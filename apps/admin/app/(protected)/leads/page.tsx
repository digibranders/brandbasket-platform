import type { Metadata } from "next";
import type { ReactElement } from "react";
import { SectionTabs } from "@/components/console/section-tabs";
import { EnquiriesHeader } from "@/components/enquiries/enquiries-header";
import { EnquiriesWorkspace } from "@/components/enquiries/enquiries-workspace";
import { loadOpenEnquiry } from "@/components/enquiries/open-enquiry";
import { ENQUIRY_BUCKETS, inBucket, readEnquiryQuery, type EnquiryBucket } from "@/lib/enquiries";
import { toEnquiryRow } from "@/lib/enquiries-model";
import { loadEnquiryScreen } from "@/lib/server/enquiries-screen";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export const metadata: Metadata = { title: "Enquiries" };

/** Inbox, Enquiries: the list with the open enquiry in a side panel. Nobody owns an enquiry, so the owner filter is ignored. */
export default async function EnquiriesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { user, staff: viewer } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "leads.list", targetType: "leads" });
  const raw = await searchParams;
  const query = { ...readEnquiryQuery(raw), owner: "anyone" } as const;
  const [screen, open] = await Promise.all([loadEnquiryScreen(query, user.id), loadOpenEnquiry({ raw: raw.open, staffUserId: user.id, now: new Date() })]);
  const counts = Object.fromEntries(
    ENQUIRY_BUCKETS.filter((bucket): bucket is Exclude<EnquiryBucket, "all"> => bucket !== "all").map((bucket) => [bucket, screen.all.filter((lead) => inBucket(lead.status, bucket)).length]),
  ) as Record<Exclude<EnquiryBucket, "all">, number>;
  const empty =
    screen.all.length === 0
      ? { title: "No enquiries yet.", description: "People who ask about a plan appear here with how long they have waited." }
      : { title: "No enquiries match this.", description: "Clear the search or the filters to see every enquiry again." };

  return (
    <>
      <EnquiriesHeader query={query} weekCount={screen.weekCount} toContactCount={screen.toContactCount} />
      <SectionTabs role={viewer.role} page="/leads" />
      <div className="mt-6">
        <EnquiriesWorkspace
          rows={screen.rows.map((lead) => toEnquiryRow(lead, screen.now))}
          query={query}
          counts={counts}
          openId={open.openId}
          openRow={open.openRow}
          detail={open.detail}
          detailFailedFor={open.detailFailedFor}
          empty={empty}
        />
      </div>
    </>
  );
}
