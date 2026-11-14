import type { ReactElement } from "react";
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
  readonly kickoffs: readonly TodayKickoffItem[];
}

/**
 * The kickoff prompt on Today:
 * "Did the kickoff call with <business> happen?" with three actions:
 * 1. Call completed (notes optional)
 * 2. They did not join
 * 3. Reschedule
 */
export function TodayKickoffPrompt({ kickoffs }: TodayKickoffPromptProps): ReactElement | null {
  if (kickoffs.length === 0) return null;

  return (
    <div className="grid gap-4">
      {kickoffs.map((call) => (
        <section
          key={call.businessId}
          aria-labelledby={`today-kickoff-${call.businessId}`}
          className="rounded-2xl border border-line bg-card p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
            <h2 id={`today-kickoff-${call.businessId}`} className="font-display text-base font-semibold text-ink">
              Did the kickoff call with {call.businessName} happen?
            </h2>
            <span className="text-xs font-medium text-ink-2">
              Ended {weekdayDate(call.endsAt)}, {clock(call.endsAt)}
            </span>
          </div>

          <p className="mt-2 text-sm text-ink-soft">
            Call confirmation readies the website build. If nobody confirms the call within 24 hours, the build starts automatically.
          </p>

          <form action={completeKickoffAction} className="mt-4 grid gap-2">
            <input type="hidden" name="businessId" value={call.businessId} />
            <label htmlFor={`today-notes-${call.businessId}`} className="text-sm font-semibold text-ink">
              What was agreed (optional)
            </label>
            <textarea
              id={`today-notes-${call.businessId}`}
              name="notes"
              rows={2}
              maxLength={600}
              placeholder="Notes (optional)"
              className={fieldClasses}
            />
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button type="submit" className={buttonPrimary}>
                Call completed
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <form action={theyDidNotJoinAction}>
              <input type="hidden" name="businessId" value={call.businessId} />
              <button type="submit" className={buttonSecondary}>
                They did not join
              </button>
            </form>

            <form action={rescheduleKickoffAction}>
              <input type="hidden" name="businessId" value={call.businessId} />
              <button type="submit" className={buttonSecondary}>
                Reschedule
              </button>
            </form>
          </div>
        </section>
      ))}
    </div>
  );
}
