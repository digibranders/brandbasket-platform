import type { Metadata } from "next";
import type { ReactElement } from "react";
import { NotificationSwitches } from "@/components/panel/notification-switches";
import { PageFrame, PageSection } from "@/components/v2/page";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { notificationRows } from "@/lib/settings/notifications";
import { loadNotificationChoices } from "@/lib/settings/notifications-load";
import { setNotificationAction } from "./actions";

export const metadata: Metadata = { title: "Email notifications" };

/** Which emails the signed-in person gets about their business. Open to every kind of account, like the rest of Settings. */
export default async function NotificationSettingsPage(): Promise<ReactElement> {
  const { tenant } = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  const rows = notificationRows(await loadNotificationChoices(tenant));

  return (
    <PageFrame title="Email notifications" lede="Choose which emails we send you about your business. Changes apply at once." width="form">
      <PageSection id="email" title="Email me when">
        <NotificationSwitches rows={rows} action={setNotificationAction} />
      </PageSection>
    </PageFrame>
  );
}
