import * as Sentry from "@sentry/nextjs";
import { installBrowserErrorCapture } from "@brandbasket/shared/lib/error-report";
import { sentryPrivacyOptions, sentryTracesSampleRate } from "./lib/sentry-options";

// Browser runtime: client errors, unhandled rejections and navigation spans. Without a DSN the SDK stays off, so local
// development and tests need no Sentry project. Session Replay is off: no replay integration, and both sample rates
// are zero, so nothing a customer types or sees is recorded.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: sentryTracesSampleRate(),
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  ...sentryPrivacyOptions,
});

// The native staff inbox (/support/errors) takes its own filtered copy of each browser failure. It is separate from
// Sentry and sends nothing outside our own app.
installBrowserErrorCapture("platform", process.env.NEXT_PUBLIC_FYNIX_RELEASE);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
