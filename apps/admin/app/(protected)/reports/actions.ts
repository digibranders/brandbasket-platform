"use server";

import { moveReport, ReportMoveError, type ReportState } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { recordStaffAction } from "@/lib/server/activity";
import { sendReportFromConsole } from "@/lib/server/monthly-reports";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

function readReportId(formData: FormData): string {
  const parsed = z.uuid().safeParse(formData.get("reportId"));
  if (!parsed.success) throw new Error("Missing report id");
  return parsed.data;
}

function back(reportId: string, done: string): never {
  revalidatePath("/reports");
  redirect(`/reports/${reportId}?done=${encodeURIComponent(done)}`);
}

/** Staff send a reviewed report: it is approved, its PDF is made, and the customer sees it and is emailed. */
export async function sendReportAction(formData: FormData): Promise<void> {
  const granted = await requireStaffAccess();
  const reportId = readReportId(formData);
  let done: string;
  try {
    const result = await sendReportFromConsole(reportId, granted.user.id, new Date());
    await logStaffAccess({ staffUserId: granted.user.id, action: "report.send", targetType: "report", targetId: reportId, result: "ok" });
    await recordStaffAction(granted, { businessId: result.report.businessId, kind: "report.send", summary: `Sent the ${result.report.month.slice(0, 7)} ${result.report.service} report` });
    done = `sent.${result.email}`;
  } catch (error) {
    console.error("A monthly report could not be sent.", { reportId, error: error instanceof Error ? error.name : "error" });
    await logStaffAccess({ staffUserId: granted.user.id, action: "report.send", targetType: "report", targetId: reportId, result: "failed" });
    done = error instanceof ReportMoveError ? error.reason : "send-failed";
  }
  back(reportId, done);
}

async function moveTo(formData: FormData, to: ReportState, done: string, kind: string): Promise<void> {
  const granted = await requireStaffAccess();
  const reportId = readReportId(formData);
  let outcome = done;
  try {
    const report = await moveReport(getStaffDb(), { id: reportId, to, staffId: granted.user.id, now: new Date() });
    await logStaffAccess({ staffUserId: granted.user.id, action: kind, targetType: "report", targetId: reportId });
    await recordStaffAction(granted, { businessId: report.businessId, kind, summary: `Moved the ${report.month.slice(0, 7)} ${report.service} report to ${to}` });
  } catch (error) {
    if (!(error instanceof ReportMoveError)) throw error;
    outcome = error.reason;
  }
  back(reportId, outcome);
}

/** Staff hold a report back, e.g. a figure looks wrong. It stays out of the customer's view. */
export async function holdReportAction(formData: FormData): Promise<void> {
  await moveTo(formData, "held", "held", "report.hold");
}

/** Staff take a held report back to a draft. */
export async function releaseReportAction(formData: FormData): Promise<void> {
  await moveTo(formData, "draft", "released", "report.release");
}
