import type { ReactElement, ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import {
  NavCalendarCheckIcon,
  NavCirclePlusIcon,
  NavCircleArrowUpIcon,
  NavListChecksIcon,
  NavBriefcaseIcon,
  NavHandHeartIcon,
  NavDashboardIcon,
  NavGlobeIcon,
  NavImagesIcon,
  NavInboxIcon,
  NavMegaphoneIcon,
  NavNotebookPenIcon,
  NavPercentIcon,
  NavScrollTextIcon,
  NavStarIcon,
  NavStorefrontIcon,
} from "@brandbasket/shared/ui/nav-icons";
import { DocumentIcon, TagIcon, UserIcon } from "@brandbasket/shared/ui/icons";
import { DashboardFrame, type DashboardPlanChip } from "@brandbasket/shared/ui/panel/dashboard-frame";
import { AppointmentsNavRefresh } from "@/components/panel/appointments/appointments-nav-refresh";
import { ADD_ONS_PATH } from "@/lib/add-ons";
import { CHATBOT_LEADS_PATH, CHATBOT_NAME_PATH } from "@/lib/chatbots-view";
import { DEALS_PATH } from "@/lib/deals";
import { LEADS_PATH } from "@/lib/leads";
import { REVIEWS_PATH } from "@/lib/owner-replies";
import { joinSections } from "@/lib/sidebar-sections";
import { clientListingSections, type ClientListingSection, type ClientListingState } from "@/lib/listing-sections";
import { BRAND, offersChoice } from "@/lib/brand";
import { UPGRADE_PATH, type MembershipTier } from "@/lib/membership";
import { ADVERTISE_PATH, LISTING_PAGE_PATH } from "@/lib/server/customer-access";
import { logoOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { signOut } from "@/lib/server/sign-out";
import type { SidebarNavItem } from "@brandbasket/shared/ui/panel/sidebar-nav";
import { getAccountPanel } from "@/lib/server/account-panel";
import { getEnabledModules, getNewAppointmentCount } from "@/lib/server/business-modules";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
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

/** The plan chip under the wordmark. Only Premium has one: the Care plan is the ordinary case and is not labelled. */
const PREMIUM_CHIP: DashboardPlanChip = { label: "Premium member", mark: "crown" };

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
 * pages, its website (setup, project, domain, content), its account (add-ons, billing), and last the way up to a bigger
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
      { href: "/", label: "Home", icon: <NavDashboardIcon className="size-5" /> },
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
        : [{ href: "/onboarding", label: "Set up your website", icon: <NavListChecksIcon className="size-5" /> }]),
      { href: "/project", label: "Your project", icon: <NavBriefcaseIcon className="size-5" /> },
      // OyeChats' own mark, white on the dark sidebar, as its maker publishes it (public/brand/oyechats-icon-white.png). A plain
      // img: it is a small fixed picture, which next/image would only add work to.
      // OyeChats is a group: the visitors who left their details, and what the customer calls their assistant.
      {
        href: CHATBOT_LEADS_PATH,
        label: "OyeChats",
        // eslint-disable-next-line @next/next/no-img-element
        icon: <img src="/brand/oyechats-icon-white.png" alt="" width={20} height={20} className="size-5 object-contain" />,
        children: [
          { href: CHATBOT_LEADS_PATH, label: "Leads", icon: <UserIcon className="size-4" /> },
          { href: CHATBOT_NAME_PATH, label: "Chatbot name", icon: <TagIcon className="size-4" /> },
        ],
      },
      { href: "/domain", label: "Your domain", icon: <NavGlobeIcon className="size-5" /> },
      // Content is a group: the blog's posts, the people who write them, and the categories they are filed under.
      {
        href: "/content/blog",
        label: "Content",
        icon: <NavNotebookPenIcon className="size-5" />,
        children: [
          { href: "/content/blog", label: "Blogs", icon: <DocumentIcon className="size-4" /> },
          { href: "/content/authors", label: "Authors", icon: <UserIcon className="size-4" /> },
          { href: "/content/categories", label: "Categories", icon: <TagIcon className="size-4" /> },
        ],
      },
    ],
    [
      { href: ADD_ONS_PATH, label: "Add-ons", icon: <NavCirclePlusIcon className="size-5" /> },
      { href: "/billing", label: "Billing", icon: <NavScrollTextIcon className="size-5" /> },
    ],
    // Care is the website only: the way up to the rest is in the menu, where Premium's own sections would be.
    tier === "care" && offersChoice(BRAND, "premium") ? [{ href: UPGRADE_PATH, label: "Upgrade", icon: <NavCircleArrowUpIcon className="size-5" /> }] : [],
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
      {...(tier === "premium" ? { plan: PREMIUM_CHIP } : {})}
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
