import type { Metadata } from "next";
import { Panel, PanelError, PageHeader } from "@/components";
import { DeleteAccountFlow } from "@/features/settings/components/delete-account-flow";
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
      <PageHeader title="Delete account" description="Close your account and end your plan." back={{ href: "/settings/privacy", label: "Privacy and data" }} />
      <Panel>
        {facts.ok ? <DeleteAccountFlow facts={facts.data} /> : <PanelError failure={facts.error} what="what deleting your account ends" />}
      </Panel>
    </>
  );
}
