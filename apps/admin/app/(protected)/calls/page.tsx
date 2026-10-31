import { listSetupCallsForStaff } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { Section } from "@/components/console/section";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { groupCalls, type CallLine } from "@/lib/calls-view";
import { KickoffWrapUp } from "./kickoff-wrap-up";
import { todayRange } from "@/lib/team-time";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Calls" };

const DAY_MS = 86_400_000;
/** How far back and ahead the page looks. */
const PAST_DAYS = 7;
const AHEAD_DAYS = 28;

function CallTable({ lines }: { readonly lines: readonly CallLine[] }): ReactElement {
  return (
    <TableScroll label="Calls">
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH}>When</th>
            <th className={TH}>Client</th>
            <th className={TH}>Setup answers</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.call.businessId}>
              <td className={TD_TIME}>{line.when}</td>
              <td className={TD}>
                <Link href={`/clients/${line.call.businessId}`} className="font-semibold text-ink">
                  {line.call.businessName}
                </Link>
              </td>
              <td className={`${TD} font-figure tabular-nums text-ink-2`}>{line.setup}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

/** Every kickoff call: today first, then what is coming, then the last week, with how far each client got in setup. */
export default async function CallsPage(): Promise<ReactElement> {
  await requireStaffAccess();
  const now = new Date();
  const { start } = todayRange(now);
  const calls = await listSetupCallsForStaff(getStaffDb(), new Date(start.getTime() - PAST_DAYS * DAY_MS), new Date(start.getTime() + AHEAD_DAYS * DAY_MS));
  const groups = groupCalls(calls, now);

  return (
    <>
      <PageHeader title="Calls" meta={`${groups.today.length} today · ${groups.upcoming.length} coming up`} />
      <KickoffWrapUp now={now} />
      <Section title="Today">{groups.today.length === 0 ? <EmptyLine>No calls today.</EmptyLine> : <CallTable lines={groups.today} />}</Section>
      <Section title="Coming up">{groups.upcoming.length === 0 ? <EmptyLine>Nothing booked in the next four weeks.</EmptyLine> : <CallTable lines={groups.upcoming} />}</Section>
      <Section title="Last 7 days">{groups.past.length === 0 ? <EmptyLine>No calls in the last week.</EmptyLine> : <CallTable lines={groups.past} />}</Section>
      {groups.noTime.length === 0 ? null : (
        <Section title="Booked, time not reported">
          <CallTable lines={groups.noTime} />
        </Section>
      )}
    </>
  );
}
