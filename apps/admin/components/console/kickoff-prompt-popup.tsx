"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useState, type ReactElement } from "react";
import { completeKickoffAction, rescheduleKickoffAction, theyDidNotJoinAction } from "@/app/(protected)/calls/kickoff-actions";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";
import { KICKOFF_NOTIFICATION_REPEAT_MS, shouldShowKickoffPrompt } from "@/lib/kickoff-prompt-rule";
import { clock, weekdayDate } from "@/lib/team-time";

export interface PendingKickoffItem {
  readonly businessId: string;
  readonly businessName: string;
  readonly endsAt: Date;
}

export interface KickoffPromptPopupProps {
  readonly pendingKickoffs: readonly PendingKickoffItem[];
}

/**
 * When a booked kickoff time passes, show PromptPopup:
 * "Did the kickoff call with <business> happen?" with three actions:
 * 1. Call completed (notes optional)
 * 2. They did not join
 * 3. Reschedule
 *
 * Includes the 24-hour automatic fallback note.
 * If dismissed, a notification banner repeats until answered (every 15 minutes).
 */
export function KickoffPromptPopup({ pendingKickoffs }: KickoffPromptPopupProps): ReactElement | null {
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (pendingKickoffs.length === 0) return null;

  const current = pendingKickoffs[0];
  if (!current) return null;

  const showModal =
    manualOpen ||
    shouldShowKickoffPrompt({
      hasPending: pendingKickoffs.length > 0,
      dismissedAt,
      now,
      repeatMs: KICKOFF_NOTIFICATION_REPEAT_MS,
    });

  if (showModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kickoff-prompt-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          className="fixed inset-0 bg-[#15161A]/40 backdrop-blur-[2px]"
          onClick={() => {
            setDismissedAt(Date.now());
            setManualOpen(false);
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 w-full max-w-[560px] rounded-[20px] border border-line bg-surface p-7 shadow-[0_24px_64px_-16px_rgba(42,28,16,0.28)]">
          <header className="flex items-start justify-between gap-4">
            <div>
              <h2 id="kickoff-prompt-title" className="font-display text-[22px] font-semibold text-ink">
                Did the kickoff call with {current.businessName} happen?
              </h2>
              <p className="mt-1 font-sans text-sm text-ink-2">
                Ended {weekdayDate(current.endsAt)}, {clock(current.endsAt)}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDismissedAt(Date.now());
                setManualOpen(false);
              }}
              aria-label="Dismiss prompt"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <p className="mt-3 rounded-[8px] bg-sunken/50 p-3 font-sans text-xs text-ink-2">
            Call confirmation readies the website build. If not confirmed within 24 hours of scheduled completion, the build starts automatically.
          </p>

          <form action={completeKickoffAction} className="mt-5 grid gap-3">
            <input type="hidden" name="businessId" value={current.businessId} />
            <label htmlFor={`kickoff-notes-${current.businessId}`} className="block font-sans text-sm font-medium text-ink">
              What was agreed (optional)
            </label>
            <textarea
              id={`kickoff-notes-${current.businessId}`}
              name="notes"
              rows={3}
              maxLength={600}
              placeholder="Notes (optional)"
              className={fieldClasses}
            />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" className={buttonPrimary}>
                Call completed
              </button>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <form action={theyDidNotJoinAction}>
              <input type="hidden" name="businessId" value={current.businessId} />
              <button type="submit" className={buttonSecondary}>
                They did not join
              </button>
            </form>

            <form action={rescheduleKickoffAction}>
              <input type="hidden" name="businessId" value={current.businessId} />
              <button type="submit" className={buttonSecondary}>
                Reschedule
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // When modal is dismissed, show repeating notification banner in the console
  return (
    <aside
      aria-label="Kickoff call notification"
      className="fixed bottom-4 right-4 z-40 max-w-md rounded-[14px] border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-rattan-text">Kickoff call waiting</p>
          <p className="truncate text-sm font-medium text-ink">
            Did the kickoff call with {current.businessName} happen?
          </p>
        </div>
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className={buttonPrimary}
        >
          Answer
        </button>
      </div>
    </aside>
  );
}
