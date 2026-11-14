import type { Metadata } from "next";
import { Panel } from "@/components";
import { SettingsHeader } from "@/features/settings/components/settings-header";
import { SocialSettingsView } from "@/features/settings/components/social-settings";
import { privacyRequestHref } from "@/features/settings/rules/privacy";
import { loadSocialSettings } from "@/legacy-social/server/social-settings";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Social media settings" };

/** Settings, Social media: the accounts posts go to (connect, reconnect, disconnect), and the data request. Only for a business with the Social media service. */
export default async function SocialMediaSettingsPage() {
  const customer = await requireCustomer();
  const has = customer.services.includes("social");
  const settings = has ? await loadSocialSettings(customer) : null;
  return (
    <>
      <SettingsHeader current="/settings/social-media" showTeam={customer.role === "owner"} showSocial={has} />
      {settings === null ? (
        <Panel title="Social media">
          <p className="type-meta">Social media is not part of your plan.</p>
        </Panel>
      ) : !settings.configured ? (
        <Panel title="Social media">
          <p className="type-meta">Posting is not available on this server.</p>
        </Panel>
      ) : (
        <SocialSettingsView
          brandName={settings.brandName}
          channels={settings.channels}
          unavailable={settings.unavailable}
          canChange={customer.role !== "viewer"}
          deletionHref={`${privacyRequestHref()}?subject=${encodeURIComponent("Delete my social media data")}`}
        />
      )}
    </>
  );
}
