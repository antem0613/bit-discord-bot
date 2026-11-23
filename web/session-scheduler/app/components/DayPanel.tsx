"use client";

import Link from "next/link";
import { ROOM_LABELS, isExclusiveRoom } from "@/lib/event-constants";
import type { CalendarDayData } from "@/lib/calendar";
import { WEEKDAY_LABELS, formatLongDate, roomStyle, weekdayOf, weekdayTextClass } from "@/lib/ui-styles";
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, LoaderCircle, MapPin, Plus, X } from "lucide-react";

const ROOMS = Object.keys(ROOM_LABELS) as (keyof typeof ROOM_LABELS)[];

// Day detail shown beside the calendar (desktop) or as a bottom sheet (mobile); the container
// positioning is decided by ScheduleBoard.
export default function DayPanel({
  day,
  todayKey,
  pending,
  onPrev,
  onNext,
  onClose,
}: {
  day: CalendarDayData;
  todayKey: string;
  pending: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const weekday = weekdayOf(day.date);
  const isFuture = day.date >= todayKey;
  // Mirrors findRoomConflicts (lib/events.ts): only non-cancelled events occupy a room, and
  // "他サーバー" can be shared, so this matches exactly what finalizing would accept.
  const activeEvents = day.events.filter((e) => !e.cancelled);
  const usedRooms = new Set(activeEvents.map((e) => e.room).filter(isExclusiveRoom));
  const sharedRoomCount = (room: string) => activeEvents.filter((e) => e.room === room).length;

  return (
    <div className="flex max-h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 pt-3 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {day.date === todayKey && <span className="badge bg-brand-soft text-brand">今日</span>}
            {pending && <LoaderCircle className="size-3.5 animate-spin text-muted" aria-label="読み込み中" />}
          </div>
          <h2 className="text-xl font-bold tabular-nums">
            {formatLongDate(day.date)}
            <span className={`ml-1 text-base font-semibold ${weekdayTextClass(weekday) || "text-muted"}`}>
              ({WEEKDAY_LABELS[weekday]})
            </span>
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onPrev} disabled={day.isMinDate || pending} className="icon-btn size-8" aria-label="前の日">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={onNext} disabled={day.isMaxDate || pending} className="icon-btn size-8" aria-label="次の日">
            <ChevronRight className="size-4" />
          </button>
          <button type="button" onClick={onClose} className="icon-btn size-8 border-transparent" aria-label="閉じる">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className={`flex-1 space-y-5 overflow-y-auto px-4 py-4 transition-opacity ${pending ? "opacity-60" : ""}`}>
        {isFuture && (
          <section>
            <h3 className="section-title mb-2 text-xs">部屋の空き状況</h3>
            <ul className="flex flex-wrap gap-1.5">
              {ROOMS.map((room) => {
                const used = usedRooms.has(room);
                const shared = !isExclusiveRoom(room);
                const count = shared ? sharedRoomCount(room) : 0;
                return (
                  <li
                    key={room}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                      used ? "border-transparent bg-surface-3 text-subtle line-through" : "border-line font-medium"
                    }`}
                    title={used ? "使用中" : shared ? "複数可" : "空き"}
                  >
                    <span className={`size-2 rounded-full ${used ? "bg-subtle/50" : roomStyle(room).dot}`} />
                    {ROOM_LABELS[room]}
                    {shared && count > 0 && <span className="text-subtle">{count}件</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <h3 className="section-title mb-2 text-xs">確定済みの予定（{day.events.length}）</h3>
          {day.events.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {day.events.map((e) => {
                const style = roomStyle(e.room);
                return (
                  <li key={e.id}>
                    <Link
                      href={`/events/${e.id}`}
                      className={`relative block overflow-hidden rounded-xl border border-line bg-surface-2 py-2.5 pr-3 pl-4 transition-colors hover:border-brand/50 hover:bg-surface-3 ${
                        e.cancelled ? "opacity-70" : ""
                      }`}
                    >
                      <span className={`absolute inset-y-0 left-0 w-1 ${e.cancelled ? "bg-zinc-400" : style.bar}`} />
                      <p className={`font-semibold ${e.cancelled ? "line-through" : ""}`}>{e.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {e.cancelled ? (
                          <span className="badge bg-red-500/15 text-red-700 dark:text-red-300">キャンセル</span>
                        ) : (
                          e.room && (
                            <span className={`badge ${style.chip}`}>
                              <MapPin className="size-3" />
                              {ROOM_LABELS[e.room as keyof typeof ROOM_LABELS]}
                            </span>
                          )
                        )}
                      </div>
                      {e.description && <p className="mt-1 line-clamp-2 text-xs whitespace-pre-wrap text-muted">{e.description}</p>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted">確定済みの予定はありません</p>
          )}
        </section>

        {day.candidates.length > 0 && (
          <section>
            <h3 className="section-title mb-2 flex items-center gap-1 text-xs">
              <CalendarClock className="size-3.5" />
              調整中（この日が候補）{day.candidates.length}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {day.candidates.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/events/${c.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-subtle/60 px-3 py-2 text-sm transition-colors hover:border-brand/60 hover:bg-surface-2"
                  >
                    <span className="truncate">{c.title}</span>
                    <span
                      className={`badge ${
                        c.closed ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                      }`}
                    >
                      {c.closed ? "確定待ち" : "回答受付中"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isFuture && day.events.length === 0 && day.candidates.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-4 text-sm text-subtle">
            <CalendarPlus className="size-6" />
            過去の日付です
          </div>
        )}
      </div>

      {/* Footer action */}
      {isFuture && (
        <div className="border-t border-line p-3">
          <Link href={`/events/new?date=${day.date}`} className="btn-primary w-full">
            <Plus className="size-4" />
            この日を候補にイベントを作成
          </Link>
        </div>
      )}
    </div>
  );
}
