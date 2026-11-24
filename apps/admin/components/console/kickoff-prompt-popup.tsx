"use client";

import { X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactElement } from "react";
import { markKickoffPromptsShownAction } from "@/app/(protected)/calls/kickoff-actions";
import { buttonPrimary } from "@/components/console/buttons";
import { KickoffAnswer } from "@/components/console/kickoff-answer";
import { clock, weekdayDate } from "@/lib/team-time";

/** How often the console asks the server again, so an answer in another tab or the 15 minute repeat shows up without a reload. */
const REFRESH_MS = 60_000;

export interface KickoffPromptPopupItem {
  readonly callId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly endsAt: Date;
  readonly due: boolean;
}

export interface KickoffPromptPopupProps {
  readonly prompts: readonly KickoffPromptPopupItem[];
}

/**
 * "Did the kickoff call with <business> happen?" for every call that has ended and has no answer, each with the three actions
 * (Call completed with optional notes, They did not join, Reschedule). The server decides when it opens: a call is due when its
 * popup was never shown or was last shown 15 minutes ago, so it repeats until answered and stays right after a reload or in a
 * second tab. Closing it leaves a small notice in the corner; the server's next "due" opens it again.
 */
export function KickoffPromptPopup({ prompts }: KickoffPromptPopupProps): ReactElement | null {
  const router = useRouter();
  const dueIds = prompts.filter((prompt) => prompt.due).map((prompt) => prompt.callId);
  const dueKey = dueIds.join(",");
  const [open, setOpen] = useState(dueKey !== "");
  const [seenKey, setSeenKey] = useState(dueKey);
  // A new set of due calls opens the popup (adjusted during render, as React advises, not in an effect).
  if (dueKey !== seenKey) {
    setSeenKey(dueKey);
    if (dueKey !== "") setOpen(true);
  }

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  // Tells the server the popup was shown for these calls, which starts the next 15 minutes.
  useEffect(() => {
    if (dueKey === "") return;
    void markKickoffPromptsShownAction(dueKey.split(",")).catch(() => undefined);
  }, [dueKey]);

  if (prompts.length === 0) return null;

  if (open) {
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="kickoff-prompt-title" className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-[#15161A]/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />

        <div className="relative z-10 grid max-h-[90dvh] w-full max-w-[560px] gap-8 overflow-y-auto rounded-[20px] border border-line bg-surface p-7 shadow-[0_24px_64px_-16px_rgba(42,28,16,0.28)]">
          {prompts.map((prompt, index) => (
            <section key={prompt.callId} aria-labelledby={index === 0 ? "kickoff-prompt-title" : `kickoff-prompt-${prompt.callId}`}>
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h2 id={index === 0 ? "kickoff-prompt-title" : `kickoff-prompt-${prompt.callId}`} className="font-display text-[22px] font-semibold text-ink">
                    Did the kickoff call with {prompt.businessName} happen?
                  </h2>
                  <p className="mt-1 font-sans text-sm text-ink-2">
                    Ended {weekdayDate(prompt.endsAt)}, {clock(prompt.endsAt)}.
                  </p>
                </div>
                {index === 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Dismiss prompt"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                ) : null}
              </header>
              <KickoffAnswer businessId={prompt.businessId} idPrefix="popup" notesRows={3} />
            </section>
          ))}
        </div>
      </div>
    );
  }

  const first = prompts[0];
  return (
    <aside aria-label="Kickoff call notification" className="fixed bottom-4 right-4 z-40 max-w-md rounded-[14px] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-rattan-text">Kickoff call waiting</p>
          <p className="truncate text-sm font-medium text-ink">
            {prompts.length === 1 && first !== undefined ? `Did the kickoff call with ${first.businessName} happen?` : `${prompts.length} kickoff calls are waiting for your answer`}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={buttonPrimary}>
          Answer
        </button>
      </div>
    </aside>
  );
}
