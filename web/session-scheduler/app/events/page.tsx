import Link from "next/link";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { isResponseClosed } from "@/lib/events";

const STATUS_LABELS: Record<string, string> = {
  SCHEDULING: "調整中",
  FINALIZED: "確定済み",
  CANCELLED: "キャンセル",
  COMPLETED: "終了",
};

export default async function EventsPage() {
  const user = await getSession();

  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: { creator: true, candidateDates: true },
  });

  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">イベント一覧</h1>
        {user ? (
          <Link href="/events/new" className="rounded-full bg-[#5865F2] px-4 py-2 text-sm font-medium text-white">
            新規作成
          </Link>
        ) : (
          <a href="/api/auth/login" className="text-sm underline">
            Discordでログイン
          </a>
        )}
      </div>

      {events.length === 0 && <p className="text-zinc-600 dark:text-zinc-400">まだイベントがありません。</p>}

      <ul className="flex flex-col gap-3">
        {events.map((event) => {
          const closed = isResponseClosed(event);
          return (
            <li key={event.id} className="rounded border p-4">
              <Link href={`/events/${event.id}`} className="font-medium underline">
                {event.title}
              </Link>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <span>作成者: {event.creator.displayName ?? event.creator.username}</span>
                <span>候補日: {event.candidateDates.length}件</span>
                <span>状態: {STATUS_LABELS[event.status] ?? event.status}</span>
                {event.status === "SCHEDULING" && <span>{closed ? "受付終了" : "受付中"}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
