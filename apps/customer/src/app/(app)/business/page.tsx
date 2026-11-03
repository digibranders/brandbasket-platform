import type { Metadata } from "next";
import { BusinessDetails } from "@/features/business/components/business-details";
import { BusinessHeader } from "@/features/business/components/business-header";
import { loadContact, loadSiteFacts } from "@/features/business/loader";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Business profile" };

/** Business profile, Details tab. Anyone who has paid reads it; a lapsed customer reads but cannot save (the actions ask for a live paid period). */
export default async function BusinessPage() {
  const customer = await requirePaid();
  const [contact, siteFacts] = await Promise.all([loadContact(customer), customer.billing.hasWebsite ? loadSiteFacts(customer) : null]);
  return (
    <>
      <BusinessHeader current="/business" />
      <BusinessDetails customer={customer} contact={contact} siteFacts={siteFacts} />
    </>
  );
}
