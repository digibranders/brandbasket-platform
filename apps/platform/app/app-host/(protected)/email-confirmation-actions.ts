"use server";

import { requireCustomerAccess } from "@/lib/server/customer-access";
import { sendEmailConfirmation } from "@/lib/server/account-recovery";

export type ResendConfirmationState = { readonly status: "idle" } | { readonly status: "done"; readonly ok: boolean; readonly message: string };

/** Sends the signed-in customer's confirmation email again, from the banner that asks them to confirm it. */
export async function resendEmailConfirmationAction(): Promise<ResendConfirmationState> {
  const { user } = await requireCustomerAccess({ listingAccount: "allow" });
  if (user.emailConfirmed) return { status: "done", ok: true, message: "Your email is already confirmed." };
  // An account opened with a mobile number has no address to confirm (and is never shown the banner).
  if (user.phone !== null) return { status: "done", ok: true, message: "Your mobile number is already confirmed." };
  const outcome = await sendEmailConfirmation(user.email);
  if (outcome === "sent") return { status: "done", ok: true, message: `Sent. Check ${user.email}, and your spam folder.` };
  if (outcome === "limited") return { status: "done", ok: false, message: "We've sent it a few times already. Try again in an hour." };
  return { status: "done", ok: false, message: "We couldn't send it just now. Try again in a minute." };
}
