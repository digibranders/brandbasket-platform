import type { ReactElement, ReactNode } from "react";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { logoOf } from "@/lib/brand";
import { railSections } from "@/lib/rail";
import { getAccountPanel } from "@/lib/server/account-panel";
import { loadActiveServices } from "@/lib/server/active-services";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { ASK_FOR_A_CHANGE_PATH } from "@/lib/requests/links";
import { requestBrand } from "@/lib/server/request-brand";
import { loadRequestsBadge } from "@/lib/server/requests";
import { signOut } from "@/lib/server/sign-out";
import { PhoneBars } from "./phone-bars";
import { Rail, type AccountMenu } from "./rail";

interface AppShellProps {
  readonly userName: string;
  readonly userEmail: string;
  /** Also an affiliate: the rail gets an Affiliate link. */
  readonly isAffiliate?: boolean;
  readonly children: ReactNode;
}

/** The customer portal's shell: the sidebar (or the phone bars) around the page. */
export async function AppShell({ userName, userEmail, isAffiliate = false, children }: AppShellProps): Promise<ReactElement> {
  // A free listing account is let in too: Settings, Billing and the privacy pages are still its own, and a refusal here would send it to a page that no longer exists.
  const { tenant, billing } = await requireCustomerAccess({ listingAccount: "allow" });
  const [brand, panel, services] = await Promise.all([requestBrand(), getAccountPanel(), loadActiveServices(tenant)]);
  // Quotes to answer and changes to check. The loader shows none rather than failing, so the shell always draws.
  const requestsCount = await loadRequestsBadge(tenant);
  const sections = railSections({
    hasAccess: billing.hasAccess,
    // An unpaid client still sets up and pays on Check and send: only a paid plan without a website loses the section.
    hasWebsite: !billing.hasAccess || billing.hasWebsite,
    hasSocial: services.includes("social"),
    hasSearch: services.includes("search"),
    requestsCount,
    affiliate: isAffiliate,
  });
  const logo = logoOf(brand);
  const menu: AccountMenu = {
    account: { name: userName, email: userEmail, href: "/settings" },
    panel,
    docsUrl: logo.siteUrl ?? `${siteConfig.url}/faq`,
    // Every question lands in Requests, where the reply and its date are tracked.
    helpHref: `${ASK_FOR_A_CHANGE_PATH}?kind=other`,
  };

  return (
    <div className="dashboard-type flex min-h-dvh bg-bg">
      <Rail sections={sections} logo={logo} menu={menu} businessName={tenant.businessName} signOut={signOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneBars sections={sections} logo={logo} menu={menu} signOut={signOut} />
        <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 lg:pb-16 lg:pt-10 xl:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
