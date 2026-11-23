"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";

/**
 * Accessible confirmation built on the native <dialog>: focus is trapped and
 * restored, Esc cancels, and the page behind is inert. We avoid window.confirm()
 * because it can't be styled, blocks the event loop, and some in-app browsers
 * (WhatsApp, Instagram) suppress it entirely.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
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
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault(); // keep React in control of `open`
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, outside the panel) cancels.
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px] open:motion-safe:animate-pop"
    >
      {/* Content only exists while open: no stale copy in the DOM, nothing for find-in-page to hit. */}
      {open && (
        <div className="p-6">
          <h2 id="confirm-title" className="text-xl font-black">
            {title}
          </h2>
          <div className="mt-2 text-slate-600">{children}</div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
              {cancelLabel}
            </Button>
            <Button variant={tone === "danger" ? "dangerSolid" : "primary"} onClick={onConfirm} disabled={busy}>
              {busy ? "Leaving…" : confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
