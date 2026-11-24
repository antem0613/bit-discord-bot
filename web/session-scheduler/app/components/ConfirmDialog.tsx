"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

// Modal confirmation built on <dialog> (focus trap, Esc and backdrop handling come from the browser).
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel(); // click on the backdrop
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex gap-3 p-5">
        {danger && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
            <TriangleAlert className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-bold">{title}</h2>
          {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
        <button type="button" onClick={onCancel} className="btn-ghost" autoFocus>
          やめる
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={danger ? "btn border-danger bg-danger text-white hover:bg-danger/85" : "btn-primary"}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

// A submit button for a server-action form that asks for confirmation first.
export function ConfirmSubmitButton({
  action,
  children,
  className,
  title,
  message,
  confirmLabel,
  danger = false,
}: {
  action: () => Promise<void>;
  children: ReactNode;
  className: string;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form ref={formRef} action={action} onSubmit={() => setSubmitting(true)}>
      <button type="button" className={className} disabled={submitting} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        confirmLabel={confirmLabel}
        danger={danger}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      >
        {message}
      </ConfirmDialog>
    </form>
  );
}
