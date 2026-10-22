import type { ReactElement, ReactNode } from "react";
import { BillingBanner } from "@/components/panel/billing-banner";
import { CustomerShell } from "@/components/panel/customer-shell";
import { EmailConfirmationBanner } from "@/components/panel/email-confirmation-banner";
import { HiddenOnPaths } from "@/components/panel/hidden-on-paths";
import { PaymentCelebration } from "@/components/panel/payment-celebration";
import { ListingAccountShell } from "@/components/panel/listing-account-shell";
import { MembershipGateShell } from "@/components/panel/membership-gate-shell";
import { displayBusinessId } from "@/lib/business-profile";
import { websiteAloneNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { membershipPriceLine } from "@/lib/membership";
import { accountLabel } from "@/lib/server/account-label";
import { ensureGeoCatalog } from "@/lib/server/geo-catalog";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { loadWelcomeServices } from "@/lib/server/add-ons";
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
  // An owner who chose Managed Website and has not paid has one page, the plan's, and no dashboard around it yet.
  if (isAwaitingMembership(entry)) return <MembershipGateShell>{children}</MembershipGateShell>;
  const placeId = await getOwnPlaceId({ tenant });
  const businessId = placeId === null ? null : displayBusinessId(placeId);
  // A website client has no Leads in the menu (the directory is off), so there is nothing to count for them.
  const newLeadCount = entry.kind === "website" ? 0 : await readNewLeadCount(tenant);
  if (entry.kind === "listing") {
    // Premium is highlighted for an account that said it has no website (and for accounts older than the question).
    const premiumOffer = entry.signupChoice === "own_website" || billing.plan === null ? null : membershipPriceLine(billing.plan, websiteAloneNetCents(billing.plan.currency));
    return (
      <ListingAccountShell
        userName={user.name}
        userEmail={accountLabel(user)}
        premiumOffer={premiumOffer}
        businessId={businessId}
        newLeadCount={newLeadCount}
      >
        {/* An account opened with a mobile number has no address to confirm. */}
        {user.emailConfirmed || user.phone !== null ? null : (
          <EmailConfirmationBanner email={user.email} resend={resendEmailConfirmationAction} />
        )}
        {children}
      </ListingAccountShell>
    );
  }
  const banner = await getBillingBanner();
  // What the welcome after a payment lists: the services that payment opened.
  const welcomeServices = billing.hasAccess ? await loadWelcomeServices(tenant) : [];

  return (
    <CustomerShell userName={user.name} userEmail={accountLabel(user)} businessId={businessId}>
      {/* Goes off once, when a payment has just opened the plan (the address says so; see lib/celebration.ts). */}
      <PaymentCelebration services={welcomeServices} />
      {banner === null ? null : (
        <HiddenOnPaths paths={PAGES_WITH_THEIR_OWN_BANNER}>
          <BillingBanner banner={banner} className="mb-8" />
        </HiddenOnPaths>
      )}
      {children}
    </CustomerShell>
  );
}
