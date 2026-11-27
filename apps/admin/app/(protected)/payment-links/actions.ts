"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { extendPaymentLinkFor, revokePaymentLinkFor, type PaymentLinkChange } from "@/lib/server/payment-links-admin";
import { requireStaffCan } from "@/lib/server/staff-role";

const linkId = z.uuid();

const RESULT: Readonly<Record<PaymentLinkChange, string>> = {
  done: "done",
  "not-found": "gone",
  "not-open": "closed",
  "business-has-another": "another",
};

/** Reads the link id the row's form posted; anything that is not an id is the same answer as a link that is gone. */
function postedLinkId(formData: FormData): string | null {
  const parsed = linkId.safeParse(formData.get("linkId"));
  return parsed.success ? parsed.data : null;
}

async function change(
  formData: FormData,
  doneName: "cancelled" | "extended",
  run: (input: { readonly linkId: string; readonly staff: Awaited<ReturnType<typeof requireStaffCan>>; readonly now: Date }) => Promise<PaymentLinkChange>,
): Promise<never> {
  const staff = await requireStaffCan("money");
  const id = postedLinkId(formData);
  const outcome = id === null ? "not-found" : await run({ linkId: id, staff, now: new Date() });
  revalidatePath("/payment-links");
  return redirect(`/payment-links?result=${outcome === "done" ? doneName : RESULT[outcome]}`);
}

/** Cancels a link that is not paid yet. */
export async function cancelPaymentLinkAction(formData: FormData): Promise<void> {
  await change(formData, "cancelled", revokePaymentLinkFor);
}

/** Gives an open or expired link seven more days from now. */
export async function extendPaymentLinkAction(formData: FormData): Promise<void> {
  await change(formData, "extended", extendPaymentLinkFor);
}
