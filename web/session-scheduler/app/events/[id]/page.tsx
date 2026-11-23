import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, CalendarClock, Clock, Lock, LockOpen, MapPin, Settings2, TriangleAlert, User, XCircle } from "lucide-react";
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
import { STATUS_BADGES, formatLongDate, formatShortDate, roomStyle, statusKey, weekdayOf, weekdayTextClass, WEEKDAY_LABELS } from "@/lib/ui-styles";
import dayjs from "@/lib/dayjs";

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

  const badge = STATUS_BADGES[statusKey(event.status, closed)];
  const topDateIds = new Set(responseRows.filter((r) => r.isTop).map((r) => r.id));
  const showCreatorPanel = isCreator && (event.status === "SCHEDULING" || event.status === "FINALIZED");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link href="/" className="btn-ghost -ml-3 mb-2">
        <ArrowLeft className="size-4" />
        カレンダー
      </Link>

      {/* ---------- Overview ---------- */}
      <section className="card p-5 sm:p-7">
        <span className={`badge ${badge.className}`}>{badge.label}</span>
        <h1 className="mt-2 text-2xl leading-tight font-bold break-words sm:text-4xl">{event.title}</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <User className="size-4" />
            {event.creator.displayName ?? event.creator.username}
          </span>
          {event.schedulingDeadline && (
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" />
              回答期限 {dayjs(event.schedulingDeadline).tz().format("YYYY/M/D HH:mm")}
            </span>
          )}
          {event.status === "SCHEDULING" && (
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-4" />
              候補日 {event.candidateDates.length}日
            </span>
          )}
        </div>
        {event.description && (
          <p className="mt-5 border-t border-line pt-5 leading-relaxed whitespace-pre-wrap">{event.description}</p>
        )}
      </section>

      {error && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <TriangleAlert className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {event.status === "CANCELLED" && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          <XCircle className="size-4 shrink-0" />
          このイベントはキャンセルされました。
        </p>
      )}

      {/* ---------- Final dates ---------- */}
      {event.status === "FINALIZED" && (
        <section className="card mt-4 border-emerald-500/40 p-5 sm:p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
            <CalendarCheck className="size-5" />
            実施日
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {event.finalDates.map((f) => {
              const key = toDateKey(f.date);
              const wd = weekdayOf(key);
              return (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                  <span className="font-bold tabular-nums">
                    {formatLongDate(key)}
                    <span className={`ml-1 font-semibold ${weekdayTextClass(wd) || "text-muted"}`}>({WEEKDAY_LABELS[wd]})</span>
                  </span>
                  {f.room && (
                    <span className={`badge ${roomStyle(f.room).chip}`}>
                      <MapPin className="size-3" />
                      {ROOM_LABELS[f.room]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------- Responses ---------- */}
      <section className="card mt-4 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold">みんなの回答</h2>
            <p className="field-hint mt-0.5">
              {canAnswer
                ? "各日付で当てはまる記号を選んでください。押すとすぐ保存されます。"
                : !user
                  ? "回答するにはログインしてください。"
                  : event.status === "SCHEDULING" && closed
                    ? "回答の受付は終了しています。"
                    : "回答の集計結果です。"}
              {isCreator && " 日付を押すと回答者が表示されます。"}
            </p>
          </div>
          {!user && event.status === "SCHEDULING" && !closed && (
            <a href="/api/auth/login" className="btn-primary px-3 py-1.5">
              Discordでログイン
            </a>
          )}
        </div>

        <ul className="mb-4 flex flex-wrap gap-1.5 text-sm">
          {SYMBOL_ORDER.map((symbol) => (
            <li key={symbol} className="flex items-center gap-1.5 rounded-full bg-surface-3 py-1 pr-3 pl-2">
              <span className="font-bold">{SYMBOL_MARKS[symbol]}</span>
              <span className="text-muted">{labelBySymbol[symbol]}</span>
            </li>
          ))}
        </ul>

        <ResponseTable
          symbolOrder={SYMBOL_ORDER}
          rows={responseRows}
          canAnswer={canAnswer}
          isCreator={isCreator}
          responderDetails={responderDetails}
          onSelectSymbol={selectResponse.bind(null, event.id)}
        />
      </section>

      {/* ---------- Creator panel ---------- */}
      {showCreatorPanel && (
        <section className="card mt-4 border-dashed p-5 sm:p-6">
          <h2 className="mb-1 flex items-center gap-2 font-bold">
            <Settings2 className="size-5 text-brand" />
            主催者メニュー
          </h2>
          <p className="field-hint mb-4">この操作はイベント作成者にのみ表示されています。</p>

          {event.status === "SCHEDULING" && !closed && (
            <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">回答が集まったら受付を締め切り、実施日を決定します。</p>
              <form action={closeEvent.bind(null, event.id)}>
                <button type="submit" className="btn-danger">
                  <Lock className="size-4" />
                  参加受付を締め切る
                </button>
              </form>
            </div>
          )}

          {event.status === "SCHEDULING" && closed && (
            <div className="flex flex-col gap-4">
              {canReopen && (
                <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted">受付を締め切っています。再開すると再び回答できるようになります。</p>
                  <form action={reopenEvent.bind(null, event.id)}>
                    <button type="submit" className="btn-secondary">
                      <LockOpen className="size-4" />
                      参加受付を再開する
                    </button>
                  </form>
                </div>
              )}

              <form action={finalizeEvent.bind(null, event.id)} className="flex flex-col gap-3">
                <h3 className="text-sm font-bold">実施日と場所を決定</h3>
                <ul className="flex flex-col gap-2">
                  {event.candidateDates.map((candidate) => {
                    const key = toDateKey(candidate.date);
                    return (
                      <li
                        key={candidate.id}
                        className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3 has-[input:checked]:border-brand has-[input:checked]:bg-brand-soft sm:flex-row sm:items-center sm:justify-between"
                      >
                        <label className="flex cursor-pointer items-center gap-3">
                          <input type="checkbox" name="finalDate" value={key} className="size-5 accent-brand" />
                          <span className={`text-lg font-bold tabular-nums ${weekdayTextClass(weekdayOf(key))}`}>
                            {formatShortDate(key)}
                          </span>
                          {topDateIds.has(candidate.id) && (
                            <span className="badge bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">最有力</span>
                          )}
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <MapPin className="size-4 text-muted" />
                          <span className="sr-only">場所</span>
                          <select name={`room_${key}`} defaultValue="" className="input py-2 sm:w-52">
                            <option value="">場所なし</option>
                            {Object.values(SessionRoom).map((room) => (
                              <option key={room} value={room}>
                                {ROOM_LABELS[room]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <button type="submit" className="btn-primary self-end px-6">
                  <CalendarCheck className="size-4" />
                  この内容で確定する
                </button>
              </form>
            </div>
          )}

          {event.status === "FINALIZED" && (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/events/${event.id}/reschedule`} className="btn-secondary">
                <CalendarClock className="size-4" />
                日程を再調整する
              </Link>
              <form action={cancelEvent.bind(null, event.id)}>
                <button type="submit" className="btn-danger">
                  <XCircle className="size-4" />
                  イベントをキャンセルする
                </button>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
