import Link from "next/link";
import { getSession } from "@/lib/discord-auth";
import { createEvent } from "@/app/actions/events";
import { DEFAULT_SYMBOL_LABELS, SYMBOL_MARKS, SYMBOL_ORDER } from "@/lib/events";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [user, { error }] = await Promise.all([getSession(), searchParams]);

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-xl p-8">
        <p>イベントを作成するにはログインが必要です。</p>
        <a href="/api/auth/login" className="text-blue-600 underline">
          Discordでログイン
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">イベントを作成</h1>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <form action={createEvent} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">タイトル</span>
          <input name="title" required className="rounded border px-3 py-2 dark:bg-zinc-900" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">説明</span>
          <textarea name="description" rows={3} className="rounded border px-3 py-2 dark:bg-zinc-900" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">候補日（1行に1つ、YYYY-MM-DD形式。連続していなくても可）</span>
          <textarea
            name="candidateDates"
            required
            rows={5}
            placeholder={"2026-10-01\n2026-10-03\n2026-10-05"}
            className="rounded border px-3 py-2 font-mono dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">日程調整の回答期限（任意。過ぎると自動的に締め切られます）</span>
          <input type="datetime-local" name="schedulingDeadline" className="rounded border px-3 py-2 dark:bg-zinc-900" />
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
            作成する
          </button>
          <Link href="/events" className="text-sm underline">
            一覧に戻る
          </Link>
        </div>
      </form>
    </div>
  );
}
