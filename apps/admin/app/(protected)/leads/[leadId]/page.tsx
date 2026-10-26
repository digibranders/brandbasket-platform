import { findLead, findUserIdByEmail, isBillingStarted, listConsents, listLeadInvites } from "@brandbasket/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { EnquiriesHeader } from "@/components/enquiries/enquiries-header";
import { EnquiryDetail } from "@/components/enquiries/enquiry-detail";
import { EnquiryList } from "@/components/enquiries/enquiry-list";
import { readEnquiryQuery } from "@/lib/enquiries";
import { getStaffDb } from "@/lib/server/db";
import { loadEnquiryScreen } from "@/lib/server/enquiries-screen";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export const metadata: Metadata = { title: "Enquiry" };

export default async function EnquiryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly leadId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const { leadId } = await params;
  await logStaffAccess({ staffUserId: user.id, action: "lead.view", targetType: "lead", targetId: leadId });
  const query = readEnquiryQuery(await searchParams);
  const db = getStaffDb();
  const lead = await findLead(db, leadId);
  if (lead === null) notFound();

  const [screen, invites, consents, strandedAccount, currencyLocked] = await Promise.all([
    loadEnquiryScreen(query, user.id),
    listLeadInvites(db, lead.id),
    listConsents(db, { type: "lead", ref: lead.id }),
    lead.businessId === null ? findUserIdByEmail(db, lead.email) : Promise.resolve(null),
    lead.businessId === null ? Promise.resolve(false) : isBillingStarted(db, lead.businessId),
  ]);
  const consent = [...consents].reverse().find((entry) => entry.purpose === "lead_contact" && entry.event === "given") ?? null;

  return (
    <>
      <EnquiriesHeader query={query} weekCount={screen.weekCount} toContactCount={screen.toContactCount} />
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <EnquiryList all={screen.all} rows={screen.rows} query={query} selectedId={lead.id} ownerNames={screen.ownerNames} now={screen.now} />
        <EnquiryDetail
          lead={lead}
          invites={invites}
          consent={consent}
          staff={screen.staff}
          strandedAccount={strandedAccount !== null}
          currencyLocked={currencyLocked}
          now={screen.now}
        />
      </div>
    </>
  );
}
