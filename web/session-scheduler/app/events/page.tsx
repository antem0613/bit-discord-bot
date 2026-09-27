import Link from "next/link";
import { getSession } from "@/lib/discord-auth";
import { getEventListItems, type EventListFilter } from "@/lib/event-list";
import EventListPanel from "@/app/components/EventListPanel";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ listFilter?: string }>;
}) {
  const [user, { listFilter }] = await Promise.all([getSession(), searchParams]);
  const filter: EventListFilter = listFilter === "confirmed" || listFilter === "mine" ? listFilter : "status";
  const events = await getEventListItems(filter, user?.id);

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

      <EventListPanel basePath="/events" filter={filter} events={events} showMineFilter={Boolean(user)} />
    </div>
  );
}
