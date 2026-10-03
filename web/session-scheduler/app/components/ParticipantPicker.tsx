"use client";

import { useMemo, useState } from "react";
import type { GuildMemberSummary } from "@/lib/discord-auth";

// Lets the event creator pre-select guild members (fetched server-side via the bot) as participants.
// Selection only records an internal participation marker (see `EventParticipant`); it does not create
// any schedule response, so a participant can still freely answer (or not) once invited.
export default function ParticipantPicker({
  name = "participantIds",
  members,
}: {
  name?: string;
  members: GuildMemberSummary[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        サーバーメンバー一覧を取得できなかったため、参加者を事前設定できません。
      </p>
    );
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="メンバーを検索"
        className="mb-2 w-full rounded border px-3 py-1.5 text-sm dark:bg-zinc-900"
      />
      <div className="max-h-48 divide-y overflow-y-auto rounded border dark:divide-zinc-700">
        {filtered.length === 0 ? (
          <p className="p-2 text-sm text-zinc-600 dark:text-zinc-400">該当するメンバーがいません。</p>
        ) : (
          filtered.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
              <span>{m.displayName}</span>
              {m.displayName !== m.username && (
                <span className="text-xs text-zinc-500">@{m.username}</span>
              )}
            </label>
          ))
        )}
      </div>

      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {selected.size > 0 ? `選択中: ${selected.size}人` : "参加者を選択しなくても作成できます"}
      </p>

      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
