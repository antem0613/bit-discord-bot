"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { createEvent } from "@/app/actions/events";
import CandidateDatePicker from "@/app/components/CandidateDatePicker";
import ParticipantPicker from "@/app/components/ParticipantPicker";
import { FormSection, SymbolLabelFields } from "@/app/components/FormSection";
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
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <TriangleAlert className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <FormSection step={1} title="イベントの内容">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">タイトル</span>
            <input name="title" required placeholder="例: 新歓TRPGセッション" className="input" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">説明</span>
            <textarea name="description" rows={3} placeholder="シナリオ名、所要時間、持ち物など" className="input resize-y" />
          </label>
        </div>
      </FormSection>

      <FormSection step={2} title="候補日" hint="連続していなくても選べます。もう一度押すと選択を外せます。">
        <CandidateDatePicker name="candidateDates" initialDates={initialDates} />
      </FormSection>

      <FormSection step={3} title="回答期限" hint="過ぎると自動的に締め切られます。" optional>
        <input type="datetime-local" name="schedulingDeadline" min={deadlineMin} className="input sm:max-w-xs" />
      </FormSection>

      <FormSection step={4} title="回答記号の説明" hint="回答者に表示される各記号の意味です。">
        <SymbolLabelFields />
      </FormSection>

      <FormSection step={5} title="参加者をあらかじめ設定" optional>
        <ParticipantPicker name="participantIds" members={guildMembers} />
      </FormSection>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <Link href="/" className="btn-ghost">
          キャンセル
        </Link>
        <button type="submit" disabled={pending} className="btn-primary px-6">
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          作成する
        </button>
      </div>
    </form>
  );
}
