import * as Sentry from "@sentry/nextjs";
import { reportBrowserError } from "@brandbasket/shared/lib/error-report";

const reported = new WeakSet<object>();

/**
 * Reports an error caught by error.tsx or global-error.tsx exactly once: once to Sentry and once to the native inbox.
 * React can run the effect that calls this twice for one error (StrictMode, remounts), so the same error object is
 * never reported twice. An error with a digest was already reported by the server's onRequestError hook, so it is not
 * sent again from the browser to either place.
 */
export function reportBoundaryError(error: Error & { readonly digest?: string }, severity: "error" | "fatal" = "error"): void {
  if (reported.has(error)) return;
  reported.add(error);
  if (error.digest === undefined) Sentry.captureException(error);
  reportBrowserError(error, {
    app: "platform",
    operation: "error_boundary",
    route: window.location.pathname,
    severity,
    release: process.env.NEXT_PUBLIC_FYNIX_RELEASE,
  });
}
