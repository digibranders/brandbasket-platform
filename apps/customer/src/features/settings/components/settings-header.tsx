import { PageHeader } from "@/components";
import { TabLinks } from "@/ui";

const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/security", label: "Sign-in and security" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/privacy", label: "Privacy and data" },
] as const;

export type SettingsTab = (typeof TABS)[number]["href"];

/** The page title and its tabs. Team is the owner's, so the others do not see the tab. */
export function SettingsHeader({ current, showTeam }: { readonly current: SettingsTab; readonly showTeam: boolean }) {
  const items = TABS.filter((tab) => showTeam || tab.href !== "/settings/team");
  return <PageHeader title="Settings" tabs={<TabLinks aria-label="Settings" items={items} current={current} />} />;
}
