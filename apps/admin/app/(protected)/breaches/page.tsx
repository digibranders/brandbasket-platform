import { listBreaches } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { BreachesWorkspace } from "@/components/compliance/breaches-workspace";
import { ClockStrip } from "@/components/compliance/clock-strip";
import { ReadFailed } from "@/components/compliance/read-failed";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { StatTiles } from "@/components/console/stat-tiles";
import { BREACH_DATA_CATEGORIES, BREACH_FORM_MESSAGES } from "@/lib/breach-form";
import { breachRow, sortBreaches } from "@/lib/compliance-model";
import { readClockStrip, readGuarded } from "@/lib/server/compliance-clocks";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";

export const metadata: Metadata = { title: "Breaches" };

export default async function BreachesPage({ searchParams }: { readonly searchParams: Promise<{ readonly problem?: string }> }): Promise<ReactElement> {
  const { user } = await requireStaffCan("oversight");
  await logStaffAccess({ staffUserId: user.id, action: "breach.view" });
  const { problem } = await searchParams;
  const now = new Date();
  const breaches = await readGuarded("breach register", () => listBreaches(getStaffDb()));
  const strip = await readClockStrip(now, { breaches });
  const shownProblem = problem !== undefined && BREACH_FORM_MESSAGES.includes(problem) ? problem : null;
  const rows = breaches === null ? [] : sortBreaches(breaches.map((breach) => breachRow(breach, now)));
  const openCount = rows.filter((row) => !row.closed).length;
  const lateCount = rows.filter((row) => row.late).length;

  return (
    <>
      <PageHeader title="Breaches" meta="Two clocks run from the moment a breach is detected: 6 hours for CERT-In and 72 hours for the Data Protection Board." />
      <SectionTabs page="/breaches" />
      <ClockStrip {...strip} />
      {shownProblem === null ? null : <Notice tone="problem" className="mt-4">{shownProblem}</Notice>}
      {breaches === null ? (
        <ReadFailed title="Breaches could not be loaded." message="Nothing was changed. Try again. Open breaches keep their clocks while this is down." href="/breaches" />
      ) : (
        <>
          <StatTiles
            label="Breach figures"
            items={[
              { value: openCount, label: "Open breaches", note: openCount === 0 ? "None open" : "Not closed yet" },
              { value: lateCount, label: "Reports overdue", note: lateCount === 0 ? "None" : "CERT-In or the Board", tone: lateCount === 0 ? "good" : "bad" },
              { value: rows.length, label: "Logged in all" },
            ]}
          />
          <BreachesWorkspace rows={rows} openCount={openCount} closedCount={rows.length - openCount} lateCount={lateCount} categories={BREACH_DATA_CATEGORIES} />
        </>
      )}
    </>
  );
}
