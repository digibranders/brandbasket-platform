import type { Metadata } from "next";
import { PanelError } from "@/components";
import { loadNotificationRows } from "@/features/settings/loader";
import { NotificationTable } from "@/features/settings/components/notification-table";
import { SettingsCard } from "@/features/settings/components/settings-card";
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
      <SettingsHeader current="/settings/notifications" showTeam={customer.role === "owner"} showSocial={customer.services.includes("social")} />
      <SettingsCard title="Email notifications" description="Choose which emails we send you." tone="focal" flush>
        {rows.ok ? <NotificationTable rows={rows.data} /> : <div className="px-5 pb-5 sm:px-7 sm:pb-7"><PanelError failure={rows.error} what="your notification settings" /></div>}
      </SettingsCard>
    </>
  );
}
