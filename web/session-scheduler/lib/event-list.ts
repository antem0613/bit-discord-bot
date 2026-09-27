import { prisma } from "@/lib/prisma";
import { SchedulingStatus } from "@/app/generated/prisma/client";
import { jstToday } from "@/lib/calendar-grid";

export type EventListFilter = "status" | "confirmed" | "mine";

// Lower sorts first: open-for-scheduling events surface above already-finalized/completed ones.
const STATUS_PRIORITY: Partial<Record<SchedulingStatus, number>> = {
  SCHEDULING: 0,
  FINALIZED: 1,
  COMPLETED: 2,
};

// An event's row is only ever removed from the database once the calendar's month navigation
// (clamped to "current month or later") can never reach it again, i.e. every date relevant to its
// current stage (final dates once confirmed, otherwise candidate dates) falls in a month before
// the current one. Until then it stays in the database; see `isFinished` for the (DB-untouched)
// rule that just hides finished events from the list.
export async function purgeUncalendarableEvents(): Promise<void> {
  const today = jstToday();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const expiredFinalized = await prisma.event.findMany({
    where: {
      status: SchedulingStatus.FINALIZED,
      finalDates: { some: {}, none: { date: { gte: monthStart } } },
    },
    select: { id: true },
  });

  const expiredScheduling = await prisma.event.findMany({
    where: {
      status: SchedulingStatus.SCHEDULING,
      candidateDates: { some: {}, none: { date: { gte: monthStart } } },
    },
    select: { id: true },
  });

  const idsToDelete = [...expiredFinalized, ...expiredScheduling].map((e) => e.id);
  if (idsToDelete.length > 0) {
    await prisma.event.deleteMany({ where: { id: { in: idsToDelete } } });
  }
}

// True once every date relevant to the event's current stage is strictly before today. Used to hide
// finished events from the list without deleting them (they're only deleted once the calendar can no
// longer show them at all; see `purgeUncalendarableEvents`).
function isFinished(dates: Date[], today: Date): boolean {
  return dates.length > 0 && dates.every((d) => d < today);
}

// Fetches the (non-cancelled, non-finished) event list already filtered/sorted for one of the three
// list views:
// - "status": recruitment status priority (SCHEDULING first)
// - "confirmed": events with a finalized date, soonest first
// - "mine": events the given member has responded to, finalized ones first then soonest date
export async function getEventListItems(filter: EventListFilter, userId?: string) {
  const events = await prisma.event.findMany({
    where: { status: { not: SchedulingStatus.CANCELLED } },
    include: {
      creator: true,
      candidateDates: {
        orderBy: { date: "asc" },
        select: { date: true, responses: { where: { memberId: userId ?? "" }, select: { id: true } } },
      },
      finalDates: { orderBy: { date: "asc" }, select: { date: true } },
    },
  });

  const today = jstToday();
  const withComputed = events
    .map((event) => ({
      event,
      earliestCandidateDate: event.candidateDates[0]?.date ?? null,
      earliestFinalDate: event.finalDates[0]?.date ?? null,
      participates: event.candidateDates.some((c) => c.responses.length > 0),
    }))
    .filter(({ event }) => {
      const relevantDates =
        event.status === SchedulingStatus.FINALIZED
          ? event.finalDates.map((f) => f.date)
          : event.candidateDates.map((c) => c.date);
      return !isFinished(relevantDates, today);
    });

  let filtered = withComputed;
  if (filter === "confirmed") {
    filtered = filtered.filter((e) => e.event.status === SchedulingStatus.FINALIZED);
  } else if (filter === "mine") {
    filtered = filtered.filter((e) => e.participates);
  }

  filtered.sort((a, b) => {
    if (filter === "confirmed") {
      return (a.earliestFinalDate?.getTime() ?? Infinity) - (b.earliestFinalDate?.getTime() ?? Infinity);
    }
    if (filter === "mine") {
      const aFinalized = a.event.status === SchedulingStatus.FINALIZED;
      const bFinalized = b.event.status === SchedulingStatus.FINALIZED;
      if (aFinalized !== bFinalized) return aFinalized ? -1 : 1;
      const aDate = a.earliestFinalDate ?? a.earliestCandidateDate;
      const bDate = b.earliestFinalDate ?? b.earliestCandidateDate;
      return (aDate?.getTime() ?? Infinity) - (bDate?.getTime() ?? Infinity);
    }
    const priorityA = STATUS_PRIORITY[a.event.status] ?? 99;
    const priorityB = STATUS_PRIORITY[b.event.status] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return b.event.createdAt.getTime() - a.event.createdAt.getTime();
  });

  return filtered.map((f) => f.event);
}

export type EventListEvent = Awaited<ReturnType<typeof getEventListItems>>[number];
