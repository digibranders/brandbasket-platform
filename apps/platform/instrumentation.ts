import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { reportRequestError } from "./lib/request-error";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // A server real customers can reach must not start with settings missing or an OTP bypass set.
    const { assertRuntimeEnvironment } = await import("@fynix/shared/server/runtime-environment");
    const { runtimeRequirements } = await import("@fynix/shared/lib/production-requirements");
    assertRuntimeEnvironment(process.env, runtimeRequirements("platform"));
    // The robot check on the sign-in and sign-up forms stays off, with a note in the log, until its keys are set.
    const { warnIfTurnstileUnconfigured } = await import("@fynix/shared/server/turnstile-request");
    warnIfTurnstileUnconfigured();
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * The one request error hook. It reports errors from server components, server actions, route handlers, and the request
 * proxy to Sentry (scrubbed, off without a DSN) and to the native staff inbox at /support/errors. The native copy keeps
 * only a class, a fixed operation and a route template (see docs/operations/automatic-errors.md). Either report failing
 * never stops the other or replaces the original error.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await reportRequestError(request, context, process.env.NEXT_RUNTIME, {
    sentry: () => Sentry.captureRequestError(error, request, context),
    native: async (operation) => {
      const { reportServerError } = await import("./lib/server/error-report");
      return reportServerError(error, { app: "platform", operation, route: context.routePath });
    },
  });
};
