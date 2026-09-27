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
  isPastDeadline,
  isResponseClosed,
} from "@/lib/events";
import dayjs from "@/lib/dayjs";

// Thrown for expected validation/permission failures; the message is shown to the user via a redirect.
class ActionError extends Error {}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ActionError(`日付の形式が正しくありません: ${value}`);
  }
  return date;
}

// Shared by create and reschedule: an empty deadline is allowed, but a set one must be strictly in the future.
// The `datetime-local` input has no timezone of its own, so it's always interpreted as Japan time.
function parseDeadline(raw: string): Date | null {
  if (!raw) return null;
  const parsed = dayjs.tz(raw, "Asia/Tokyo");
  if (!parsed.isValid()) {
    throw new ActionError("回答期限の形式が正しくありません");
  }
  if (parsed.valueOf() <= Date.now()) {
    throw new ActionError("回答期限には現在より後の日時を指定してください");
  }
  return parsed.toDate();
}

export type CreateEventState = { error: string } | undefined;

// Returns `{ error }` instead of redirecting on failure so the form (via useActionState) stays mounted
// with everything the user already typed/selected intact.
export async function createEvent(_prevState: CreateEventState, formData: FormData): Promise<CreateEventState> {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const schedulingDeadline = parseDeadline(String(formData.get("schedulingDeadline") ?? "").trim());
    const dateStrings = Array.from(new Set(formData.getAll("candidateDates").map(String).filter(Boolean)));

    if (!title) throw new ActionError("タイトルを入力してください");
    if (dateStrings.length === 0) {
      throw new ActionError("候補日を1つ以上選択してください");
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
        schedulingDeadline,
        candidateDates: { create: candidateDates },
        symbolLabels: { create: symbolLabels },
      },
    });

    redirect(`/events/${event.id}`);
  } catch (error) {
    if (error instanceof ActionError) {
      return { error: error.message };
    }
    throw error;
  }
}

// Selects (or switches) the current member's answer for a single candidate date; upsert enforces one symbol per member/date.
export async function selectResponse(eventId: string, candidateDateId: string, symbol: AvailabilitySymbol) {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    await ensureEventClosed(eventId);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, closedAt: true, schedulingDeadline: true },
    });
    if (!event) throw new ActionError("イベントが見つかりません");
    if (isResponseClosed(event)) throw new ActionError("回答の受付は終了しています");
    if (!SYMBOL_ORDER.includes(symbol)) throw new ActionError("不正な回答記号です");

    const candidateDate = await prisma.eventCandidateDate.findUnique({
      where: { id: candidateDateId },
      select: { eventId: true },
    });
    if (!candidateDate || candidateDate.eventId !== eventId) {
      throw new ActionError("候補日が見つかりません");
    }

    await prisma.scheduleResponse.upsert({
      where: { candidateDateId_memberId: { candidateDateId, memberId: session.id } },
      create: { candidateDateId, eventId, memberId: session.id, symbol },
      update: { symbol },
    });
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

export async function reopenEvent(eventId: string) {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { creatorId: true, status: true, closedAt: true, schedulingDeadline: true },
    });
    if (!event) throw new ActionError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new ActionError("イベント作成者のみ操作できます");
    if (event.status !== SchedulingStatus.SCHEDULING) {
      throw new ActionError("このイベントはすでに確定済み、またはキャンセルされています");
    }
    if (event.closedAt === null) throw new ActionError("受付は締め切られていません");
    // A deadline-based closure must stay closed; only a manual, still-before-deadline closure can be reopened.
    if (isPastDeadline(event)) throw new ActionError("回答期限を過ぎているため再開できません");

    await prisma.event.update({ where: { id: eventId }, data: { closedAt: null } });
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

export async function cancelEvent(eventId: string) {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { creatorId: true, status: true },
    });
    if (!event) throw new ActionError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new ActionError("イベント作成者のみ操作できます");
    if (event.status !== SchedulingStatus.FINALIZED) {
      throw new ActionError("確定済みのイベントのみキャンセルできます");
    }

    await prisma.event.update({ where: { id: eventId }, data: { status: SchedulingStatus.CANCELLED } });
  } catch (error) {
    if (error instanceof ActionError) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
}

// Restarts scheduling from a finalized event: clears final dates/candidate dates/labels/responses and takes fresh input for everything except title and description.
export async function rescheduleEvent(eventId: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { creatorId: true, status: true },
    });
    if (!event) throw new ActionError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new ActionError("イベント作成者のみ操作できます");
    if (event.status !== SchedulingStatus.FINALIZED) {
      throw new ActionError("確定済みのイベントのみ再調整できます");
    }

    const schedulingDeadline = parseDeadline(String(formData.get("schedulingDeadline") ?? "").trim());
    const dateStrings = Array.from(new Set(formData.getAll("candidateDates").map(String).filter(Boolean)));
    if (dateStrings.length === 0) throw new ActionError("候補日を1つ以上選択してください");

    const candidateDates = dateStrings.map((d) => ({ date: parseDateOnly(d) }));
    const symbolLabels = SYMBOL_ORDER.map((symbol) => {
      const raw = String(formData.get(`label_${symbol}`) ?? "").trim();
      return { symbol, label: raw || DEFAULT_SYMBOL_LABELS[symbol] };
    });

    await prisma.$transaction([
      prisma.eventFinalDate.deleteMany({ where: { eventId } }),
      prisma.eventCandidateDate.deleteMany({ where: { eventId } }), // cascades to ScheduleResponse
      prisma.eventSymbolLabel.deleteMany({ where: { eventId } }),
      prisma.event.update({
        where: { id: eventId },
        data: {
          status: SchedulingStatus.SCHEDULING,
          closedAt: null,
          schedulingDeadline,
          candidateDates: { create: candidateDates },
          symbolLabels: { create: symbolLabels },
        },
      }),
    ]);

    revalidatePath("/");
    redirect(`/events/${eventId}`);
  } catch (error) {
    if (error instanceof ActionError) {
      redirect(`/events/${eventId}/reschedule?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}

