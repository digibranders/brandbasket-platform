import "server-only";
import { listNotificationPreferences, withTenantScope, type NotificationTopic } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { getAppDb } from "@/lib/server/db";

/** The signed-in person's effective email choice for every topic, for the business in their session. */
export async function loadNotificationChoices(tenant: TenantContext): Promise<Record<NotificationTopic, boolean>> {
  return withTenantScope(getAppDb(), tenant, (tx) => listNotificationPreferences(tx, tenant.userId));
}
