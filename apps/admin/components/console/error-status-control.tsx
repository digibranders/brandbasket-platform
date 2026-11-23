"use client";

import { useToast } from "@brandbasket/shared/ui/patterns";
import { useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";
import { setErrorStatusAction } from "@/app/(protected)/support/errors/actions";
import { ERROR_STATUSES, ERROR_STATUS_LABELS, errorStatusToast, type ErrorStatus } from "@/lib/error-status";
import { buttonSecondary } from "./buttons";

interface ErrorStatusControlProps {
  readonly issueId: string;
  readonly errorClass: string;
  readonly status: ErrorStatus;
  readonly occurrenceCount: number;
}

/** Review status as one row of buttons. A change emails nobody, so it shows a toast with Undo instead of asking first. */
export function ErrorStatusControl({ issueId, errorClass, status, occurrenceCount }: ErrorStatusControlProps): ReactElement {
  const { show } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(next: ErrorStatus): Promise<void> {
    if (busy || next === status) return;
    setBusy(true);
    try {
      const result = await setErrorStatusAction(issueId, next, occurrenceCount);
      if (!result.ok) {
        show({ message: result.message, tone: "error" });
        return;
      }
      show({
        message: errorStatusToast(errorClass, next),
        undoneMessage: `${errorClass} is ${ERROR_STATUS_LABELS[result.previous].toLowerCase()} again`,
        undo: async () => {
          const undone = await setErrorStatusAction(issueId, result.previous, result.occurrenceCount);
          if (!undone.ok) throw new Error(undone.message);
          router.refresh();
        },
      });
      router.refresh();
    } catch {
      show({ message: "The change did not save. Nothing was changed.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="group" aria-label="Review status" className="flex flex-wrap gap-2">
      {ERROR_STATUSES.map((option) => (
        <button
          key={option}
          type="button"
          disabled={busy}
          aria-pressed={option === status}
          onClick={() => void change(option)}
          className={`${buttonSecondary} ${option === status ? "shadow-[inset_0_0_0_2px_var(--color-ink)]" : ""}`}
        >
          {ERROR_STATUS_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
