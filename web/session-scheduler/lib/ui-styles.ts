// Shared, client-safe presentation helpers (colors per room / status, Japanese date formatting).
// Class strings are written out in full so Tailwind can detect them.
import { parseDateKey } from "@/lib/calendar-grid";

export type RoomStyle = { chip: string; dot: string; bar: string; text: string };

const NO_ROOM_STYLE: RoomStyle = {
  chip: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  dot: "bg-zinc-400",
  bar: "bg-zinc-400",
  text: "text-zinc-700 dark:text-zinc-300",
};

const ROOM_STYLES: Record<string, RoomStyle> = {
  Room1: {
    chip: "bg-rose-500/12 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
  },
  Room2: {
    chip: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  Room3: {
    chip: "bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-300",
  },
  Room4: {
    chip: "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
  },
  OtherServer: {
    chip: "bg-violet-500/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-300",
  },
};

export function roomStyle(room: string | null | undefined): RoomStyle {
  return (room && ROOM_STYLES[room]) || NO_ROOM_STYLE;
}

export const CANCELLED_CHIP = "bg-zinc-500/10 text-subtle line-through";

export type StatusKey = "open" | "closed" | "finalized" | "completed" | "cancelled";

export function statusKey(status: string, responseClosed: boolean): StatusKey {
  if (status === "SCHEDULING") return responseClosed ? "closed" : "open";
  if (status === "FINALIZED") return "finalized";
  if (status === "CANCELLED") return "cancelled";
  return "completed";
}

export const STATUS_BADGES: Record<StatusKey, { label: string; className: string }> = {
  open: { label: "回答受付中", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  closed: { label: "受付終了・確定待ち", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  finalized: { label: "日程確定", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  completed: { label: "終了", className: "bg-zinc-500/15 text-muted" },
  cancelled: { label: "キャンセル", className: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function weekdayOf(dateKey: string): number {
  return parseDateKey(dateKey).getUTCDay();
}

// Sunday red, Saturday blue, others inherit.
export function weekdayTextClass(weekday: number): string {
  if (weekday === 0) return "text-rose-600 dark:text-rose-400";
  if (weekday === 6) return "text-sky-600 dark:text-sky-400";
  return "";
}

// "2026-11-24" -> "11/24(火)"
export function formatShortDate(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY_LABELS[d.getUTCDay()]})`;
}

// "2026-11-24" -> "2026年11月24日"
export function formatLongDate(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
