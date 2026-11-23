"use server";

import { revalidatePath } from "next/cache";
import { recordStaffAction } from "@/lib/server/activity";
import { createReportSend, type ReportSendResult } from "@/lib/server/report-send-action";
import { sendReportFromConsole } from "@/lib/server/monthly-reports";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

const send = createReportSend({
  requireStaff: requireStaffAccess,
  send: (reportId, staffUserId) => sendReportFromConsole(reportId, staffUserId, new Date()),
  log: (granted, reportId, result) => logStaffAccess({ staffUserId: granted.user.id, action: "report.send", targetType: "report", targetId: reportId, result }),
  record: (granted, entry) => recordStaffAction(granted, entry),
  revalidate: () => revalidatePath("/reports"),
});

/** Send (or retry) from the Reports list. The review page keeps `sendReportAction`, which redirects with the outcome. */
export async function sendReportNowAction(reportId: string): Promise<ReportSendResult> {
  return send(reportId);
}
