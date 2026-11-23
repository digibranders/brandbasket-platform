import type { StaffRole } from "@brandbasket/db";
import { staffCan, type StaffCapability } from "@brandbasket/shared/lib/access";

interface TabDefinition {
  readonly slug: string;
  readonly label: string;
  /** A role without this capability does not see the tab. */
  readonly needs?: StaffCapability;
}

/**
 * The client workspace's six tabs, in order (plan 2.2). Money keeps /billing and Account keeps /people, so every link,
 * redirect and notice that already names those addresses still lands. None needs a capability: the money half of Money
 * checks the capability itself (billing/page.tsx).
 */
export const CLIENT_TABS = [
  { slug: "", label: "Overview" },
  { slug: "website", label: "Website" },
  { slug: "services", label: "Services" },
  { slug: "billing", label: "Money" },
  { slug: "requests", label: "Requests" },
  { slug: "people", label: "Account" },
] as const satisfies readonly TabDefinition[];

export type ClientTab = (typeof CLIENT_TABS)[number];
export type ClientTabSlug = ClientTab["slug"];

export function tabsFor(role: StaffRole): readonly ClientTab[] {
  // The cast widens the literal tuple so a tab that later declares `needs` is filtered without touching this function.
  return CLIENT_TABS.filter((tab) => {
    const { needs } = tab as TabDefinition;
    return needs === undefined || staffCan(role, needs);
  });
}

export function clientTabHref(businessId: string, slug: ClientTabSlug): string {
  return slug === "" ? `/clients/${businessId}` : `/clients/${businessId}/${slug}`;
}

type Query = Readonly<Record<string, string | string[] | undefined>>;

/** A tab's address carrying a query string as it came in (repeated keys kept), or the bare address when there is none. */
export function clientTabHrefWithQuery(businessId: string, slug: ClientTabSlug, query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  const text = params.toString();
  return text === "" ? clientTabHref(businessId, slug) : `${clientTabHref(businessId, slug)}?${text}`;
}

/** Which tab shows each notice an action redirects with. */
const NOTICE_TABS: Readonly<Partial<Record<string, Exclude<ClientTabSlug, "">>>> = {
  payment: "billing",
  charges: "billing",
  invoice: "billing",
  refund: "billing",
  addOns: "billing",
  work: "services",
  numbers: "services",
  updates: "services",
  chatbots: "services",
  campaigns: "services",
  accounts: "services",
  preview: "website",
  build: "website",
  launch: "website",
  dns: "website",
  move: "website",
  website: "website",
  hosting: "website",
  features: "website",
  listing: "website",
  tags: "website",
  calls: "requests",
  requests: "requests",
  mail: "requests",
};

/**
 * Notice links now name their tab, but an address made before that (a bookmark, a mail, a page open during a deploy) still
 * arrives at /clients/<id>?<notice>. This names the tab that owns the notice, with the same query, so the Overview can
 * pass the address on. Null when the query names no notice.
 */
export function forwardedNoticeHref(businessId: string, query: Query): string | null {
  const tab = Object.keys(query)
    .map((key) => NOTICE_TABS[key])
    .find((slug) => slug !== undefined);
  return tab === undefined ? null : clientTabHrefWithQuery(businessId, tab, query);
}
