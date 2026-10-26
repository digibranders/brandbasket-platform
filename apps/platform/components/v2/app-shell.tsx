import type { ReactElement, ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { logoOf } from "@/lib/brand";
import { inFirstLook } from "@/lib/first-look";
import type { ClientListingState } from "@/lib/listing-sections";
import { railSections } from "@/lib/rail";
import { getAccountPanel } from "@/lib/server/account-panel";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getClientListingState } from "@/lib/server/listing";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { requestBrand } from "@/lib/server/request-brand";
import { getSetupCallState } from "@/lib/server/setup-call";
import { signOut } from "@/lib/server/sign-out";
import { PhoneBars } from "./phone-bars";
import { Rail, type AccountMenu } from "./rail";

interface AppShellProps {
  readonly userName: string;
  readonly userEmail: string;
  /** The Business ID of a listing the member claimed while free, for the account menu; null when there is none. */
  readonly businessId: string | null;
  readonly children: ReactNode;
}

/** A failed read hides the directory items rather than taking the dashboard down. */
async function readListingNav(): Promise<ClientListingState> {
  try {
    return await getClientListingState();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[app-shell] could not read the listing; hiding it from the rail", errorLogInfo(error));
    return { ownListing: false, claim: false };
  }
}

/** The customer dashboard v2: the rail (or the phone bars) around the page. */
export async function AppShell({ userName, userEmail, businessId, children }: AppShellProps): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  const [brand, panel, overview, liveWebsite, listing, callState] = await Promise.all([
    requestBrand(),
    getAccountPanel(),
    getProjectOverview(),
    getLiveWebsite(),
    readListingNav(),
    getSetupCallState(tenant),
  ]);
  const websiteSent = liveWebsite !== null || overview.project?.onboardingSubmittedAt != null;
  const quiet = inFirstLook({ websiteSent, callEndsAtIso: callState.booking?.endsAtIso ?? null, nowMs: callState.readAtMs });
  const sections = railSections({
    quiet,
    // An unpaid client still sets up and pays on Check and send: only a paid plan without a website loses the section.
    hasWebsite: !billing.hasAccess || billing.hasWebsite,
    websiteSetupDone: websiteSent,
    listingClaim: listing.claim,
  });
  const logo = logoOf(brand);
  const menu: AccountMenu = {
    account: { name: userName, email: userEmail, href: "/settings", ...(businessId === null ? {} : { businessId }) },
    panel,
    docsUrl: logo.siteUrl ?? `${siteConfig.url}/faq`,
    contactEmail: logo.email ?? siteConfig.email,
    brandName: logo.name,
  };

  return (
    <div className="flex min-h-dvh bg-bg lg:bg-dark-surface">
      <Rail sections={sections} logo={logo} menu={menu} signOut={signOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneBars sections={sections} logo={logo} menu={menu} signOut={signOut} />
        <div className="relative isolate flex min-w-0 flex-1 flex-col overflow-clip bg-bg lg:my-2 lg:mr-2 lg:rounded-lift">
          <main id="main" className="min-w-0 flex-1 px-5 pb-28 pt-4 sm:px-8 lg:pb-16 lg:pt-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
