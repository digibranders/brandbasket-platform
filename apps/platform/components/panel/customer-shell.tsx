import type { ReactElement, ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import {
  NavCalendarCheckIcon,
  NavCirclePlusIcon,
  NavCircleArrowUpIcon,
  NavClipboardListIcon,
  NavCompassIcon,
  NavHandHeartIcon,
  NavHomeIcon,
  NavIdCardIcon,
  NavImagesIcon,
  NavInboxIcon,
  NavMegaphoneIcon,
  NavPenIcon,
  NavPercentIcon,
  NavReceiptIcon,
  NavStarIcon,
  NavStorefrontIcon,
} from "@fynix/shared/ui/nav-icons";
import { DashboardFrame, type DashboardPlanChip } from "@fynix/shared/ui/panel/dashboard-frame";
import { AppointmentsNavRefresh } from "@/components/panel/appointments/appointments-nav-refresh";
import { ADD_ONS_PATH } from "@/lib/add-ons";
import { DEALS_PATH } from "@/lib/deals";
import { LEADS_PATH } from "@/lib/leads";
import { REVIEWS_PATH } from "@/lib/owner-replies";
import { joinSections } from "@/lib/sidebar-sections";
import { clientListingSections, type ClientListingSection, type ClientListingState } from "@/lib/listing-sections";
import { UPGRADE_PATH, type MembershipTier } from "@/lib/membership";
import { ADVERTISE_PATH, LISTING_PAGE_PATH } from "@/lib/server/customer-access";
import { logoOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { signOut } from "@/lib/server/sign-out";
import type { SidebarNavItem } from "@fynix/shared/ui/panel/sidebar-nav";
import { getAccountPanel } from "@/lib/server/account-panel";
import { getEnabledModules, getNewAppointmentCount } from "@/lib/server/business-modules";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { getClientListingState } from "@/lib/server/listing";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";

interface CustomerShellProps {
  readonly userName: string;
  readonly userEmail: string;
  /** The Business ID of a listing the member claimed while free, for the account menu; null when there is none. */
  readonly businessId: string | null;
  /** The plan the client is on: a Care client has none of Premium's sections (docs/superpowers/specs/2026-10-07-care-plan-design.md). */
  readonly tier: MembershipTier;
  /** Enquiries the owner has not replied to, the pill on Leads. */
  readonly newLeadCount: number;
  readonly children: ReactNode;
}

/** What the plan chip under the wordmark says: Premium's gold crown, Care's heart. */
const PLAN_CHIPS: Readonly<Record<MembershipTier, DashboardPlanChip>> = {
  premium: { label: "Premium member", mark: "crown" },
  care: { label: "Care plan", mark: "heart" },
};

/** The directory sections' menu items: the placed listing's tab, or the free listing's own pages a member kept. */
const LISTING_NAV: Readonly<Record<ClientListingSection, SidebarNavItem>> = {
  listing: { href: "/listing", label: "Listing", icon: <NavStorefrontIcon className="size-5" /> },
  "claim-listing": { href: LISTING_PAGE_PATH, label: "Business profile", icon: <NavStorefrontIcon className="size-5" /> },
  leads: { href: LEADS_PATH, label: "Leads", icon: <NavInboxIcon className="size-5" /> },
  reviews: { href: REVIEWS_PATH, label: "Reviews", icon: <NavStarIcon className="size-5" /> },
  photos: { href: "/photos", label: "Photos", icon: <NavImagesIcon className="size-5" /> },
  deals: { href: DEALS_PATH, label: "Deals", icon: <NavPercentIcon className="size-5" /> },
  advertise: { href: ADVERTISE_PATH, label: "Advertise", icon: <NavMegaphoneIcon className="size-5" /> },
};

/**
 * The sections a customer actually has, for where they actually are.
 *
 * This was a fixed list, which meant "Set up your website" stayed in the sidebar forever — still offered to someone
 * whose website went live months ago. Setup is the one section that finishes, so it is the one that comes and goes;
 * the rest are permanent. Monitoring used to sit here too and was dropped: it never checked anything, so the site's
 * state belongs on Home beside the other figures.
 *
 * Appointments is the one section a business might not have at all: it only shows once the module is switched on
 * for them, right after Home so a clinic sees new bookings before anything else. The unseen-booking count is the
 * row's `count`, a small pill that is left off at zero and hidden while the customer is already on the page.
 * Patients, the clinic's register built from those bookings, comes and goes with the same module, right after it.
 * The directory sections follow (lib/listing-sections.ts): Listing and Leads once staff have created the business's
 * Featured listing on the local directory, and, for a Premium member that started as a free listing, everything that free
 * listing had: its Listing page, Leads, Photos and Advertise.
 *
 * A Care client has the website's sections only: Appointments, Patients and the directory sections are Premium's, so
 * they are left out here, and their pages send a Care client Home (`plan: "premium"`, lib/server/customer-access.ts).
 * Deals and Reviews are the exceptions: any business with a claimed listing posts deals and answers its reviews, so a
 * Care client with a claim keeps both.
 *
 * The rows come in sections with a hairline between them: the business's day-to-day (Home, bookings), its directory
 * pages, its website (setup, project, details, content), its account (add-ons, billing), and last the way up to a bigger
 * plan, which a Premium member does not have.
 */
function customerNav({
  setupDone,
  appointmentsEnabled,
  newAppointmentCount,
  listing,
  tier,
  newLeadCount,
}: {
  readonly tier: MembershipTier;
  readonly newLeadCount: number;
  readonly setupDone: boolean;
  readonly appointmentsEnabled: boolean;
  readonly newAppointmentCount: number;
  readonly listing: ClientListingState;
}): readonly SidebarNavItem[] {
  return joinSections([
    [
      { href: "/", label: "Home", icon: <NavHomeIcon className="size-5" /> },
      ...(!appointmentsEnabled
        ? []
        : [
            {
              href: "/appointments",
              label: "Appointments",
              icon: <NavCalendarCheckIcon className="size-5" />,
              count: newAppointmentCount,
            },
            { href: "/patients", label: "Patients", icon: <NavHandHeartIcon className="size-5" /> },
          ]),
    ],
    tier === "care"
      ? listing.claim
        ? [LISTING_NAV.reviews, LISTING_NAV.deals]
        : []
      : clientListingSections(listing).map((section) =>
          section === "leads" ? { ...LISTING_NAV.leads, count: newLeadCount } : LISTING_NAV[section],
        ),
    [
      ...(setupDone
        ? []
        : [{ href: "/onboarding", label: "Set up your website", icon: <NavClipboardListIcon className="size-5" /> }]),
      { href: "/project", label: "Your project", icon: <NavCompassIcon className="size-5" /> },
      { href: "/details", label: "Your details", icon: <NavIdCardIcon className="size-5" /> },
      // Content is a group: the blog's posts, the people who write them, and the categories they are filed under.
      {
        href: "/content/blog",
        label: "Content",
        icon: <NavPenIcon className="size-5" />,
        children: [
          { href: "/content/blog", label: "Blogs" },
          { href: "/content/authors", label: "Authors" },
          { href: "/content/categories", label: "Categories" },
        ],
      },
    ],
    [
      { href: ADD_ONS_PATH, label: "Add-ons", icon: <NavCirclePlusIcon className="size-5" /> },
      { href: "/billing", label: "Billing", icon: <NavReceiptIcon className="size-5" /> },
    ],
    // Care is the website only: the way up to the rest is in the menu, where Premium's own sections would be.
    tier === "care" ? [{ href: UPGRADE_PATH, label: "Upgrade", icon: <NavCircleArrowUpIcon className="size-5" /> }] : [],
  ]);
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
export async function CustomerShell({ userName, userEmail, businessId, tier, newLeadCount, children }: CustomerShellProps): Promise<ReactElement> {
  const [brand, panel, overview, liveWebsite, appointmentsNav, listing] = await Promise.all([
    requestBrand(),
    getAccountPanel(),
    getProjectOverview(),
    getLiveWebsite(),
    readAppointmentsNav(),
    readListingNav(),
  ]);
  // Appointments are Premium's: a Care client has none, whatever the module says.
  const appointmentsEnabled = tier === "premium" && appointmentsNav.enabled;
  const newAppointmentCount = appointmentsNav.newCount;
  // Setup is over once it has been sent to us, whether or not the site has launched yet.
  const setupDone = liveWebsite !== null || overview.project?.onboardingSubmittedAt != null;

  return (
    <DashboardFrame
      signOut={signOut}
      nav={customerNav({ setupDone, appointmentsEnabled, newAppointmentCount, listing, tier, newLeadCount })}
      account={{ name: userName, email: userEmail, href: "/settings", ...(businessId === null ? {} : { businessId }) }}
      panel={panel}
      variant="dark"
      brand={logoOf(brand)}
      plan={PLAN_CHIPS[tier]}
      topBar={
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          Your {brand.shortName} dashboard{tier === "care" ? " · Care" : ""}
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
