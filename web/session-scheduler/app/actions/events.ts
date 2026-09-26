"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { AvailabilitySymbol, SchedulingStatus, SessionRoom } from "@/app/generated/prisma/client";
import {
  DEFAULT_SYMBOL_LABELS,
  SYMBOL_ORDER,
  ensureEventClosed,
  findRoomConflicts,
  isResponseClosed,
} from "@/lib/events";

// Thrown for expected validation/permission failures; the message is shown to the user via a redirect.
class ActionError extends Error {}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ActionError(`日付の形式が正しくありません: ${value}`);
  }
  return date;
}

export async function createEvent(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const deadlineRaw = String(formData.get("schedulingDeadline") ?? "").trim();
    const datesRaw = String(formData.get("candidateDates") ?? "");

    if (!title) throw new ActionError("タイトルを入力してください");

    const dateStrings = Array.from(
      new Set(
        datesRaw
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      )
    );
    if (dateStrings.length === 0) {
      throw new ActionError("候補日を1つ以上入力してください");
    }

    const candidateDates = dateStrings.map((d) => ({ date: parseDateOnly(d) }));
    const symbolLabels = SYMBOL_ORDER.map((symbol) => {
      const raw = String(formData.get(`label_${symbol}`) ?? "").trim();
      return { symbol, label: raw || DEFAULT_SYMBOL_LABELS[symbol] };
    });

    const event = await prisma.event.create({
      data: {
        title,
        description,
        creatorId: session.id,
        schedulingDeadline: deadlineRaw ? new Date(deadlineRaw) : null,
        candidateDates: { create: candidateDates },
        symbolLabels: { create: symbolLabels },
      },
    });

    redirect(`/events/${event.id}`);
  } catch (error) {
    if (error instanceof ActionError) {
      redirect(`/events/new?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}

export async function submitResponses(eventId: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    await ensureEventClosed(eventId);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, closedAt: true, schedulingDeadline: true, candidateDates: { select: { id: true } } },
    });
    if (!event) throw new ActionError("イベントが見つかりません");
    if (isResponseClosed(event)) throw new ActionError("回答の受付は終了しています");

    const validIds = new Set(event.candidateDates.map((c) => c.id));

    await prisma.$transaction(
      Array.from(validIds)
        .map((candidateDateId) => {
          const symbol = String(formData.get(`symbol_${candidateDateId}`) ?? "");
          if (!SYMBOL_ORDER.includes(symbol as AvailabilitySymbol)) return null;
          return prisma.scheduleResponse.upsert({
            where: { candidateDateId_memberId: { candidateDateId, memberId: session.id } },
            create: { candidateDateId, eventId, memberId: session.id, symbol: symbol as AvailabilitySymbol },
            update: { symbol: symbol as AvailabilitySymbol },
          });
        })
        .filter((query) => query !== null)
    );
  } catch (error) {
    if (error instanceof ActionError) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(`/events/${eventId}`);
}

export async function closeEvent(eventId: string) {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { creatorId: true, status: true, closedAt: true },
    });
    if (!event) throw new ActionError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new ActionError("イベント作成者のみ操作できます");
    if (event.status === SchedulingStatus.SCHEDULING && event.closedAt === null) {
      await prisma.event.update({ where: { id: eventId }, data: { closedAt: new Date() } });
    }
  } catch (error) {
    if (error instanceof ActionError) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(`/events/${eventId}`);
}

export async function finalizeEvent(eventId: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        creatorId: true,
        status: true,
        closedAt: true,
        schedulingDeadline: true,
        candidateDates: { select: { date: true } },
      },
    });
    if (!event) throw new ActionError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new ActionError("イベント作成者のみ操作できます");
    if (event.status !== SchedulingStatus.SCHEDULING) {
      throw new ActionError("このイベントはすでに確定済み、またはキャンセルされています");
    }
    if (!isResponseClosed(event)) throw new ActionError("先に参加受付を締め切ってください");

    const candidateKeys = new Set(event.candidateDates.map((c) => c.date.toISOString().slice(0, 10)));
    const selectedDates = formData.getAll("finalDate").map(String);
    if (selectedDates.length === 0) throw new ActionError("実施日を1つ以上選択してください");

    const finalDates = selectedDates.map((dateStr) => {
      if (!candidateKeys.has(dateStr)) throw new ActionError("候補日以外は実施日に選択できません");
      const roomRaw = String(formData.get(`room_${dateStr}`) ?? "");
      const room = roomRaw && roomRaw in SessionRoom ? (roomRaw as SessionRoom) : null;
      return { date: parseDateOnly(dateStr), room };
    });

    const conflicts = await findRoomConflicts(finalDates);
    if (conflicts.length > 0) {
      const detail = conflicts.map((c) => `${c.date.toISOString().slice(0, 10)}(${c.room})`).join(", ");
      throw new ActionError(`セッション部屋が他のイベントと重複しています: ${detail}`);
    }

    await prisma.$transaction([
      prisma.eventFinalDate.createMany({
        data: finalDates.map((f) => ({ eventId, date: f.date, room: f.room })),
      }),
      prisma.event.update({ where: { id: eventId }, data: { status: SchedulingStatus.FINALIZED } }),
    ]);
  } catch (error) {
    if (error instanceof ActionError) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
}
