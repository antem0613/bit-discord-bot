import Link from "next/link";
import { CalendarCheck, CalendarRange, Clock, User } from "lucide-react";
import { isResponseClosed, toDateKey } from "@/lib/events";
import type { EventListEvent, EventListFilter } from "@/lib/event-list";
import { STATUS_BADGES, formatShortDate, statusKey } from "@/lib/ui-styles";
import dayjs from "@/lib/dayjs";

const FILTER_OPTIONS: { value: EventListFilter; label: string }[] = [
  { value: "status", label: "募集状態順" },
  { value: "confirmed", label: "確定日順" },
  { value: "mine", label: "参加イベント" },
];

const ACCENT_BY_STATUS = {
  open: "before:bg-sky-500",
  closed: "before:bg-amber-500",
  finalized: "before:bg-emerald-500",
  completed: "before:bg-zinc-400",
  cancelled: "before:bg-red-500",
} as const;

export default function EventListPanel({
  basePath,
  filter,
  events,
  showMineFilter,
  listClassName = "flex flex-col gap-2",
}: {
  basePath: string;
  filter: EventListFilter;
  events: EventListEvent[];
  showMineFilter: boolean;
  listClassName?: string;
}) {
  const options = showMineFilter ? FILTER_OPTIONS : FILTER_OPTIONS.filter((o) => o.value !== "mine");

  return (
    <div>
      <nav className="mb-3 flex rounded-full bg-surface-3 p-1 text-xs font-medium" aria-label="並び替え">
        {options.map((opt) => (
          <Link
            key={opt.value}
            href={`${basePath}?listFilter=${opt.value}`}
            scroll={false}
            aria-current={filter === opt.value ? "page" : undefined}
            className={`flex-1 rounded-full px-2 py-1.5 text-center transition-colors ${
              filter === opt.value ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </nav>

      {events.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted">
          該当するイベントがありません。
        </p>
      )}

      <ul className={listClassName}>
        {events.map((event) => {
          const closed = isResponseClosed(event);
          const key = statusKey(event.status, closed);
          const badge = STATUS_BADGES[key];
          const candidateKeys = event.candidateDates.map((c) => toDateKey(c.date));
          const finalKeys = event.finalDates.map((f) => toDateKey(f.date));

          return (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className={`relative block overflow-hidden rounded-xl border border-line bg-surface-2 py-3 pr-3 pl-4 text-sm transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 hover:border-brand/50 hover:bg-surface-3 ${ACCENT_BY_STATUS[key]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 font-semibold">{event.title}</p>
                  <span className={`badge mt-0.5 ${badge.className}`}>{badge.label}</span>
                </div>

                <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted">
                  {event.status === "FINALIZED" && finalKeys.length > 0 ? (
                    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <CalendarCheck className="size-3.5 shrink-0" />
                      <span className="truncate">{finalKeys.map(formatShortDate).join("、")}</span>
                    </span>
                  ) : (
                    candidateKeys.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <CalendarRange className="size-3.5 shrink-0" />
                        <span className="truncate">
                          候補 {formatShortDate(candidateKeys[0])}
                          {candidateKeys.length > 1 && ` 〜 ${formatShortDate(candidateKeys[candidateKeys.length - 1])}`}
                          {candidateKeys.length > 1 && `（${candidateKeys.length}日）`}
                        </span>
                      </span>
                    )
                  )}
                  {key === "open" && event.schedulingDeadline && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5 shrink-0" />
                      締切 {dayjs(event.schedulingDeadline).tz().format("M/D HH:mm")}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <User className="size-3.5 shrink-0" />
                    <span className="truncate">{event.creator.displayName ?? event.creator.username}</span>
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
