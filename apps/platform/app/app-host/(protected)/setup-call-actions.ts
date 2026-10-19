"use server";

import { isPhoneAccountEmail } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { bookSetupCall, loadSetupCallSlots, markSetupCallBooked, type BookSetupCallResult, type SetupCallSlots } from "@/lib/server/setup-call";

/**
 * Called by the home screen's booking card when the booking page says a time was picked, so the dashboard stops asking for a
 * call and says the call is booked. The argument is Calendly's link for the booking; anything else is ignored.
 */
export async function recordSetupCallBooked(inviteeUri: unknown): Promise<void> {
  const { tenant } = await requireCustomerAccess();
  await markSetupCallBooked(tenant, inviteeUri, new Date());
  revalidatePath("/");
}

/** The times the customer can pick from, for the booking card's own calendar. */
export async function loadCallSlots(): Promise<SetupCallSlots> {
  await requireCustomerAccess();
  return loadSetupCallSlots(new Date());
}

/** Books the picked time for the signed-in customer. An account with no real email address cannot be sent the invitation. */
export async function bookCallSlot(startIso: unknown, timeZone: unknown): Promise<BookSetupCallResult> {
  const { user, tenant } = await requireCustomerAccess();
  if (isPhoneAccountEmail(user.email)) return { ok: false, reason: "failed" };
  const result = await bookSetupCall(tenant, { name: user.name, email: user.email }, startIso, timeZone, new Date());
  if (result.ok) revalidatePath("/");
  return result;
}
