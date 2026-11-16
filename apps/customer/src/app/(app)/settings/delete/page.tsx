import type { Metadata } from "next";
import { PanelError } from "@/components";
import { DeleteAccountFlow } from "@/features/settings/components/delete-account-flow";
import { SettingsCard } from "@/features/settings/components/settings-card";
import { SettingsHeader } from "@/features/settings/components/settings-header";
import { loadDeleteFacts } from "@/features/settings/loader";
import { requireOwner } from "@/lib/guards";
import { load } from "@/lib/loaded";

export const metadata: Metadata = { title: "Delete account" };

/** Deleting the account: the walk-through. The owner's alone, because closing it ends the whole business's plan. */
export default async function DeleteAccountPage() {
  const customer = await requireOwner();
  const facts = await load("settings.delete", () => loadDeleteFacts(customer));
  return (
    <>
      <SettingsHeader current="/settings/delete" showTeam showSocial={customer.services.includes("social")} />
      <SettingsCard title="Delete account" description="Close your account and end your plan." tone="danger">
        {facts.ok ? <DeleteAccountFlow facts={facts.data} /> : <PanelError failure={facts.error} what="what deleting your account ends" />}
      </SettingsCard>
    </>
  );
}
