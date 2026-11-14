"use client";

import { useId, useRef, type ReactElement, type ReactNode } from "react";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/console/buttons";

export interface ConfirmDialogProps {
  /** The dialog title, naming the action clearly. Plain words, no dashes. */
  readonly title: string;
  /** Consequence line: what happens when confirmed. Plain words, no dashes. */
  readonly consequence: string;
  /** Label for the confirm button inside the dialog. Defaults to "Confirm". */
  readonly confirmLabel?: string;
  /** Label for the cancel button inside the dialog. Defaults to "Cancel". */
  readonly cancelLabel?: string;
  /** Visual tone: "danger" for destructive, "default" for primary. Defaults to "danger". */
  readonly variant?: "danger" | "default";
  /** Trigger button text when no custom trigger element is provided. */
  readonly triggerLabel?: string;
  /** Custom CSS classes for the trigger button. */
  readonly triggerClassName?: string;
  /** Custom trigger node to open the dialog. */
  readonly trigger?: ReactNode;
  /** Server action or form action to execute when confirmed. */
  readonly formAction?: (formData: FormData) => void | Promise<void>;
  /** Form content: hidden inputs, field controls, etc. */
  readonly children?: ReactNode;
  /** Called when the dialog is dismissed without confirming. */
  readonly onCancel?: () => void;
  /** Called when confirm is clicked. */
  readonly onConfirm?: () => void;
}

/**
 * Accessible confirmation dialog for destructive actions in the staff console.
 * Uses native <dialog> with existing design tokens and a light theme.
 * Always injects name="confirm" value="yes" into form submissions.
 */
export function ConfirmDialog({
  title,
  consequence,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  triggerLabel,
  triggerClassName,
  trigger,
  formAction,
  children,
  onCancel,
  onConfirm,
}: ConfirmDialogProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  function openDialog(): void {
    dialogRef.current?.showModal();
  }

  function closeDialog(): void {
    dialogRef.current?.close();
    onCancel?.();
  }

  return (
    <>
      {trigger !== undefined ? (
        <span onClick={openDialog} className="inline-block">
          {trigger}
        </span>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          className={triggerClassName ?? (variant === "danger" ? buttonDanger : buttonSecondary)}
        >
          {triggerLabel ?? title}
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeDialog();
        }}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-6 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-xs"
      >
        <div className="grid gap-2">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <p id={descId} className="text-sm text-ink-2">
            {consequence}
          </p>
        </div>

        <form
          action={formAction}
          onSubmit={() => {
            onConfirm?.();
            dialogRef.current?.close();
          }}
          className="mt-6"
        >
          <input type="hidden" name="confirm" value="yes" />
          {children}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button type="button" onClick={closeDialog} className={buttonSecondary}>
              {cancelLabel}
            </button>
            <GatedSubmitButton
              className={variant === "danger" ? buttonDanger : buttonPrimary}
              pendingLabel="Confirming..."
            >
              {confirmLabel}
            </GatedSubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
