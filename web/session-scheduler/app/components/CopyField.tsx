"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Read-only text with a copy button (used for the personal iCal URL).
export default function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (http, permissions): the field stays selectable for manual copy.
    }
  }

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="input min-w-0 flex-1 font-mono text-xs"
      />
      <button type="button" onClick={copy} className="btn-secondary shrink-0">
        {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
        {copied ? "コピーしました" : "コピー"}
      </button>
    </div>
  );
}
