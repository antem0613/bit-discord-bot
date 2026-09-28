"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { buildMonthGrid, clampToCurrentOrLater, jstToday, shiftMonth, toDateKey } from "@/lib/calendar-grid";
import { ROOM_LABELS } from "@/lib/event-constants";
import type { CalendarMonthData } from "@/lib/calendar";
import { LucideChevronLeft, LucideChevronRight } from "lucide-react";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_TAGS_PER_DAY = 3;

export default function CalendarWidget({ initial }: { initial: CalendarMonthData }) {
  const [data, setData] = useState(initial);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const days = buildMonthGrid(data.year, data.month);

  // Navigates months entirely client-side (fetch + state update) so browsing months never grows browser history.
  function goToMonth(year: number, month: number, selectDate: string | null = null) {
    startTransition(async () => {
      const res = await fetch(`/api/calendar?y=${year}&m=${month + 1}`);
      const next: CalendarMonthData = await res.json();
      setData(next);
      setSelectedDate(selectDate);
    });
  }

  // Clicking a grayed-out day from an adjacent month switches to that month (if it's in range) and selects it.
  function handleDayClick(day: Date, key: string, inMonth: boolean) {
    if (inMonth) {
      setSelectedDate((current) => (current === key ? null : key));
      return;
    }
    const targetYear = day.getUTCFullYear();
    const targetMonth = day.getUTCMonth();
    const clamped = clampToCurrentOrLater(targetYear, targetMonth, jstToday());
    if (clamped.year !== targetYear || clamped.month !== targetMonth) return;
    goToMonth(targetYear, targetMonth, key);
  }

  const prev = shiftMonth(data.year, data.month, -1);
  const next = shiftMonth(data.year, data.month, 1);
  const selectedEvents = selectedDate ? (data.eventsByDate[selectedDate] ?? []) : null;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {data.year}年{data.month + 1}月
        </h1>
        <div className="flex gap-3 text-sm">
          {data.isCurrentMonth ? (
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
          {data.isMaxMonth ? (
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
          const inMonth = day.getUTCMonth() === data.month;
          const dayEvents = data.eventsByDate[key] ?? [];
          const visible = dayEvents.slice(0, MAX_TAGS_PER_DAY);
          const overflow = dayEvents.length - visible.length;

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleDayClick(day, key, inMonth)}
              className={`flex min-h-24 flex-col gap-0.5 border p-1 text-left
                ${inMonth ? "" : "text-zinc-400 dark:text-zinc-600"
                } ${selectedDate === key ? "bg-blue-200 dark:bg-cyan-800" : inMonth ? "bg-white dark:bg-slate-600" : "bg-zinc-100 dark:bg-zinc-800"}`}
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

      {selectedDate && (
        <section className="mt-6 rounded border p-4 bg-white dark:bg-zinc-800">
          <h2 className="mb-2 font-medium">{selectedDate} の予定</h2>
          {selectedEvents && selectedEvents.length > 0 ? (
            <ul className="flex max-h-[10vh] flex-col gap-2 overflow-y-auto pr-1">
              {selectedEvents.map((e) => (
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
      )}
    </div>
  );
}
