import { listAdCreditDue } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Avatar } from "@/components/console/avatar";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { adCreditDueRows } from "@/lib/ad-credit-due";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export const metadata: Metadata = { title: "Ad credit due" };

/**
 * The ad credit owed this month, for the ads team to spend and the CA to see: one line per paying package. Only a live,
 * paid subscription is listed, and a business that drops a service, cancels or asks to close drops off at once.
 */
export default async function AdCreditDuePage(): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "ad_credit.list", targetType: "ad_credit" });
  const rows = adCreditDueRows(await listAdCreditDue(getStaffDb(), new Date()));

  return (
    <>
      <PageHeader title="Ad credit due this month" meta="Packages bought together that include monthly ad credit, while they are paid and running." />
      {rows.length === 0 ? (
        <EmptyLine>No ad credit is due this month.</EmptyLine>
      ) : (
        <HairlineList label="Ad credit due">
          {rows.map((row) => (
            <HairlineRow
              key={row.id}
              href={`/clients/${row.businessId}`}
              lead={<Avatar id={row.businessId} name={row.businessName} />}
              title={row.businessName}
              sub={row.package}
              meta={row.amount}
              trail={row.paidThrough}
            />
          ))}
        </HairlineList>
      )}
    </>
  );
}
