import { AvailabilitySymbol, SchedulingStatus, SessionRoom } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import dayjs from "@/lib/dayjs";
import { DEFAULT_SYMBOL_LABELS, SYMBOL_ORDER } from "@/lib/event-constants";
import { notifyParticipantsAdded, notifyRecruitmentAutoClosed } from "@/lib/notifications";

export { toDateKey } from "@/lib/calendar-grid";
export { SYMBOL_ORDER, DEFAULT_SYMBOL_LABELS, SYMBOL_MARKS, SYMBOL_SCORES, ROOM_LABELS } from "@/lib/event-constants";

// Thrown for expected validation/permission failures. Callers (the website's server actions, and the
// bot-originated event-creation API route) turn this into a user-facing message instead of a 500.
export class EventValidationError extends Error {}

export function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new EventValidationError(`日付の形式が正しくありません: ${value}`);
  }
  return date;
}

// Shared by create and reschedule: an empty deadline is allowed, but a set one must be strictly in the future.
// Expects an ISO-like "YYYY-MM-DDTHH:mm" string (what the web form's `datetime-local` input produces);
// callers with free-text input (e.g. the bot's modal) must normalize to this shape first. Always
// interpreted as Japan time, matching the rest of the app.
export function parseDeadline(raw: string): Date | null {
  if (!raw) return null;
  const parsed = dayjs.tz(raw, "Asia/Tokyo");
  if (!parsed.isValid()) {
    throw new EventValidationError("回答期限の形式が正しくありません");
  }
  if (parsed.valueOf() <= Date.now()) {
    throw new EventValidationError("回答期限には現在より後の日時を指定してください");
  }
  return parsed.toDate();
}

type EventForStatus = {
  status: SchedulingStatus;
  closedAt: Date | null;
  schedulingDeadline: Date | null;
};

export function isPastDeadline(event: EventForStatus, now = dayjs().tz()): boolean {
  return event.schedulingDeadline !== null && dayjs(event.schedulingDeadline).tz() <= now;
}

// Formats `date` as a Japan-time `datetime-local` input value so the deadline field can reject past values.
export function toDateTimeLocalMin(date: Date = new Date()): string {
  return dayjs(date).tz().format("YYYY-MM-DDTHH:mm");
}

// True once responses/participation are no longer accepted, whether closed manually or by deadline.
export function isResponseClosed(event: EventForStatus, now = dayjs().tz()): boolean {
  return event.status !== SchedulingStatus.SCHEDULING || event.closedAt !== null || isPastDeadline(event, now);
}

// Lazily applies the "auto-close on deadline" rule: persists closedAt the first time it's noticed the
// deadline has passed, and DMs the host (who didn't trigger this themselves, unlike a manual close).
export async function ensureEventClosed(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true, closedAt: true, schedulingDeadline: true, creatorId: true, title: true },
  });
  if (!event) return;

  if (event.status === SchedulingStatus.SCHEDULING && event.closedAt === null && isPastDeadline(event)) {
    await prisma.event.update({
      where: { id: eventId },
      data: { closedAt: event.schedulingDeadline as Date },
    });
    await notifyRecruitmentAutoClosed(eventId, event.title, event.creatorId);
  }
}

export type FinalDateInput = { date: Date; room: SessionRoom | null };

// Returns the subset of `dates` whose room is already booked by another finalized event on that day.
export async function findRoomConflicts(dates: FinalDateInput[]): Promise<FinalDateInput[]> {
  const roomedDates = dates.filter((d): d is FinalDateInput & { room: SessionRoom } => d.room !== null);
  if (roomedDates.length === 0) return [];

  const existing = await prisma.eventFinalDate.findMany({
    where: {
      OR: roomedDates.map((d) => ({ date: d.date, room: d.room })),
    },
    select: { date: true, room: true },
  });

  const existingKeys = new Set(existing.map((e) => `${e.date.toISOString()}_${e.room}`));
  return roomedDates.filter((d) => existingKeys.has(`${d.date.toISOString()}_${d.room}`));
}

export type CreateEventParticipantInput = { id: string; username: string; displayName: string };

export type CreateEventRecordInput = {
  creatorId: string;
  creatorUsername: string;
  creatorDisplayName: string;
  title: string;
  description: string;
  // Raw "YYYY-MM-DD" strings; deduplicated and validated here.
  candidateDateStrings: string[];
  // Raw deadline input, already normalized to the "YYYY-MM-DDTHH:mm" shape `parseDeadline` expects
  // (or an empty string for "no deadline").
  schedulingDeadlineRaw: string;
  // Defaults to `DEFAULT_SYMBOL_LABELS` when omitted (the bot-originated flow doesn't let the host
  // customize these).
  symbolLabels?: { symbol: AvailabilitySymbol; label: string }[];
  // Pre-set participants (see `EventParticipant`); defaults to none.
  participants?: CreateEventParticipantInput[];
};

// Core event-creation logic shared by the website's "create event" form action and the bot-originated
// "/schedule create" API route. Validates input, upserts the creator's (and any participants') `Member`
// row — so a bot-originated creator who has never logged into the website still gets one — and creates
// the `Event` together with its candidate dates, symbol labels, and pre-set participants in one transaction.
export async function createEventRecord(input: CreateEventRecordInput): Promise<{ id: string }> {
  const title = input.title.trim();
  if (!title) throw new EventValidationError("タイトルを入力してください");

  const dateStrings = Array.from(new Set(input.candidateDateStrings.filter(Boolean)));
  if (dateStrings.length === 0) throw new EventValidationError("候補日を1つ以上選択してください");
  const candidateDates = dateStrings.map((d) => ({ date: parseDateOnly(d) }));

  const schedulingDeadline = parseDeadline(input.schedulingDeadlineRaw.trim());

  const symbolLabels =
    input.symbolLabels ?? SYMBOL_ORDER.map((symbol) => ({ symbol, label: DEFAULT_SYMBOL_LABELS[symbol] }));
  const participants = (input.participants ?? []).filter((p) => p.id !== input.creatorId);

  const event = await prisma.$transaction(async (tx) => {
    await tx.member.upsert({
      where: { id: input.creatorId },
      create: { id: input.creatorId, username: input.creatorUsername, displayName: input.creatorDisplayName },
      update: { username: input.creatorUsername, displayName: input.creatorDisplayName },
    });

    for (const p of participants) {
      await tx.member.upsert({
        where: { id: p.id },
        create: { id: p.id, username: p.username, displayName: p.displayName },
        update: { username: p.username, displayName: p.displayName },
      });
    }

    return tx.event.create({
      data: {
        title,
        description: input.description.trim(),
        creatorId: input.creatorId,
        schedulingDeadline,
        candidateDates: { create: candidateDates },
        symbolLabels: { create: symbolLabels },
        participants: { create: participants.map((p) => ({ memberId: p.id })) },
      },
    });
  });

  await notifyParticipantsAdded(event.id, title, participants.map((p) => p.id));

  return { id: event.id };
}
