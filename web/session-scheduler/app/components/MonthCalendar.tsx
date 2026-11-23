"use client";

import { buildMonthGrid, toDateKey } from "@/lib/calendar-grid";
import { ROOM_LABELS } from "@/lib/event-constants";
import type { CalendarMonthData } from "@/lib/calendar";
import { CANCELLED_CHIP, WEEKDAY_LABELS, roomStyle, weekdayTextClass } from "@/lib/ui-styles";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

const MAX_TAGS_PER_DAY = 3;

const TENTATIVE_CHIP = "border border-dashed border-subtle/60 text-muted";

// Presentational month grid. Confirmed events are solid chips; candidate dates of events still being
// scheduled are dashed "tentative" chips so upcoming clashes are visible before anything is final.
export default function MonthCalendar({
  monthData,
  selectedDate,
  todayKey,
  pending,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  onToday,
}: {
  monthData: CalendarMonthData;
  selectedDate: string | null;
  todayKey: string;
  pending: boolean;
  onSelectDay: (day: Date, key: string, inMonth: boolean) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}) {
  const days = buildMonthGrid(monthData.year, monthData.month);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold tabular-nums">
            <span className="mr-1 text-base font-medium text-muted">{monthData.year}年</span>
            {monthData.month + 1}月
          </h1>
          {pending && <LoaderCircle className="size-4 animate-spin self-center text-muted" aria-label="読み込み中" />}
        </div>
        <div className="flex items-center gap-2">
          {!monthData.isCurrentMonth && (
            <button type="button" onClick={onToday} disabled={pending} className="btn-secondary px-3 py-1.5">
              今日
            </button>
          )}
          <button type="button" onClick={onPrevMonth} disabled={monthData.isCurrentMonth || pending} className="icon-btn" aria-label="前の月">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={onNextMonth} disabled={monthData.isMaxMonth || pending} className="icon-btn" aria-label="次の月">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-line bg-surface-2 text-xs font-semibold">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} className={`py-2 text-center ${weekdayTextClass(i) || "text-muted"}`}>
            {label}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-px border-t border-line bg-line transition-opacity ${pending ? "opacity-60" : ""}`}>
        {days.map((day, index) => {
          const key = toDateKey(day);
          const inMonth = day.getUTCMonth() === monthData.month;
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const isSelected = key === selectedDate;
          const confirmed = monthData.eventsByDate[key] ?? [];
          const tentative = monthData.candidatesByDate[key] ?? [];
          const total = confirmed.length + tentative.length;
          const visibleConfirmed = confirmed.slice(0, MAX_TAGS_PER_DAY);
          const visibleTentative = tentative.slice(0, MAX_TAGS_PER_DAY - visibleConfirmed.length);
          const overflow = total - visibleConfirmed.length - visibleTentative.length;
          const weekday = index % 7;

          const label = [
            `${day.getUTCMonth() + 1}月${day.getUTCDate()}日`,
            confirmed.length > 0 ? `確定${confirmed.length}件` : "",
            tentative.length > 0 ? `候補${tentative.length}件` : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(day, key, inMonth)}
              disabled={pending}
              aria-pressed={isSelected}
              aria-label={label}
              className={`group relative flex min-h-20 flex-col gap-1 p-1 text-left transition-colors sm:min-h-28 sm:p-1.5 ${
                isSelected
                  ? "z-10 bg-brand-soft ring-2 ring-brand ring-inset"
                  : inMonth
                    ? "bg-surface hover:bg-brand-soft"
                    : "bg-surface-2 hover:bg-surface-3"
              }`}
            >
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${
                  isToday
                    ? "bg-brand font-bold text-white"
                    : `${weekdayTextClass(weekday)} ${inMonth ? "font-medium" : "opacity-40"} ${isPast && inMonth ? "opacity-55" : ""}`
                }`}
              >
                {day.getUTCDate()}
              </span>

              {/* Phones: solid dot = confirmed, hollow dot = tentative */}
              {total > 0 && (
                <span className={`flex flex-wrap gap-0.5 px-1 sm:hidden ${inMonth ? "" : "opacity-50"}`}>
                  {confirmed.slice(0, 6).map((e) => (
                    <span key={e.id} className={`size-1.5 rounded-full ${e.cancelled ? "bg-zinc-400" : roomStyle(e.room).dot}`} />
                  ))}
                  {tentative.slice(0, Math.max(0, 6 - confirmed.length)).map((c) => (
                    <span key={`c-${c.id}`} className="size-1.5 rounded-full ring-1 ring-subtle ring-inset" />
                  ))}
                </span>
              )}

              {/* Tablet and up: titled chips */}
              <span className={`hidden flex-col gap-0.5 sm:flex ${inMonth ? "" : "opacity-50"}`}>
                {visibleConfirmed.map((e) => (
                  <span
                    key={e.id}
                    className={`truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${e.cancelled ? CANCELLED_CHIP : roomStyle(e.room).chip}`}
                  >
                    {e.title}
                  </span>
                ))}
                {visibleTentative.map((c) => (
                  <span key={`c-${c.id}`} className={`truncate rounded-md px-1.5 py-px text-[11px] ${TENTATIVE_CHIP}`}>
                    {c.title}
                  </span>
                ))}
                {overflow > 0 && <span className="px-1 text-[11px] font-medium text-muted">+{overflow}件</span>}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-muted sm:px-5">
        {Object.entries(ROOM_LABELS).map(([room, label]) => (
          <li key={room} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${roomStyle(room).dot}`} />
            {label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-dashed border-subtle" />
          調整中の候補日
        </li>
      </ul>
    </section>
  );
}
