import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BellRing, CalendarCheck, CalendarClock, CircleCheck, Clock, Lock, LockOpen, MapPin, Pencil, Settings2, TriangleAlert, User, XCircle } from "lucide-react";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import {
  cancelEvent,
  closeEvent,
  finalizeEvent,
  remindNonResponders,
  reopenEvent,
  saveComment,
  saveResponseNote,
  selectResponse,
} from "@/app/actions/events";
import EventComments from "@/app/components/EventComments";
import {
  ROOM_LABELS,
  SYMBOL_MARKS,
  SYMBOL_ORDER,
  SYMBOL_SCORES,
  ensureEventClosed,
  formatTimeRange,
  isPastDeadline,
  isResponseClosed,
  toDateKey,
} from "@/lib/events";
import { AvailabilitySymbol } from "@/app/generated/prisma/client";
import ResponseTable, { type Responder } from "@/app/components/ResponseTable";
import { ConfirmSubmitButton } from "@/app/components/ConfirmDialog";
import { TimeAndRoomInputs } from "@/app/components/EditEventForm";
import { REMINDER_COOLDOWN_MS } from "@/lib/event-constants";
import { STATUS_BADGES, formatLongDate, formatShortDate, roomStyle, statusKey, weekdayOf, weekdayTextClass, WEEKDAY_LABELS } from "@/lib/ui-styles";
import dayjs from "@/lib/dayjs";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; count?: string }>;
}) {
  const [{ id }, { error, notice, count }, user] = await Promise.all([params, searchParams, getSession()]);

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
      participants: { include: { member: true } },
      comments: { include: { member: true }, orderBy: { updatedAt: "desc" } },
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
    myNote: candidate.responses.find((r) => r.memberId === user?.id)?.note ?? null,
    // △ notes are public (like comments), so everyone sees who wrote them.
    notes: candidate.responses
      .filter((r) => r.symbol === "TRIANGLE" && r.note)
      .map((r) => ({ name: r.member.displayName ?? r.member.username, note: r.note as string })),
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

  // Creator-only: which pre-set participants still owe answers (for the reminder button).
  const answeredByMember = new Map<string, number>();
  for (const c of event.candidateDates) {
    for (const r of c.responses) answeredByMember.set(r.memberId, (answeredByMember.get(r.memberId) ?? 0) + 1);
  }
  const totalCandidates = event.candidateDates.length;
  const invited = event.participants
    .filter((p) => p.memberId !== event.creatorId)
    .map((p) => ({
      id: p.memberId,
      name: p.member.displayName ?? p.member.username,
      answered: answeredByMember.get(p.memberId) ?? 0,
    }));
  const notAnswered = invited.filter((p) => p.answered === 0);
  const partlyAnswered = invited.filter((p) => p.answered > 0 && p.answered < totalCandidates);
  const reminderWaitMinutes = minutesUntilReminderAllowed(event.lastRemindedAt);

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

      {notice === "updated" && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CircleCheck className="size-4 shrink-0" />
          イベントを更新しました。
        </p>
      )}
      {notice === "reminded" && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CircleCheck className="size-4 shrink-0" />
          未回答の {Number(count) || 0} 人にリマインドを送りました。
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
          <ul className="flex flex-col gap-2">
            {event.finalDates.map((f) => {
              const key = toDateKey(f.date);
              const wd = weekdayOf(key);
              return (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                  <span className="font-bold tabular-nums">
                    {formatLongDate(key)}
                    <span className={`ml-1 font-semibold ${weekdayTextClass(wd) || "text-muted"}`}>({WEEKDAY_LABELS[wd]})</span>
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    {(f.startTime || f.endTime) && (
                      <span className="badge bg-surface-3 text-foreground tabular-nums">
                        <Clock className="size-3" />
                        {formatTimeRange(f.startTime, f.endTime)}
                      </span>
                    )}
                    {f.room && (
                      <span className={`badge ${roomStyle(f.room).chip}`}>
                        <MapPin className="size-3" />
                        {ROOM_LABELS[f.room]}
                      </span>
                    )}
                  </span>
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
          onSaveNote={saveResponseNote.bind(null, event.id)}
        />
      </section>

      {/* ---------- Comments (visible to everyone) ---------- */}
      <EventComments
        comments={event.comments.map((c) => ({
          id: c.id,
          name: c.member.displayName ?? c.member.username,
          body: c.body,
          updatedLabel: dayjs(c.updatedAt).tz().format("M/D HH:mm"),
          isMine: c.memberId === user?.id,
        }))}
        myBody={event.comments.find((c) => c.memberId === user?.id)?.body ?? ""}
        canComment={Boolean(user) && event.status !== "CANCELLED"}
        onSave={saveComment.bind(null, event.id)}
      />

      {/* ---------- Creator panel ---------- */}
      {showCreatorPanel && (
        <section className="card mt-4 border-dashed p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="mb-1 flex items-center gap-2 font-bold">
                <Settings2 className="size-5 text-brand" />
                主催者メニュー
              </h2>
              <p className="field-hint">この操作はイベント作成者にのみ表示されています。</p>
            </div>
            <Link href={`/events/${event.id}/edit`} className="btn-secondary">
              <Pencil className="size-4" />
              編集
            </Link>
          </div>

          {event.status === "SCHEDULING" && !closed && invited.length > 0 && (
            <div className="mb-3 rounded-xl bg-surface-2 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    参加者 {invited.length}人のうち 回答済み {invited.length - notAnswered.length - partlyAnswered.length}人
                  </p>
                  {notAnswered.length > 0 && (
                    <p className="mt-1 text-muted">
                      <span className="badge mr-1 bg-amber-500/15 text-amber-700 dark:text-amber-300">未回答</span>
                      {notAnswered.map((p) => p.name).join("、")}
                    </p>
                  )}
                  {partlyAnswered.length > 0 && (
                    <p className="mt-1 text-muted">
                      <span className="badge mr-1 bg-sky-500/15 text-sky-700 dark:text-sky-300">一部回答</span>
                      {partlyAnswered.map((p) => `${p.name}（${p.answered}/${totalCandidates}）`).join("、")}
                    </p>
                  )}
                </div>
                {notAnswered.length + partlyAnswered.length > 0 && (
                  <form action={remindNonResponders.bind(null, event.id)} className="shrink-0">
                    <button type="submit" className="btn-secondary" disabled={reminderWaitMinutes > 0}>
                      <BellRing className="size-4" />
                      未回答者にリマインド
                    </button>
                    <p className="field-hint mt-1 text-right">
                      {reminderWaitMinutes > 0 ? `あと${reminderWaitMinutes}分で再送できます` : "Discord の DM で通知します"}
                    </p>
                  </form>
                )}
              </div>
            </div>
          )}

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
                <h3 className="text-sm font-bold">実施日・時間・場所を決定</h3>
                <p className="field-hint -mt-2">時間は任意です。終了時刻は日付をまたいでも構いません。</p>
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
                        <div className="sm:max-w-xl sm:flex-1">
                          <TimeAndRoomInputs dateKey={key} />
                        </div>
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
              <ConfirmSubmitButton
                action={cancelEvent.bind(null, event.id)}
                className="btn-danger"
                danger
                title="イベントをキャンセルしますか？"
                message={`「${event.title}」をキャンセルします。カレンダー上はキャンセル済みとして残り、元に戻すことはできません。`}
                confirmLabel="キャンセルする"
              >
                <XCircle className="size-4" />
                イベントをキャンセルする
              </ConfirmSubmitButton>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// Minutes left before the host may send another reminder (0 = allowed now).
function minutesUntilReminderAllowed(lastRemindedAt: Date | null): number {
  if (!lastRemindedAt) return 0;
  const remainingMs = lastRemindedAt.getTime() + REMINDER_COOLDOWN_MS - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 60_000) : 0;
}
