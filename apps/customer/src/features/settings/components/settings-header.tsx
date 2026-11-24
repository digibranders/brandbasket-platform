import Link from "next/link";
import { SettingsTabs, type SettingsTabItem } from "@brandbasket/shared/ui/patterns";
import { PageHeader } from "@/components";

const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/security", label: "Sign-in and security" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/social-media", label: "Social media" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/privacy", label: "Privacy and data" },
  { href: "/settings/delete", label: "Delete account" },
] as const;

export type SettingsTab = (typeof TABS)[number]["href"];

/** Team and Delete account are the owner's, so the others do not see those tabs; Social media is only for a business that has the service. */
export function visibleSettingsTabs(showTeam: boolean, showSocial: boolean): readonly SettingsTabItem[] {
  return TABS.filter((tab) => {
    if (tab.href === "/settings/team" || tab.href === "/settings/delete") return showTeam;
    if (tab.href === "/settings/social-media") return showSocial;
    return true;
  }).map((tab) => ({ id: tab.href, label: tab.label, href: tab.href, ...(tab.href === "/settings/delete" ? { tone: "danger" as const } : {}) }));
}

/** The page title and its tabs. */
export function SettingsHeader({ current, showTeam, showSocial = false }: { readonly current: SettingsTab; readonly showTeam: boolean; readonly showSocial?: boolean }) {
  return (
    <PageHeader
      title="Settings"
      description="Manage your profile, sign-in, notifications, team and data."
      tabs={<SettingsTabs ariaLabel="Settings" tabs={visibleSettingsTabs(showTeam, showSocial)} activeTabId={current} LinkComponent={Link} />}
    />
  );
}
