import { consumeRateLimit, recordErrorReport } from "@brandbasket/db";
import { createErrorReportCollector } from "@brandbasket/shared/server/error-report";
import { getStaffDb } from "@/lib/server/db";
import { appOriginForHostHeader } from "@/lib/server/request-brand";
import { getSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

/** Staff connection is used only for sanitized telemetry writes and hashed rate-limit counters. */
export const POST = createErrorReportCollector({
  app: "platform",
  // The host the report came from, when it is one of this dashboard's (the Brandbasket host as well as the app's).
  getOrigin: (request) => appOriginForHostHeader(request.headers.get("host")),
  getSessionUser,
  writeReport: (report, userId) => recordErrorReport(getStaffDb(), report, userId),
  consumeLimit: async (key, rule) => (await consumeRateLimit(getStaffDb(), key, rule)).allowed,
  release: process.env.NEXT_PUBLIC_BRANDBASKET_RELEASE,
});

