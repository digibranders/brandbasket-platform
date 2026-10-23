import type { SidebarNavItem } from "@brandbasket/shared/ui/panel/sidebar-nav";
import {
  NavCalendarCheckIcon,
  NavCirclePlusIcon,
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
import { ADD_ONS_PATH } from "@/lib/add-ons";
import { CHATBOT_LEADS_PATH, CHATBOT_NAME_PATH } from "@/lib/chatbots-view";
import { DEALS_PATH } from "@/lib/deals";
import { LEADS_PATH } from "@/lib/leads";
import { REVIEWS_PATH } from "@/lib/owner-replies";
import { joinSections } from "@/lib/sidebar-sections";
import type { ClientListingSection, ClientListingState } from "@/lib/listing-sections";
import { ADVERTISE_PATH, LISTING_PAGE_PATH } from "@/lib/server/customer-access";

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

/** The website's section: setup (until it is sent), project, OyeChats, domain and content. */
function websiteNav(setupDone: boolean): readonly SidebarNavItem[] {
  return [
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
  ];
}

/**
 * The sections a customer actually has, for where they actually are.
 *
 * This was a fixed list, which meant "Set up your website" stayed in the sidebar forever, still offered to someone
 * whose website went live months ago. Setup is the one section that finishes, so it is the one that comes and goes;
 * the rest are permanent. Monitoring used to sit here too and was dropped: it never checked anything, so the site's
 * state belongs on Home beside the other figures.
 *
 * Appointments is the one section a business might not have at all: it only shows once the module is switched on
 * for them, right after Home so a clinic sees new bookings before anything else. The unseen-booking count is the
 * row's `count`, a small pill that is left off at zero and hidden while the customer is already on the page.
 * Patients, the clinic's register built from those bookings, comes and goes with the same module, right after it.
 * A Managed Website client has the website's sections; the directory is off (BRAND.showsListing). Deals and Reviews are
 * the exception: any business with a claimed listing posts deals and answers its reviews, so a client with a claim keeps
 * both.
 *
 * The rows come in sections with a hairline between them: the business's day-to-day (Home, bookings), its directory
 * pages, its website (setup, project, domain, content), and its account (services, billing). The website's section is
 * only there for a client that has a website: a paid Social-only or SEO-only client has no site to set up.
 */
export function customerNav({
  showWebsite,
  setupDone,
  appointmentsEnabled,
  newAppointmentCount,
  listing,
}: {
  /** False for a paid client without the Managed Website service (Social-only, SEO-only, or a dropped website that has ended). */
  readonly showWebsite: boolean;
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
    listing.claim ? [LISTING_NAV.reviews, LISTING_NAV.deals] : [],
    showWebsite ? websiteNav(setupDone) : [],
    [
      { href: ADD_ONS_PATH, label: "Services", icon: <NavCirclePlusIcon className="size-5" /> },
      { href: "/billing", label: "Billing", icon: <NavScrollTextIcon className="size-5" /> },
    ],
  ]);
}
