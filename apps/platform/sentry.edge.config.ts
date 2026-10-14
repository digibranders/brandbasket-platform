import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions, sentryTracesSampleRate } from "./lib/sentry-options";

// Edge runtime: the request proxy and any edge route handlers. Events are scrubbed before they leave the process.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: sentryTracesSampleRate(),
  ...sentryPrivacyOptions,
});
