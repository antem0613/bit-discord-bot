import Link from "next/link";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { isResponseClosed } from "@/lib/events";
import { getCalendarMonthData } from "@/lib/calendar";
import CalendarWidget from "@/app/components/CalendarWidget";

const ERROR_MESSAGES: Record<string, string> = {
  not_member: "対象サーバーのメンバーのみログインできます。",
  invalid_state: "ログインに失敗しました。もう一度お試しください。",
  login_failed: "ログイン処理中にエラーが発生しました。",
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULING: "調整中",
  FINALIZED: "確定済み",
  CANCELLED: "キャンセル",
  COMPLETED: "終了",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const now = new Date();
  const [user, { error }, calendarData, events] = await Promise.all([
    getSession(),
    searchParams,
    getCalendarMonthData(now.getUTCFullYear(), now.getUTCMonth()),
    prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      include: { creator: true, candidateDates: true },
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {error && ERROR_MESSAGES[error] && (
          <p className="text-sm text-red-600 dark:text-red-400">{ERROR_MESSAGES[error]}</p>
        )}
        <div className="ml-auto flex items-center gap-4 text-sm">
          {user ? (
            <>
              <span>
                ようこそ、<span className="font-semibold">{user.displayName}</span> さん
              </span>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="rounded-full border px-4 py-1.5 hover:bg-black/4 dark:hover:bg-white/10">
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <a href="/api/auth/login" className="rounded-full bg-[#5865F2] px-4 py-1.5 font-medium text-white">
              Discordでログイン
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <CalendarWidget initial={calendarData} />

        <aside className="w-full shrink-0 lg:w-80">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">イベント一覧</h2>
            {user && (
              <Link href="/events/new" className="rounded-full bg-[#5865F2] px-3 py-1 text-xs font-medium text-white">
                新規作成
              </Link>
            )}
          </div>

          {events.length === 0 && <p className="text-sm text-zinc-600 dark:text-zinc-400">まだイベントがありません。</p>}

          <ul className="flex flex-col gap-2">
            {events.map((event) => {
              const closed = isResponseClosed(event);
              return (
                <li key={event.id} className="rounded border p-3 text-sm">
                  <Link href={`/events/${event.id}`} className="font-medium underline">
                    {event.title}
                  </Link>
                  <div className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <span>作成者: {event.creator.displayName ?? event.creator.username}</span>
                    <span>候補日: {event.candidateDates.length}件</span>
                    <span>
                      状態: {STATUS_LABELS[event.status] ?? event.status}
                      {event.status === "SCHEDULING" && `（${closed ? "受付終了" : "受付中"}）`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
