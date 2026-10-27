import { listActivityForBusiness, listAssignableSupportStaff } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ActivityList } from "@/components/activity-list";
import { Section } from "@/components/console/section";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Client activity" };

/** How much history one page shows. */
const ACTIVITY_SHOWN = 200;

export default async function ClientActivityPage({ params }: { readonly params: Promise<{ readonly businessId: string }> }): Promise<ReactElement> {
  const { businessId } = await params;
  const { client } = await openClientTab(businessId, "activity");
  const db = getStaffDb();
  const [rows, staff] = await Promise.all([listActivityForBusiness(db, client.businessId, ACTIVITY_SHOWN), listAssignableSupportStaff(db)]);

  return (
    <Section title="Activity" aside={rows.length === ACTIVITY_SHOWN ? `The ${ACTIVITY_SHOWN} newest` : undefined}>
      <ActivityList rows={rows} staffNames={new Map(staff.map((member) => [member.userId, member.name]))} />
    </Section>
  );
}
