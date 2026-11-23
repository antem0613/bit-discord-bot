import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, TriangleAlert } from "lucide-react";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { rescheduleEvent } from "@/app/actions/events";
import { toDateTimeLocalMin } from "@/lib/events";
import CandidateDatePicker from "@/app/components/CandidateDatePicker";
import { FormSection, SymbolLabelFields } from "@/app/components/FormSection";
import Notice from "@/app/components/Notice";

export default async function RescheduleEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }, user] = await Promise.all([params, searchParams, getSession()]);

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, creatorId: true, status: true },
  });
  if (!event) notFound();

  const backLink = (
    <Link href={`/events/${event.id}`} className="btn-secondary">
      イベントに戻る
    </Link>
  );

  if (!user || user.id !== event.creatorId) {
    return <Notice message="このイベントの作成者のみ再調整できます。" action={backLink} />;
  }

  if (event.status !== "FINALIZED") {
    return <Notice message="確定済みのイベントのみ再調整できます。" action={backLink} />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href={`/events/${event.id}`} className="btn-ghost -ml-3 mb-2">
        <ArrowLeft className="size-4" />
        イベントに戻る
      </Link>
      <h1 className="text-2xl font-bold sm:text-3xl">日程を再調整</h1>
      <p className="mt-1 font-medium text-muted">{event.title}</p>
      {event.description && <p className="mt-1 line-clamp-2 text-sm whitespace-pre-wrap text-subtle">{event.description}</p>}

      <p className="mt-4 mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
        <Info className="mt-0.5 size-4 shrink-0" />
        確定していた実施日はカレンダーから削除され、以下の内容で日程調整をやり直します。
      </p>

      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <TriangleAlert className="size-4 shrink-0" />
          {error}
        </p>
      )}

      <form action={rescheduleEvent.bind(null, event.id)} className="flex flex-col gap-4">
        <FormSection step={1} title="新しい候補日" hint="連続していなくても選べます。">
          <CandidateDatePicker name="candidateDates" />
        </FormSection>

        <FormSection step={2} title="回答期限" hint="過ぎると自動的に締め切られます。" optional>
          <input type="datetime-local" name="schedulingDeadline" min={toDateTimeLocalMin()} className="input sm:max-w-xs" />
        </FormSection>

        <FormSection step={3} title="回答記号の説明">
          <SymbolLabelFields />
        </FormSection>

        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <Link href={`/events/${event.id}`} className="btn-ghost">
            キャンセル
          </Link>
          <button type="submit" className="btn-primary px-6">
            再調整を開始する
          </button>
        </div>
      </form>
    </div>
  );
}
