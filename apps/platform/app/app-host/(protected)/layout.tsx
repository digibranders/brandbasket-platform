import type { ReactElement, ReactNode } from "react";
import { BillingBanner } from "@/components/panel/billing-banner";
import { CustomerShell } from "@/components/panel/customer-shell";
import { EmailConfirmationBanner } from "@/components/panel/email-confirmation-banner";
import { HiddenOnPaths } from "@/components/panel/hidden-on-paths";
import { PaymentCelebration } from "@/components/panel/payment-celebration";
import { ListingAccountShell } from "@/components/panel/listing-account-shell";
import { MembershipGateShell } from "@/components/panel/membership-gate-shell";
import { displayBusinessId } from "@/lib/business-profile";
import { membershipPriceLine } from "@/lib/membership";
import { accountLabel } from "@/lib/server/account-label";
import { ensureGeoCatalog } from "@/lib/server/geo-catalog";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { getOwnPlaceId } from "@/lib/server/business-profile";
import { getCustomerBusinessEntry, isAwaitingMembership, requireCustomerAccess } from "@/lib/server/customer-access";
import { readNewLeadCount } from "@/lib/server/leads-owner";

import { resendEmailConfirmationAction } from "./email-confirmation-actions";

interface AppProtectedLayoutProps {
  readonly children: ReactNode;
}

/** The home screen places the banner in its own header, so the layout leaves it out there. */
const PAGES_WITH_THEIR_OWN_BANNER = ["/"] as const;

export default async function AppProtectedLayout({ children }: AppProtectedLayoutProps): Promise<ReactElement> {
  // Open to free listing accounts, which get their own shell; each page decides for itself whether it is theirs.
  const { user, tenant, billing } = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  await ensureGeoCatalog();
  const entry = await getCustomerBusinessEntry(tenant.userId, tenant.businessId);
  // An owner who chose Care or Premium and has not paid has one page, that plan's, and no dashboard around it yet.
  if (isAwaitingMembership(entry)) return <MembershipGateShell>{children}</MembershipGateShell>;
  const placeId = await getOwnPlaceId({ tenant });
  const businessId = placeId === null ? null : displayBusinessId(placeId);
  // A Care client has no Leads in the menu, so there is nothing to count for them.
  const newLeadCount = entry.kind === "website" && billing.tier === "care" ? 0 : await readNewLeadCount(tenant);
  if (entry.kind === "listing") {
    // Premium is highlighted for an account that said it has no website (and for accounts older than the question).
    const premiumOffer = entry.signupChoice === "own_website" || billing.plan === null ? null : membershipPriceLine(billing.plan);
    return (
      <ListingAccountShell
        userName={user.name}
        userEmail={accountLabel(user)}
        premiumOffer={premiumOffer}
        businessId={businessId}
        newLeadCount={newLeadCount}
      >
        {/* An account opened with a mobile number proved it with a texted code, and has no address to confirm. */}
        {user.emailConfirmed || user.phone !== null ? null : (
          <EmailConfirmationBanner email={user.email} resend={resendEmailConfirmationAction} />
        )}
        {children}
      </ListingAccountShell>
    );
  }
  const banner = await getBillingBanner();

  return (
    <CustomerShell userName={user.name} userEmail={accountLabel(user)} businessId={businessId} tier={billing.tier} newLeadCount={newLeadCount}>
      {/* Goes off once, when a payment has just opened the plan (the address says so; see lib/celebration.ts). */}
      <PaymentCelebration tier={billing.tier} />
      {banner === null ? null : (
        <HiddenOnPaths paths={PAGES_WITH_THEIR_OWN_BANNER}>
          <BillingBanner banner={banner} className="mb-8" />
        </HiddenOnPaths>
      )}
      {children}
    </CustomerShell>
  );
}
