"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import { revokePushSubscription, savePushSubscription } from "@brandbasket/db";
import { parsePushSubscription, pushEndpointSchema } from "@brandbasket/shared/lib/push-device";
import { headers } from "next/headers";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export type PushActionResult = { readonly ok: true } | { readonly ok: false };

/** Saves this browser's push subscription for the signed-in staff member. The member is the session's; the call carries only the subscription. */
export async function savePushDeviceAction(input: unknown): Promise<PushActionResult> {
  const { user } = await requireStaffAccess();
  const parsed = parsePushSubscription(input);
  if (!parsed.success) return { ok: false };
  try {
    await savePushSubscription(getStaffDb(), {
      audience: "staff",
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: (await headers()).get("user-agent"),
    });
  } catch (error) {
    console.error("Saving a console push subscription failed.", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Turns push off for this browser, for the signed-in staff member only. */
export async function removePushDeviceAction(input: unknown): Promise<PushActionResult> {
  const { user } = await requireStaffAccess();
  const parsed = pushEndpointSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    await revokePushSubscription(getStaffDb(), user.id, parsed.data.endpoint);
  } catch (error) {
    console.error("Removing a console push subscription failed.", error);
    return { ok: false };
  }
  return { ok: true };
}
