"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { cancelCallAction } from "@/app/app-host/(protected)/requests/calls/actions";
import { SOFT_BUTTON } from "@/components/v2/classes";

/** Cancel a call in two steps, so one stray click does not cancel it. */
export function CancelCallButton({ callId }: { readonly callId: string }): ReactElement {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState(false);
  const [working, startWorking] = useTransition();

  const cancel = (): void => {
    setProblem(false);
    startWorking(async () => {
      const result = await cancelCallAction(callId).catch(() => ({ ok: false, reason: "failed" }) as const);
      // Updates after an await are no longer inside the transition, so wrap them to keep `working` true until they land.
      startWorking(() => {
        // A call that is already gone is simply drawn as gone by the refresh.
        if (result.ok || result.reason === "gone") router.refresh();
        else setProblem(true);
      });
    });
  };

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={SOFT_BUTTON}>
        Cancel call
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
      <span className="font-semibold text-ink">Cancel this call?</span>
      <button type="button" disabled={working} onClick={cancel} className={SOFT_BUTTON}>
        {working ? "Cancelling…" : "Yes, cancel"}
      </button>
      <button type="button" disabled={working} onClick={() => setAsking(false)} className={SOFT_BUTTON}>
        Keep it
      </button>
      {problem ? (
        <span role="alert" className="w-full text-error">
          We could not cancel that call. Please try again.
        </span>
      ) : null}
    </span>
  );
}
