import { prisma } from "@/lib/prisma";
import { buildMonthGrid, clampToCurrentOrLater, toDateKey } from "@/lib/calendar-grid";

export type CalendarDayEvent = { id: string; title: string; room: string | null };
export type CalendarMonthData = {
  year: number;
  month: number; // 0-indexed
  isCurrentMonth: boolean;
  eventsByDate: Record<string, CalendarDayEvent[]>;
};

export async function getCalendarMonthData(requestedYear: number, requestedMonth: number): Promise<CalendarMonthData> {
  const now = new Date();
  const { year, month } = clampToCurrentOrLater(requestedYear, requestedMonth, now);

  const days = buildMonthGrid(year, month);
  const rangeStart = days[0];
  const rangeEnd = new Date(days[days.length - 1]);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const finalDates = await prisma.eventFinalDate.findMany({
    where: { date: { gte: rangeStart, lt: rangeEnd } },
    include: { event: { select: { id: true, title: true } } },
    orderBy: { date: "asc" },
  });

  const eventsByDate: Record<string, CalendarDayEvent[]> = {};
  for (const f of finalDates) {
    const key = toDateKey(f.date);
    (eventsByDate[key] ??= []).push({ id: f.event.id, title: f.event.title, room: f.room });
  }

  return {
    year,
    month,
    isCurrentMonth: year === now.getUTCFullYear() && month === now.getUTCMonth(),
    eventsByDate,
  };
}
