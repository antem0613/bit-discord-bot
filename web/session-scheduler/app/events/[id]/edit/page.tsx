import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { fetchGuildMembers, getSession, type GuildMemberSummary } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { updateEvent } from "@/app/actions/events";
import { DEFAULT_SYMBOL_LABELS, SYMBOL_ORDER, toDateKey, toDateTimeLocalMin } from "@/lib/events";
import EditEventForm from "@/app/components/EditEventForm";
import Notice from "@/app/components/Notice";
import type { AvailabilitySymbol } from "@/app/generated/prisma/enums";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }, user] = await Promise.all([params, searchParams, getSession()]);

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      symbolLabels: true,
      candidateDates: { orderBy: { date: "asc" }, include: { _count: { select: { responses: true } } } },
      finalDates: { orderBy: { date: "asc" } },
      participants: { select: { memberId: true } },
    },
  });
  if (!event) notFound();

  const backLink = (
    <Link href={`/events/${event.id}`} className="btn-secondary">
      イベントに戻る
    </Link>
  );
  if (!user || user.id !== event.creatorId) {
    return <Notice message="このイベントの作成者のみ編集できます。" action={backLink} />;
  }
  if (event.status !== "SCHEDULING" && event.status !== "FINALIZED") {
    return <Notice message="キャンセル済み・終了済みのイベントは編集できません。" action={backLink} />;
  }

  // Same best-effort rule as the create page: without the member list the picker is hidden and
  // participants are left unchanged.
  let members: GuildMemberSummary[] = [];
  try {
    members = (await fetchGuildMembers()).filter((m) => m.id !== user.id);
  } catch (e) {
    console.error("Failed to fetch guild members for participant picker:", e);
  }

  const labels = Object.fromEntries(
    SYMBOL_ORDER.map((s) => [s, event.symbolLabels.find((l) => l.symbol === s)?.label ?? DEFAULT_SYMBOL_LABELS[s]])
  ) as Record<AvailabilitySymbol, string>;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href={`/events/${event.id}`} className="btn-ghost -ml-3 mb-2">
        <ArrowLeft className="size-4" />
        イベントに戻る
      </Link>
      <h1 className="mb-5 text-2xl font-bold sm:text-3xl">イベントを編集</h1>

      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <TriangleAlert className="size-4 shrink-0" />
          {error}
        </p>
      )}

      <EditEventForm
        action={updateEvent.bind(null, event.id)}
        eventId={event.id}
        status={event.status}
        title={event.title}
        description={event.description}
        labels={labels}
        candidateDates={event.candidateDates.map((c) => toDateKey(c.date))}
        answerCountByDate={Object.fromEntries(event.candidateDates.map((c) => [toDateKey(c.date), c._count.responses]))}
        deadlineValue={event.schedulingDeadline ? toDateTimeLocalMin(event.schedulingDeadline) : ""}
        deadlineMin={toDateTimeLocalMin()}
        finalDates={event.finalDates.map((f) => ({ date: toDateKey(f.date), room: f.room, startTime: f.startTime, endTime: f.endTime }))}
        members={members}
        participantIds={event.participants.map((p) => p.memberId)}
      />
    </div>
  );
}
