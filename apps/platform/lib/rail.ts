import { AFFILIATE_PATH } from "@brandbasket/shared/lib/affiliate-links";
import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import { CALLS_PATH } from "@/lib/calls/links";
import { CHATBOT_PATH } from "@/lib/chatbots-view";
import { ASK_FOR_A_CHANGE_PATH, REQUESTS_PATH } from "@/lib/requests/links";
import { WEBSITE_PATH, WEBSITE_TABS } from "@/lib/website/tabs";

/** The rail's icons by name; components/v2/rail-icon.tsx draws them. */
export type RailIcon = "overview" | "requests" | "todo" | "website" | "chatbot" | "social" | "search" | "profile" | "services" | "billing" | "settings" | "affiliate";

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
  /** Whether the plan is paid and running (billing.hasAccess). To do is for paid accounts only. */
  readonly hasAccess: boolean;
  /** False for a paid plan without the Managed Website service. */
  readonly hasWebsite: boolean;
  /** Social & Ads and Search bought (lib/server/todo.ts services). Left out, the link is not shown. */
  readonly hasSocial?: boolean;
  readonly hasSearch?: boolean;
  /** Whether the website's setup has been sent (or the site is live). */
  readonly websiteSetupDone: boolean;
  /** Items the customer still owes us (lib/todo.ts openCount). */
  readonly todoCount: number;
  /** Quotes to answer and changes to check (lib/server/requests.ts loadRequestNeeds). Left out, there is no number. */
  readonly requestsCount?: number;
  /** The signed-in person is also an affiliate: their coupon page sits in the Account section. */
  readonly affiliate?: boolean;
}

const TODO_HREF = "/todo";
/** OyeChats comes with the website, so it sits under Services beside it. */
const OYECHATS: RailLink = { href: CHATBOT_PATH, label: "OyeChats", icon: "chatbot" };
const SOCIAL: RailLink = { href: "/social", label: "Social & Ads", icon: "social" };
const SEARCH: RailLink = { href: "/search", label: "Search", icon: "search" };

const OVERVIEW: RailLink = { href: "/", label: "Overview", icon: "overview" };
const PROFILE: RailLink = { href: "/details", label: "Business profile", icon: "profile" };
/** The add-ons page, named for what it holds so it never reads like the Services section above it. */
const SERVICES: RailLink = { href: ADD_ONS_PATH, label: "Your plan", icon: "services" };
const BILLING: RailLink = { href: "/billing", label: "Billing", icon: "billing" };
const SETTINGS: RailLink = { href: "/settings", label: "Settings", icon: "settings" };
const AFFILIATE: RailLink = { href: AFFILIATE_PATH, label: "Affiliate", icon: "affiliate" };

/** Ask for a change, the first thing search offers (plan 28 section 2). */
export const ASK_FOR_A_CHANGE: RailTarget = { href: ASK_FOR_A_CHANGE_PATH, label: "Ask for a change" };

/**
 * Requests, with the number of things waiting on the customer beside it. Calls sits under it (plan 28 section 7) for a paid
 * account: the kickoff call is booked from Overview, and every later call is booked and read here.
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
      { href: "/content/authors", label: "Authors" },
      { href: "/content/categories", label: "Categories" },
    ],
  };
}

export function railSections(input: RailInput): readonly RailSection[] {
  const requests = requestsLink(input.requestsCount, input.hasAccess);
  const services = [...(input.hasWebsite ? [websiteLink(), OYECHATS] : []), ...(input.hasSocial === true ? [SOCIAL] : []), ...(input.hasSearch === true ? [SEARCH] : [])];
  const todo: RailLink = { href: TODO_HREF, label: "To do", icon: "todo", ...(input.todoCount > 0 ? { count: input.todoCount } : {}) };
  return [
    { label: null, links: input.hasAccess ? [OVERVIEW, todo, requests] : [OVERVIEW, requests] },
    ...(services.length > 0 ? [{ label: "Services", links: services }] : []),
    { label: "Account", links: [PROFILE, SERVICES, BILLING, ...(input.affiliate === true ? [AFFILIATE] : []), SETTINGS] },
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

/** The pages inside a link, for search and the phone menu: the Website tabs after Progress (the desktop page shows them as tabs), then the link's own. */
export function menuChildren(link: RailLink): readonly RailTarget[] {
  return [...(link.href === WEBSITE_PATH ? WEBSITE_TABS.slice(1) : []), ...(link.children ?? [])];
}

/** Everything search can jump to: Ask for a change, every link, and every page inside a group as "Group: Page". */
export function railTargets(sections: readonly RailSection[]): readonly RailTarget[] {
  return [
    ASK_FOR_A_CHANGE,
    ...sections.flatMap((section) =>
      section.links.flatMap((link) => [
        { href: link.href, label: link.label },
        ...menuChildren(link).map((child) => ({ href: child.href, label: `${link.label}: ${child.label}` })),
      ]),
    ),
  ];
}

export function searchRail(sections: readonly RailSection[], query: string): readonly RailTarget[] {
  const wanted = query.trim().toLowerCase();
  const targets = railTargets(sections);
  return wanted === "" ? targets : targets.filter((target) => target.label.toLowerCase().includes(wanted));
}
