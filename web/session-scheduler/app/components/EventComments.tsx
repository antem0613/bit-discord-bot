"use client";

import { useState, useTransition } from "react";
import { Check, MessageCircle } from "lucide-react";
import { COMMENT_MAX_LENGTH } from "@/lib/event-constants";

export type CommentItem = { id: string; name: string; body: string; updatedLabel: string; isMine: boolean };

// One free-text comment per member, shown to everyone. Saving an empty comment deletes it.
export default function EventComments({
  comments,
  myBody,
  canComment,
  onSave,
}: {
  comments: CommentItem[];
  myBody: string;
  canComment: boolean;
  onSave: (body: string) => Promise<{ error?: string }>;
}) {
  const [value, setValue] = useState(myBody);
  const [saved, setSaved] = useState(myBody);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const dirty = value.trim() !== saved;

  function save() {
    startTransition(async () => {
      const next = value.trim();
      const result = await onSave(next);
      if (result.error) {
        setStatus({ kind: "error", text: result.error });
      } else {
        setSaved(next);
        setValue(next);
        setStatus({ kind: "ok", text: next ? "保存しました" : "コメントを削除しました" });
      }
    });
  }

  return (
    <section className="card mt-4 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-bold">
        <MessageCircle className="size-5 text-brand" />
        コメント
        <span className="text-sm font-normal text-muted">{comments.length}件</span>
      </h2>
      <p className="field-hint mt-0.5">都合の補足などを書けます（1人1件・全員に表示されます）。</p>

      {canComment && (
        <div className="mt-4">
          <textarea
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setStatus(null);
            }}
            maxLength={COMMENT_MAX_LENGTH}
            rows={2}
            placeholder="例: 平日は21時以降なら参加できます"
            aria-label="あなたのコメント"
            className="input resize-y"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-subtle tabular-nums">
              {value.length}/{COMMENT_MAX_LENGTH}
            </span>
            <div className="flex items-center gap-3">
              {status && (
                <span className={`flex items-center gap-1 text-xs ${status.kind === "error" ? "text-danger" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {status.kind === "ok" && <Check className="size-3.5" />}
                  {status.text}
                </span>
              )}
              <button type="button" onClick={save} disabled={!dirty || isPending} className="btn-primary px-4 py-1.5">
                {saved ? "更新する" : "投稿する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {comments.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className={`rounded-xl px-4 py-3 ${c.isMine ? "bg-brand-soft" : "bg-surface-2"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">
                  {c.name}
                  {c.isMine && <span className="ml-1.5 text-xs font-normal text-muted">（あなた）</span>}
                </span>
                <span className="shrink-0 text-xs text-subtle">{c.updatedLabel}</span>
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-4 text-center text-sm text-muted">まだコメントはありません</p>
      )}
    </section>
  );
}
