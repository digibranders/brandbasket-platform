"use client";

import Link from "next/link";
import { type ReactElement, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { GTM_ID, MEASUREMENT_TOOLS } from "@/lib/consent";
import { readConsent, saveConsent, subscribeConsent } from "./consent-storage";
import { clearMeasurementCookies, syncTagManager } from "./tags";

/** Fired by the Your privacy page's button to bring the choice back. */
export const COOKIE_SETTINGS_EVENT = "bb:cookie-settings";

interface ConsentBannerProps {
  /** The privacy notice on the website. */
  readonly privacyHref: string;
}

/**
 * Asks once whether the dashboard may measure how it is used, and starts Google Tag Manager only after a yes. Allow and
 * No thanks share one style so neither is nudged. Mounted by the root layout only when a container is configured.
 */
export function ConsentBanner({ privacyHref }: ConsentBannerProps): ReactElement | null {
  const record = useSyncExternalStore(subscribeConsent, readConsent, () => undefined);
  const [reopened, setReopened] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (record && GTM_ID) syncTagManager(GTM_ID, record.measurement);
  }, [record]);

  useEffect(() => {
    const reopen = (): void => setReopened(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (reopened) headingRef.current?.focus();
  }, [reopened]);

  if (record === undefined || (record !== null && !reopened)) return null;

  const commit = (measurement: boolean): void => {
    const wasOn = readConsent()?.measurement === true;
    saveConsent(measurement);
    setReopened(false);
    if (wasOn && !measurement) {
      clearMeasurementCookies();
      // Tags already running cannot be unloaded; a fresh page starts with only what is still allowed.
      window.location.reload();
    }
  };

  return (
    <section
      role="region"
      aria-labelledby={headingId}
      className="fixed inset-x-4 bottom-20 z-30 grid max-w-md gap-3 rounded-lg bg-surface p-5 shadow-lift lg:bottom-4 lg:left-auto"
    >
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="font-display text-[1.0625rem] font-semibold leading-tight">
        Can we measure how you use the dashboard?
      </h2>
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        {MEASUREMENT_TOOLS[0]} counts visits and {MEASUREMENT_TOOLS[1]} records how pages are used, so we can fix what confuses people.
        Clarity hides the text and numbers on your screen. Nothing is used for advertising.{" "}
        <Link href={privacyHref} className="whitespace-nowrap font-semibold text-ink underline underline-offset-[3px]">
          Privacy notice
        </Link>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={SOFT_BUTTON} onClick={() => commit(false)}>
          No thanks
        </button>
        <button type="button" className={SOFT_BUTTON} onClick={() => commit(true)}>
          Allow
        </button>
      </div>
    </section>
  );
}
