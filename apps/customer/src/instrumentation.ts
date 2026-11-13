import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail at start, not on the first request, when the server is missing a setting it cannot run without.
    const { serverEnv } = await import("./lib/env");
    serverEnv();
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Errors from server components, server actions and route handlers go to Sentry (scrubbed, off without a DSN). */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  try {
    Sentry.captureRequestError(error, request, context);
  } catch {
    /* Monitoring failure must never replace the original failure. */
  }
};
