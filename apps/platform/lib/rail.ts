import { AFFILIATE_PATH } from "@brandbasket/shared/lib/affiliate-links";
import { CALLS_PATH } from "@/lib/calls/links";
import type { ServiceKey } from "@/lib/first-look";
import { BILLING_PATH, PLAN_TABS } from "@/lib/plan/tabs";
import { ASK_FOR_A_CHANGE_PATH, REQUESTS_PATH } from "@/lib/requests/links";
import { sectionTabPaths } from "@/lib/section-tabs";
import { WEBSITE_PATH, WEBSITE_TABS } from "@/lib/website/tabs";

/** The sidebar's icons by name; components/v2/rail-icon.tsx draws them. */
export type RailIcon = "home" | "requests" | "website" | "social" | "search" | "business" | "plan" | "settings" | "affiliate";

export interface RailTarget {
  readonly href: string;
  readonly label: string;
}

export interface RailLink extends RailTarget {
  readonly icon: RailIcon;
  /** Open items shown as a number beside the link. */
  readonly count?: number;
  /** The service this link is, drawn as a small square in its colour. */
  readonly mark?: ServiceKey;
  /** Pages inside the link. Search and the phone menu list them; the sidebar does not (the page shows them as tabs or links). */
  readonly children?: readonly RailTarget[];
  /** Other paths where the link stays marked: the pages of its tabs. */
  readonly alsoCurrent?: readonly string[];
}

export interface RailSection {
  /** The small heading above the section; null for the first one. */
  readonly label: string | null;
  readonly links: readonly RailLink[];
}

export interface RailInput {
  /** Whether the plan is paid and running (billing.hasAccess). Calls are for paid accounts only. */
  readonly hasAccess: boolean;
  /** False for a paid plan without the Managed Website service. */
  readonly hasWebsite: boolean;
  /** Social & Ads and Local SEO + AEO bought (lib/server/active-services.ts). Left out, the link is not shown. */
  readonly hasSocial?: boolean;
  readonly hasSearch?: boolean;
  /** Quotes to answer, changes to check and questions from the team (lib/server/requests.ts loadRequestsBadge). Left out, there is no number. */
  readonly requestsCount?: number;
  /** The signed-in person is also an affiliate: their coupon page sits in the Account section. */
  readonly affiliate?: boolean;
}

export const HOME_HREF = "/";
export const BUSINESS_HREF = "/details";

const HOME: RailLink = { href: HOME_HREF, label: "Home", icon: "home" };
const SOCIAL: RailLink = { href: "/social", label: "Social & Ads", icon: "social", mark: "social" };
// The URL stays /search so old links keep working; only the name is new.
const SEARCH: RailLink = { href: "/search", label: "Local SEO + AEO", icon: "search", mark: "search" };
const BUSINESS: RailLink = { href: BUSINESS_HREF, label: "Business", icon: "business" };
const SETTINGS: RailLink = { href: "/settings", label: "Settings", icon: "settings" };
const AFFILIATE: RailLink = { href: AFFILIATE_PATH, label: "Affiliate", icon: "affiliate" };

/** New request, the first thing search offers. */
export const ASK_FOR_A_CHANGE: RailTarget = { href: ASK_FOR_A_CHANGE_PATH, label: "New request" };

/** Requests, with the number of things waiting on the customer beside it. Calls is reached from the Requests page; search lists it for a paid account. */
function requestsLink(count: number | undefined, withCalls: boolean): RailLink {
  return {
    href: REQUESTS_PATH,
    label: "Requests",
    icon: "requests",
    ...(count !== undefined && count > 0 ? { count } : {}),
    ...(withCalls ? { children: [{ href: CALLS_PATH, label: "Calls" }] } : {}),
  };
}

/** The website opens on its Overview tab. The other tabs, and the blog's authors and categories, are listed for search. */
const WEBSITE: RailLink = {
  href: WEBSITE_PATH,
  label: "Website",
  icon: "website",
  mark: "website",
  children: [
    ...WEBSITE_TABS.slice(1).map((tab) => ({ href: tab.href, label: tab.label })),
    { href: "/content/authors", label: "Authors" },
    { href: "/content/categories", label: "Categories" },
  ],
  alsoCurrent: sectionTabPaths(WEBSITE_TABS),
};

/** Your services and Billing are one link, with the billing page as its second tab. */
const PLAN: RailLink = {
  href: PLAN_TABS[0]?.href ?? BILLING_PATH,
  label: "Plan & billing",
  icon: "plan",
  children: PLAN_TABS.slice(1).map((tab) => ({ href: tab.href, label: tab.label })),
  alsoCurrent: sectionTabPaths(PLAN_TABS),
};

export function railSections(input: RailInput): readonly RailSection[] {
  const services = [...(input.hasWebsite ? [WEBSITE] : []), ...(input.hasSocial === true ? [SOCIAL] : []), ...(input.hasSearch === true ? [SEARCH] : [])];
  return [
    { label: null, links: [HOME] },
    ...(services.length > 0 ? [{ label: "Services", links: services }] : []),
    // Business is the website's details until it is rebuilt for every customer (plan phase 7): a plan without the website has no page behind it.
    { label: "Manage", links: [requestsLink(input.requestsCount, input.hasAccess), BUSINESS] },
    { label: "Account", links: [PLAN, ...(input.affiliate === true ? [AFFILIATE] : []), SETTINGS] },
  ];
}

/** Home only on "/" itself; every other link on its own path and the pages under it. */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === HOME_HREF) return pathname === HOME_HREF;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function linkIsCurrent(link: RailLink, pathname: string): boolean {
  return isCurrent(pathname, link.href) || (link.alsoCurrent ?? []).some((path) => isCurrent(pathname, path)) || (link.children ?? []).some((child) => isCurrent(pathname, child.href));
}

/** The pages inside a link, for search and the phone menu. */
export function menuChildren(link: RailLink): readonly RailTarget[] {
  return link.children ?? [];
}

/** The phone's bottom bar: Home, the first service, Requests and Business (when it has them); the Menu button is added beside them. */
export function phoneTabs(sections: readonly RailSection[]): readonly RailLink[] {
  const links = sections.flatMap((section) => section.links);
  const firstService = sections.find((section) => section.label === "Services")?.links[0];
  const named = (href: string): RailLink | undefined => links.find((link) => link.href === href);
  return [named(HOME_HREF), firstService, named(REQUESTS_PATH), named(BUSINESS_HREF)].filter((link): link is RailLink => link !== undefined);
}

/** Everything search can jump to: New request, every link, and every page inside a group as "Group: Page". */
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
