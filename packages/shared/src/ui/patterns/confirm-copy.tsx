"use client";

import { useCallback, useId, useState, type ReactElement } from "react";
import { patternButtonDanger, patternButtonPrimary, patternButtonSecondary } from "./button-classes";
import { ModalDialog } from "./modal-dialog";

/**
 * The words of a confirm (notes-console-v2-patterns.md section 3): title names the action and its object, one consequence
 * line, a primary named for the act, "Keep" as the cancel. `tickSentence` adds the first-person tick box money actions need.
 */
export interface ConfirmCopy {
  readonly title: string;
  readonly consequence: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: "Keep";
  readonly tickSentence?: string;
  readonly tone?: "default" | "danger";
}

export interface ConfirmCopyDialogProps {
  readonly copy: ConfirmCopy;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly busy?: boolean;
}

/** Mounted only while a confirm is pending. The shared `ConfirmDialog` stays as it is for the screens that use it. */
export function ConfirmCopyDialog({ copy, onConfirm, onCancel, busy = false }: ConfirmCopyDialogProps): ReactElement {
  const titleId = useId();
  const tickId = useId();
  const [ticked, setTicked] = useState(false);
  const needsTick = copy.tickSentence !== undefined;

  return (
    <ModalDialog labelledBy={titleId} onEscape={onCancel} onScrimClick={onCancel}>
      <div className="motion-pop w-[440px] max-w-full rounded-[20px] bg-surface p-7 shadow-dialog">
        <h2 id={titleId} className="font-display text-[22px] font-semibold leading-7 text-ink">
          {copy.title}
        </h2>
        <p className="mt-2 font-sans text-[15px] leading-6 text-ink-2">{copy.consequence}</p>
        {needsTick ? (
          <label htmlFor={tickId} className="mt-4 flex items-start gap-3 font-sans text-sm leading-5 text-ink">
            <input
              id={tickId}
              type="checkbox"
              checked={ticked}
              onChange={(event) => setTicked(event.target.checked)}
              className="mt-0.5 size-[18px] shrink-0 accent-ink"
            />
            <span>{copy.tickSentence}</span>
          </label>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={patternButtonSecondary}>
            {copy.cancelLabel ?? "Keep"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || (needsTick && !ticked)}
            className={copy.tone === "danger" ? patternButtonDanger : patternButtonPrimary}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

export interface ConfirmRunner {
  /** Runs `run` now, or after the person confirms when `copy` is given. */
  readonly request: (copy: ConfirmCopy | undefined, run: () => void) => void;
  /** Render this once next to the control; it is null until a confirm is pending. */
  readonly dialog: ReactElement | null;
}

export function useConfirmRun(): ConfirmRunner {
  const [pending, setPending] = useState<{ readonly copy: ConfirmCopy; readonly run: () => void } | null>(null);
  const request = useCallback((copy: ConfirmCopy | undefined, run: () => void): void => {
    if (copy) setPending({ copy, run });
    else run();
  }, []);
  const dialog = pending ? (
    <ConfirmCopyDialog
      copy={pending.copy}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const { run } = pending;
        setPending(null);
        run();
      }}
    />
  ) : null;
  return { request, dialog };
}
