import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import { CALLS_PATH } from "@/lib/calls/links";
import { CHATBOT_NAME_PATH } from "@/lib/chatbots-view";
import { ASK_FOR_A_CHANGE_PATH, REQUESTS_PATH } from "@/lib/requests/links";
import { WEBSITE_PATH, WEBSITE_TABS } from "@/lib/website/tabs";

/** The rail's icons by name; components/v2/rail-icon.tsx draws them. */
export type RailIcon = "overview" | "requests" | "todo" | "website" | "reviews" | "deals" | "profile" | "services" | "billing" | "settings";

export interface RailTarget {
  readonly href: string;
  readonly label: string;
}

export interface RailLink extends RailTarget {
  readonly icon: RailIcon;
  /** Open items shown as a number beside the link. */
  readonly count?: number;
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
  /** Whether the plan is paid and running (billing.hasAccess). To do is for paid accounts only. */
  readonly hasAccess: boolean;
  /** False for a paid plan without the Managed Website service. */
  readonly hasWebsite: boolean;
  /** Whether the website's setup has been sent (or the site is live). */
  readonly websiteSetupDone: boolean;
  /** A member who claimed a directory listing keeps its Reviews and Deals. */
  readonly listingClaim: boolean;
  /** Items the customer still owes us (lib/todo.ts openCount). */
  readonly todoCount: number;
  /** Quotes to answer and changes to check (lib/server/requests.ts loadRequestNeeds). Left out, there is no number. */
  readonly requestsCount?: number;
}

/** Plain strings, not imported from lib/deals.ts and lib/owner-replies.ts: those pull the database driver into the browser bundle, and this file is bundled into client components. lib/rail.test.ts pins them to the real paths. */
const DEALS_HREF = "/deals";
const REVIEWS_HREF = "/reviews";
const TODO_HREF = "/todo";

const OVERVIEW: RailLink = { href: "/", label: "Overview", icon: "overview" };
const PROFILE: RailLink = { href: "/details", label: "Business profile", icon: "profile" };
/** The add-ons page, named for what it holds so it never reads like the Services section above it. */
const SERVICES: RailLink = { href: ADD_ONS_PATH, label: "Your plan", icon: "services" };
const BILLING: RailLink = { href: "/billing", label: "Billing", icon: "billing" };
const SETTINGS: RailLink = { href: "/settings", label: "Settings", icon: "settings" };
const REVIEWS: RailLink = { href: REVIEWS_HREF, label: "Reviews", icon: "reviews" };
const DEALS: RailLink = { href: DEALS_HREF, label: "Deals", icon: "deals" };

/** Ask for a change, the first thing search offers (plan 28 section 2). */
export const ASK_FOR_A_CHANGE: RailTarget = { href: ASK_FOR_A_CHANGE_PATH, label: "Ask for a change" };

/**
 * Requests, with the number of things waiting on the customer beside it. Calls sits under it (plan 28 section 7) once the
 * kickoff call has happened: the first look has one call only, and it is booked from Overview.
 */
function requestsLink(count: number | undefined, withCalls: boolean): RailLink {
  return {
    href: REQUESTS_PATH,
    label: "Requests",
    icon: "requests",
    ...(count !== undefined && count > 0 ? { count } : {}),
    ...(withCalls ? { children: [{ href: CALLS_PATH, label: "Calls" }] } : {}),
  };
}

/** The website opens on its Progress tab. Its tabs are the Website workspace's; these are the pages that are not tabs. */
function websiteLink(): RailLink {
  return {
    href: WEBSITE_PATH,
    label: "Website",
    icon: "website",
    children: [
      { href: CHATBOT_NAME_PATH, label: "Chatbot name" },
      { href: "/content/authors", label: "Authors" },
      { href: "/content/categories", label: "Categories" },
    ],
  };
}

export function railSections(input: RailInput): readonly RailSection[] {
  const requests = requestsLink(input.requestsCount, input.hasAccess && !input.quiet);
  if (input.quiet) {
    return [
      { label: null, links: [OVERVIEW, requests] },
      { label: "Account", links: [BILLING, SETTINGS] },
    ];
  }
  const todo: RailLink = { href: TODO_HREF, label: "To do", icon: "todo", ...(input.todoCount > 0 ? { count: input.todoCount } : {}) };
  return [
    { label: null, links: input.hasAccess ? [OVERVIEW, todo, requests] : [OVERVIEW, requests] },
    ...(input.hasWebsite ? [{ label: "Services", links: [websiteLink()] }] : []),
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
  return (
    isCurrent(pathname, link.href) ||
    (link.href === WEBSITE_PATH && WEBSITE_TABS.some((tab) => isCurrent(pathname, tab.href))) ||
    (link.children ?? []).some((child) => isCurrent(pathname, child.href))
  );
}

/** Everything search can jump to: Ask for a change, every link, and every page inside a group as "Group: Page". */
export function railTargets(sections: readonly RailSection[]): readonly RailTarget[] {
  return [
    ASK_FOR_A_CHANGE,
    ...sections.flatMap((section) =>
      section.links.flatMap((link) => [
        { href: link.href, label: link.label },
        ...(link.href === WEBSITE_PATH ? WEBSITE_TABS.slice(1).map((tab) => ({ href: tab.href, label: `${link.label}: ${tab.label}` })) : []),
        ...(link.children ?? []).map((child) => ({ href: child.href, label: `${link.label}: ${child.label}` })),
      ]),
    ),
  ];
}

export function searchRail(sections: readonly RailSection[], query: string): readonly RailTarget[] {
  const wanted = query.trim().toLowerCase();
  const targets = railTargets(sections);
  return wanted === "" ? targets : targets.filter((target) => target.label.toLowerCase().includes(wanted));
}
