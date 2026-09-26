import { SchedulingStatus, SessionRoom } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export { toDateKey } from "@/lib/calendar-grid";
export { SYMBOL_ORDER, DEFAULT_SYMBOL_LABELS, SYMBOL_MARKS, ROOM_LABELS } from "@/lib/event-constants";

type EventForStatus = {
  status: SchedulingStatus;
  closedAt: Date | null;
  schedulingDeadline: Date | null;
};

export function isPastDeadline(event: EventForStatus, now: Date = new Date()): boolean {
  return event.schedulingDeadline !== null && event.schedulingDeadline <= now;
}

// True once responses/participation are no longer accepted, whether closed manually or by deadline.
export function isResponseClosed(event: EventForStatus, now: Date = new Date()): boolean {
  return event.status !== SchedulingStatus.SCHEDULING || event.closedAt !== null || isPastDeadline(event, now);
}

// Lazily applies the "auto-close on deadline" rule: persists closedAt the first time it's noticed the deadline has passed.
export async function ensureEventClosed(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true, closedAt: true, schedulingDeadline: true },
  });
  if (!event) return;

  if (event.status === SchedulingStatus.SCHEDULING && event.closedAt === null && isPastDeadline(event)) {
    await prisma.event.update({
      where: { id: eventId },
      data: { closedAt: event.schedulingDeadline as Date },
    });
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
