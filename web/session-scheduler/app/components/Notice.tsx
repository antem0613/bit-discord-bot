import type { ReactNode } from "react";
import { Info } from "lucide-react";

// Centered single-message card for gated states (login required, not permitted, etc.).
export default function Notice({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <div className="card flex flex-col items-center gap-4 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Info className="size-6" />
        </span>
        <p className="font-medium">{message}</p>
        {action}
      </div>
    </div>
  );
}
