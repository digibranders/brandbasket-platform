import type { Metadata } from "next";
import { GTM_ID } from "@/features/consent/consent";
import { PrivacyPanels } from "@/features/settings/components/privacy-panels";
import { SettingsHeader } from "@/features/settings/components/settings-header";
import { loadNominee } from "@/features/settings/loader";
import { requireCustomer } from "@/lib/guards";
import { load } from "@/lib/loaded";

export const metadata: Metadata = { title: "Privacy and data" };

/** Settings, Privacy and data. Open to every member of a business; closing the account is offered to the owner only. */
export default async function PrivacyPage() {
  const customer = await requireCustomer();
  const nominee = await load("settings.nominee", () => loadNominee(customer));
  return (
    <>
      <SettingsHeader current="/settings/privacy" showTeam={customer.role === "owner"} showSocial={customer.services.includes("social")} />
      <PrivacyPanels nominee={nominee} measuring={GTM_ID !== null} canDelete={customer.role === "owner"} />
    </>
  );
}
