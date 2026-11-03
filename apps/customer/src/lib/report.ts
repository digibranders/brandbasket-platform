import * as Sentry from "@sentry/nextjs";

/** Where in the app a failure happened. Never put customer text, ids from a request or personal data in here. */
export interface ReportContext {
  /** A stable name for the place: "home.services", "billing.invoices". */
  readonly area: string;
}

/**
 * Sends a caught error to Sentry, scrubbed by the privacy options in ./sentry-options (a no-op without a DSN). Returns the
 * event id for a support reference. Reporting never throws: a monitoring failure must not replace the original failure.
 */
export function reportError(error: unknown, context: ReportContext): string | undefined {
  try {
    return Sentry.captureException(error, { tags: { area: context.area } });
  } catch {
    return undefined;
  }
}
