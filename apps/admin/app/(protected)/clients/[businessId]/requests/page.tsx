import { listSupportTicketsForStaff } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from "@brandbasket/shared/lib/support";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { CallsSection } from "@/components/console/calls-section";
import { EmptyLine } from "@/components/console/hairline-list";
import { RequestsSection } from "@/components/console/requests-section";
import { Section } from "@/components/console/section";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { readCallsNotice } from "@/lib/call-form";
import { readMailOutcome, readRequestActionNotice } from "@/lib/request-notices";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Client requests" };

/** The most one support page returns (supportPageLimit). */
const REQUESTS_SHOWN = 25;

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
  const page = await listSupportTicketsForStaff(getStaffDb(), { businessId: client.businessId, limit: REQUESTS_SHOWN });

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
    </>
  );
}
