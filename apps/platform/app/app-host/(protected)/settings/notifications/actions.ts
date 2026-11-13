"use server";

import { setNotificationPreference, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import {
  NOTIFICATION_SAVE_FAILED,
  NOTIFICATION_UNKNOWN_TOPIC,
  NOTIFICATIONS_SETTINGS_PATH,
  notificationChoiceSchema,
  type NotificationChoiceState,
} from "@/lib/settings/notifications";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { reportServerError } from "@/lib/server/error-report";

/** Open to every kind of account, like the rest of Settings: a website client's, a free listing's, a member's. */
const ANY_ACCOUNT = { listingAccount: "allow", membershipCheckout: "allow" } as const;

/** Stores one email choice of the signed-in person for their business. The person and business are the session's, never the caller's. */
export async function setNotificationAction(topic: string, email: boolean): Promise<NotificationChoiceState> {
  const { tenant } = await requireCustomerAccess(ANY_ACCOUNT);
  const parsed = notificationChoiceSchema.safeParse({ topic, email });
  if (!parsed.success) return { status: "error", message: NOTIFICATION_UNKNOWN_TOPIC };
  try {
    await withTenantScope(getAppDb(), tenant, (tx) => setNotificationPreference(tx, tenant.userId, parsed.data.topic, parsed.data.email));
  } catch (error) {
    unstable_rethrow(error);
    await reportServerError(error, { app: "platform", operation: "server_action", route: NOTIFICATIONS_SETTINGS_PATH });
    return { status: "error", message: NOTIFICATION_SAVE_FAILED };
  }
  revalidatePath(NOTIFICATIONS_SETTINGS_PATH);
  return { status: "saved" };
}
