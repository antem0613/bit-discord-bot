"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addDays, clampToCurrentOrLater, jstToday, parseDateKey, shiftMonth, toDateKey } from "@/lib/calendar-grid";
import type { CalendarDayData, CalendarMonthData } from "@/lib/calendar";
import MonthCalendar from "@/app/components/MonthCalendar";
import DayPanel from "@/app/components/DayPanel";

// While the tab is visible, re-fetch this often so other members' additions/changes show up.
const AUTO_REFRESH_MS = 60_000;
// Returning to the tab refreshes immediately, unless the last refresh was this recent.
const FOCUS_REFRESH_MIN_GAP_MS = 10_000;

async function fetchMonth(year: number, month: number): Promise<CalendarMonthData> {
  const res = await fetch(`/api/calendar?y=${year}&m=${month + 1}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`calendar ${res.status}`);
  return res.json();
}

async function fetchDay(dateKey: string): Promise<CalendarDayData> {
  const res = await fetch(`/api/calendar/day?date=${dateKey}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`calendar/day ${res.status}`);
  return res.json();
}

// Keeps ?date= in the URL in sync (shareable links) without adding history entries.
function syncDateParam(dateKey: string | null) {
  const url = new URL(window.location.href);
  if (dateKey) url.searchParams.set("date", dateKey);
  else url.searchParams.delete("date");
  window.history.replaceState(null, "", url);
}

// Month calendar + day detail. Desktop: the day panel takes the place of `eventList` in the side
// column. Mobile: the day panel is a bottom sheet over the page.
export default function ScheduleBoard({
  initialMonth,
  initialDay,
  eventList,
}: {
  initialMonth: CalendarMonthData;
  initialDay: CalendarDayData | null;
  eventList: ReactNode;
}) {
  const router = useRouter();
  const [monthData, setMonthData] = useState(initialMonth);
  const [dayData, setDayData] = useState<CalendarDayData | null>(initialDay);
  const [isPending, startTransition] = useTransition();
  const todayKey = toDateKey(jstToday());

  // Latest view state for the background refresher (which runs outside render).
  const viewRef = useRef({ year: initialMonth.year, month: initialMonth.month, date: initialDay?.date ?? null });
  useEffect(() => {
    viewRef.current = { year: monthData.year, month: monthData.month, date: dayData?.date ?? null };
  }, [monthData.year, monthData.month, dayData?.date]);

  // Drops responses from requests superseded by a newer navigation.
  const seqRef = useRef(0);

  function goToMonth(year: number, month: number) {
    const seq = ++seqRef.current;
    startTransition(async () => {
      const next = await fetchMonth(year, month);
      if (seq === seqRef.current) setMonthData(next);
    });
  }

  function openDay(dateKey: string) {
    const seq = ++seqRef.current;
    startTransition(async () => {
      const day = await fetchDay(dateKey);
      const d = parseDateKey(day.date);
      const needsMonth = d.getUTCFullYear() !== viewRef.current.year || d.getUTCMonth() !== viewRef.current.month;
      const month = needsMonth ? await fetchMonth(d.getUTCFullYear(), d.getUTCMonth()) : null;
      if (seq !== seqRef.current) return;
      setDayData(day);
      if (month) setMonthData(month);
      syncDateParam(day.date);
    });
  }

  const closeDay = useCallback(() => {
    ++seqRef.current;
    setDayData(null);
    syncDateParam(null);
  }, []);

  function handleSelectDay(day: Date, key: string, inMonth: boolean) {
    if (key === dayData?.date) {
      closeDay();
      return;
    }
    if (!inMonth) {
      // Grayed-out days from adjacent months only open if that month is within the navigable range.
      const y = day.getUTCFullYear();
      const m = day.getUTCMonth();
      const clamped = clampToCurrentOrLater(y, m, jstToday());
      if (clamped.year !== y || clamped.month !== m) return;
    }
    openDay(key);
  }

  function shiftDay(delta: number) {
    if (!dayData) return;
    openDay(toDateKey(addDays(parseDateKey(dayData.date), delta)));
  }

  // ---------- Background refresh (focus / visibility / interval) ----------
  const lastRefreshRef = useRef(0);
  const refresh = useCallback(async () => {
    lastRefreshRef.current = Date.now();
    const seq = seqRef.current;
    const { year, month, date } = viewRef.current;
    try {
      const [m, d] = await Promise.all([fetchMonth(year, month), date ? fetchDay(date) : Promise.resolve(null)]);
      if (seq !== seqRef.current) return; // the user navigated meanwhile
      setMonthData(m);
      if (d) setDayData(d);
      router.refresh(); // server-rendered event list
    } catch {
      // offline / session expired: keep showing what we have; a reload will hit the login gate.
    }
  }, [router]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshRef.current > FOCUS_REFRESH_MIN_GAP_MS) {
        void refresh();
      }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  // ---------- Sheet behaviour on small screens ----------
  const isOpen = dayData !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDay();
    window.addEventListener("keydown", onKey);
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    const prevOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, closeDay]);

  const today = jstToday();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <MonthCalendar
          monthData={monthData}
          selectedDate={dayData?.date ?? null}
          todayKey={todayKey}
          pending={isPending}
          onSelectDay={handleSelectDay}
          onPrevMonth={() => {
            const prev = shiftMonth(monthData.year, monthData.month, -1);
            goToMonth(prev.year, prev.month);
          }}
          onNextMonth={() => {
            const next = shiftMonth(monthData.year, monthData.month, 1);
            goToMonth(next.year, next.month);
          }}
          onToday={() => goToMonth(today.getUTCFullYear(), today.getUTCMonth())}
        />
      </div>

      <aside className="w-full shrink-0 lg:sticky lg:top-22 lg:w-88">
        {dayData && (
          <>
            <button
              type="button"
              aria-label="閉じる"
              onClick={closeDay}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden"
            />
            <div
              role="dialog"
              aria-label={`${dayData.date} の予定`}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82vh] flex-col overflow-hidden rounded-t-3xl border-t border-line bg-surface shadow-2xl max-lg:animate-sheet-up lg:static lg:z-auto lg:max-h-[calc(100vh-7rem)] lg:rounded-2xl lg:border lg:shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
            >
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-surface-3 lg:hidden" />
              <DayPanel
                day={dayData}
                todayKey={todayKey}
                pending={isPending}
                onPrev={() => shiftDay(-1)}
                onNext={() => shiftDay(1)}
                onClose={closeDay}
              />
            </div>
          </>
        )}
        <div className={dayData ? "lg:hidden" : ""}>{eventList}</div>
      </aside>
    </div>
  );
}
