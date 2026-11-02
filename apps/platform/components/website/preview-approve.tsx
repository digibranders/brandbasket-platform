"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@brandbasket/shared/lib/cn";
import { approvePreviewAction } from "@/app/app-host/(protected)/website/actions";
import { SOFT_BUTTON } from "@/components/v2/classes";

function YesApprove(): ReactElement {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={cn(SOFT_BUTTON, "disabled:opacity-55")}>
      {pending ? "Approving..." : "Yes, approve"}
    </button>
  );
}

/**
 * Approve under a preview, with its confirm step in the page itself (never a modal, DESIGN.md): approving cannot be taken
 * back, so the first press turns the button into one sentence with "Yes, approve" and "Keep reviewing". Focus moves to the
 * sentence on opening and back to the button on keeping.
 */
export function PreviewApprove(): ReactElement {
  const [asking, setAsking] = useState(false);
  const questionId = useId();
  const questionRef = useRef<HTMLParagraphElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (asking) {
      questionRef.current?.focus();
      return;
    }
    if (returnFocus.current) {
      returnFocus.current = false;
      openerRef.current?.focus();
    }
  }, [asking]);

  if (!asking) {
    return (
      <button ref={openerRef} type="button" className={cn(SOFT_BUTTON, "w-full")} onClick={() => setAsking(true)}>
        Approve
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby={questionId} className="grid gap-3">
      <p id={questionId} ref={questionRef} tabIndex={-1} className="text-[0.9375rem] text-ink outline-none">
        Approve this preview? We will then start getting it live.
      </p>
      <form action={approvePreviewAction} className="flex flex-wrap items-center gap-3">
        <YesApprove />
        <button
          type="button"
          className="text-[0.8125rem] font-semibold text-ink-2 underline underline-offset-[3px] transition-colors duration-200 hover:text-ink"
          onClick={() => {
            returnFocus.current = true;
            setAsking(false);
          }}
        >
          Keep reviewing
        </button>
      </form>
    </div>
  );
}
