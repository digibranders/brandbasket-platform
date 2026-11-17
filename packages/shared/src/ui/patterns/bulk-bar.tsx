"use client";

import { useState, type ReactElement } from "react";
import { patternButtonSecondary } from "./button-classes";
import { useConfirmRun, type ConfirmCopy } from "./confirm-copy";
import { AlertGlyph } from "./pattern-icons";
import { toastStore } from "./toast";

/**
 * One bulk action. There is deliberately no `money` flag: an action that moves money is never bulk, so BulkBar cannot be
 * given one (notes-console-v2-patterns.md section 3, "Never bulk").
 */
export interface BulkAction {
  readonly id: string;
  readonly label: string;
  /** What the button says while it runs ("Marking"). Defaults to the label. */
  readonly busyLabel?: string;
  readonly run: (ids: readonly string[]) => Promise<{ readonly done: number; readonly failed: readonly string[] }>;
  /** Required when the action emails customers: "Send 3 setup links?". */
  readonly confirm?: (count: number) => ConfirmCopy;
  /** Offered only where a reverse exists and nothing was emailed. Receives the ids that succeeded. */
  readonly undo?: (ids: readonly string[]) => Promise<void>;
  readonly disabledReason?: (ids: readonly string[]) => string | null;
  /** The success line: "Marked 3 contacted". Default `${label}: ${done} done`. */
  readonly doneMessage?: (done: number) => string;
  /** The partial line: "2 of 3 marked contacted, 1 failed". Default `${done} of ${total} done, ${failed} failed`. */
  readonly partialMessage?: (done: number, total: number, failed: number) => string;
}

export interface BulkBarProps {
  /** The selected row ids. The bar renders nothing when this is empty. */
  readonly ids: readonly string[];
  readonly actions: readonly BulkAction[];
  readonly onClear: () => void;
  /** Called after an action settles with the ids that failed, so the list can keep exactly those selected. */
  readonly onSettled?: (failedIds: readonly string[]) => void;
}

/**
 * BulkBar: the count, the permitted actions and Clear. Actions that email customers ask first; a reversible one runs and
 * shows one Undo toast for the whole set. A partial failure is stated with numbers and the failed rows stay selected.
 */
export function BulkBar({ ids, actions, onClear, onSettled }: BulkBarProps): ReactElement | null {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const confirmRun = useConfirmRun();

  if (ids.length === 0) return null;
  const busy = runningId !== null;

  const execute = async (action: BulkAction): Promise<void> => {
    setRunningId(action.id);
    setFailure(null);
    try {
      const { done, failed } = await action.run(ids);
      const doneIds = ids.filter((id) => !failed.includes(id));
      if (failed.length > 0) {
        setFailure(action.partialMessage?.(done, ids.length, failed.length) ?? `${done} of ${ids.length} done, ${failed.length} failed`);
      } else {
        const message = action.doneMessage?.(done) ?? `${action.label}: ${done} done`;
        const undo = action.undo;
        toastStore.show({ message, undo: undo ? () => undo(doneIds) : undefined });
      }
      onSettled?.(failed);
    } catch {
      setFailure(`${action.label} did not run. Nothing was changed.`);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div>
      <div role="region" aria-label="Bulk actions" aria-busy={busy || undefined} className="flex flex-wrap items-center gap-2 rounded-[14px] border border-ink bg-surface px-3 py-2 shadow-hero max-[860px]:sticky max-[860px]:bottom-2">
        <span className="mr-2 font-sans text-sm font-semibold text-ink">
          <span className="font-mono font-medium">{ids.length}</span> selected
        </span>
        {actions.map((action) => {
          const reason = action.disabledReason?.(ids) ?? null;
          const running = runningId === action.id;
          return (
            <span key={action.id} className="inline-flex items-center gap-2 max-[860px]:flex-1">
              <button
                type="button"
                disabled={busy}
                aria-disabled={reason !== null || undefined}
                aria-busy={running || undefined}
                onClick={() => {
                  if (reason !== null) return;
                  confirmRun.request(action.confirm?.(ids.length), () => void execute(action));
                }}
                className={`${patternButtonSecondary} max-[860px]:flex-1`}
              >
                {running ? `${action.busyLabel ?? action.label}...` : action.label}
              </button>
              {reason ? <span className="font-sans text-xs leading-4 text-ink-3">{reason}</span> : null}
            </span>
          );
        })}
        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          className="ml-auto inline-flex h-9 items-center rounded-[8px] px-2 font-sans text-sm font-semibold text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 max-[860px]:h-11"
        >
          Clear
        </button>
      </div>
      {failure ? (
        <div role="alert" className="mt-2 flex items-center gap-2.5 rounded-[10px] bg-neg-wash px-3 py-2 font-sans text-[13px] leading-5 text-neg-text">
          <AlertGlyph />
          {failure}
        </div>
      ) : null}
      {confirmRun.dialog}
    </div>
  );
}
