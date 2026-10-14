"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parseAdPlacement, parseAdRupees, parseAdTagline } from "@fynix/shared/lib/directory/ads";
import { bidNotice, type AdvertiseNotice } from "@/lib/advertise-notices";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { saveCustomerBid, saveCustomerTagline } from "@/lib/server/directory-ads";

const weekSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Back to the bid panel on the week and spot just acted on, so the owner sees the result where they were. */
function back(notice: AdvertiseNotice, week?: string, placement?: string): never {
  const params = new URLSearchParams({ notice });
  if (week !== undefined) params.set("week", week);
  if (placement !== undefined) params.set("spot", placement);
  redirect(`/advertise?${params.toString()}#bid`);
}

/**
 * Places or changes a bid (the Place bid button) or withdraws it (the Withdraw link, `intent=withdraw`). Every rule is
 * checked again in the database transaction; this only reads the form.
 */
export async function saveBidAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const placement = parseAdPlacement(formData.get("placement"));
  const week = weekSchema.safeParse(formData.get("week"));
  if (placement === null || !week.success) back("invalid");

  const withdrawing = formData.get("intent") === "withdraw";
  const amountPaise = withdrawing ? null : parseAdRupees(formData.get("amount"));
  if (!withdrawing && amountPaise === null) back("invalid", week.data, placement);

  const outcome = await saveCustomerBid(customer, { placement, weekStart: week.data, amountPaise }, new Date());
  back(bidNotice(outcome), week.data, placement);
}

/** Saves the ad's one line for staff to approve; an empty line removes it. */
export async function saveTaglineAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const parsed = parseAdTagline(formData.get("tagline"));
  if (!parsed.ok) redirect("/advertise?notice=tagline-invalid#your-ad");
  const saved = await saveCustomerTagline(customer, parsed.tagline);
  if (!saved) redirect("/advertise?notice=no-claim");
  redirect(`/advertise?notice=${parsed.tagline === null ? "tagline-cleared" : "tagline-saved"}#your-ad`);
}
