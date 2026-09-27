import Link from "next/link";
import { getSession } from "@/lib/discord-auth";
import { getCalendarMonthData } from "@/lib/calendar";
import { jstToday } from "@/lib/calendar-grid";
import { getEventListItems, type EventListFilter } from "@/lib/event-list";
import CalendarWidget from "@/app/components/CalendarWidget";
import EventListPanel from "@/app/components/EventListPanel";
import Image from "next/image";

const ERROR_MESSAGES: Record<string, string> = {
  not_member: "対象サーバーのメンバーのみログインできます。",
  invalid_state: "ログインに失敗しました。もう一度お試しください。",
  login_failed: "ログイン処理中にエラーが発生しました。",
};

export default async function Home({
  searchParams,
}: {
    searchParams: Promise<{ error?: string; listFilter?: string }>;
}) {
  const [user, { error, listFilter }] = await Promise.all([getSession(), searchParams]);
  const filter: EventListFilter = listFilter === "confirmed" || listFilter === "mine" ? listFilter : "status";
  const now = jstToday();
  const [calendarData, events] = await Promise.all([
    getCalendarMonthData(now.getUTCFullYear(), now.getUTCMonth()),
    getEventListItems(filter, user?.id),
  ]);

  return (
    <div className=" flex-col gap-6">
      <header className="p-4 flex items-center">
        <Image src='/kusozako_icon.png' alt='アイコン' width={50} height={50} />
        <h1 className=" text-xl font-bold">
          クソザコダイス君
        </h1>
        <h2 className="ml-4">
          日程調整ページ
        </h2>
        <div className="ml-auto flex gap-4 text-sm items-center">
          {user ? (
            <>
              <span>
                <span className="text-gray-400"> ログイン中 </span>  <span className="font-semibold">{user.displayName}</span>
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
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {error && ERROR_MESSAGES[error] && (
          <p className="text-sm text-red-600 dark:text-red-400">{ERROR_MESSAGES[error]}</p>
        )}

      </div>

      <div className="mx-auto w-full max-w-6xl flex flex-col gap-6 lg:flex-row lg:items-start">
        <CalendarWidget initial={calendarData} />

        <aside className="w-full shrink-0 lg:w-80">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">イベント一覧</h2>
            {user && (
              <Link href="/events/new" className="rounded-full bg-[#5865F2] px-3 py-2 text-md font-medium text-white">
                新規作成
              </Link>
            )}
          </div>

          <EventListPanel
            basePath="/"
            filter={filter}
            events={events}
            showMineFilter={Boolean(user)}
            listClassName="flex max-h-[80vh] flex-col gap-2 overflow-y-auto pr-1"
            itemClassName="rounded border p-3 text-sm bg-white dark:bg-zinc-800"
          />
        </aside>
      </div>
    </div>
  );
}
