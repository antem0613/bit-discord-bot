"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { MapPin, TriangleAlert } from "lucide-react";
import CandidateDatePicker from "@/app/components/CandidateDatePicker";
import ParticipantPicker from "@/app/components/ParticipantPicker";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { FormSection } from "@/app/components/FormSection";
import { ROOM_LABELS, SYMBOL_MARKS, SYMBOL_ORDER } from "@/lib/event-constants";
import { formatShortDate, weekdayOf, weekdayTextClass } from "@/lib/ui-styles";
import type { GuildMemberSummary } from "@/lib/discord-auth";
import type { AvailabilitySymbol } from "@/app/generated/prisma/enums";

export type EditableFinalDate = { date: string; room: string | null; startTime: string | null; endTime: string | null };

export default function EditEventForm({
  action,
  eventId,
  status,
  title,
  description,
  labels,
  candidateDates,
  answerCountByDate,
  deadlineValue,
  deadlineMin,
  finalDates,
  members,
  participantIds,
}: {
  action: (formData: FormData) => Promise<void>;
  eventId: string;
  status: "SCHEDULING" | "FINALIZED";
  title: string;
  description: string;
  labels: Record<AvailabilitySymbol, string>;
  candidateDates: string[];
  answerCountByDate: Record<string, number>;
  deadlineValue: string;
  deadlineMin: string;
  finalDates: EditableFinalDate[];
  members: GuildMemberSummary[];
  participantIds: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedDates, setSelectedDates] = useState(candidateDates);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Existing candidate dates being removed that already have answers (those answers get deleted).
  const removedWithAnswers = candidateDates.filter((d) => !selectedDates.includes(d) && (answerCountByDate[d] ?? 0) > 0);
  const lostAnswers = removedWithAnswers.reduce((sum, d) => sum + (answerCountByDate[d] ?? 0), 0);
  const added = selectedDates.filter((d) => !candidateDates.includes(d));

  // Section numbers: content, (dates, deadline | final dates), labels, participants.
  const labelsStep = status === "SCHEDULING" ? 4 : 3;
  const confirmedRef = useRef(false);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (removedWithAnswers.length > 0 && !confirmedRef.current) {
          e.preventDefault();
          setConfirmOpen(true);
          return;
        }
        setSubmitting(true);
      }}
      className="flex flex-col gap-4"
    >
      <FormSection step={1} title="イベントの内容">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">タイトル</span>
            <input name="title" required defaultValue={title} className="input" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">説明</span>
            <textarea name="description" rows={3} defaultValue={description} className="input resize-y" />
          </label>
        </div>
      </FormSection>

      {status === "SCHEDULING" && (
        <>
          <FormSection step={2} title="候補日" hint="追加すると参加者に通知されます。回答のある日を外すと、その日の回答は削除されます。">
            <CandidateDatePicker name="candidateDates" initialDates={candidateDates} onChange={setSelectedDates} />
            {(added.length > 0 || removedWithAnswers.length > 0) && (
              <div className="mt-3 flex flex-col gap-2 text-sm">
                {added.length > 0 && (
                  <p className="rounded-xl bg-brand-soft px-3 py-2 text-brand">
                    追加: {added.map(formatShortDate).join("、")}（保存時に参加者へ通知）
                  </p>
                )}
                {removedWithAnswers.length > 0 && (
                  <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    {removedWithAnswers.map(formatShortDate).join("、")} の回答 {lostAnswers} 件が削除されます
                  </p>
                )}
              </div>
            )}
          </FormSection>

          <FormSection step={3} title="回答期限" hint="変更する場合は現在より後の日時を指定してください。" optional>
            <input
              type="datetime-local"
              name="schedulingDeadline"
              defaultValue={deadlineValue}
              min={deadlineMin}
              className="input sm:max-w-xs"
            />
          </FormSection>
        </>
      )}

      {status === "FINALIZED" && (
        <FormSection step={2} title="実施日の時間・場所" hint="変更すると参加者に通知されます。日付自体を変える場合は「日程を再調整」を使ってください。">
          <FinalDateFields finalDates={finalDates} />
        </FormSection>
      )}

      <FormSection step={labelsStep} title="回答記号の説明">
        <div className="grid gap-2 sm:grid-cols-2">
          {SYMBOL_ORDER.map((symbol) => (
            <label key={symbol} className="flex items-center gap-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-lg font-bold">
                {SYMBOL_MARKS[symbol]}
              </span>
              <input name={`label_${symbol}`} defaultValue={labels[symbol]} className="input" aria-label={`${SYMBOL_MARKS[symbol]} の説明`} />
            </label>
          ))}
        </div>
      </FormSection>

      <FormSection step={labelsStep + 1} title="参加者" hint="追加した人には通知が届きます。" optional>
        <ParticipantPicker name="participantIds" members={members} initialSelected={participantIds} />
      </FormSection>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <Link href={`/events/${eventId}`} className="btn-ghost">
          キャンセル
        </Link>
        <button type="submit" disabled={submitting} className="btn-primary px-6">
          保存する
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="回答が削除されます"
        confirmLabel="削除して保存"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          confirmedRef.current = true;
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
      >
        {removedWithAnswers.map(formatShortDate).join("、")} を候補日から外すと、その日の回答 {lostAnswers} 件が削除されます。元に戻せません。
      </ConfirmDialog>
    </form>
  );
}

// Room + start/end time inputs for each final date (fields room_/start_/end_<date>).
export function FinalDateFields({ finalDates }: { finalDates: EditableFinalDate[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {finalDates.map((f) => (
        <li key={f.date} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3 sm:flex-row sm:items-center">
          <span className={`w-28 shrink-0 text-lg font-bold tabular-nums ${weekdayTextClass(weekdayOf(f.date))}`}>
            {formatShortDate(f.date)}
          </span>
          <TimeAndRoomInputs dateKey={f.date} room={f.room} startTime={f.startTime} endTime={f.endTime} />
        </li>
      ))}
    </ul>
  );
}

export function TimeAndRoomInputs({
  dateKey,
  room,
  startTime,
  endTime,
}: {
  dateKey: string;
  room?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <input type="time" name={`start_${dateKey}`} defaultValue={startTime ?? ""} className="input w-30 py-2" aria-label="開始時刻" />
        <span className="text-muted">〜</span>
        <input type="time" name={`end_${dateKey}`} defaultValue={endTime ?? ""} className="input w-30 py-2" aria-label="終了時刻（任意）" />
      </div>
      <label className="flex min-w-0 flex-1 items-center gap-1.5">
        <MapPin className="size-4 shrink-0 text-muted" />
        <span className="sr-only">場所</span>
        <select name={`room_${dateKey}`} defaultValue={room ?? ""} className="input min-w-44 py-2">
          <option value="">場所なし</option>
          {Object.entries(ROOM_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
