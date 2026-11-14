"use client";

import { useEffect, useState } from "react";
import { Button, Icon, type IconName } from "@/ui";
import { cx } from "@/ui/cx";

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

/** One centred status card for both states, so the page does not change shape when the wait runs long. */
function StatusCard({ icon, tone, title, children }: { readonly icon: IconName; readonly tone: string; readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section role="status" aria-live="polite" className="flex flex-col items-center gap-2 rounded-panel border border-border bg-surface px-6 py-12 text-center">
      <span className={cx("mb-1 inline-flex size-10 items-center justify-center rounded-full", tone)}>
        <Icon name={icon} size="lg" />
      </span>
      <h2 className="type-sub text-ink">{title}</h2>
      {children}
    </section>
  );
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

  if (!gaveUp) {
    return (
      <StatusCard icon="CheckCircle" tone="bg-pos-wash text-pos-text" title="Payment received">
        <p className="max-w-reading type-body text-ink-3">{waitingText}</p>
        <p className="mt-2 inline-flex items-center gap-2 type-meta">
          <Icon name="SpinnerGap" size="sm" className="motion-safe:animate-spin" />
          This page updates by itself. Please keep it open.
        </p>
      </StatusCard>
    );
  }
  return (
    <StatusCard icon="Warning" tone="bg-warn-wash text-warn-text" title="Still confirming your payment">
      <p className="max-w-reading type-body text-ink-3">
        {delayedText} If you paid, there’s nothing more to pay: email us at <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we’ll sort it out.
      </p>
      <Button size="sm" className="mt-2" onClick={() => restartWait(storageKey)}>
        Check again
      </Button>
    </StatusCard>
  );
}
