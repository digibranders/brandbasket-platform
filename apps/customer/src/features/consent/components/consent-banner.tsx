"use client";

import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/ui";
import { GTM_ID, MEASUREMENT_TOOLS } from "../consent";
import { readConsent, saveConsent, subscribeConsent } from "./consent-storage";
import { clearMeasurementCookies, syncTagManager } from "./tags";

/** Fired by the Cookie settings button to bring the choice back. */
export const COOKIE_SETTINGS_EVENT = "bb:cookie-settings";

/** The privacy notice on the website (apps/platform lib/legal-links.ts, Brandbasket's own site). */
const PRIVACY_HREF = new URL("/privacy", siteConfig.url).toString();

/**
 * Asks once whether the dashboard may measure how it is used, and starts Google Tag Manager only after a yes. Allow and
 * No thanks share one style so neither is nudged. Mounted by the root layout only when a container is configured.
 * Ported from apps/platform components/consent/ConsentBanner.tsx.
 */
export function ConsentBanner() {
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
      className="fixed inset-x-4 bottom-4 z-30 grid max-w-md gap-3 rounded-panel border border-border bg-surface p-5 shadow-pop md:left-auto"
    >
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="type-section text-ink outline-none">
        Can we measure how you use the dashboard?
      </h2>
      <p className="type-body text-ink-2">
        {MEASUREMENT_TOOLS[0]} counts visits and {MEASUREMENT_TOOLS[1]} records how pages are used, so we can fix what confuses people.
        Clarity hides the text and numbers on your screen. Nothing is used for advertising.{" "}
        <a href={PRIVACY_HREF} className="whitespace-nowrap font-semibold text-ink underline underline-offset-2">
          Privacy notice
        </a>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => commit(false)}>No thanks</Button>
        <Button onClick={() => commit(true)}>Allow</Button>
      </div>
    </section>
  );
}
