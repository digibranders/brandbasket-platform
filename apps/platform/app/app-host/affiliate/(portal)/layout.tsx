import type { ReactElement, ReactNode } from "react";
import { AffiliateShell } from "@/components/panel/affiliate/affiliate-shell";
import { accountLabel } from "@/lib/server/account-label";
import { requireAffiliateAccess } from "@/lib/server/affiliate-access";

interface AffiliateLayoutProps {
  readonly children: ReactNode;
}

export default async function AffiliateLayout({ children }: AffiliateLayoutProps): Promise<ReactElement> {
  // Not a customer area: anyone who is not an affiliate is sent to sign in, and each page checks again for itself.
  const { user } = await requireAffiliateAccess();
  return (
    <AffiliateShell userName={user.name} userEmail={accountLabel(user)}>
      {children}
    </AffiliateShell>
  );
}
