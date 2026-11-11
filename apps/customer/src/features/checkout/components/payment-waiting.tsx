"use client";

import { useEffect, useState } from "react";
import { Banner, Button } from "@/ui";

/*
 * Ported from apps/platform components/panel/payment-waiting.tsx. Shown when the browser is back from the payment provider
 * before the provider has told us the payment went through (its signed webhook arrives separately, usually within seconds).
 * It loads the page again every few seconds; once the payment is recorded the page itself moves on. After a minute it stops
 * and says who to write to. The start of the wait is kept in the tab's session storage, since every load starts afresh.
 */

const CHECK_EVERY_MS = 3_000;
const GIVE_UP_AFTER_MS = 60_000;
const STORAGE_PREFIX = "brandbasket:payment-wait:";

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

interface PaymentWaitingProps {
  /** What is being waited on, so a new payment starts a new wait: "membership:<checkout id>". */
  readonly waitKey: string;
  readonly waitingText: string;
  readonly delayedText: string;
  readonly supportEmail: string;
}

export function PaymentWaiting({ waitKey, waitingText, delayedText, supportEmail }: PaymentWaitingProps) {
  const [gaveUp, setGaveUp] = useState(false);
  const storageKey = `${STORAGE_PREFIX}${waitKey}`;

  useEffect(() => {
    const now = Date.now();
    const waitedTooLong = now - waitStartedAt(storageKey, now) >= GIVE_UP_AFTER_MS;
    const timer = window.setTimeout(
      () => {
        if (waitedTooLong) setGaveUp(true);
        else window.location.reload();
      },
      waitedTooLong ? 0 : CHECK_EVERY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  if (!gaveUp) return <Banner tone="info">{waitingText}</Banner>;
  return (
    <Banner
      tone="warn"
      action={
        <Button size="sm" onClick={() => restartWait(storageKey)}>
          Check again
        </Button>
      }
    >
      {delayedText} If you paid, there’s nothing more to pay: email us at <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we’ll sort it out.
    </Banner>
  );
}
