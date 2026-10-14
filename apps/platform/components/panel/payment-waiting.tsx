"use client";

import { useEffect, useState, type ReactElement } from "react";

interface PaymentWaitingProps {
  /** What is being waited on, so a new payment starts a new wait: "membership:<checkout id>", "billing:reactivation"... */
  readonly waitKey: string;
  /** Said while the page is checking: "We've received your payment. Opening your membership…". */
  readonly waitingText: string;
  /** Said first when the wait runs out: "Opening your membership is taking longer than usual.". */
  readonly delayedText: string;
  readonly supportEmail: string;
}

/** How often the page is loaded again to see whether the payment has been confirmed, and when it stops trying. */
const CHECK_EVERY_MS = 3_000;
const GIVE_UP_AFTER_MS = 60_000;
const STORAGE_PREFIX = "fynix:payment-wait:";

/** When this browser tab started waiting on this checkout; now, if it cannot remember (storage off) or never did. */
function waitStartedAt(key: string, now: number): number {
  try {
    const stored = Number(window.sessionStorage.getItem(key));
    if (Number.isFinite(stored) && stored > 0 && stored <= now) return stored;
    window.sessionStorage.setItem(key, String(now));
  } catch {
    // A tab with storage switched off just waits from now each time it loads.
  }
  return now;
}

function restartWait(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing was stored, so there is nothing to clear.
  }
  window.location.reload();
}

/**
 * Shown when the browser is back from the payment provider before the provider has told us the payment went through
 * (its confirmation arrives separately, usually within seconds). It loads the page again every few seconds: once the
 * payment is recorded, the page itself draws what it has bought. A full load, not a refresh in place, because the
 * dashboard around the page changes with the plan and must be drawn again from the server.
 *
 * After a minute it stops and says who to write to, rather than spinning for ever. The start of the wait is kept in
 * the tab's session storage, since every load starts this component afresh.
 */
export function PaymentWaiting({ waitKey, waitingText, delayedText, supportEmail }: PaymentWaitingProps): ReactElement {
  const [gaveUp, setGaveUp] = useState(false);
  const storageKey = `${STORAGE_PREFIX}${waitKey}`;

  useEffect(() => {
    const now = Date.now();
    const waitedTooLong = now - waitStartedAt(storageKey, now) >= GIVE_UP_AFTER_MS;
    // Either way it happens from a timer: a tab that has waited its minute says so at once, the rest look again soon.
    const timer = window.setTimeout(
      () => {
        if (waitedTooLong) setGaveUp(true);
        else window.location.reload();
      },
      waitedTooLong ? 0 : CHECK_EVERY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  if (!gaveUp) {
    return (
      <p role="status" className="max-w-xl rounded-control bg-paper-deep px-4 py-3 text-sm text-ink">
        {waitingText}
      </p>
    );
  }
  return (
    <div role="status" className="max-w-xl rounded-control bg-paper-deep px-4 py-3 text-sm leading-relaxed text-ink">
      <p>
        {delayedText} If you paid, there’s nothing more to pay: email us at{" "}
        <a href={`mailto:${supportEmail}`} className="link-underline">
          {supportEmail}
        </a>{" "}
        and we’ll sort it out.
      </p>
      <button type="button" onClick={() => restartWait(storageKey)} className="link-underline mt-2">
        Check again
      </button>
    </div>
  );
}
