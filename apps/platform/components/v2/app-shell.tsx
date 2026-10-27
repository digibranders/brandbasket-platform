import type { ReactElement, ReactNode } from "react";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { logoOf } from "@/lib/brand";
import { firstLookInput, inFirstLook, type ServiceKey } from "@/lib/first-look";
import { railSections } from "@/lib/rail";
import { getAccountPanel } from "@/lib/server/account-panel";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { ASK_FOR_A_CHANGE_PATH } from "@/lib/requests/links";
import { requestBrand } from "@/lib/server/request-brand";
import { loadRequestNeeds } from "@/lib/server/requests";
import { quietly } from "@/lib/server/quietly";
import { getSetupCallState } from "@/lib/server/setup-call";
import { signOut } from "@/lib/server/sign-out";
import { loadTodo } from "@/lib/server/todo";
import { PhoneBars } from "./phone-bars";
import { Rail, type AccountMenu } from "./rail";

interface AppShellProps {
  readonly userName: string;
  readonly userEmail: string;
  readonly children: ReactNode;
}

const NO_TODO: { readonly open: number; readonly services: readonly ServiceKey[] } = { open: 0, services: [] };

/** The customer dashboard v2: the rail (or the phone bars) around the page. */
export async function AppShell({ userName, userEmail, children }: AppShellProps): Promise<ReactElement> {
  // A free listing account is let in too: Settings, Billing and the privacy pages are still its own, and a refusal here would send it to a page that no longer exists.
  const { tenant, billing } = await requireCustomerAccess({ listingAccount: "allow" });
  const [brand, panel, overview, liveWebsite, callState] = await Promise.all([
    requestBrand(),
    getAccountPanel(),
    getProjectOverview(),
    getLiveWebsite(),
    getSetupCallState(tenant),
  ]);
  const setupSent = overview.project?.onboardingSubmittedAt != null;
  const websiteSent = liveWebsite !== null || setupSent;
  const quiet = inFirstLook(firstLookInput({ hasAccess: billing.hasAccess, liveWebsite, project: overview.project, callState }));
  // To do is for paid accounts past the first look. The count is a convenience: a failed read shows no number rather than
  // taking the shell down. The same cached read says which services were bought, for the rail's Services section.
  const todo =
    quiet || !billing.hasAccess
      ? NO_TODO
      : await quietly("app-shell", "the To do count", NO_TODO, async () => {
          const { open, services } = await loadTodo(tenant);
          return { open, services };
        });
  // Quotes to answer and changes to check. The loader shows none rather than failing, so the shell always draws.
  const requestsCount = (await loadRequestNeeds(tenant)).length;
  const sections = railSections({
    quiet,
    hasAccess: billing.hasAccess,
    // An unpaid client still sets up and pays on Check and send: only a paid plan without a website loses the section.
    hasWebsite: !billing.hasAccess || billing.hasWebsite,
    websiteSetupDone: websiteSent,
    hasSocial: todo.services.includes("social"),
    hasSearch: todo.services.includes("search"),
    todoCount: todo.open,
    requestsCount,
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
    <div className="dashboard-type flex min-h-dvh bg-bg lg:bg-dark-surface">
      <Rail sections={sections} logo={logo} menu={menu} signOut={signOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneBars sections={sections} logo={logo} menu={menu} signOut={signOut} />
        <div className="relative isolate flex min-w-0 flex-1 flex-col overflow-clip bg-bg lg:my-2 lg:mr-2 lg:rounded-lift">
          <main id="main" className="min-w-0 flex-1 px-6 pb-28 pt-4 md:px-8 lg:pb-16 lg:pt-10 xl:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
