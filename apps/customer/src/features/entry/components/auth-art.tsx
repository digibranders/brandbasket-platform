"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import styles from "./auth-art.module.css";
import { readEntryRequest } from "../rules/account-entry";
import { signUpPanelCopy, WEBSITE_LAUNCH_STEPS } from "../rules/signup-panel";

export interface AuthArtProps {
  readonly steps?: readonly string[];
  readonly promise?: string;
}

/** The launch path from the Home page, in an owner's words: what happens after sign-up, ending with the website live. */
export const LAUNCH_STEPS = WEBSITE_LAUNCH_STEPS;

function AuthArtContent({ steps, promise }: AuthArtProps) {
  const searchParams = useSearchParams();

  let activeSteps = steps;
  let activePromise = promise;

  if (activeSteps === undefined || activePromise === undefined) {
    const params: Record<string, string> = {};
    if (searchParams) {
      searchParams.forEach((val, key) => {
        params[key] = val;
      });
    }
    const entry = readEntryRequest(params);
    const isInvite = Boolean(params.next && params.next.startsWith("/invite"));
    const copy = signUpPanelCopy(entry.services, isInvite);
    activeSteps = activeSteps ?? copy.steps;
    activePromise = activePromise ?? copy.promise;
  }

  return (
    <section className={styles.art} aria-hidden="true">
      <ol className={styles.steps}>
        {activeSteps.map((step) => (
          <li key={step} className={styles.line}>
            {step}
          </li>
        ))}
      </ol>
      <p className={styles.promise}>{activePromise}</p>
    </section>
  );
}

/**
 * The panel beside every entry form: the launch path as large lines that take turns
 * lighting up (auth-art.module.css), then the promise under them.
 * Follows the chosen services: website steps are only shown when Managed Website is chosen.
 * Decoration only, so it is hidden from screen readers. Phones do not get it.
 */
export function AuthArt(props: AuthArtProps) {
  return (
    <Suspense
      fallback={
        <section className={styles.art} aria-hidden="true">
          <ol className={styles.steps}>
            {LAUNCH_STEPS.map((step) => (
              <li key={step} className={styles.line}>
                {step}
              </li>
            ))}
          </ol>
          <p className={styles.promise}>Then we look after it, every month.</p>
        </section>
      }
    >
      <AuthArtContent {...props} />
    </Suspense>
  );
}
