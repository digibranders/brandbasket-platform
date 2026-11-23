"use client";

import { useState, type ReactElement } from "react";
import { TodayKickoffPrompt } from "@/components/today/kickoff-prompt";

export interface KickoffPromptOpenerProps {
  readonly businessId: string;
  readonly businessName: string;
  /** When the booked call ended. */
  readonly endsAt: Date;
  /** The button's classes; the caller chooses primary or secondary. */
  readonly className: string;
  /** The button's words. */
  readonly children: string;
}

/**
 * The only way to answer "did the kickoff call happen" from a client page: a button that opens the one kickoff prompt (the
 * one Today opens). The answer itself, notes and all, is made inside the prompt; this button never records anything.
 */
export function KickoffPromptOpener({ businessId, businessName, endsAt, className, children }: KickoffPromptOpenerProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open ? <TodayKickoffPrompt kickoff={{ businessId, businessName, endsAt }} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
