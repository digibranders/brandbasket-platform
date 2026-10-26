import type { StaffRole } from "@brandbasket/db";
import { staffCan, type StaffCapability } from "@brandbasket/shared/lib/access";

/** The client page's tabs, in order. A tab with `needs` is hidden from roles without that capability. */
export const CLIENT_TABS = [
  { slug: "", label: "Overview" },
  { slug: "project", label: "Project" },
  { slug: "billing", label: "Billing", needs: "money" },
  { slug: "services", label: "Services" },
  { slug: "website", label: "Website" },
  { slug: "requests", label: "Requests" },
  { slug: "people", label: "People" },
  { slug: "activity", label: "Activity" },
] as const satisfies readonly { readonly slug: string; readonly label: string; readonly needs?: StaffCapability }[];

export type ClientTab = (typeof CLIENT_TABS)[number];
export type ClientTabSlug = ClientTab["slug"];

export function tabsFor(role: StaffRole): readonly ClientTab[] {
  return CLIENT_TABS.filter((tab) => !("needs" in tab) || staffCan(role, tab.needs));
}

export function clientTabHref(businessId: string, slug: ClientTabSlug): string {
  return slug === "" ? `/clients/${businessId}` : `/clients/${businessId}/${slug}`;
}

/** Which tab shows each notice an action redirects with. */
const NOTICE_TABS: Readonly<Partial<Record<string, Exclude<ClientTabSlug, "">>>> = {
  payment: "billing",
  charges: "billing",
  invoice: "billing",
  preview: "project",
  launch: "project",
  dns: "project",
  addOns: "services",
  chatbots: "services",
  website: "website",
  features: "website",
  listing: "website",
  tags: "website",
};

/**
 * Actions still redirect to /clients/<id>?<notice>, as they did before the page had tabs. This names the tab that owns
 * the notice, with the same query, so the Overview can pass the address on. Null when the query names no notice.
 */
export function forwardedNoticeHref(businessId: string, query: Readonly<Record<string, string | string[] | undefined>>): string | null {
  const tab = Object.keys(query)
    .map((key) => NOTICE_TABS[key])
    .find((slug) => slug !== undefined);
  if (tab === undefined) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  return `${clientTabHref(businessId, tab)}?${params.toString()}`;
}
