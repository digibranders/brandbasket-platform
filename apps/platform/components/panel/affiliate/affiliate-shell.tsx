import type { ReactElement, ReactNode } from "react";
import { TagIcon } from "@firstfold/shared/ui/icons";
import { AFFILIATE_PATH } from "@firstfold/shared/lib/affiliate-links";
import { DashboardFrame } from "@firstfold/shared/ui/panel/dashboard-frame";
import type { SidebarNavItem } from "@firstfold/shared/ui/panel/sidebar-nav";
import { brandText } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { signOut } from "@/lib/server/sign-out";

interface AffiliateShellProps {
  readonly userName: string;
  readonly userEmail: string;
  readonly children: ReactNode;
}

/** An affiliate has one page: their coupon. Nothing of a business's dashboard applies to them. */
const AFFILIATE_NAV: readonly SidebarNavItem[] = [
  { href: AFFILIATE_PATH, label: "My coupon", icon: <TagIcon className="size-5" /> },
];

/** The frame around an affiliate's dashboard: the same sidebar and account menu as everyone's, with the one page. */
export async function AffiliateShell({ userName, userEmail, children }: AffiliateShellProps): Promise<ReactElement> {
  const brand = await requestBrand();
  return (
    <DashboardFrame
      signOut={signOut}
      nav={AFFILIATE_NAV}
      // No account page: an affiliate changes their password with the link staff send, so the menu shows no Settings.
      account={{ name: userName, email: userEmail }}
      panel={null}
      variant="dark"
      topBar={<p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">{brandText("Your Firstfold affiliate dashboard", brand)}</p>}
    >
      {children}
    </DashboardFrame>
  );
}
