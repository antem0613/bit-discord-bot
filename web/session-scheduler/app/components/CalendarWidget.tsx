"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { buildMonthGrid, shiftMonth, toDateKey } from "@/lib/calendar-grid";
import { ROOM_LABELS } from "@/lib/event-constants";
import type { CalendarMonthData } from "@/lib/calendar";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_TAGS_PER_DAY = 3;

export default function CalendarWidget({ initial }: { initial: CalendarMonthData }) {
  const [data, setData] = useState(initial);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const days = buildMonthGrid(data.year, data.month);

  // Navigates months entirely client-side (fetch + state update) so browsing months never grows browser history.
  function goToMonth(year: number, month: number) {
    startTransition(async () => {
      const res = await fetch(`/api/calendar?y=${year}&m=${month + 1}`);
      const next: CalendarMonthData = await res.json();
      setData(next);
      setSelectedDate(null);
    });
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
            <span className="text-zinc-400">前月</span>
          ) : (
            <button type="button" onClick={() => goToMonth(prev.year, prev.month)} className="underline disabled:opacity-50" disabled={isPending}>
              前月
            </button>
          )}
          <button type="button" onClick={() => goToMonth(next.year, next.month)} className="underline disabled:opacity-50" disabled={isPending}>
            次月
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-l text-sm">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="border-r border-b bg-zinc-50 p-1 text-center font-medium dark:bg-zinc-900">
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
              onClick={() => setSelectedDate((current) => (current === key ? null : key))}
              className={`flex min-h-24 flex-col gap-0.5 border-r border-b p-1 text-left ${
                inMonth ? "" : "text-zinc-400 dark:text-zinc-600"
              } ${selectedDate === key ? "bg-blue-50 dark:bg-blue-950" : ""}`}
            >
              <span className="text-xs">{day.getUTCDate()}</span>
              {visible.map((e) => (
                <span
                  key={e.id}
                  className="truncate rounded bg-[#5865F2]/10 px-1 text-[11px] text-[#5865F2] dark:text-indigo-300"
                >
                  {e.title}
                </span>
              ))}
              {overflow > 0 && <span className="text-[11px] text-zinc-500">他{overflow}件</span>}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <section className="mt-6 rounded border p-4">
          <h2 className="mb-2 font-medium">{selectedDate} の予定</h2>
          {selectedEvents && selectedEvents.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {selectedEvents.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="underline">
                    {e.title}
                  </Link>
                  {e.room && (
                    <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {ROOM_LABELS[e.room as keyof typeof ROOM_LABELS]}
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
