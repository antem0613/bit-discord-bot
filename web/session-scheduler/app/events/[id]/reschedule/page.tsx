import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { rescheduleEvent } from "@/app/actions/events";
import { DEFAULT_SYMBOL_LABELS, SYMBOL_MARKS, SYMBOL_ORDER, toDateTimeLocalMin } from "@/lib/events";
import CandidateDatePicker from "@/app/components/CandidateDatePicker";

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

  if (!user || user.id !== event.creatorId) {
    return (
      <div className="mx-auto w-full max-w-xl p-8">
        <p>このイベントの作成者のみ再調整できます。</p>
        <Link href={`/events/${event.id}`} className="text-sm underline">
          イベントに戻る
        </Link>
      </div>
    );
  }

  if (event.status !== "FINALIZED") {
    return (
      <div className="mx-auto w-full max-w-xl p-8">
        <p>確定済みのイベントのみ再調整できます。</p>
        <Link href={`/events/${event.id}`} className="text-sm underline">
          イベントに戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">日程を再調整</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        {event.title}
        {event.description && ` — ${event.description}`}
      </p>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        確定していた実施日はカレンダーから削除され、以下の内容で日程調整をやり直します。
      </p>

      <form action={rescheduleEvent.bind(null, event.id)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">候補日（連続していなくても可）</span>
          <CandidateDatePicker name="candidateDates" />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">日程調整の回答期限（任意。過ぎると自動的に締め切られます）</span>
          <input
            type="datetime-local"
            name="schedulingDeadline"
            min={toDateTimeLocalMin()}
            className="rounded border px-3 py-2 dark:bg-zinc-900"
          />
        </label>

        <fieldset className="flex flex-col gap-2 rounded border p-4">
          <legend className="px-1 text-sm font-medium">回答記号のラベル</legend>
          {SYMBOL_ORDER.map((symbol) => (
            <label key={symbol} className="flex items-center gap-3">
              <span className="w-6 text-center text-lg">{SYMBOL_MARKS[symbol]}</span>
              <input
                name={`label_${symbol}`}
                defaultValue={DEFAULT_SYMBOL_LABELS[symbol]}
                className="flex-1 rounded border px-3 py-1.5 dark:bg-zinc-900"
              />
            </label>
          ))}
        </fieldset>

        <div className="flex items-center gap-4">
          <button type="submit" className="rounded-full bg-[#5865F2] px-5 py-2 font-medium text-white">
            再調整を開始する
          </button>
          <Link href={`/events/${event.id}`} className="text-sm underline">
            キャンセルして戻る
          </Link>
        </div>
      </form>
    </div>
  );
}
