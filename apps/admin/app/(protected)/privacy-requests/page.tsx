import { listPrivacyRequests } from "@brandbasket/db";
import type { SelectOption } from "@brandbasket/shared/ui/select-field";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ClockStrip } from "@/components/compliance/clock-strip";
import { PrivacyWorkspace } from "@/components/compliance/privacy-workspace";
import { ReadFailed } from "@/components/compliance/read-failed";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { StatTiles } from "@/components/console/stat-tiles";
import { privacyCounts, privacyRow, sortPrivacy } from "@/lib/compliance-model";
import { PRIVACY_REQUEST_FORM_MESSAGES, REQUEST_KIND_LABELS, REQUEST_OUTCOME_LABELS } from "@/lib/privacy-request-form";
import { readClockStrip, readGuarded } from "@/lib/server/compliance-clocks";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";

export const metadata: Metadata = { title: "Privacy requests" };

const KIND_OPTIONS: readonly SelectOption[] = Object.entries(REQUEST_KIND_LABELS).map(([value, label]) => ({ value, label }));
const OUTCOME_OPTIONS: readonly SelectOption[] = Object.entries(REQUEST_OUTCOME_LABELS).map(([value, label]) => ({ value, label }));

export default async function PrivacyRequestsPage({ searchParams }: { readonly searchParams: Promise<{ readonly problem?: string }> }): Promise<ReactElement> {
  const { user } = await requireStaffCan("oversight");
  await logStaffAccess({ staffUserId: user.id, action: "privacy_request.view" });
  const { problem } = await searchParams;
  const now = new Date();
  const requests = await readGuarded("privacy requests", () => listPrivacyRequests(getStaffDb()));
  const strip = await readClockStrip(now, { requests });
  const shownProblem = problem !== undefined && PRIVACY_REQUEST_FORM_MESSAGES.includes(problem) ? problem : null;
  const rows = requests === null ? [] : sortPrivacy(requests.map((request) => privacyRow(request, now, REQUEST_KIND_LABELS, REQUEST_OUTCOME_LABELS)));
  const counts = privacyCounts(rows);

  return (
    <>
      <PageHeader title="Privacy requests" meta="Each request has a 30 day clock. Overdue and urgent ones come first." />
      <SectionTabs page="/privacy-requests" />
      <ClockStrip {...strip} />
      {shownProblem === null ? null : <Notice tone="problem" className="mt-4">{shownProblem}</Notice>}
      {requests === null ? (
        <ReadFailed title="Privacy requests could not be loaded." message="Nothing was changed. Try again. Open requests keep their clocks while this is down." href="/privacy-requests" />
      ) : (
        <>
          <StatTiles
            label="Privacy request figures"
            items={[
              { value: counts.open, label: "Open requests", note: counts.open === 0 ? "All closed" : "Being worked on" },
              {
                value: counts.late + counts.soon,
                label: "Urgent or overdue",
                note: counts.late + counts.soon === 0 ? "None" : `${counts.late} overdue, ${counts.soon} due in under 72 hours`,
                tone: counts.late + counts.soon === 0 ? "good" : "bad",
              },
              { value: counts.closed, label: "Closed" },
            ]}
          />
          {counts.soon === 0 ? null : (
            <p role="status" className="mt-4 text-sm">
              <b>{counts.soon === 1 ? "1 request is due in under 72 hours." : `${counts.soon} requests are due in under 72 hours.`}</b> Open it first after any overdue one.
            </p>
          )}
          <PrivacyWorkspace rows={rows} counts={counts} kindOptions={KIND_OPTIONS} outcomeOptions={OUTCOME_OPTIONS} />
        </>
      )}
    </>
  );
}
