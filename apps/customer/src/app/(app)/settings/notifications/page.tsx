import type { Metadata } from "next";
import { PanelData } from "@/components";
import { loadNotificationRows } from "@/features/settings/loader";
import { NotificationTable } from "@/features/settings/components/notification-table";
import { SettingsHeader } from "@/features/settings/components/settings-header";
import { requireCustomer } from "@/lib/guards";
import { load } from "@/lib/loaded";

export const metadata: Metadata = { title: "Notifications" };

/** Settings, Notifications: one email switch per kind of message, for the signed-in person and their business. */
export default async function NotificationsPage() {
  const customer = await requireCustomer();
  const rows = await load("settings.notifications", () => loadNotificationRows(customer));
  return (
    <>
      <SettingsHeader current="/settings/notifications" showTeam={customer.role === "owner"} />
      <PanelData data={rows} what="your notification settings" flush>
        {(data) => <NotificationTable rows={data} />}
      </PanelData>
    </>
  );
}
