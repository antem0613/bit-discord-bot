"use client";

import { useMemo, useState } from "react";
import { buildMonthGrid, jstToday, maxSelectableDate, shiftMonth, toDateKey } from "@/lib/calendar-grid";
import { WEEKDAY_LABELS, formatShortDate, weekdayTextClass } from "@/lib/ui-styles";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// Lets the event creator pick any set of (not necessarily consecutive) candidate dates from a calendar.
// `initialDates` prefills the selection (e.g. when arriving from the day-detail "新規作成" button) while
// still letting the user freely add to or remove from it afterward.
// Navigation and selection are limited to today..the last day of the month 12 months ahead, the same
// range the main calendar can display.
export default function CandidateDatePicker({ name = "candidateDates", initialDates = [] }: { name?: string; initialDates?: string[] }) {
  const firstInitialDate = initialDates[0] ? new Date(`${initialDates[0]}T00:00:00.000Z`) : null;
  const [year, setYear] = useState(() => firstInitialDate?.getUTCFullYear() ?? jstToday().getUTCFullYear());
  const [month, setMonth] = useState(() => firstInitialDate?.getUTCMonth() ?? jstToday().getUTCMonth());
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialDates));

  const days = useMemo(() => buildMonthGrid(year, month), [year, month]);
  // Recomputed on every render (i.e. whenever an interaction fires a state update) so "today" never goes stale.
  const today = jstToday();
  const todayKey = toDateKey(today);
  const maxKey = toDateKey(maxSelectableDate(today));

  const monthIndex = year * 12 + month;
  const minMonthIndex = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const maxMonthIndex = minMonthIndex + 12;

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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="w-full rounded-xl border border-line bg-surface-2 p-3 sm:max-w-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold tabular-nums">
            {year}年{month + 1}月
          </span>
          <div className="flex gap-1">
            <button type="button" onClick={() => goToMonth(-1)} disabled={monthIndex <= minMonthIndex} className="icon-btn size-8" aria-label="前の月">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => goToMonth(1)} disabled={monthIndex >= maxMonthIndex} className="icon-btn size-8" aria-label="次の月">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={label} className={`py-1 font-semibold ${weekdayTextClass(i) || "text-muted"}`}>
              {label}
            </div>
          ))}
          {days.map((day, index) => {
            const key = toDateKey(day);
            const inMonth = day.getUTCMonth() === month;
            const disabled = key < todayKey || key > maxKey;
            const isSelected = selected.has(key);
            const isToday = key === todayKey;

            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => toggle(key)}
                aria-pressed={isSelected}
                className={`aspect-square rounded-lg text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${
                  isSelected
                    ? "bg-brand font-semibold text-white hover:bg-brand-hover"
                    : `hover:bg-brand-soft ${weekdayTextClass(index % 7)} ${inMonth ? "" : "opacity-40"} ${
                        isToday ? "ring-1 ring-brand ring-inset" : ""
                      }`
                }`}
              >
                {day.getUTCDate()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="mb-2 text-xs font-semibold text-muted">
          選択中の候補日 <span className="tabular-nums text-foreground">{sortedSelected.length}</span>日
        </p>
        {sortedSelected.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {sortedSelected.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pr-1.5 pl-3 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white"
                  aria-label={`${formatShortDate(key)} を外す`}
                >
                  {formatShortDate(key)}
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted">
            カレンダーから候補日を1つ以上選択してください
          </p>
        )}
      </div>

      {sortedSelected.map((key) => (
        <input key={key} type="hidden" name={name} value={key} />
      ))}
    </div>
  );
}
