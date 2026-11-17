import type { ReactElement } from "react";
import { KickoffAnswer } from "@/components/console/kickoff-answer";
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
 *
 * Includes the 24-hour automatic fallback note.
 */
export function TodayKickoffPrompt({ kickoffs }: TodayKickoffPromptProps): ReactElement | null {
  if (kickoffs.length === 0) return null;

  return (
    <div className="grid gap-4">
      {kickoffs.map((call) => (
        <section
          key={call.businessId}
          aria-labelledby={`today-kickoff-${call.businessId}`}
          className="rounded-[20px] border border-line bg-surface p-7 shadow-card"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
            <h2 id={`today-kickoff-${call.businessId}`} className="font-display text-[22px] font-semibold text-ink">
              Did the kickoff call with {call.businessName} happen?
            </h2>
            <span className="font-sans text-xs font-medium text-ink-2">
              Ended {weekdayDate(call.endsAt)}, {clock(call.endsAt)}
            </span>
          </div>

          <KickoffAnswer businessId={call.businessId} idPrefix="today" notesRows={2} />
        </section>
      ))}
    </div>
  );
}
