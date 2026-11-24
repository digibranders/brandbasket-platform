import type { Metadata } from "next";
import { PageHeader } from "@/components";
import { ChangelogList } from "@/features/changelog/components/changelog-list";
import { SettingsCard } from "@/features/settings/components/settings-card";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "What’s new" };

/** What changed in the dashboard. Reached from the account menu. Every member of a business may read it. */
export default async function ChangelogPage() {
  await requireCustomer();
  return (
    <>
      <PageHeader title="What’s new" description="What we have changed in your dashboard." />
      <SettingsCard title="Latest updates" tone="focal" flush>
        <ChangelogList />
      </SettingsCard>
    </>
  );
}
