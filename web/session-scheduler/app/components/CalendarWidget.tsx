"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addDays, buildMonthGrid, clampToCurrentOrLater, jstToday, parseDateKey, shiftMonth, toDateKey } from "@/lib/calendar-grid";
import { ROOM_LABELS } from "@/lib/event-constants";
import type { CalendarDayData, CalendarMonthData } from "@/lib/calendar";
import { LucideChevronLeft, LucideChevronRight } from "lucide-react";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_TAGS_PER_DAY = 3;

export default function CalendarWidget({ initial }: { initial: CalendarMonthData }) {
  const [monthData, setMonthData] = useState(initial);
  const [dayData, setDayData] = useState<CalendarDayData | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "day">("month");
  const [isPending, startTransition] = useTransition();

  const days = buildMonthGrid(monthData.year, monthData.month);

  // Navigates months entirely client-side (fetch + state update) so browsing months never grows browser history.
  function goToMonth(year: number, month: number) {
    startTransition(async () => {
      const res = await fetch(`/api/calendar?y=${year}&m=${month + 1}`);
      const next: CalendarMonthData = await res.json();
      setMonthData(next);
      setViewMode("month");
    });
  }

  // Fetches and switches to the day-detail view for `dateKey`. The server clamps the date to the same
  // current-month..+12-months range enforced for the month calendar.
  function goToDay(dateKey: string) {
    startTransition(async () => {
      const res = await fetch(`/api/calendar/day?date=${dateKey}`);
      const next: CalendarDayData = await res.json();
      setDayData(next);
      setViewMode("day");
    });
  }

  // Clicking a grayed-out day from an adjacent month only opens it if that month is in range.
  function handleDayClick(day: Date, key: string, inMonth: boolean) {
    if (inMonth) {
      goToDay(key);
      return;
    }
    const targetYear = day.getUTCFullYear();
    const targetMonth = day.getUTCMonth();
    const clamped = clampToCurrentOrLater(targetYear, targetMonth, jstToday());
    if (clamped.year !== targetYear || clamped.month !== targetMonth) return;
    goToDay(key);
  }

  function shiftDay(delta: number) {
    if (!dayData) return;
    goToDay(toDateKey(addDays(parseDateKey(dayData.date), delta)));
  }

  // Returns to the month grid, showing the month that contains the day currently displayed.
  function backToCalendar() {
    if (!dayData) {
      setViewMode("month");
      return;
    }
    const current = parseDateKey(dayData.date);
    goToMonth(current.getUTCFullYear(), current.getUTCMonth());
  }

  if (viewMode === "day" && dayData) {
    return (
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex">
            <h1 className="text-2xl font-semibold">{dayData.date.slice(0, 4)}年{parseInt(dayData.date.slice(5, 7))}月{parseInt(dayData.date.slice(8, 10))}日 の予定</h1>
            <button type="button" onClick={backToCalendar} className="text-sm ml-4 underline disabled:opacity-50" disabled={isPending}>
              ← カレンダーに戻る
            </button>
          </div>
          <div className="flex gap-3 text-sm">
            {dayData.isMinDate ? (
              <div className="border-zinc-400 text-zinc-400 ronded-md px-1 items-center">
                <LucideChevronLeft />
              </div>
            ) : (
              <div className="border border-zinc-700 rounded-md px-1 bg-white/70 dark:bg-zinc-800/70">
                <button type="button" onClick={() => shiftDay(-1)} className="disabled:opacity-50 items-center" disabled={isPending}>
                  <LucideChevronLeft />
                </button>
              </div>
            )}
            {dayData.isMaxDate ? (
              <div className="border-zinc-400 text-zinc-400 ronded-md px-1 items-center">
                <LucideChevronRight />
              </div>
            ) : (
              <div className="border border-zinc-700 rounded-md px-1 bg-white/70 dark:bg-zinc-800/70">
                <button type="button" onClick={() => shiftDay(1)} className="disabled:opacity-50 items-center" disabled={isPending}>
                  <LucideChevronRight />
                </button>
              </div>
            )}
          </div>
        </div>

        <section className="rounded border p-4 bg-white dark:bg-zinc-800">
          <div className="mb-3 flex items-center">
            {dayData.date >= toDateKey(jstToday()) && (
              <Link href={`/events/new?date=${dayData.date}`} className="rounded-full bg-[#5865F2] px-3 py-2 text-sm font-medium text-white">
                新規作成
              </Link>
            )}
          </div>

          {dayData.events.length > 0 ? (
            <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
              {dayData.events.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className={`bg-slate-400/10 hover:bg-slate-400/30 dark:bg-white/20 dark:hover:bg-white/10 rounded-lg p-1 ${e.cancelled ? "line-through opacity-70" : ""} 
                  ${e.room === 'Room1' ? "text-rose-700 dark:text-rose-300" :
                      e.room === 'Room2' ? "text-lime-700 dark:text-green-300" :
                        e.room === "Room3" ? "text-blue-700 dark:text-blue-300" :
                          e.room === "Room4" ? "text-yellow-700 dark:text-yellow-300" :
                            e.room === "OtherServer" ? "text-purple-700 dark:text-fuchsia-300" : ""}`}>
                    {e.title}
                  </Link>
                  {e.cancelled && <span className="ml-2 text-sm text-red-600 dark:text-red-400">キャンセルされました</span>}
                  {!e.cancelled && e.room && (
                    <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {ROOM_LABELS[e.room as keyof typeof ROOM_LABELS]}
                    </span>
                  )}
                  {e.description && (
                    <span className="ml-6 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                      {e.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">予定はありません。</p>
          )}
        </section>
      </div>
    );
  }

  const prev = shiftMonth(monthData.year, monthData.month, -1);
  const next = shiftMonth(monthData.year, monthData.month, 1);

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {monthData.year}年{monthData.month + 1}月
        </h1>
        <div className="flex gap-3 text-sm">
          {monthData.isCurrentMonth ? (
            <div className="border-zinc-400 text-zinc-400 ronded-md px-1 items-center">
              <LucideChevronLeft />
            </div>
          ) : (
              <div className="border border-zinc-700 rounded-md px-1 bg-white/70 dark:bg-zinc-800/70">
                <button type="button" onClick={() => goToMonth(prev.year, prev.month)} className="disabled:opacity-50 items-center" disabled={isPending}>
                  <LucideChevronLeft />
                </button>
              </div>
          )}
          {monthData.isMaxMonth ? (
            <div className="border-zinc-400 text-zinc-400 ronded-md px-1 items-center">
              <LucideChevronRight />
            </div>
          ) : (
            <div className="border border-zinc-700 rounded-md px-1 bg-white/70 dark:bg-zinc-800/70">
              <button type="button" onClick={() => goToMonth(next.year, next.month)} className="underline disabled:opacity-50 items-center" disabled={isPending}>
                <LucideChevronRight />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 border rounded-t-xl text-sm">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className={`border-r border-b bg-zinc-50 p-1 text-center font-medium dark:bg-zinc-900 ${label === '日' ? 'rounded-tl-xl' : ''} ${label === '土' ? 'rounded-tr-xl' : ''}`}>
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = toDateKey(day);
          const inMonth = day.getUTCMonth() === monthData.month;
          const dayEvents = monthData.eventsByDate[key] ?? [];
          const visible = dayEvents.slice(0, MAX_TAGS_PER_DAY);
          const overflow = dayEvents.length - visible.length;

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleDayClick(day, key, inMonth)}
              className={`flex min-h-24 flex-col gap-0.5 border p-1 text-left
                ${inMonth ? "" : "text-zinc-400 dark:text-zinc-600"
                } ${inMonth ? "bg-white dark:bg-slate-600" : "bg-zinc-100 dark:bg-zinc-800"}`}
            >
              <span className="text-xs">{day.getUTCDate()}</span>
              {visible.map((e) => (
                <span
                  key={e.id}
                  className={`truncate rounded px-1 text-[11px] 
                    ${e.cancelled
                      ? "bg-zinc-200/50 text-zinc-500 line-through dark:bg-zinc-800/20 dark:text-zinc-500"
                      : ""
                    }
                    ${e.room && ROOM_LABELS[e.room as keyof typeof ROOM_LABELS] == ROOM_LABELS['Room1']
                      ? "bg-red-400/10 text-rose-700 dark:text-rose-300"
                      : ""
                    }
                    ${e.room && ROOM_LABELS[e.room as keyof typeof ROOM_LABELS] == ROOM_LABELS['Room2']
                      ? "bg-lime-400/10 text-lime-700 dark:text-green-300"
                      : ""
                    }
                    ${e.room && ROOM_LABELS[e.room as keyof typeof ROOM_LABELS] == ROOM_LABELS['Room3']
                      ? "bg-blue-400/10 text-blue-700 dark:text-blue-300"
                      : ""
                    }
                    ${e.room && ROOM_LABELS[e.room as keyof typeof ROOM_LABELS] == ROOM_LABELS['Room4']
                      ? "bg-yellow-400/10 text-yellow-700 dark:text-yellow-300"
                      : ""
                    }
                    ${e.room && ROOM_LABELS[e.room as keyof typeof ROOM_LABELS] == ROOM_LABELS['OtherServer']
                      ? "bg-purple-400/10 text-purple-700 dark:text-fuchsia-300"
                      : ""
                    }
                    ${!e.room
                      ? " text-gray-700 dark:text-gray-300"
                      : ""
                    }
                    `}
                >
                  {e.title}
                </span>
              ))}
              {overflow > 0 && <span className="text-[11px] text-zinc-500 dark:text-white">他{overflow}件</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
