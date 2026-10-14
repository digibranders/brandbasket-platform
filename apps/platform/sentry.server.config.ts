import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions, sentryTracesSampleRate } from "./lib/sentry-options";

// Node.js runtime: API routes, server components, server actions, and the database code they call. Local variables are
// not attached to stack frames, because this app handles customer and billing data, and events are scrubbed before
// they leave the process.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: sentryTracesSampleRate(),
  includeLocalVariables: false,
  ...sentryPrivacyOptions,
});
