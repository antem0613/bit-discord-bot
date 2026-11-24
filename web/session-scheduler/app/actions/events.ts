"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchGuildMembers, getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { AvailabilitySymbol, Prisma, SchedulingStatus, SessionRoom } from "@/app/generated/prisma/client";
import {
  DEFAULT_SYMBOL_LABELS,
  EventValidationError,
  ROOM_LABELS,
  SYMBOL_ORDER,
  createEventRecord,
  ensureEventClosed,
  findRoomConflicts,
  lockRoomBookings,
  isPastDeadline,
  isResponseClosed,
  parseDateOnly,
  parseDeadline,
  parseTimeInput,
  toDateKey,
  toDateTimeLocalMin,
} from "@/lib/events";
import { COMMENT_MAX_LENGTH, NOTE_MAX_LENGTH, REMINDER_COOLDOWN_MS } from "@/lib/event-constants";
import {
  type FinalDateSummary,
  notifyCandidatesAdded,
  notifyEventFinalized,
  notifyEventRescheduled,
  notifyFinalDatesChanged,
  notifyParticipantsAdded,
  notifyResponseReminder,
} from "@/lib/notifications";

export type CreateEventState = { error: string } | undefined;

// Returns `{ error }` instead of redirecting on failure so the form (via useActionState) stays mounted
// with everything the user already typed/selected intact.
export async function createEvent(_prevState: CreateEventState, formData: FormData): Promise<CreateEventState> {
  const session = await getSession();
  if (!session) redirect("/login");

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
  if (!session) redirect("/login");

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
      // The note only explains a △, so it's dropped when switching to another symbol.
      update: symbol === AvailabilitySymbol.TRIANGLE ? { symbol } : { symbol, note: null },
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
  if (!session) redirect("/login");

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
  if (!session) redirect("/login");

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
  if (!session) redirect("/login");

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
      return { date: parseDateOnly(dateStr), ...readFinalDateDetails(formData, dateStr) };
    });

    await prisma.$transaction(async (tx) => {
      // Check-then-insert under a lock so two hosts can't book the same room on the same day at once.
      await lockRoomBookings(tx);
      const conflicts = await findRoomConflicts(finalDates, tx);
      if (conflicts.length > 0) {
        const detail = conflicts
          .map((c) => `${c.date.toISOString().slice(0, 10)}(${c.room ? ROOM_LABELS[c.room] : ""})`)
          .join(", ");
        throw new EventValidationError(`セッション部屋が他のイベントと重複しています: ${detail}`);
      }

      await tx.eventFinalDate.createMany({
        data: finalDates.map((f) => ({ eventId, date: f.date, room: f.room, startTime: f.startTime, endTime: f.endTime })),
      });
      await tx.event.update({ where: { id: eventId }, data: { status: SchedulingStatus.FINALIZED } });
    });

    // Notify everyone who engaged with this event, excluding the creator who just finalized it themselves.
    const memberIds = await getEngagedMemberIds(eventId, session.id);
    await notifyEventFinalized(eventId, event.title, toFinalDateSummaries(finalDates), memberIds);
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
  if (!session) redirect("/login");

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
  if (!session) redirect("/login");

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

// ---------- shared helpers ----------

// Room / start / end time for one final date, from fields `room_<date>`, `start_<date>`, `end_<date>`.
function readFinalDateDetails(formData: FormData, dateKey: string) {
  const roomRaw = String(formData.get(`room_${dateKey}`) ?? "");
  const room = roomRaw && roomRaw in SessionRoom ? (roomRaw as SessionRoom) : null;
  const startTime = parseTimeInput(formData.get(`start_${dateKey}`), `${dateKey} の開始時刻`);
  const endTime = parseTimeInput(formData.get(`end_${dateKey}`), `${dateKey} の終了時刻`);
  return { room, startTime, endTime };
}

function toFinalDateSummaries(
  dates: { date: Date; room: SessionRoom | null; startTime: string | null; endTime: string | null }[]
): FinalDateSummary[] {
  return dates
    .map((f) => ({ date: toDateKey(f.date), room: f.room, startTime: f.startTime, endTime: f.endTime }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Everyone who engaged with the event: answered any candidate date, or is a pre-set participant.
async function getEngagedMemberIds(eventId: string, excludeMemberId: string): Promise<string[]> {
  const [responders, participantRows] = await Promise.all([
    prisma.scheduleResponse.findMany({
      where: { eventId, memberId: { not: excludeMemberId } },
      select: { memberId: true },
      distinct: ["memberId"],
    }),
    prisma.eventParticipant.findMany({
      where: { eventId, memberId: { not: excludeMemberId } },
      select: { memberId: true },
    }),
  ]);
  return Array.from(new Set([...responders.map((r) => r.memberId), ...participantRows.map((p) => p.memberId)]));
}

// ---------- edit ----------

// Edits an event after creation (creator only, not for cancelled events).
// - Always: title, description, symbol labels, pre-set participants.
// - While SCHEDULING: candidate dates (removing one deletes its answers) and the answer deadline.
// - When FINALIZED: each final date's room and start/end time (room clashes re-checked under the lock).
// Participants are DM'd about newly added candidate dates / changed final dates / being added.
export async function updateEvent(eventId: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        candidateDates: { select: { id: true, date: true } },
        finalDates: true,
        participants: { select: { memberId: true } },
      },
    });
    if (!event) throw new EventValidationError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new EventValidationError("イベント作成者のみ編集できます");
    if (event.status === SchedulingStatus.CANCELLED || event.status === SchedulingStatus.COMPLETED) {
      throw new EventValidationError("キャンセル済み・終了済みのイベントは編集できません");
    }

    const title = String(formData.get("title") ?? "").trim();
    if (!title) throw new EventValidationError("タイトルを入力してください");
    const description = String(formData.get("description") ?? "").trim();
    const symbolLabels = SYMBOL_ORDER.map((symbol) => {
      const raw = String(formData.get(`label_${symbol}`) ?? "").trim();
      return { symbol, label: raw || DEFAULT_SYMBOL_LABELS[symbol] };
    });

    // Participants are only touched when the picker actually rendered: the guild member list can be
    // unavailable, and an empty submission must not wipe existing participants in that case.
    const participantsEditable = formData.get("participantsEditable") === "1";
    const currentParticipantIds = new Set(event.participants.map((p) => p.memberId));
    const submittedParticipantIds = new Set(formData.getAll("participantIds").map(String).filter(Boolean));
    const addedParticipantIds = participantsEditable
      ? [...submittedParticipantIds].filter((id) => !currentParticipantIds.has(id) && id !== session.id)
      : [];
    const removedParticipantIds = participantsEditable
      ? [...currentParticipantIds].filter((id) => !submittedParticipantIds.has(id))
      : [];
    // Validate additions against a fresh guild member list (same rule as at creation time).
    const addedParticipants =
      addedParticipantIds.length === 0
        ? []
        : (await fetchGuildMembers()).filter((m) => addedParticipantIds.includes(m.id));

    let addedCandidateKeys: string[] = [];
    let changedFinalDates: FinalDateSummary[] | null = null;

    if (event.status === SchedulingStatus.SCHEDULING) {
      // Deadline: an untouched (possibly already past) value is kept as-is; a changed one must be future.
      const deadlineRaw = String(formData.get("schedulingDeadline") ?? "").trim();
      const existingRaw = event.schedulingDeadline ? toDateTimeLocalMin(event.schedulingDeadline) : "";
      const schedulingDeadline = deadlineRaw === existingRaw ? event.schedulingDeadline : parseDeadline(deadlineRaw);

      const submittedKeys = Array.from(new Set(formData.getAll("candidateDates").map(String).filter(Boolean)));
      if (submittedKeys.length === 0) throw new EventValidationError("候補日を1つ以上選択してください");
      submittedKeys.forEach(parseDateOnly); // validates the format
      const existingByKey = new Map(event.candidateDates.map((c) => [toDateKey(c.date), c.id]));
      addedCandidateKeys = submittedKeys.filter((k) => !existingByKey.has(k)).sort();
      const removedCandidateIds = [...existingByKey].filter(([k]) => !submittedKeys.includes(k)).map(([, id]) => id);

      await prisma.$transaction(async (tx) => {
        await tx.event.update({ where: { id: eventId }, data: { title, description, schedulingDeadline } });
        if (removedCandidateIds.length > 0) {
          await tx.eventCandidateDate.deleteMany({ where: { id: { in: removedCandidateIds } } }); // cascades answers
        }
        if (addedCandidateKeys.length > 0) {
          await tx.eventCandidateDate.createMany({
            data: addedCandidateKeys.map((k) => ({ eventId, date: parseDateOnly(k) })),
          });
        }
        await saveLabelsAndParticipants(tx, eventId, symbolLabels, addedParticipants, removedParticipantIds);
      });
    } else {
      // FINALIZED: per-final-date room / time.
      const updates = event.finalDates.map((f) => ({ id: f.id, date: f.date, ...readFinalDateDetails(formData, toDateKey(f.date)) }));
      const changed = updates.some((u) => {
        const before = event.finalDates.find((f) => f.id === u.id);
        return !before || before.room !== u.room || before.startTime !== u.startTime || before.endTime !== u.endTime;
      });

      await prisma.$transaction(async (tx) => {
        if (changed) {
          await lockRoomBookings(tx);
          const conflicts = await findRoomConflicts(updates, tx, eventId);
          if (conflicts.length > 0) {
            const detail = conflicts.map((c) => `${toDateKey(c.date)}(${c.room ? ROOM_LABELS[c.room] : ""})`).join(", ");
            throw new EventValidationError(`セッション部屋が他のイベントと重複しています: ${detail}`);
          }
          for (const u of updates) {
            await tx.eventFinalDate.update({
              where: { id: u.id },
              data: { room: u.room, startTime: u.startTime, endTime: u.endTime },
            });
          }
        }
        await tx.event.update({ where: { id: eventId }, data: { title, description } });
        await saveLabelsAndParticipants(tx, eventId, symbolLabels, addedParticipants, removedParticipantIds);
      });
      if (changed) changedFinalDates = toFinalDateSummaries(updates);
    }

    // Notifications (best-effort). Newly added participants get the "you were added" DM instead.
    const newlyAdded = new Set(addedParticipants.map((p) => p.id));
    const others = (await getEngagedMemberIds(eventId, session.id)).filter((id) => !newlyAdded.has(id));
    await notifyParticipantsAdded(eventId, title, [...newlyAdded]);
    if (addedCandidateKeys.length > 0) await notifyCandidatesAdded(eventId, title, addedCandidateKeys, others);
    if (changedFinalDates) await notifyFinalDatesChanged(eventId, title, changedFinalDates, others);
  } catch (error) {
    if (error instanceof EventValidationError) {
      redirect(`/events/${eventId}/edit?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
  redirect(`/events/${eventId}?notice=updated`);
}

async function saveLabelsAndParticipants(
  tx: Prisma.TransactionClient,
  eventId: string,
  symbolLabels: { symbol: AvailabilitySymbol; label: string }[],
  addedParticipants: { id: string; username: string; displayName: string }[],
  removedParticipantIds: string[]
) {
  for (const { symbol, label } of symbolLabels) {
    await tx.eventSymbolLabel.upsert({
      where: { eventId_symbol: { eventId, symbol } },
      create: { eventId, symbol, label },
      update: { label },
    });
  }
  for (const p of addedParticipants) {
    await tx.member.upsert({
      where: { id: p.id },
      create: { id: p.id, username: p.username, displayName: p.displayName },
      update: { username: p.username, displayName: p.displayName },
    });
  }
  if (addedParticipants.length > 0) {
    await tx.eventParticipant.createMany({
      data: addedParticipants.map((p) => ({ eventId, memberId: p.id })),
      skipDuplicates: true,
    });
  }
  if (removedParticipantIds.length > 0) {
    await tx.eventParticipant.deleteMany({ where: { eventId, memberId: { in: removedParticipantIds } } });
  }
}

// ---------- reminder ----------

// DMs pre-set participants who haven't answered every candidate date yet (creator only, while open).
// Limited to once per REMINDER_COOLDOWN_MS so a host can't spam members.
export async function remindNonResponders(eventId: string) {
  const session = await getSession();
  if (!session) redirect("/login");

  let count = 0;
  try {
    await ensureEventClosed(eventId);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        creatorId: true,
        title: true,
        status: true,
        closedAt: true,
        schedulingDeadline: true,
        lastRemindedAt: true,
        candidateDates: { select: { id: true } },
        participants: { select: { memberId: true } },
        responses: { select: { memberId: true } },
      },
    });
    if (!event) throw new EventValidationError("イベントが見つかりません");
    if (event.creatorId !== session.id) throw new EventValidationError("イベント作成者のみ操作できます");
    if (isResponseClosed(event)) throw new EventValidationError("回答の受付は終了しています");
    if (event.lastRemindedAt && Date.now() - event.lastRemindedAt.getTime() < REMINDER_COOLDOWN_MS) {
      throw new EventValidationError("リマインドは1時間に1回までです");
    }

    const answered = new Map<string, number>();
    for (const r of event.responses) answered.set(r.memberId, (answered.get(r.memberId) ?? 0) + 1);
    const targets = event.participants
      .map((p) => p.memberId)
      .filter((id) => id !== session.id && (answered.get(id) ?? 0) < event.candidateDates.length);
    if (targets.length === 0) throw new EventValidationError("未回答の参加者はいません");

    // Claim the cooldown slot with a conditional update so a double submit can't send twice.
    const { count: claimed } = await prisma.event.updateMany({
      where: { id: eventId, lastRemindedAt: event.lastRemindedAt },
      data: { lastRemindedAt: new Date() },
    });
    if (claimed === 0) throw new EventValidationError("リマインドは1時間に1回までです");

    await notifyResponseReminder(eventId, event.title, event.schedulingDeadline, targets);
    count = targets.length;
  } catch (error) {
    if (error instanceof EventValidationError) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?notice=reminded&count=${count}`);
}

// ---------- comments / △ notes (shown to everyone) ----------

export type InlineSaveResult = { error?: string };

// Saves (or, when empty, deletes) the current member's one comment on an event.
export async function saveComment(eventId: string, rawBody: string): Promise<InlineSaveResult> {
  const session = await getSession();
  if (!session) return { error: "ログインが必要です" };

  const body = String(rawBody ?? "").trim();
  if (body.length > COMMENT_MAX_LENGTH) return { error: `コメントは${COMMENT_MAX_LENGTH}文字以内で入力してください` };

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { status: true } });
  if (!event) return { error: "イベントが見つかりません" };
  if (event.status === SchedulingStatus.CANCELLED) return { error: "キャンセルされたイベントにはコメントできません" };

  if (body) {
    await prisma.eventComment.upsert({
      where: { eventId_memberId: { eventId, memberId: session.id } },
      create: { eventId, memberId: session.id, body },
      update: { body },
    });
  } else {
    await prisma.eventComment.deleteMany({ where: { eventId, memberId: session.id } });
  }
  revalidatePath(`/events/${eventId}`);
  return {};
}

// Saves the short note on the current member's △ answer for one candidate date (empty = remove).
export async function saveResponseNote(eventId: string, candidateDateId: string, rawNote: string): Promise<InlineSaveResult> {
  const session = await getSession();
  if (!session) return { error: "ログインが必要です" };

  const note = String(rawNote ?? "").trim();
  if (note.length > NOTE_MAX_LENGTH) return { error: `メモは${NOTE_MAX_LENGTH}文字以内で入力してください` };

  await ensureEventClosed(eventId);
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true, closedAt: true, schedulingDeadline: true },
  });
  if (!event) return { error: "イベントが見つかりません" };
  if (isResponseClosed(event)) return { error: "回答の受付は終了しています" };

  const { count } = await prisma.scheduleResponse.updateMany({
    where: { candidateDateId, eventId, memberId: session.id, symbol: AvailabilitySymbol.TRIANGLE },
    data: { note: note || null },
  });
  if (count === 0) return { error: "△で回答した日にだけメモを付けられます" };

  revalidatePath(`/events/${eventId}`);
  return {};
}
