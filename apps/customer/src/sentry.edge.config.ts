import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions, sentryTracesSampleRate } from "./lib/sentry-options";

// Edge runtime: any edge route handler. Events are scrubbed before they leave the process.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: sentryTracesSampleRate(),
  ...sentryPrivacyOptions,
});
