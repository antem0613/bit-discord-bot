import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { closeEvent, finalizeEvent, submitResponses } from "@/app/actions/events";
import {
  ROOM_LABELS,
  SYMBOL_MARKS,
  SYMBOL_ORDER,
  ensureEventClosed,
  isResponseClosed,
  toDateKey,
} from "@/lib/events";
import { AvailabilitySymbol, SessionRoom } from "@/app/generated/prisma/client";

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

  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <Link href="/events" className="text-sm underline">
        ← 一覧に戻る
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">{event.title}</h1>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        <span>作成者: {event.creator.displayName ?? event.creator.username}</span>
        <span>状態: {STATUS_LABELS[event.status] ?? event.status}</span>
        {event.schedulingDeadline && (
          <span>回答期限: {event.schedulingDeadline.toLocaleString("ja-JP")}</span>
        )}
        {event.status === "SCHEDULING" && <span>{closed ? "受付終了" : "受付中"}</span>}
      </div>
      {event.description && <p className="mt-4 whitespace-pre-wrap">{event.description}</p>}

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <section className="mt-6 rounded border p-4">
        <h2 className="mb-2 font-medium">回答記号</h2>
        <ul className="flex flex-wrap gap-4 text-sm">
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">日付</th>
                {SYMBOL_ORDER.map((symbol) => (
                  <th key={symbol} className="py-2 pr-4">
                    {SYMBOL_MARKS[symbol]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {event.candidateDates.map((candidate) => {
                const bySymbol = new Map<AvailabilitySymbol, string[]>();
                for (const r of candidate.responses) {
                  const name = r.member.displayName ?? r.member.username;
                  bySymbol.set(r.symbol, [...(bySymbol.get(r.symbol) ?? []), name]);
                }
                return (
                  <tr key={candidate.id} className="border-b align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">{toDateKey(candidate.date)}</td>
                    {SYMBOL_ORDER.map((symbol) => (
                      <td key={symbol} className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                        {(bySymbol.get(symbol) ?? []).join("、")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {user && event.status === "SCHEDULING" && (
        <section className="mt-6">
          <h2 className="mb-2 font-medium">あなたの回答</h2>
          {closed ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">回答の受付は終了しています。</p>
          ) : (
            <form action={submitResponses.bind(null, event.id)} className="flex flex-col gap-3">
              {event.candidateDates.map((candidate) => (
                <div key={candidate.id} className="flex items-center gap-4">
                  <span className="w-28 shrink-0">{toDateKey(candidate.date)}</span>
                  <div className="flex gap-3">
                    {SYMBOL_ORDER.map((symbol) => (
                      <label key={symbol} className="flex items-center gap-1 text-sm">
                        <input
                          type="radio"
                          name={`symbol_${candidate.id}`}
                          value={symbol}
                          defaultChecked={myResponses.get(candidate.id) === symbol}
                        />
                        {SYMBOL_MARKS[symbol]}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button type="submit" className="mt-2 w-fit rounded-full bg-[#5865F2] px-5 py-2 font-medium text-white">
                回答する
              </button>
            </form>
          )}
        </section>
      )}

      {isCreator && event.status === "SCHEDULING" && !closed && (
        <section className="mt-6">
          <form action={closeEvent.bind(null, event.id)}>
            <button type="submit" className="rounded-full border px-5 py-2 text-sm">
              参加受付を締め切る
            </button>
          </form>
        </section>
      )}

      {isCreator && event.status === "SCHEDULING" && closed && (
        <section className="mt-6 rounded border p-4">
          <h2 className="mb-3 font-medium">実施日を確定する</h2>
          <form action={finalizeEvent.bind(null, event.id)} className="flex flex-col gap-3">
            {event.candidateDates.map((candidate) => {
              const key = toDateKey(candidate.date);
              return (
                <div key={candidate.id} className="flex items-center gap-4">
                  <label className="flex w-40 shrink-0 items-center gap-2">
                    <input type="checkbox" name="finalDate" value={key} />
                    {key}
                  </label>
                  <select name={`room_${key}`} defaultValue="" className="rounded border px-2 py-1 dark:bg-zinc-900">
                    <option value="">セッション部屋なし</option>
                    {Object.values(SessionRoom).map((room) => (
                      <option key={room} value={room}>
                        {ROOM_LABELS[room]}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            <button type="submit" className="mt-2 w-fit rounded-full bg-[#5865F2] px-5 py-2 font-medium text-white">
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
    </div>
  );
}
