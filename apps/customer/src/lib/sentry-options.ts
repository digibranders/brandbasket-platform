import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

/**
 * Privacy settings shared by the browser, Node.js and edge runtimes. Sentry only runs when a DSN is set. Default PII is
 * off, every event and breadcrumb is scrubbed before it is sent (see sentry-scrub.ts), and Session Replay is never
 * installed in any runtime: a replay records what customers type and see.
 */
export const sentryPrivacyOptions = {
  sendDefaultPii: false,
  beforeSend: (event: ErrorEvent): ErrorEvent => scrubEvent(event),
  beforeSendTransaction: scrubEvent,
  beforeBreadcrumb: (breadcrumb: Breadcrumb): Breadcrumb | null => scrubBreadcrumb(breadcrumb),
} as const;

/** The tracing rate is the same in every runtime. */
export function sentryTracesSampleRate(nodeEnv: string | undefined = process.env.NODE_ENV): number {
  return nodeEnv === "development" ? 1.0 : 0.1;
}
