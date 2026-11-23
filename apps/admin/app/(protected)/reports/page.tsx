import { findBusinessAlertDetails, listReportsForReview } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { toReportRow } from "@/lib/reports-view";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export const metadata: Metadata = { title: "Reports to review" };

/**
 * Inbox, Reports to review: every report not yet sent, whatever the date (CD-15: the 1st to the 5th is when drafts appear, and
 * an unsent draft stays until it is sent). The owner's address is read only for a report whose send did not finish, because
 * only its Retry send confirm names it.
 */
export default async function ReportsPage(): Promise<ReactElement> {
  const { user, staff: viewer } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "report.view", targetType: "reports" });
  const db = getStaffDb();
  const reports = await listReportsForReview(db);
  const waiting = reports.filter((row) => row.state === "draft" || row.state === "approved").length;
  const rows = await Promise.all(reports.map(async (report) => toReportRow(report, report.state === "approved" ? ((await findBusinessAlertDetails(db, report.businessId))?.owner.email ?? null) : null)));

  return (
    <>
      <PageHeader title="Reports to review" meta={rows.length === 0 ? "Nothing waiting" : `${waiting} to review, ${rows.length - waiting} on hold`} />
      <SectionTabs role={viewer.role} page="/reports" />
      <div className="mt-6">
        <ReportsWorkspace rows={rows} />
      </div>
    </>
  );
}
