import type { Metadata } from "next";
import type { ReactElement } from "react";
import { CareUpgrade } from "@/components/panel/upgrade/care-upgrade";
import { FreeUpgrade } from "@/components/panel/upgrade/free-upgrade";
import { getCustomerBusinessEntry, requireCustomerAccess } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Upgrade" };

interface UpgradePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * The Upgrade page, in the sidebar's last group. Free, Care and Premium side by side, for the two accounts that can still
 * move up: a free listing account, which buys either plan (components/panel/upgrade/free-upgrade.tsx), and a Care client,
 * who moves up to Premium on the subscription they have (care-upgrade.tsx). A Premium member has nowhere to go, so the
 * Care page sends them Home. An owner held on the plan they chose at sign-up is sent back to that plan's page.
 */
export default async function UpgradePage({ searchParams }: UpgradePageProps): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const entry = await getCustomerBusinessEntry(customer.tenant.userId, customer.tenant.businessId);
  if (entry.kind === "listing") return <FreeUpgrade customer={customer} />;
  return <CareUpgrade customer={customer} payment={(await searchParams).payment} />;
}
