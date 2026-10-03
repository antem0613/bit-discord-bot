"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createEvent } from "@/app/actions/events";
import { DEFAULT_SYMBOL_LABELS, SYMBOL_MARKS, SYMBOL_ORDER } from "@/lib/event-constants";
import CandidateDatePicker from "@/app/components/CandidateDatePicker";
import ParticipantPicker from "@/app/components/ParticipantPicker";
import type { GuildMemberSummary } from "@/lib/discord-auth";

export default function CreateEventForm({
  deadlineMin,
  initialDates = [],
  guildMembers = [],
}: {
  deadlineMin: string;
  initialDates?: string[];
  guildMembers?: GuildMemberSummary[];
}) {
  const [state, formAction, pending] = useActionState(createEvent, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">タイトル</span>
        <input name="title" required className="rounded border px-3 py-2 dark:bg-zinc-900" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">説明</span>
        <textarea name="description" rows={3} className="rounded border px-3 py-2 dark:bg-zinc-900" />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">候補日（連続していなくても可）</span>
        <CandidateDatePicker name="candidateDates" initialDates={initialDates} />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">日程調整の回答期限（過ぎると自動的に締め切られます）</span>
        <input
          type="datetime-local"
          name="schedulingDeadline"
          min={deadlineMin}
          className="rounded border px-3 py-2 dark:bg-zinc-600 dark:text-white"
        />
      </label>

      <fieldset className="flex flex-col gap-2 rounded border p-4">
        <legend className="px-1 text-sm font-medium">回答記号の説明</legend>
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

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">参加者をあらかじめ設定（任意）</span>
        <ParticipantPicker name="participantIds" members={guildMembers} />
      </div>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="rounded-full bg-[#5865F2] px-5 py-2 font-medium text-white disabled:opacity-50">
          作成する
        </button>
        <Link href="/" className="text-sm underline">
          カレンダーに戻る
        </Link>
      </div>
    </form>
  );
}
