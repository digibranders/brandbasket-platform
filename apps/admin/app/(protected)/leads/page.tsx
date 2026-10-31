import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EnquiriesHeader } from "@/components/enquiries/enquiries-header";
import { EnquiryList } from "@/components/enquiries/enquiry-list";
import { readEnquiryQuery } from "@/lib/enquiries";
import { loadEnquiryScreen } from "@/lib/server/enquiries-screen";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export const metadata: Metadata = { title: "Enquiries" };

export default async function EnquiriesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "leads.list", targetType: "leads" });
  const query = readEnquiryQuery(await searchParams);
  const screen = await loadEnquiryScreen(query, user.id);
  return (
    <>
      <EnquiriesHeader query={query} weekCount={screen.weekCount} toContactCount={screen.toContactCount} />
      <div className="mt-6">
        <EnquiryList all={screen.all} rows={screen.rows} query={query} selectedId={null} ownerNames={screen.ownerNames} now={screen.now} />
      </div>
    </>
  );
}
