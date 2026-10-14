"use server";

import { revalidatePath } from "next/cache";
import { setLeadReplied } from "@fynix/db";
import { LEADS_PATH } from "@/lib/leads";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getStaffDb } from "@/lib/server/db";
import { resolveLeadsSource } from "@/lib/server/leads-owner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marks one enquiry replied, or new again, from a button beside it. Only the lead's id and which way to go are read
 * from the form; whose lead it may be is decided here from the signed-in business, so an id from anywhere else changes
 * nothing. The layout is drawn again so the sidebar's count follows.
 */
export async function setLeadRepliedAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const id = formData.get("leadId");
  const replied = formData.get("replied") === "true";
  if (typeof id !== "string" || !UUID.test(id)) return;
  const { source } = await resolveLeadsSource(tenant);
  if (source.state !== "open") return;
  await setLeadReplied(getStaffDb(), source.business, id, replied, new Date());
  revalidatePath(LEADS_PATH);
  revalidatePath("/", "layout");
}
