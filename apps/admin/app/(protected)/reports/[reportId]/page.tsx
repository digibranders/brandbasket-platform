import { findBusinessAlertDetails, getReport } from "@brandbasket/db";
import { reportContentSchema } from "@brandbasket/shared/lib/reports/content";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { FactList, Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { monthLabel, reportNotice, REPORT_STATE_LABELS, serviceTitle } from "@/lib/reports-view";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { holdReportAction, releaseReportAction, sendReportAction } from "../actions";

export const metadata: Metadata = { title: "Review a report" };

function Hidden({ reportId }: { readonly reportId: string }): ReactElement {
  return <input type="hidden" name="reportId" value={reportId} />;
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly reportId: string }>;
  readonly searchParams: Promise<{ readonly done?: string }>;
}): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const { reportId } = await params;
  if (!z.uuid().safeParse(reportId).success) notFound();
  const db = getStaffDb();
  const report = await getReport(db, reportId);
  if (report === null) notFound();
  await logStaffAccess({ staffUserId: user.id, action: "report.view", targetType: "report", targetId: reportId, businessId: report.businessId });
  const details = await findBusinessAlertDetails(db, report.businessId);
  const content = reportContentSchema.safeParse(report.content);
  const notice = reportNotice((await searchParams).done);
  const state = REPORT_STATE_LABELS[report.state];
  const readable = content.success && report.contentVersion === 1;

  return (
    <>
      <PageHeader
        back={{ href: "/reports", label: "Customer reports" }}
        title={`${serviceTitle(report.service)}, ${monthLabel(report.month)}`}
        meta={details?.business.name ?? "Client"}
        action={
          report.state === "sent" ? null : (
            <div className="flex flex-wrap gap-2">
              {report.state === "held" ? (
                <form action={releaseReportAction}>
                  <Hidden reportId={report.id} />
                  <button type="submit" className={buttonSecondary}>
                    Release hold
                  </button>
                </form>
              ) : (
                <form action={holdReportAction}>
                  <Hidden reportId={report.id} />
                  <button type="submit" className={buttonSecondary}>
                    Hold
                  </button>
                </form>
              )}
              {readable ? (
                <form action={sendReportAction}>
                  <Hidden reportId={report.id} />
                  <button type="submit" className={buttonPrimary}>
                    Send to customer
                  </button>
                </form>
              ) : null}
            </div>
          )
        }
      />
      {notice === null ? null : (
        <Notice tone={notice.tone} className="mt-4">
          {notice.text}
        </Notice>
      )}

      <Section title="Status">
        <FactList
          items={[
            { label: "State", value: <StatusPill tone={state.tone}>{state.label}</StatusPill> },
            { label: "Written", value: <LocalDateTime iso={report.composedAt.toISOString()} variant="timestamp" /> },
            { label: "Sent", value: report.sentAt === null ? "Not yet" : <LocalDateTime iso={report.sentAt.toISOString()} variant="timestamp" /> },
            { label: "PDF", value: report.pdfKey === null ? "Made when the report is sent" : "Made" },
            { label: "Send to", value: details?.owner.email ?? "No email address on record" },
          ]}
        />
      </Section>

      {readable ? (
        <>
          <Section title="What the customer will read">
            <p className="max-w-2xl text-base text-ink">{content.data.headline}</p>
          </Section>
          <Section title="The figures">
            <FactList items={content.data.figures.map((figure) => ({ label: figure.label, value: figure.value }))} />
          </Section>
          {(content.data.lists ?? []).map((list) => (
            <Section key={list.title} title={list.title}>
              <FactList items={list.rows.map((row) => ({ label: row.label, value: row.value }))} />
            </Section>
          ))}
          <Section title="What we did">
            {content.data.whatWeDid.length === 0 ? (
              <p className="text-sm text-ink-2">Nothing logged for this month.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {content.data.whatWeDid.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            )}
          </Section>
        </>
      ) : (
        <Notice tone="problem" className="mt-6">
          This report is stored in a form the console cannot read, so it cannot be sent. Write it again from the records.
        </Notice>
      )}
    </>
  );
}
