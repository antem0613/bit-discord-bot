import Link from "next/link";
import { isResponseClosed, toDateKey } from "@/lib/events";
import type { EventListEvent, EventListFilter } from "@/lib/event-list";

const STATUS_LABELS: Record<string, string> = {
  SCHEDULING: "調整中",
  FINALIZED: "確定済み",
  CANCELLED: "キャンセル",
  COMPLETED: "終了",
};

const FILTER_OPTIONS: { value: EventListFilter; label: string }[] = [
  { value: "status", label: "募集状態順" },
  { value: "confirmed", label: "確定日順" },
  { value: "mine", label: "参加イベント" },
];

export default function EventListPanel({
  basePath,
  filter,
  events,
  showMineFilter,
  listClassName = "flex flex-col gap-2",
  itemClassName = "rounded border p-3 text-sm bg-white hover:bg-slate-200",
}: {
  basePath: string;
  filter: EventListFilter;
  events: EventListEvent[];
  showMineFilter: boolean;
  listClassName?: string;
  itemClassName?: string;
}) {
  const options = showMineFilter ? FILTER_OPTIONS : FILTER_OPTIONS.filter((o) => o.value !== "mine");

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {options.map((opt) => (
          <Link
            key={opt.value}
            href={`${basePath}?listFilter=${opt.value}`}
            className={`rounded-full px-3 py-1 ${
              filter === opt.value ? "bg-[#5865F2] text-white" : "border text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {events.length === 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">該当するイベントがありません。</p>
      )}

      <ul className={listClassName}>
        {events.map((event) => {
          const closed = isResponseClosed(event);
          return (
            <Link href={`/events/${event.id}`} key={event.id} className="rounded border p-3 text-sm bg-white hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-600">
              <p  className="font-bold">
                {event.title}
              </p>
              <div className="mt-1 gap-x-4 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                <span>作成者: {event.creator.displayName ?? event.creator.username}</span>
                <div className={`
                ${event.status === 'SCHEDULING' ? closed ? "text-yellow-600" : "text-cyan-400" : event.status === 'FINALIZED' ? "text-emerald-400" : ""}
                `}>
                  {STATUS_LABELS[event.status] ?? event.status}
                  {event.status === "SCHEDULING" && `（${closed ? "受付終了" : "受付中"}）`}
                </div>
              </div>
              {event.status === "FINALIZED" && event.finalDates.length > 0 && (
                <p className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">
                  日程: {event.finalDates.map((f) => toDateKey(f.date)).join("、")}
                </p>
              )}
            </Link>
          );
        })}
      </ul>
    </div>
  );
}
