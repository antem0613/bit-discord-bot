"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchGuildMembers, getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { AvailabilitySymbol, SchedulingStatus, SessionRoom } from "@/app/generated/prisma/client";
import {
  DEFAULT_SYMBOL_LABELS,
  EventValidationError,
  SYMBOL_ORDER,
  createEventRecord,
  ensureEventClosed,
  findRoomConflicts,
  isPastDeadline,
  isResponseClosed,
  parseDateOnly,
  parseDeadline,
} from "@/lib/events";
import { notifyEventFinalized, notifyEventRescheduled } from "@/lib/notifications";

export type CreateEventState = { error: string } | undefined;

// Returns `{ error }` instead of redirecting on failure so the form (via useActionState) stays mounted
// with everything the user already typed/selected intact.
export async function createEvent(_prevState: CreateEventState, formData: FormData): Promise<CreateEventState> {
  const session = await getSession();
  if (!session) redirect("/?error=login_failed");

  try {
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const schedulingDeadlineRaw = String(formData.get("schedulingDeadline") ?? "").trim();
    const candidateDateStrings = formData.getAll("candidateDates").map(String);

    const symbolLabels = SYMBOL_ORDER.map((symbol) => {
      const raw = String(formData.get(`label_${symbol}`) ?? "").trim();
      return { symbol, label: raw || DEFAULT_SYMBOL_LABELS[symbol] };
    });

    // Pre-set participants only record an internal participation marker (EventParticipant); they're
    // not asked to answer here. Validate the submitted IDs against a fresh guild member list so an
    // attacker can't register an arbitrary/non-member ID as a participant.
    const participantIds = Array.from(new Set(formData.getAll("participantIds").map(String).filter(Boolean)));
    const participants = participantIds.length === 0
      ? []
      : (await fetchGuildMembers()).filter((m) => participantIds.includes(m.id));

    const event = await createEventRecord({
      creatorId: session.id,
      creatorUsername: session.username,
      creatorDisplayName: session.displayName,
      title,
      description,
      candidateDateStrings,
      schedulingDeadlineRaw,
      symbolLabels,
      participants,
    });

    redirect(`/events/${event.id}`);
  } catch (error) {
    if (error instanceof EventValidationError) {
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
    if (!event) throw new EventValidationError("イベントが見つかりません");
    if (isResponseClosed(event)) throw new EventValidationError("回答の受付は終了しています");
    if (!SYMBOL_ORDER.includes(symbol)) throw new EventValidationError("不正な回答記号です");

    const candidateDate = await prisma.eventCandidateDate.findUnique({
      where: { id: candidateDateId },
      select: { eventId: true },
    });
    if (!candidateDate || candidateDate.eventId !== eventId) {
      throw new EventValidationError("候補日が見つかりません");
    }

    await prisma.scheduleResponse.upsert({
      where: { candidateDateId_memberId: { candidateDateId, memberId: session.id } },
      create: { candidateDateId, eventId, memberId: session.id, symbol },
      update: { symbol },
    });
  } catch (error) {
    if (error instanceof EventValidationError) {
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
    if (!event) throw new EventValidationError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new EventValidationError("イベント作成者のみ操作できます");
    if (event.status === SchedulingStatus.SCHEDULING && event.closedAt === null) {
      await prisma.event.update({ where: { id: eventId }, data: { closedAt: new Date() } });
    }
  } catch (error) {
    if (error instanceof EventValidationError) {
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
    if (!event) throw new EventValidationError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new EventValidationError("イベント作成者のみ操作できます");
    if (event.status !== SchedulingStatus.SCHEDULING) {
      throw new EventValidationError("このイベントはすでに確定済み、またはキャンセルされています");
    }
    if (event.closedAt === null) throw new EventValidationError("受付は締め切られていません");
    // A deadline-based closure must stay closed; only a manual, still-before-deadline closure can be reopened.
    if (isPastDeadline(event)) throw new EventValidationError("回答期限を過ぎているため再開できません");

    await prisma.event.update({ where: { id: eventId }, data: { closedAt: null } });
  } catch (error) {
    if (error instanceof EventValidationError) {
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
        title: true,
        candidateDates: { select: { date: true } },
      },
    });
    if (!event) throw new EventValidationError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new EventValidationError("イベント作成者のみ操作できます");
    if (event.status !== SchedulingStatus.SCHEDULING) {
      throw new EventValidationError("このイベントはすでに確定済み、またはキャンセルされています");
    }
    if (!isResponseClosed(event)) throw new EventValidationError("先に参加受付を締め切ってください");

    const candidateKeys = new Set(event.candidateDates.map((c) => c.date.toISOString().slice(0, 10)));
    const selectedDates = formData.getAll("finalDate").map(String);
    if (selectedDates.length === 0) throw new EventValidationError("実施日を1つ以上選択してください");

    const finalDates = selectedDates.map((dateStr) => {
      if (!candidateKeys.has(dateStr)) throw new EventValidationError("候補日以外は実施日に選択できません");
      const roomRaw = String(formData.get(`room_${dateStr}`) ?? "");
      const room = roomRaw && roomRaw in SessionRoom ? (roomRaw as SessionRoom) : null;
      return { date: parseDateOnly(dateStr), room };
    });

    const conflicts = await findRoomConflicts(finalDates);
    if (conflicts.length > 0) {
      const detail = conflicts.map((c) => `${c.date.toISOString().slice(0, 10)}(${c.room})`).join(", ");
      throw new EventValidationError(`セッション部屋が他のイベントと重複しています: ${detail}`);
    }

    await prisma.$transaction([
      prisma.eventFinalDate.createMany({
        data: finalDates.map((f) => ({ eventId, date: f.date, room: f.room })),
      }),
      prisma.event.update({ where: { id: eventId }, data: { status: SchedulingStatus.FINALIZED } }),
    ]);

    // Notify everyone who engaged with this event (answered any candidate date, or was pre-set as a
    // participant), excluding the creator who just finalized it themselves.
    const [responders, participantRows] = await Promise.all([
      prisma.scheduleResponse.findMany({
        where: { eventId, memberId: { not: session.id } },
        select: { memberId: true },
        distinct: ["memberId"],
      }),
      prisma.eventParticipant.findMany({
        where: { eventId, memberId: { not: session.id } },
        select: { memberId: true },
      }),
    ]);
    const memberIds = Array.from(
      new Set([...responders.map((r) => r.memberId), ...participantRows.map((p) => p.memberId)])
    );
    const finalDateKeys = finalDates.map((f) => f.date.toISOString().slice(0, 10)).sort();
    await notifyEventFinalized(eventId, event.title, finalDateKeys, memberIds);
  } catch (error) {
    if (error instanceof EventValidationError) {
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
    if (!event) throw new EventValidationError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new EventValidationError("イベント作成者のみ操作できます");
    if (event.status !== SchedulingStatus.FINALIZED) {
      throw new EventValidationError("確定済みのイベントのみキャンセルできます");
    }

    await prisma.event.update({ where: { id: eventId }, data: { status: SchedulingStatus.CANCELLED } });
  } catch (error) {
    if (error instanceof EventValidationError) {
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
      select: {
        creatorId: true,
        status: true,
        title: true,
        candidateDates: { select: { responses: { select: { memberId: true } } } },
      },
    });
    if (!event) throw new EventValidationError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new EventValidationError("イベント作成者のみ操作できます");
    if (event.status !== SchedulingStatus.FINALIZED) {
      throw new EventValidationError("確定済みのイベントのみ再調整できます");
    }

    const schedulingDeadline = parseDeadline(String(formData.get("schedulingDeadline") ?? "").trim());
    const dateStrings = Array.from(new Set(formData.getAll("candidateDates").map(String).filter(Boolean)));
    if (dateStrings.length === 0) throw new EventValidationError("候補日を1つ以上選択してください");

    const candidateDates = dateStrings.map((d) => ({ date: parseDateOnly(d) }));
    const symbolLabels = SYMBOL_ORDER.map((symbol) => {
      const raw = String(formData.get(`label_${symbol}`) ?? "").trim();
      return { symbol, label: raw || DEFAULT_SYMBOL_LABELS[symbol] };
    });

    // Members who actually answered the previous round are carried over as pre-set participants (same
    // as the "参加者をあらかじめ設定" picker at creation time), since their responses are about to be
    // wiped by the candidate-date reset below but they should still count as participating going forward.
    const priorResponderIds = Array.from(
      new Set(event.candidateDates.flatMap((c) => c.responses.map((r) => r.memberId)))
    );

    await prisma.$transaction([
      prisma.eventFinalDate.deleteMany({ where: { eventId } }),
      prisma.eventCandidateDate.deleteMany({ where: { eventId } }), // cascades to ScheduleResponse
      prisma.eventSymbolLabel.deleteMany({ where: { eventId } }),
      prisma.eventParticipant.createMany({
        data: priorResponderIds.map((memberId) => ({ eventId, memberId })),
        skipDuplicates: true,
      }),
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

    // Notify everyone currently participating (pre-set participants + the prior responders just
    // carried over above), excluding the creator who triggered this themselves.
    const participants = await prisma.eventParticipant.findMany({
      where: { eventId, memberId: { not: session.id } },
      select: { memberId: true },
    });
    await notifyEventRescheduled(eventId, event.title, participants.map((p) => p.memberId));

    revalidatePath("/");
    redirect(`/events/${eventId}`);
  } catch (error) {
    if (error instanceof EventValidationError) {
      redirect(`/events/${eventId}/reschedule?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}
