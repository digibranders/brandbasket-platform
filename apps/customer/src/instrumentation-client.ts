import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions, sentryTracesSampleRate } from "./lib/sentry-options";

// Browser runtime: client errors, unhandled rejections and navigation spans. Without a DSN the SDK stays off. Session Replay
// is off: no replay integration and both sample rates are zero, so nothing a customer types or sees is recorded.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: sentryTracesSampleRate(),
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  ...sentryPrivacyOptions,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
