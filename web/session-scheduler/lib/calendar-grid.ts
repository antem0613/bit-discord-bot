// Pure date/grid helpers with no server-only dependencies, safe to import from Client Components.

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // Japan has no DST, so a fixed UTC+9 offset is always correct.

// Reinterprets `instant` as a UTC-midnight Date encoding today's calendar day in Japan time, so the
// existing UTC-getter-based grid/key helpers below transparently operate on the JST calendar day.
export function jstToday(instant: Date = new Date()): Date {
  const jst = new Date(instant.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Parses a "YYYY-MM-DD" key back into a UTC-midnight Date. Returns an invalid Date if malformed.
export function parseDateKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return new Date(NaN);
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

export function addDays(date: Date, delta: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + delta);
  return result;
}

const MAX_MONTHS_AHEAD = 12;

// Clamps to the displayable range: from the current month up to `MAX_MONTHS_AHEAD` months ahead.
export function clampToCurrentOrLater(year: number, month: number, now: Date): { year: number; month: number } {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { year: currentYear, month: currentMonth };
  }

  const max = shiftMonth(currentYear, currentMonth, MAX_MONTHS_AHEAD);
  if (year > max.year || (year === max.year && month > max.month)) {
    return max;
  }
  return { year, month };
}

// The earliest/latest day navigable from "now": the same current-month..`MAX_MONTHS_AHEAD`-months-ahead
// range enforced by `clampToCurrentOrLater` for the month calendar, expressed as day boundaries for the
// day-detail view's prev/next navigation.
export function minSelectableDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function maxSelectableDate(now: Date): Date {
  const max = shiftMonth(now.getUTCFullYear(), now.getUTCMonth(), MAX_MONTHS_AHEAD);
  return addDays(new Date(Date.UTC(max.year, max.month + 1, 1)), -1);
}

// Clamps `date` into the [minSelectableDate(now), maxSelectableDate(now)] range.
export function clampToSelectableDate(date: Date, now: Date): Date {
  const min = minSelectableDate(now);
  const max = maxSelectableDate(now);
  if (Number.isNaN(date.getTime())) return now;
  if (date.getTime() < min.getTime()) return min;
  if (date.getTime() > max.getTime()) return max;
  return date;
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
