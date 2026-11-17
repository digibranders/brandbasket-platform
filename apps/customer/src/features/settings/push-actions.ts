"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import { revokePushSubscription, savePushSubscription, withUserScope } from "@brandbasket/db";
import { parsePushSubscription, pushEndpointSchema } from "@brandbasket/shared/lib/push-device";
import { headers } from "next/headers";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getAppDb, getStaffDb } from "@/lib/db";
import { requireCustomer } from "@/lib/guards";
import { reportError } from "@/lib/report";

const SAVE_FAILED = "We could not turn notifications on. Please try again in a moment.";
const REMOVE_FAILED = "We could not turn notifications off. Please try again in a moment.";

/**
 * Saves this browser's push subscription for the signed-in person. The person is always the session's: nothing the call
 * carries but the subscription itself is read. It is written on the staff connection because a browser's address is unique
 * across everyone, so a browser another person used before holds a row this person's connection cannot see.
 */
export async function savePushDeviceAction(input: unknown): Promise<ActionResult> {
  const { user } = await requireCustomer();
  const parsed = parsePushSubscription(input);
  if (!parsed.success) return actionFail(SAVE_FAILED);
  try {
    await savePushSubscription(getStaffDb(), {
      audience: "customer",
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: (await headers()).get("user-agent"),
    });
  } catch (error) {
    reportError(error, { area: "settings.push.save" });
    return actionFail(SAVE_FAILED);
  }
  return actionOk();
}

/** Turns this browser's push off for the signed-in person. A browser that was already off is done. */
export async function removePushDeviceAction(input: unknown): Promise<ActionResult> {
  const { user } = await requireCustomer();
  const parsed = pushEndpointSchema.safeParse(input);
  if (!parsed.success) return actionFail(REMOVE_FAILED);
  try {
    await withUserScope(getAppDb(), user.id, (tx) => revokePushSubscription(tx, user.id, parsed.data.endpoint));
  } catch (error) {
    reportError(error, { area: "settings.push.remove" });
    return actionFail(REMOVE_FAILED);
  }
  return actionOk();
}
