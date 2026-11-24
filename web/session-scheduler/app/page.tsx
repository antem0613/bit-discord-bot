import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/discord-auth";
import { getCalendarDayData, getCalendarMonthData } from "@/lib/calendar";
import { jstToday, parseDateKey } from "@/lib/calendar-grid";
import { getEventListItems, type EventListFilter } from "@/lib/event-list";
import ScheduleBoard from "@/app/components/ScheduleBoard";
import EventListPanel from "@/app/components/EventListPanel";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ listFilter?: string; date?: string }>;
}) {
  const [user, { listFilter, date }] = await Promise.all([getSession(), searchParams]);
  const filter: EventListFilter = listFilter === "confirmed" || listFilter === "mine" ? listFilter : "status";

  // ?date=YYYY-MM-DD opens that day's panel (shareable link); the server clamps it to the navigable range.
  const initialDay = date && DATE_KEY_PATTERN.test(date) ? await getCalendarDayData(date) : null;
  const monthAnchor = initialDay ? parseDateKey(initialDay.date) : jstToday();

  const [calendarData, events] = await Promise.all([
    getCalendarMonthData(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth()),
    getEventListItems(filter, user?.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <ScheduleBoard
        initialMonth={calendarData}
        initialDay={initialDay}
        eventList={
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">イベント一覧</h2>
              {user && (
                <Link href="/events/new" className="btn-primary px-3 py-1.5">
                  <Plus className="size-4" />
                  新規作成
                </Link>
              )}
            </div>

            <EventListPanel
              basePath="/"
              filter={filter}
              events={events}
              showMineFilter={Boolean(user)}
              currentUserId={user?.id}
              listClassName="-mx-1 flex max-h-[70vh] flex-col gap-2 overflow-y-auto px-1 pb-1"
            />
          </div>
        }
      />
    </div>
  );
}
