import { listSupportTicketsForStaff } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from "@brandbasket/shared/lib/support";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { EmptyLine } from "@/components/console/hairline-list";
import { Section } from "@/components/console/section";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Client requests" };

/** The most one support page returns (supportPageLimit). */
const REQUESTS_SHOWN = 25;

export default async function ClientRequestsPage({ params }: { readonly params: Promise<{ readonly businessId: string }> }): Promise<ReactElement> {
  const { businessId } = await params;
  const { client } = await openClientTab(businessId, "requests");
  const page = await listSupportTicketsForStaff(getStaffDb(), { businessId: client.businessId, limit: REQUESTS_SHOWN });

  return (
    <Section title="Requests" aside={page.nextCursor === null ? undefined : `The ${REQUESTS_SHOWN} newest`}>
      {page.items.length === 0 ? (
        <EmptyLine>No requests from this client.</EmptyLine>
      ) : (
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
      )}
    </Section>
  );
}
