import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import { CHATBOT_LEADS_PATH, CHATBOT_NAME_PATH } from "@/lib/chatbots-view";

/** The rail's icons by name; components/v2/rail-icon.tsx draws them. */
export type RailIcon = "overview" | "requests" | "website" | "reviews" | "deals" | "profile" | "services" | "billing" | "settings";

export interface RailTarget {
  readonly href: string;
  readonly label: string;
}

export interface RailLink extends RailTarget {
  readonly icon: RailIcon;
  /** Pages inside the link, shown under it while one of them is open. */
  readonly children?: readonly RailTarget[];
}

export interface RailSection {
  /** The small heading above the section; null for the first one. */
  readonly label: string | null;
  readonly links: readonly RailLink[];
}

export interface RailInput {
  /** Until the kickoff call has happened (lib/first-look.ts inFirstLook): only what a new customer can use. */
  readonly quiet: boolean;
  /** False for a paid plan without the Managed Website service. */
  readonly hasWebsite: boolean;
  /** Whether the website's setup has been sent (or the site is live). */
  readonly websiteSetupDone: boolean;
  /** A member who claimed a directory listing keeps its Reviews and Deals. */
  readonly listingClaim: boolean;
}

/** Plain strings, not imported from lib/deals.ts and lib/owner-replies.ts: those pull the database driver into the browser bundle, and this file is bundled into client components. lib/rail.test.ts pins them to the real paths. */
const DEALS_HREF = "/deals";
const REVIEWS_HREF = "/reviews";

const OVERVIEW: RailLink = { href: "/", label: "Overview", icon: "overview" };
const REQUESTS: RailLink = { href: "/support", label: "Requests", icon: "requests" };
const PROFILE: RailLink = { href: "/details", label: "Business profile", icon: "profile" };
/** The add-ons page, named for what it holds so it never reads like the Services section above it. */
const SERVICES: RailLink = { href: ADD_ONS_PATH, label: "Your plan", icon: "services" };
const BILLING: RailLink = { href: "/billing", label: "Billing", icon: "billing" };
const SETTINGS: RailLink = { href: "/settings", label: "Settings", icon: "settings" };
const REVIEWS: RailLink = { href: REVIEWS_HREF, label: "Reviews", icon: "reviews" };
const DEALS: RailLink = { href: DEALS_HREF, label: "Deals", icon: "deals" };

/** Ask for a change, the first thing search offers (plan 28 section 2). Requests until plan 31 gives it its own form. */
export const ASK_FOR_A_CHANGE: RailTarget = { href: "/support", label: "Ask for a change" };

/** The website and its pages. Plan 33 folds these into the website's own tabs. */
function websiteLink(setupDone: boolean): RailLink {
  const start: RailTarget = setupDone ? { href: "/project", label: "Your project" } : { href: "/onboarding", label: "Set up your website" };
  return {
    href: start.href,
    label: "Website",
    icon: "website",
    children: [
      start,
      { href: "/domain", label: "Your domain" },
      { href: CHATBOT_LEADS_PATH, label: "Chatbot leads" },
      { href: CHATBOT_NAME_PATH, label: "Chatbot name" },
      { href: "/content/blog", label: "Blog" },
      { href: "/content/authors", label: "Authors" },
      { href: "/content/categories", label: "Categories" },
    ],
  };
}

export function railSections(input: RailInput): readonly RailSection[] {
  const top: RailSection = { label: null, links: [OVERVIEW, REQUESTS] };
  if (input.quiet) return [top, { label: "Account", links: [BILLING, SETTINGS] }];
  return [
    top,
    ...(input.hasWebsite ? [{ label: "Services", links: [websiteLink(input.websiteSetupDone)] }] : []),
    ...(input.listingClaim ? [{ label: "Directory", links: [REVIEWS, DEALS] }] : []),
    { label: "Account", links: [PROFILE, SERVICES, BILLING, SETTINGS] },
  ];
}

/** Overview only on "/" itself; every other link on its own path and the pages under it. */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function linkIsCurrent(link: RailLink, pathname: string): boolean {
  return isCurrent(pathname, link.href) || (link.children ?? []).some((child) => isCurrent(pathname, child.href));
}

/** Everything search can jump to: Ask for a change, every link, and every page inside a group as "Group: Page". */
export function railTargets(sections: readonly RailSection[]): readonly RailTarget[] {
  return [
    ASK_FOR_A_CHANGE,
    ...sections.flatMap((section) =>
      section.links.flatMap((link) => [{ href: link.href, label: link.label }, ...(link.children ?? []).map((child) => ({ href: child.href, label: `${link.label}: ${child.label}` }))]),
    ),
  ];
}

export function searchRail(sections: readonly RailSection[], query: string): readonly RailTarget[] {
  const wanted = query.trim().toLowerCase();
  const targets = railTargets(sections);
  return wanted === "" ? targets : targets.filter((target) => target.label.toLowerCase().includes(wanted));
}
