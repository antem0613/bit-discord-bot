import { prisma } from "@/lib/prisma";
import {
  addDays,
  buildMonthGrid,
  clampToCurrentOrLater,
  clampToSelectableDate,
  jstToday,
  maxSelectableDate,
  minSelectableDate,
  parseDateKey,
  shiftMonth,
  toDateKey,
} from "@/lib/calendar-grid";
import { purgeUncalendarableEvents } from "@/lib/event-list";
import { ROOM_LABELS } from "@/lib/event-constants";

export type CalendarDayEvent = { id: string; title: string; room: string | null; cancelled: boolean; description: string };
export type CalendarMonthData = {
  year: number;
  month: number; // 0-indexed
  isCurrentMonth: boolean;
  isMaxMonth: boolean;
  eventsByDate: Record<string, CalendarDayEvent[]>;
};

export type CalendarDayData = {
  date: string; // YYYY-MM-DD, already clamped to the selectable range
  isMinDate: boolean;
  isMaxDate: boolean;
  events: CalendarDayEvent[];
};

export async function getCalendarMonthData(requestedYear: number, requestedMonth: number): Promise<CalendarMonthData> {
  await purgeUncalendarableEvents();

  const now = jstToday();
  const { year, month } = clampToCurrentOrLater(requestedYear, requestedMonth, now);

  const days = buildMonthGrid(year, month);
  const rangeStart = days[0];
  const rangeEnd = new Date(days[days.length - 1]);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const finalDates = await prisma.eventFinalDate.findMany({
    where: { date: { gte: rangeStart, lt: rangeEnd } },
    include: { event: { select: { id: true, title: true, description: true, status: true } } },
    orderBy: { date: "asc" },
  });

  const eventsByDate: Record<string, CalendarDayEvent[]> = {};
  for (const f of finalDates) {
    const key = toDateKey(f.date);
    (eventsByDate[key] ??= []).push({
      id: f.event.id,
      title: f.event.title,
      room: f.room,
      cancelled: f.event.status === "CANCELLED",
      description: f.event.description,
    });
  }

  return {
    year,
    month,
    isCurrentMonth: year === now.getUTCFullYear() && month === now.getUTCMonth(),
    isMaxMonth: (() => {
      const max = shiftMonth(now.getUTCFullYear(), now.getUTCMonth(), 12);
      return year === max.year && month === max.month;
    })(),
    eventsByDate,
  };
}

// Single-day counterpart to `getCalendarMonthData`, used by the day-detail view that replaces the
// calendar grid when a day is selected. `requestedDateKey` is clamped to the same current-month..
// +12-months range as the month calendar (see `clampToSelectableDate`).
export async function getCalendarDayData(requestedDateKey: string): Promise<CalendarDayData> {
  await purgeUncalendarableEvents();

  const now = jstToday();
  const requested = parseDateKey(requestedDateKey);
  const date = clampToSelectableDate(Number.isNaN(requested.getTime()) ? now : requested, now);
  const nextDay = addDays(date, 1);

  const finalDates = await prisma.eventFinalDate.findMany({
    where: { date: { gte: date, lt: nextDay } },
    include: { event: { select: { id: true, title: true, description: true, status: true } } },
    orderBy: { date: "asc" },
  });

  const events: CalendarDayEvent[] = finalDates.map((f) => ({
    id: f.event.id,
    title: f.event.title,
    room: f.room,
    cancelled: f.event.status === "CANCELLED",
    description: f.event.description,
  }));

  return {
    date: toDateKey(date),
    isMinDate: date.getTime() === minSelectableDate(now).getTime(),
    isMaxDate: date.getTime() === maxSelectableDate(now).getTime(),
    events,
  };
}

export type EventOccurrence = {
  id: string;
  title: string;
  description: string;
  roomLabel: string | null;
  cancelled: boolean;
  date: string; // YYYY-MM-DD
};

// Lists every finalized event occurrence (one entry per final date) within [rangeStart, rangeEnd), for
// the Discord bot's "/schedule list" command. Unlike `getCalendarMonthData`/`getCalendarDayData`, there's
// no clamping to a "current month..+12 months" range here — a bot query can look up any month, past or
// future. Room is pre-formatted to its Japanese label so the bot doesn't need to know the enum mapping.
export async function getFinalizedEventOccurrences(rangeStart: Date, rangeEnd: Date): Promise<EventOccurrence[]> {
  await purgeUncalendarableEvents();

  const finalDates = await prisma.eventFinalDate.findMany({
    where: { date: { gte: rangeStart, lt: rangeEnd } },
    include: { event: { select: { id: true, title: true, description: true, status: true } } },
    orderBy: { date: "asc" },
  });

  return finalDates.map((f) => ({
    id: f.event.id,
    title: f.event.title,
    description: f.event.description,
    roomLabel: f.room ? ROOM_LABELS[f.room] : null,
    cancelled: f.event.status === "CANCELLED",
    date: toDateKey(f.date),
  }));
}

