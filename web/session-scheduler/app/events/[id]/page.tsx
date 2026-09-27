import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { cancelEvent, closeEvent, finalizeEvent, reopenEvent, selectResponse } from "@/app/actions/events";
import {
  ROOM_LABELS,
  SYMBOL_MARKS,
  SYMBOL_ORDER,
  SYMBOL_SCORES,
  ensureEventClosed,
  isPastDeadline,
  isResponseClosed,
  toDateKey,
} from "@/lib/events";
import { AvailabilitySymbol, SessionRoom } from "@/app/generated/prisma/client";
import ResponseTable, { type Responder } from "@/app/components/ResponseTable";
import { CornerDownLeft } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  SCHEDULING: "調整中",
  FINALIZED: "確定済み",
  CANCELLED: "キャンセル",
  COMPLETED: "終了",
};

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }, user] = await Promise.all([params, searchParams, getSession()]);

  await ensureEventClosed(id);

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      creator: true,
      symbolLabels: true,
      candidateDates: {
        orderBy: { date: "asc" },
        include: { responses: { include: { member: true } } },
      },
      finalDates: { orderBy: { date: "asc" } },
    },
  });

  if (!event) notFound();

  const isCreator = user?.id === event.creatorId;
  const closed = isResponseClosed(event);
  const canReopen = event.status === "SCHEDULING" && event.closedAt !== null && !isPastDeadline(event);
  const labelBySymbol = Object.fromEntries(event.symbolLabels.map((l) => [l.symbol, l.label])) as Record<
    AvailabilitySymbol,
    string
  >;

  const myResponses = new Map<string, AvailabilitySymbol>();
  if (user) {
    for (const candidate of event.candidateDates) {
      const mine = candidate.responses.find((r) => r.memberId === user.id);
      if (mine) myResponses.set(candidate.id, mine.symbol);
    }
  }
  const canAnswer = Boolean(user) && event.status === "SCHEDULING" && !closed;

  const dateStats = event.candidateDates.map((candidate) => {
    const counts: Record<AvailabilitySymbol, number> = { CIRCLE: 0, TRIANGLE: 0, CROSS: 0, UNKNOWN: 0 };
    for (const r of candidate.responses) counts[r.symbol] += 1;
    const score = SYMBOL_ORDER.reduce((sum, symbol) => sum + counts[symbol] * SYMBOL_SCORES[symbol], 0);
    return { candidate, counts, score };
  });
  const hasAnyResponse = event.candidateDates.some((c) => c.responses.length > 0);
  const topScore = hasAnyResponse ? Math.max(...dateStats.map((d) => d.score)) : null;

  const responseRows = dateStats.map(({ candidate, counts, score }) => ({
    id: candidate.id,
    dateKey: toDateKey(candidate.date),
    counts,
    isTop: topScore !== null && score === topScore,
    mySelection: myResponses.get(candidate.id) ?? null,
  }));

  // Only the creator gets per-member responder details; other members only ever see aggregate counts.
  const responderDetails: Record<string, Responder[]> = {};
  if (isCreator) {
    for (const candidate of event.candidateDates) {
      responderDetails[candidate.id] = candidate.responses.map((r) => ({
        name: r.member.displayName ?? r.member.username,
        symbol: r.symbol,
      }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-8">
      <Link href="/" className="flex bg-zinc-200 hover:bg-zinc-300 dark:text-zinc-400 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-full w-fit p-2">
        <CornerDownLeft /> 戻る
      </Link>

      <h1 className="mt-2 text-4xl font-bold">{event.title}</h1>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        <span>作成者: {event.creator.displayName ?? event.creator.username}</span>
        <span>状態: {STATUS_LABELS[event.status] ?? event.status}</span>
        {event.schedulingDeadline && (
          <span>回答期限: {event.schedulingDeadline.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
        )}
      </div>

      {event.description && <p className="mt-4 whitespace-pre-wrap">{event.description}</p>}

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <section className="mt-6 rounded border p-4 dark:bg-zinc-800">
        <h2 className="mb-2 font-medium">回答記号</h2>
        <ul className="flex flex-wrap gap-4 text-sm mx-auto">
          {SYMBOL_ORDER.map((symbol) => (
            <li key={symbol}>
              <span className="mr-1 text-lg">{SYMBOL_MARKS[symbol]}</span>
              {labelBySymbol[symbol]}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 font-medium">みんなの回答</h2>
        <ResponseTable
          symbolOrder={SYMBOL_ORDER}
          rows={responseRows}
          canAnswer={canAnswer}
          isCreator={isCreator}
          responderDetails={responderDetails}
          onSelectSymbol={selectResponse.bind(null, event.id)}
        />
      </section>

      {user && event.status === "SCHEDULING" && closed && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">回答の受付は終了しています。</p>
      )}

      {isCreator && event.status === "SCHEDULING" && !closed && (
        <section className="mt-6">
          <form action={closeEvent.bind(null, event.id)}>
            <button type="submit" className="rounded-full border px-5 py-2 text-sm bg-red-300 hover:bg-red-400 dark:hover:bg-red-500">
              参加受付を締め切る
            </button>
          </form>
        </section>
      )}

      {isCreator && event.status === "SCHEDULING" && closed && canReopen && (
        <section className="mt-6">
          <form action={reopenEvent.bind(null, event.id)}>
            <button type="submit" className="rounded-full border px-5 py-2 text-sm hover:bg-green-300 dark:hover:bg-emerald-600">
              参加受付を再開する
            </button>
          </form>
        </section>
      )}

      {isCreator && event.status === "SCHEDULING" && closed && (
        <section className="mt-6 rounded border p-4">
          <h2 className="mb-3 font-medium">実施日と場所を決定</h2>
          <form action={finalizeEvent.bind(null, event.id)} className="flex flex-col gap-3 items-center">
            {event.candidateDates.map((candidate) => {
              const key = toDateKey(candidate.date);
              return (
                <div key={candidate.id} className="flex items-center gap-4">
                  <label className="flex w-40 shrink-0 items-center gap-2 text-xl font-semibold">
                    <input type="checkbox" name="finalDate" value={key} />
                    {key}
                  </label>
                  <label className="ml-16">場所</label>
                  <select name={`room_${key}`} defaultValue="" className="rounded border px-2 py-1 dark:bg-zinc-900">
                    <option value="">なし</option>
                    {Object.values(SessionRoom).map((room) => (
                      <option key={room} value={room}>
                        {ROOM_LABELS[room]}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            <button type="submit" className="mt-2 w-fit rounded-full bg-[#5865F2] hover:bg-[#8992f8] px-5 py-2 font-medium text-white">
              この内容で確定する
            </button>
          </form>
        </section>
      )}

      {event.status === "FINALIZED" && (
        <section className="mt-6 rounded border p-4">
          <h2 className="mb-2 font-medium">実施日</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {event.finalDates.map((f) => (
              <li key={f.id}>
                {toDateKey(f.date)} {f.room && `- ${ROOM_LABELS[f.room]}`}
              </li>
            ))}
          </ul>
          <Link href="/" className="mt-3 inline-block text-sm underline">
            カレンダーで見る
          </Link>
        </section>
      )}

      {isCreator && event.status === "FINALIZED" && (
        <section className="mt-6 flex items-center gap-3">
          <Link href={`/events/${event.id}/reschedule`} className="rounded-full border px-5 py-2 text-sm hover:bg-zinc-400/50 dark:hover:bg-white/30">
            日程を再調整する
          </Link>
          <form action={cancelEvent.bind(null, event.id)}>
            <button type="submit" className="rounded-full border border-red-400 px-5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white">
              イベントをキャンセルする
            </button>
          </form>
        </section>
      )}

      {event.status === "CANCELLED" && (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">このイベントはキャンセルされました。</p>
      )}
    </div>
  );
}
