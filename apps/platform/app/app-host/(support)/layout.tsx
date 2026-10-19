import type { ReactElement, ReactNode } from "react";
import { DashboardFrame } from "@brandbasket/shared/ui/panel/dashboard-frame";
import { HomeIcon, LifebuoyIcon } from "@brandbasket/shared/ui/icons";
import { logoOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { accountLabel } from "@/lib/server/account-label";
import { requireSupportAccess } from "@/lib/server/support-access";
import { signOut } from "@/lib/server/sign-out";

export default async function SupportLayout({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  const { user } = await requireSupportAccess();
  const brand = await requestBrand();
  return <DashboardFrame signOut={signOut} variant="dark" brand={logoOf(brand)} account={{ name: user.name, email: accountLabel(user) }} panel={null}
    nav={[{ href: "/", label: "Back to dashboard", icon: <HomeIcon className="size-5" /> }, { href: "/support", label: "My requests", icon: <LifebuoyIcon className="size-5" /> }]}
    topBar={<p className="text-sm text-ink-soft">{brand.shortName} support</p>}>{children}</DashboardFrame>;
}
