import type { ReactElement, ReactNode } from "react";
import { AffiliateShell } from "@/components/panel/affiliate/affiliate-shell";
import { AppShell } from "@/components/v2/app-shell";
import { accountLabel } from "@/lib/server/account-label";
import { isAlsoCustomer, requireAffiliateAccess } from "@/lib/server/affiliate-access";

interface AffiliateLayoutProps {
  readonly children: ReactNode;
}

export default async function AffiliateLayout({ children }: AffiliateLayoutProps): Promise<ReactElement> {
  // Not a customer area: anyone who is not an affiliate is sent to sign in, and each page checks again for itself.
  const { user } = await requireAffiliateAccess();
  // A business owner who is also an affiliate keeps their own dashboard around the page, with Affiliate in its rail.
  if (await isAlsoCustomer(user.id)) {
    return (
      <AppShell userName={user.name} userEmail={accountLabel(user)} isAffiliate>
        {children}
      </AppShell>
    );
  }
  return (
    <AffiliateShell userName={user.name} userEmail={accountLabel(user)}>
      {children}
    </AffiliateShell>
  );
}
