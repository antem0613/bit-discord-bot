// Pure date/grid helpers with no server-only dependencies, safe to import from Client Components.

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function clampToCurrentOrLater(year: number, month: number, now: Date): { year: number; month: number } {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { year: currentYear, month: currentMonth };
  }
  return { year, month };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const target = new Date(Date.UTC(year, month + delta, 1));
  return { year: target.getUTCFullYear(), month: target.getUTCMonth() };
}

// Returns the 42 days (6 full weeks, Sun-Sat) that make up the display grid for the given month.
export function buildMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstDay.getUTCDay();
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(gridStart.getUTCDate() - startWeekday);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
}
