"use client";

import { useMemo, useState } from "react";
import { buildMonthGrid, jstToday, shiftMonth, toDateKey } from "@/lib/calendar-grid";
import { LucideChevronLeft, LucideChevronRight } from "lucide-react";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// Lets the event creator pick any set of (not necessarily consecutive) candidate dates from a calendar.
// `initialDates` prefills the selection (e.g. when arriving from the day-detail "新規作成" button) while
// still letting the user freely add to or remove from it afterward.
export default function CandidateDatePicker({ name = "candidateDates", initialDates = [] }: { name?: string; initialDates?: string[] }) {
  const firstInitialDate = initialDates[0] ? new Date(`${initialDates[0]}T00:00:00.000Z`) : null;
  const [year, setYear] = useState(() => firstInitialDate?.getUTCFullYear() ?? jstToday().getUTCFullYear());
  const [month, setMonth] = useState(() => firstInitialDate?.getUTCMonth() ?? jstToday().getUTCMonth());
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialDates));

  const days = useMemo(() => buildMonthGrid(year, month), [year, month]);
  // Recomputed on every render (i.e. whenever an interaction fires a state update) so "today" never goes stale.
  const todayKey = toDateKey(jstToday());

  const thisYear = parseInt(todayKey.slice(0,4));
  const thisMonth = parseInt(todayKey.slice(6,7));

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function goToMonth(delta: number) {
    const { year: nextYear, month: nextMonth } = shiftMonth(year, month, delta);
    setYear(nextYear);
    setMonth(nextMonth);
  }

  const sortedSelected = Array.from(selected).sort();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          {year}年{month + 1}月
        </span>
        <div className="flex gap-3 text-sm">
          {month + 1 == thisMonth && year == thisYear ? (
            <LucideChevronLeft className="text-zinc-400" />
          ):(
          <button type="button" onClick={() => goToMonth(-1)} >
            <LucideChevronLeft />
          </button>
          )}
          {month + 1 == thisMonth && year == thisYear + 1 ? (
            <LucideChevronRight className="text-zinc-400" />
          ) : (
          <button type="button" onClick={() => goToMonth(1)}>
            <LucideChevronRight />
          </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 border text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="border bg-zinc-50 p-1 text-center font-medium dark:bg-zinc-900">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = toDateKey(day);
          const inMonth = day.getUTCMonth() === month;
          const isPast = key < todayKey;
          const isOverLimit = day.getUTCMonth() + 1 > thisMonth && day.getUTCFullYear() > thisYear;
          const isSelected = selected.has(key);

          return (
            <button
              key={key}
              type="button"
              disabled={isPast || isOverLimit}
              onClick={() => toggle(key)}
              className={`min-h-10 border p-1 text-left disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-300 dark:disabled:bg-zinc-900 dark:disabled:text-zinc-700 ${
                inMonth ? "" : "text-zinc-200 dark:text-gray-400"
              } ${isSelected ? "bg-[#7a84eb] text-white" : ""}`}
            >
              {day.getUTCDate()}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {sortedSelected.length > 0 ? `選択中の候補日: ${sortedSelected.join("、")}` : "候補日を1つ以上選択してください"}
      </p>

      {sortedSelected.map((key) => (
        <input key={key} type="hidden" name={name} value={key} />
      ))}
    </div>
  );
}
