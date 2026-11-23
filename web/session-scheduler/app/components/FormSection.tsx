import type { ReactNode } from "react";
import { DEFAULT_SYMBOL_LABELS, SYMBOL_MARKS, SYMBOL_ORDER } from "@/lib/event-constants";

// A numbered card section used by the create / reschedule forms.
export function FormSection({
  step,
  title,
  hint,
  optional,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
          {step}
        </span>
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            {title}
            {optional && <span className="badge bg-surface-3 text-muted">任意</span>}
          </h2>
          {hint && <p className="field-hint mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// Editable labels for each answer symbol (form fields `label_<SYMBOL>`).
export function SymbolLabelFields() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SYMBOL_ORDER.map((symbol) => (
        <label key={symbol} className="flex items-center gap-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-lg font-bold">
            {SYMBOL_MARKS[symbol]}
          </span>
          <input name={`label_${symbol}`} defaultValue={DEFAULT_SYMBOL_LABELS[symbol]} className="input" aria-label={`${SYMBOL_MARKS[symbol]} の説明`} />
        </label>
      ))}
    </div>
  );
}
