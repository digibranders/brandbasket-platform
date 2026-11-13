import { consumeRateLimit, recordErrorReport } from "@brandbasket/db";
import { createErrorReportCollector } from "@brandbasket/shared/server/error-report";
import { getStaffDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { allowsAnyLocalHost, appOriginForHost } from "@/lib/server-media/app-origin";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * `POST /api/error-reports`: the browser's own report of an uncaught error (the fallback beside Sentry). It is open to people who
 * are not signed in, so it calls no guard: the session is read only to attribute and rate-limit a report, and everything else
 * (origin, host, size, rate limits) is the collector's. Staff connection is used only for sanitized telemetry writes and
 * hashed rate-limit counters.
 */
export const POST = createErrorReportCollector({
  // The shared report schema names this app "platform" (the customer app replaces its customer pages); only "platform" and "admin" exist.
  app: "platform",
  // The host the report came from, when it is this app's own (under next dev, any local address).
  getOrigin: (request) => appOriginForHost(request.headers.get("host"), { app: serverEnv().APP_ORIGIN, anyLocalHost: allowsAnyLocalHost(process.env) }),
  getSessionUser,
  writeReport: (report, userId) => recordErrorReport(getStaffDb(), report, userId),
  consumeLimit: async (key, rule) => (await consumeRateLimit(getStaffDb(), key, rule)).allowed,
  release: process.env.NEXT_PUBLIC_BRANDBASKET_RELEASE,
});
