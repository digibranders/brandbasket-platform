"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parseDealForm, DEALS_PATH, type DealsNotice } from "@/lib/deals";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { dealsToday, editCustomerDeal, postCustomerDeal, removeCustomerDeal } from "@/lib/server/deals";

const dealIdSchema = z.uuid();

function back(notice: DealsNotice): never {
  redirect(`${DEALS_PATH}?notice=${notice}`);
}

/** Posts a new deal; it goes up at once. */
export async function postDealAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const now = new Date();
  const parsed = parseDealForm(formData, dealsToday(now));
  if (!parsed.ok) back(parsed.notice);
  back(await postCustomerDeal(customer, parsed.fields, now));
}

/** Saves changes to one of the owner's own deals. */
export async function editDealAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const dealId = dealIdSchema.safeParse(formData.get("dealId"));
  if (!dealId.success) back("not-found");
  const parsed = parseDealForm(formData, dealsToday(new Date()));
  if (!parsed.ok) back(parsed.notice);
  back(await editCustomerDeal(customer, dealId.data, parsed.fields));
}

/** Removes one of the owner's own deals. */
export async function removeDealAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const dealId = dealIdSchema.safeParse(formData.get("dealId"));
  if (!dealId.success) back("not-found");
  back(await removeCustomerDeal(customer, dealId.data, new Date()));
}
