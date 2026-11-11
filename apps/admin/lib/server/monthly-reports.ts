import "server-only";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { sendReport, type SendReportResult } from "@brandbasket/shared/server/monthly-reports";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { serverEnv } from "./env";

/** Approves a report, makes and stores its PDF, marks it sent and emails the owner (unless they turned report emails off). */
export function sendReportFromConsole(reportId: string, staffId: string, now: Date): Promise<SendReportResult> {
  const db = getStaffDb();
  return sendReport(db, { storage: getMediaStorage(), send: (message) => customerEmailTransport(db).send(message), customerOrigin: serverEnv().APP_ORIGIN }, { reportId, staffId, now });
}
