import type { ReactElement, ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { DashboardFrame } from "@brandbasket/shared/ui/panel/dashboard-frame";
import { AppointmentsNavRefresh } from "@/components/panel/appointments/appointments-nav-refresh";
import { customerNav } from "@/components/panel/customer-nav";
import { logoOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { signOut } from "@/lib/server/sign-out";
import { getAccountPanel } from "@/lib/server/account-panel";
import { getEnabledModules, getNewAppointmentCount } from "@/lib/server/business-modules";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import type { ClientListingState } from "@/lib/listing-sections";
import { getClientListingState } from "@/lib/server/listing";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";

interface CustomerShellProps {
  readonly userName: string;
  readonly userEmail: string;
  /** The Business ID of a listing the member claimed while free, for the account menu; null when there is none. */
  readonly businessId: string | null;
  readonly children: ReactNode;
}

interface AppointmentsNavState {
  readonly enabled: boolean;
  readonly newCount: number;
}

/**
 * `getEnabledModules` and `getNewAppointmentCount` together, caught as one unit: `getNewAppointmentCount` reads
 * the same cached module list internally, so if that read fails, both reject together. A business's whole
 * dashboard shouldn't go down because the one query behind one nav item's badge failed -- so a failure here is
 * logged and degrades to "module off", which just hides the nav item, rather than throwing out of `CustomerShell`
 * and taking the rest of the page with it.
 */
async function readAppointmentsNav(): Promise<AppointmentsNavState> {
  try {
    const [modules, newCount] = await Promise.all([getEnabledModules(), getNewAppointmentCount()]);
    return { enabled: modules.includes("appointments"), newCount };
  } catch (error) {
    // Next's own control-flow errors (redirect/notFound) are thrown from deep inside a Server Component and must
    // keep propagating, not be swallowed as if the query itself had failed.
    unstable_rethrow(error);
    console.error("[customer-shell] could not read the Appointments module state; hiding it from the nav", errorLogInfo(error));
    return { enabled: false, newCount: 0 };
  }
}

/** A failed read hides the directory items rather than taking the dashboard down, like readAppointmentsNav. */
async function readListingNav(): Promise<ClientListingState> {
  try {
    return await getClientListingState();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[customer-shell] could not read the listing; hiding it from the nav", errorLogInfo(error));
    return { ownListing: false, claim: false };
  }
}

/** The customer dashboard: their sections down the side, and their name in the account chip. */
export async function CustomerShell({ userName, userEmail, businessId, children }: CustomerShellProps): Promise<ReactElement> {
  const [brand, { billing }, panel, overview, liveWebsite, appointmentsNav, listing] = await Promise.all([
    requestBrand(),
    requireCustomerAccess(),
    getAccountPanel(),
    getProjectOverview(),
    getLiveWebsite(),
    readAppointmentsNav(),
    readListingNav(),
  ]);
  // Appointments are out of scope for Brandbasket for now (owner, 2026-10-19): the module is never switched on, so this is off.
  const appointmentsEnabled = appointmentsNav.enabled;
  const newAppointmentCount = appointmentsNav.newCount;
  // An unpaid client still sets up and pays on Check and send, and a lapsed one reactivates: only a paid plan without a website loses the section.
  const showWebsite = !billing.hasAccess || billing.hasWebsite;
  // Setup is over once it has been sent to us, whether or not the site has launched yet.
  const setupDone = liveWebsite !== null || overview.project?.onboardingSubmittedAt != null;

  return (
    <DashboardFrame
      signOut={signOut}
      nav={customerNav({ showWebsite, setupDone, appointmentsEnabled, newAppointmentCount, listing })}
      account={{ name: userName, email: userEmail, href: "/settings", ...(businessId === null ? {} : { businessId }) }}
      panel={panel}
      variant="dark"
      brand={logoOf(brand)}
      topBar={
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          Your {brand.shortName} dashboard
        </p>
      }
    >
      {appointmentsEnabled ? (
        <>
          <AppointmentsNavRefresh />
        </>
      ) : null}
      {children}
    </DashboardFrame>
  );
}
