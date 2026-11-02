import { listActivityForBusiness, listAssignableSupportStaff, listSupportTicketsForStaff } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from "@brandbasket/shared/lib/support";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { ActivityList } from "@/components/activity-list";
import { CallsSection } from "@/components/console/calls-section";
import { Fold } from "@/components/console/fold";
import { EmptyLine } from "@/components/console/hairline-list";
import { RequestsSection } from "@/components/console/requests-section";
import { Section } from "@/components/console/section";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { readCallsNotice } from "@/lib/call-form";
import { readMailOutcome, readRequestActionNotice } from "@/lib/request-notices";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Client messages" };

/** The most one support page returns (supportPageLimit). */
const REQUESTS_SHOWN = 25;

/** How much history the Activity fold shows. */
const ACTIVITY_SHOWN = 200;

export default async function ClientRequestsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { client } = await openClientTab(businessId, "requests");
  const sp = await searchParams;
  const db = getStaffDb();
  const [page, activity, staff] = await Promise.all([
    listSupportTicketsForStaff(db, { businessId: client.businessId, limit: REQUESTS_SHOWN }),
    listActivityForBusiness(db, client.businessId, ACTIVITY_SHOWN),
    listAssignableSupportStaff(db),
  ]);

  return (
    <>
    <RequestsSection businessId={client.businessId} notice={readRequestActionNotice(sp.requests)} mail={readMailOutcome(sp.mail)} />
    <CallsSection businessId={client.businessId} notice={readCallsNotice(sp.calls)} />
    <Section title="Requests" aside={page.nextCursor === null ? undefined : `The ${REQUESTS_SHOWN} newest`}>
      {page.items.length === 0 ? (
        <EmptyLine>No requests from this client.</EmptyLine>
      ) : (
        <TableScroll label="Requests">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Request</th>
                <th className={TH}>Category</th>
                <th className={TH}>Status</th>
                <th className={TH}>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((ticket) => (
                <tr key={ticket.id}>
                  <td className={TD}>
                    <Link href={`/support/${ticket.id}`} className="font-semibold hover:underline">
                      {ticket.subject}
                    </Link>
                    <small className="block text-xs text-ink-2">{ticket.displayRef}</small>
                  </td>
                  <td className={TD}>{SUPPORT_CATEGORY_LABELS[ticket.category]}</td>
                  <td className={TD}>{SUPPORT_STATUS_LABELS[ticket.status]}</td>
                  <td className={TD_TIME}>
                    <LocalDateTime iso={ticket.lastActivityAt.toISOString()} variant="timestamp" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Section>
    <Fold title="Activity">
      <div id="activity" className="scroll-mt-8">
        {activity.length === ACTIVITY_SHOWN ? <p className="mb-3 text-xs font-semibold text-ink-2">The {ACTIVITY_SHOWN} newest</p> : null}
        <ActivityList rows={activity} staffNames={new Map(staff.map((member) => [member.userId, member.name]))} />
      </div>
    </Fold>
    </>
  );
}
