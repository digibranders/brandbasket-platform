import { consumeRateLimit, recordErrorReport } from "@brandbasket/db";
import { createErrorReportCollector } from "@brandbasket/shared/server/error-report";
import { getStaffDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { getSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

/** Staff connection is used only for sanitized telemetry writes and hashed rate-limit counters. */
export const POST = createErrorReportCollector({
  app: "admin",
  getOrigin: () => serverEnv().ADMIN_ORIGIN,
  getSessionUser,
  writeReport: (report, userId) => recordErrorReport(getStaffDb(), report, userId),
  consumeLimit: async (key, rule) => (await consumeRateLimit(getStaffDb(), key, rule)).allowed,
  release: process.env.NEXT_PUBLIC_BRANDBASKET_RELEASE,
});

