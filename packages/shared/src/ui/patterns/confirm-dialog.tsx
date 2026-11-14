import type { ReactElement, ReactNode } from "react";

export interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly consequence: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly isDestructive?: boolean;
  readonly isLoading?: boolean;
  readonly children?: ReactNode;
}

/**
 * ConfirmDialog: 20px radius, 28px padding, title 22px, consequence line in ink-2.
 * Primary button on the right; destructive red variant states consequence clearly.
 * Elevation 0 24px 64px -16px rgba(42,28,16,.28) over a rgba(21,22,26,.40) scrim.
 */
export function ConfirmDialog({
  isOpen,
  title,
  consequence,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDestructive = false,
  isLoading = false,
  children,
}: ConfirmDialogProps): ReactElement | null {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Scrim: rgba(21, 22, 26, 0.40) */}
      <div
        className="fixed inset-0 bg-[#15161A]/40 backdrop-blur-[2px] transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[520px] rounded-[20px] border border-border bg-surface p-7 shadow-dialog sm:p-7">
        <h2 id="confirm-dialog-title" className="font-display text-[22px] font-semibold leading-7 text-ink">
          {title}
        </h2>
        <p className="mt-2.5 font-sans text-[15px] leading-relaxed text-ink-2">{consequence}</p>

        {children ? <div className="mt-4">{children}</div> : null}

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="inline-flex h-[42px] items-center justify-center rounded-[8px] border border-border bg-surface px-5 font-sans text-sm font-semibold text-ink hover:bg-surface-hover active:translate-y-[1px] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`inline-flex h-[42px] items-center justify-center rounded-[8px] px-5 font-sans text-sm font-semibold text-white active:translate-y-[1px] disabled:opacity-50 ${
              isDestructive
                ? "bg-neg-text hover:bg-[#9B1D14]"
                : "bg-ink hover:bg-primary-hover shadow-button"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
