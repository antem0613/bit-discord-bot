import { prisma } from "@/lib/prisma";
import { buildMonthGrid, clampToCurrentOrLater, jstToday, shiftMonth, toDateKey } from "@/lib/calendar-grid";
import { purgeUncalendarableEvents } from "@/lib/event-list";

export type CalendarDayEvent = { id: string; title: string; room: string | null; cancelled: boolean; description: string };
export type CalendarMonthData = {
  year: number;
  month: number; // 0-indexed
  isCurrentMonth: boolean;
  isMaxMonth: boolean;
  eventsByDate: Record<string, CalendarDayEvent[]>;
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

