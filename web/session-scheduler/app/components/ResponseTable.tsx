"use client";

import { useState } from "react";
import { SYMBOL_MARKS } from "@/lib/event-constants";
import type { AvailabilitySymbol } from "@/app/generated/prisma/enums";

export type ResponseRow = {
  id: string;
  dateKey: string;
  counts: Record<AvailabilitySymbol, number>;
  isTop: boolean;
  mySelection: AvailabilitySymbol | null;
};

export type Responder = { name: string; symbol: AvailabilitySymbol };

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
  const selectedRow = rows.find((r) => r.id === selectedDateId) ?? null;
  const selectedResponders = selectedDateId ? (responderDetails[selectedDateId] ?? []) : [];

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start border rounded-xl px-4 dark:bg-zinc-800">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">日付</th>
              {symbolOrder.map((symbol) => (
                <th key={symbol} className="py-2 pr-4 text-center">
                  {SYMBOL_MARKS[symbol]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b align-top ${row.isTop ? "bg-green-300 dark:bg-emerald-400/20" : ""} ${
                  selectedDateId === row.id ? "outline -outline-offset-2 bg-slate-300/50" : ""
                }`}
              >
                <td className="py-2 pr-4 whitespace-nowrap">
                  {isCreator ? (
                    <button
                      type="button"
                      onClick={() => setSelectedDateId((current) => (current === row.id ? null : row.id))}
                      className="underline decoration-dotted underline-offset-2"
                    >
                      {row.dateKey}
                    </button>
                  ) : (
                    row.dateKey
                  )}
                </td>
                {symbolOrder.map((symbol) => {
                  const isSelected = row.mySelection === symbol;
                  const count = row.counts[symbol];
                  const buttonClass = `group inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors ${
                    isSelected
                      ? "border-zinc-100 bg-stone-400 text-white dark:bg-zinc-100 dark:text-slate-800"
                      : "border-zinc-300 hover:border-zinc-700 dark:border-zinc-700"
                  }`;
                  return (
                    <td key={symbol} className="py-2 pr-4 text-center">
                      {canAnswer ? (
                        <button type="button" onClick={() => onSelectSymbol(row.id, symbol)} className={buttonClass}>
                          {isSelected ? (
                            <span>{count}</span>
                          ) : (
                            <>
                              <span className="group-hover:hidden">{count}</span>
                              <span className="hidden group-hover:inline">{count + 1}</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-zinc-600 dark:text-zinc-400">{count}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isCreator && selectedRow && (
        <aside className="w-full shrink-0 p-4 text-sm lg:w-64">
          <h3 className="mb-2 font-medium">{selectedRow.dateKey} の回答者</h3>
          {selectedResponders.length > 0 ? (
                      <ul className="flex flex-col gap-1 max-h-[20vh] overflow-y-auto">
              {selectedResponders.map((responder, index) => (
                <li key={index} className="flex items-center justify-between gap-2">
                  <span>{responder.name}</span>
                  <span>{SYMBOL_MARKS[responder.symbol]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">回答者はいません。</p>
          )}
        </aside>
      )}
    </div>
  );
}
