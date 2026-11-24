"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Check, Search, X } from "lucide-react";
import type { GuildMemberSummary } from "@/lib/discord-auth";

// Lets the event creator pre-select guild members (fetched server-side via the bot) as participants.
// Selection only records an internal participation marker (see `EventParticipant`); it does not create
// any schedule response, so a participant can still freely answer (or not) once invited.
export default function ParticipantPicker({
  name = "participantIds",
  members,
  initialSelected = [],
}: {
  name?: string;
  members: GuildMemberSummary[];
  initialSelected?: string[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
    );
  }, [members, query]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (members.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted">
        サーバーメンバー一覧を取得できなかったため、参加者を事前設定できません。
      </p>
    );
  }

  const selectedMembers = members.filter((m) => selected.has(m.id));

  return (
    <div className="flex flex-col gap-2">
      {selectedMembers.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selectedMembers.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => toggle(m.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft py-1 pr-1.5 pl-1 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white"
                aria-label={`${m.displayName} を外す`}
              >
                <Image src={m.avatarUrl} alt="" width={20} height={20} className="size-5 rounded-full" />
                {m.displayName}
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前で検索"
          className="input pl-9"
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-xl border border-line bg-surface-2 p-1">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted">該当するメンバーがいません。</p>
        ) : (
          filtered.map((m) => {
            const isSelected = selected.has(m.id);
            return (
              <label
                key={m.id}
                className={`relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isSelected ? "bg-brand-soft" : "hover:bg-surface-3"
                }`}
              >
                <input type="checkbox" checked={isSelected} onChange={() => toggle(m.id)} className="sr-only" />
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
                    isSelected ? "border-brand bg-brand text-white" : "border-subtle"
                  }`}
                >
                  {isSelected && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <Image src={m.avatarUrl} alt="" width={28} height={28} className="size-7 shrink-0 rounded-full bg-surface-3" />
                <span className="truncate font-medium">{m.displayName}</span>
                {m.displayName !== m.username && <span className="truncate text-xs text-subtle">@{m.username}</span>}
              </label>
            );
          })
        )}
      </div>

      <p className="field-hint">
        {selected.size > 0 ? `${selected.size}人を選択中` : "参加者を選択しなくても作成できます"}
      </p>

      {/* Tells the edit action the picker was available, so an empty selection means "remove all". */}
      <input type="hidden" name="participantsEditable" value="1" />
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
