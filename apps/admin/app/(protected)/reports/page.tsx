import { listReportsForReview } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { buttonSmall } from "@/components/console/buttons";
import { LIFT } from "@/components/console/classes";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TH } from "@/components/console/table";
import { TableScroll } from "@/components/console/table-scroll";
import { monthLabel, REPORT_STATE_LABELS, serviceTitle } from "@/lib/reports-view";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export const metadata: Metadata = { title: "Customer reports" };

const HEADLINE_CHARACTERS = 110;

function preview(content: Record<string, unknown>): string {
  const headline = typeof content.headline === "string" ? content.headline : "";
  return headline.length > HEADLINE_CHARACTERS ? `${headline.slice(0, HEADLINE_CHARACTERS).trimEnd()}...` : headline;
}

export default async function ReportsPage(): Promise<ReactElement> {
  const { user, staff: viewer } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "report.view", targetType: "reports" });
  const rows = await listReportsForReview(getStaffDb());
  const waiting = rows.filter((row) => row.state === "draft" || row.state === "approved").length;

  return (
    <>
      <PageHeader title="Customer reports" meta={rows.length === 0 ? "Nothing waiting" : `${waiting} to review, ${rows.length - waiting} on hold`} />
      <SectionTabs role={viewer.role} page="/reports" />
      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyLine>No reports are waiting. The drafts for a month are written on the 1st of the next month.</EmptyLine>
        </div>
      ) : (
        <section aria-label="Reports to review" className={`${LIFT} mt-6 overflow-x-auto px-4`}>
          <TableScroll label="Reports to review">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Client</th>
                  <th className={TH}>Service</th>
                  <th className={TH}>Month</th>
                  <th className={TH}>State</th>
                  <th className={TH}>Opening line</th>
                  <th className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={`${TD} font-semibold`}>{row.businessName}</td>
                    <td className={TD}>{serviceTitle(row.service)}</td>
                    <td className={TD}>{monthLabel(row.month)}</td>
                    <td className={TD}>
                      <StatusPill tone={REPORT_STATE_LABELS[row.state].tone}>{REPORT_STATE_LABELS[row.state].label}</StatusPill>
                    </td>
                    <td className={`${TD} max-w-96 text-ink-2`}>{preview(row.content)}</td>
                    <td className={`${TD} text-right`}>
                      <Link href={`/reports/${row.id}`} className={buttonSmall}>
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      )}
    </>
  );
}
