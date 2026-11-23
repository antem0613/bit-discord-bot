"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Crown, Users } from "lucide-react";
import { SYMBOL_MARKS } from "@/lib/event-constants";
import { formatShortDate, weekdayOf, weekdayTextClass } from "@/lib/ui-styles";
import type { AvailabilitySymbol } from "@/app/generated/prisma/enums";

export type ResponseRow = {
  id: string;
  dateKey: string;
  counts: Record<AvailabilitySymbol, number>;
  isTop: boolean;
  mySelection: AvailabilitySymbol | null;
};

export type Responder = { name: string; symbol: AvailabilitySymbol };

const SYMBOL_STYLES: Record<AvailabilitySymbol, { selected: string; bar: string; text: string }> = {
  CIRCLE: { selected: "border-emerald-500 bg-emerald-500 text-white", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  TRIANGLE: { selected: "border-amber-500 bg-amber-500 text-white", bar: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" },
  CROSS: { selected: "border-rose-500 bg-rose-500 text-white", bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  UNKNOWN: { selected: "border-zinc-500 bg-zinc-500 text-white", bar: "bg-zinc-400", text: "text-muted" },
};

export default function ResponseTable({
  symbolOrder,
  rows,
  canAnswer,
  isCreator,
  responderDetails,
  onSelectSymbol,
}: {
  symbolOrder: AvailabilitySymbol[];
  rows: ResponseRow[];
  canAnswer: boolean;
  isCreator: boolean;
  responderDetails: Record<string, Responder[]>;
  onSelectSymbol: (candidateDateId: string, symbol: AvailabilitySymbol) => Promise<void>;
}) {
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function select(rowId: string, symbol: AvailabilitySymbol) {
    setPendingKey(`${rowId}:${symbol}`);
    startTransition(async () => {
      await onSelectSymbol(rowId, symbol);
      setPendingKey(null);
    });
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const total = symbolOrder.reduce((sum, s) => sum + row.counts[s], 0);
        const weekday = weekdayOf(row.dateKey);
        const expanded = isCreator && selectedDateId === row.id;
        const responders = responderDetails[row.id] ?? [];

        return (
          <li
            key={row.id}
            className={`overflow-hidden rounded-xl border bg-surface-2 transition-colors ${
              row.isTop ? "border-emerald-500/60 ring-1 ring-emerald-500/30" : "border-line"
            }`}
          >
            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
              <div className="flex min-w-0 items-center justify-between gap-2 sm:w-44 sm:shrink-0 sm:flex-col sm:items-start sm:gap-1">
                {isCreator ? (
                  <button
                    type="button"
                    onClick={() => setSelectedDateId((current) => (current === row.id ? null : row.id))}
                    aria-expanded={expanded}
                    className="group flex items-center gap-1 rounded-md text-left"
                    title="回答者を表示"
                  >
                    <span className={`text-lg font-bold tabular-nums ${weekdayTextClass(weekday)}`}>{formatShortDate(row.dateKey)}</span>
                    <ChevronDown className={`size-4 text-muted transition-transform group-hover:text-foreground ${expanded ? "rotate-180" : ""}`} />
                  </button>
                ) : (
                  <span className={`text-lg font-bold tabular-nums ${weekdayTextClass(weekday)}`}>{formatShortDate(row.dateKey)}</span>
                )}
                <span className="flex items-center gap-2 text-xs text-muted">
                  {row.isTop && (
                    <span className="badge bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      <Crown className="size-3" />
                      最有力
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" />
                    {total}人
                  </span>
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {symbolOrder.map((symbol) => {
                    const isSelected = row.mySelection === symbol;
                    const count = row.counts[symbol];
                    const style = SYMBOL_STYLES[symbol];
                    const isThisPending = pendingKey === `${row.id}:${symbol}`;

                    if (!canAnswer) {
                      return (
                        <div
                          key={symbol}
                          className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm ${
                            isSelected ? style.selected : "border-transparent bg-surface"
                          }`}
                        >
                          <span className={`font-bold ${isSelected ? "" : style.text}`}>{SYMBOL_MARKS[symbol]}</span>
                          <span className="tabular-nums">{count}</span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={symbol}
                        type="button"
                        onClick={() => select(row.id, symbol)}
                        disabled={isPending}
                        aria-pressed={isSelected}
                        className={`group flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm transition-all disabled:cursor-wait ${
                          isSelected
                            ? `${style.selected} shadow-sm`
                            : "border-line bg-surface hover:-translate-y-px hover:border-foreground/40 hover:shadow-sm"
                        } ${isThisPending ? "animate-pulse" : ""}`}
                      >
                        <span className={`font-bold ${isSelected ? "" : style.text}`}>{SYMBOL_MARKS[symbol]}</span>
                        {isSelected ? (
                          <span className="tabular-nums">{count}</span>
                        ) : (
                          <>
                            <span className="tabular-nums group-hover:hidden">{count}</span>
                            <span className="hidden tabular-nums group-hover:inline">{count + 1}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>

                {total > 0 && (
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    {symbolOrder.map((symbol) =>
                      row.counts[symbol] > 0 ? (
                        <span
                          key={symbol}
                          className={SYMBOL_STYLES[symbol].bar}
                          style={{ width: `${(row.counts[symbol] / total) * 100}%` }}
                        />
                      ) : null
                    )}
                  </div>
                )}
              </div>
            </div>

            {expanded && (
              <div className="border-t border-line bg-surface px-4 py-3 text-sm">
                <p className="mb-2 text-xs font-semibold text-muted">{formatShortDate(row.dateKey)} の回答者</p>
                {responders.length > 0 ? (
                  <ul className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                    {responders.map((responder, index) => (
                      <li key={index} className="flex items-center gap-1.5 rounded-full bg-surface-3 py-1 pr-3 pl-2">
                        <span className={`font-bold ${SYMBOL_STYLES[responder.symbol].text}`}>{SYMBOL_MARKS[responder.symbol]}</span>
                        {responder.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">回答者はいません。</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
