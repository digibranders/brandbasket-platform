"use client";

import { PromptPopup, toastStore } from "@brandbasket/shared/ui/patterns";
import { useState, type ReactElement } from "react";
import { completeKickoffAction, rescheduleKickoffAction, theyDidNotJoinAction } from "@/app/(protected)/calls/kickoff-actions";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";
import { clock, weekdayDate } from "@/lib/team-time";

export interface TodayKickoffItem {
  readonly businessId: string;
  readonly businessName: string;
  readonly endsAt: Date;
}

export interface TodayKickoffPromptProps {
  readonly kickoff: TodayKickoffItem | null;
  readonly onClose: () => void;
}

const FAILED = "That did not save. Nothing was changed, and your notes are still here.";

/**
 * The kickoff prompt a Today row opens: "Did the kickoff call with <business> happen?" with Call completed (notes optional),
 * They did not join and Reschedule. It runs the same three actions as the popup and keeps the notes if one fails.
 */
export function TodayKickoffPrompt({ kickoff, onClose }: TodayKickoffPromptProps): ReactElement | null {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (kickoff === null) return null;

  const run = async (action: (formData: FormData) => Promise<void>, formData: FormData, done: string): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      await action(formData);
      toastStore.show({ message: done });
      onClose();
    } catch {
      setProblem(FAILED);
    } finally {
      setBusy(false);
    }
  };
  const outcomeForm = (action: (formData: FormData) => Promise<void>, label: string, done: string): ReactElement => (
    <form action={(formData) => run(action, formData, done)}>
      <input type="hidden" name="businessId" value={kickoff.businessId} />
      <button type="submit" disabled={busy} className={buttonSecondary}>
        {label}
      </button>
    </form>
  );

  return (
    <PromptPopup isOpen title={`Did the kickoff call with ${kickoff.businessName} happen?`} description={`Ended ${weekdayDate(kickoff.endsAt)}, ${clock(kickoff.endsAt)}.`} onClose={onClose}>
      <p className="rounded-[8px] bg-sunken/50 p-3 font-sans text-xs text-ink-2">
        Call confirmation readies the website build. If not confirmed within 24 hours of scheduled completion, the build starts automatically.
      </p>
      <form action={(formData) => run(completeKickoffAction, formData, "The 48 hour first preview clock has started.")} className="mt-5 grid gap-3">
        <input type="hidden" name="businessId" value={kickoff.businessId} />
        <label htmlFor="today-kickoff-notes" className="block font-sans text-sm font-medium text-ink">
          What was agreed (optional)
        </label>
        <textarea id="today-kickoff-notes" name="notes" rows={3} maxLength={600} placeholder="Notes (optional)" className={fieldClasses} />
        {problem === null ? null : (
          <p role="alert" className="text-sm text-error">
            {problem}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" disabled={busy} className={buttonPrimary}>
            Call completed
          </button>
        </div>
      </form>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        {outcomeForm(theyDidNotJoinAction, "They did not join", "The customer will pick a new time.")}
        {outcomeForm(rescheduleKickoffAction, "Reschedule", "The customer will pick a new time.")}
      </div>
    </PromptPopup>
  );
}
