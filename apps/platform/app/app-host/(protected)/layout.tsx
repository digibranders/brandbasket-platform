import type { ReactElement, ReactNode } from "react";
import { BillingBanner } from "@/components/panel/billing-banner";
import { HiddenOnPaths } from "@/components/panel/hidden-on-paths";
import { MembershipGateShell } from "@/components/panel/membership-gate-shell";
import { AppShell } from "@/components/v2/app-shell";
import { accountLabel } from "@/lib/server/account-label";
import { getAffiliateAccess } from "@/lib/server/affiliate-access";
import { ensureGeoCatalog } from "@/lib/server/geo-catalog";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { getCustomerBusinessEntry, isAwaitingMembership, requireCustomerAccess } from "@/lib/server/customer-access";

interface AppProtectedLayoutProps {
  readonly children: ReactNode;
}

/** The home screen places the banner in its own header, so the layout leaves it out there. */
const PAGES_WITH_THEIR_OWN_BANNER = ["/"] as const;

export default async function AppProtectedLayout({ children }: AppProtectedLayoutProps): Promise<ReactElement> {
  // Open to a free listing account and to one awaiting its plan; each page decides for itself whether it is theirs.
  const { user, tenant } = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  await ensureGeoCatalog();
  const entry = await getCustomerBusinessEntry(tenant.userId, tenant.businessId);
  // An owner who chose Managed Website and has not paid has one page, the plan's, and no dashboard around it yet.
  if (isAwaitingMembership(entry)) return <MembershipGateShell>{children}</MembershipGateShell>;
  const banner = await getBillingBanner();
  const isAffiliate = (await getAffiliateAccess()).kind === "granted";

  return (
    <AppShell userName={user.name} userEmail={accountLabel(user)} isAffiliate={isAffiliate}>
      {banner === null ? null : (
        <HiddenOnPaths paths={PAGES_WITH_THEIR_OWN_BANNER}>
          <BillingBanner banner={banner} className="mb-8" />
        </HiddenOnPaths>
      )}
      {children}
    </AppShell>
  );
}
