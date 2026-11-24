import type { ReactElement } from "react";
import { completeKickoffAction, rescheduleKickoffAction, theyDidNotJoinAction } from "@/app/(protected)/calls/kickoff-actions";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";
import { KICKOFF_AUTO_START_NOTE } from "@/lib/kickoff-copy";

interface KickoffAnswerProps {
  readonly businessId: string;
  /** Keeps the notes field's id unique when the popup and Today's card are both on screen. */
  readonly idPrefix: string;
  readonly notesRows: number;
}

/** The answer to "Did the kickoff call happen?": the 24 hour note and the three actions, the same wherever the question is asked. */
export function KickoffAnswer({ businessId, idPrefix, notesRows }: KickoffAnswerProps): ReactElement {
  return (
    <>
      <p className="mt-3 rounded-[8px] bg-sunken/50 p-3 font-sans text-xs text-ink-2">{KICKOFF_AUTO_START_NOTE}</p>

      <form action={completeKickoffAction} className="mt-5 grid gap-3">
        <input type="hidden" name="businessId" value={businessId} />
        <label htmlFor={`${idPrefix}-notes-${businessId}`} className="block font-sans text-sm font-medium text-ink">
          What was agreed (optional)
        </label>
        <textarea id={`${idPrefix}-notes-${businessId}`} name="notes" rows={notesRows} maxLength={600} placeholder="Notes (optional)" className={fieldClasses} />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" className={buttonPrimary}>
            Call completed
          </button>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <form action={theyDidNotJoinAction}>
          <input type="hidden" name="businessId" value={businessId} />
          <button type="submit" className={buttonSecondary}>
            They did not join
          </button>
        </form>

        <form action={rescheduleKickoffAction}>
          <input type="hidden" name="businessId" value={businessId} />
          <button type="submit" className={buttonSecondary}>
            Reschedule
          </button>
        </form>
      </div>
    </>
  );
}
