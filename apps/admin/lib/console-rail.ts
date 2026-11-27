export type ConsoleRailIcon = "today" | "clients" | "inbox" | "money" | "compliance" | "system";

export type RailCountKey = "today" | "leads" | "requests" | "payments" | "deliveries";

export type RailCountTone = "accent" | "alert";

/** "alert" draws a count in red (late or failed work); "accent" uses the rattan gold. */
const COUNT_TONES: Readonly<Record<RailCountKey, RailCountTone>> = {
  today: "accent",
  leads: "accent",
  requests: "accent",
  payments: "accent",
  deliveries: "alert",
};

const TONE_LOUDNESS: Readonly<Record<RailCountTone, number>> = { accent: 1, alert: 2 };

/** One page of a menu item. `label` is what its tab strip shows. */
export interface ConsoleRailPage {
  readonly href: string;
  readonly label: string;
}

export interface ConsoleRailGroup {
  readonly label: string;
  readonly icon: ConsoleRailIcon;
  /** The counts added up beside the item. */
  readonly countKeys?: readonly RailCountKey[];
  /** Every page the item covers, in tab order. The item links to the first. */
  readonly pages: readonly ConsoleRailPage[];
}

/** An item as the rail draws it: the group and the address it links to. */
export interface ConsoleRailLink extends ConsoleRailGroup {
  readonly href: string;
}

export type RailCounts = Readonly<Partial<Record<RailCountKey, number>>>;

/**
 * The console's menu, in order. URLs never change when an item is renamed or regrouped. No item or page is hidden by role:
 * the one staff account sees everything, and each page and action still checks access itself.
 */
export const CONSOLE_RAIL: readonly ConsoleRailGroup[] = [
  { label: "Today", icon: "today", countKeys: ["today"], pages: [{ href: "/", label: "Today" }] },
  { label: "Clients", icon: "clients", pages: [{ href: "/clients", label: "Clients" }] },
  {
    label: "Inbox",
    icon: "inbox",
    countKeys: ["requests", "leads"],
    pages: [
      { href: "/support", label: "Requests" },
      { href: "/leads", label: "Enquiries" },
      { href: "/reports", label: "Reports to review" },
    ],
  },
  {
    label: "Money",
    icon: "money",
    countKeys: ["payments"],
    pages: [
      { href: "/payments", label: "Payments" },
      { href: "/invoices", label: "Invoices" },
      { href: "/pricing", label: "Prices" },
      { href: "/coupons", label: "Coupons" },
      { href: "/payment-links", label: "Payment links" },
      { href: "/affiliates", label: "Affiliates" },
      { href: "/ad-results", label: "Acquisition" },
    ],
  },
  {
    label: "Compliance",
    icon: "compliance",
    pages: [
      { href: "/privacy-requests", label: "Privacy requests" },
      { href: "/breaches", label: "Breaches" },
      { href: "/leaving", label: "Closures" },
      { href: "/access-log", label: "Access log" },
    ],
  },
  {
    label: "System",
    icon: "system",
    countKeys: ["deliveries"],
    pages: [
      { href: "/system", label: "Health" },
      { href: "/deliveries", label: "Emails and webhooks" },
      { href: "/support/errors", label: "App errors" },
      { href: "/settings", label: "Settings" },
      { href: "/staff", label: "Access" },
    ],
  },
];

/** The rail's items with the address each links to. Every viewer gets the same list. */
export const CONSOLE_RAIL_LINKS: readonly ConsoleRailLink[] = CONSOLE_RAIL.map((group) => ({ ...group, href: group.pages[0]?.href ?? "/" }));

/** The tabs for the menu item that holds `page`; null when the item has no other page to switch to. */
export function tabsFor(page: string): { readonly label: string; readonly pages: readonly ConsoleRailPage[] } | null {
  const group = CONSOLE_RAIL.find((candidate) => candidate.pages.some((entry) => entry.href === page));
  if (group === undefined || group.pages.length < 2) return null;
  return { label: group.label, pages: group.pages };
}

/** The number and tone beside an item: its counts added up, drawn in the loudest tone among those that have something waiting. */
export function railCount(link: ConsoleRailGroup, counts: RailCounts): { readonly value: number; readonly tone: RailCountTone } | null {
  let value = 0;
  let tone: RailCountTone | null = null;
  for (const key of link.countKeys ?? []) {
    const count = counts[key];
    if (count === undefined || count === 0) continue;
    value += count;
    if (tone === null || TONE_LOUDNESS[COUNT_TONES[key]] > TONE_LOUDNESS[tone]) tone = COUNT_TONES[key];
  }
  return tone === null ? null : { value, tone };
}

/** Pages that belong to a menu item without sitting under its address. */
export const RAIL_ALIASES: Readonly<Record<string, string>> = { "/outbox": "/deliveries" };

/** Today only on "/" itself; every other page on its own address and the pages under it. */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The one item to mark as the current page: the one holding the longest matching address, so App errors wins over Requests. */
export function currentHref(links: readonly ConsoleRailLink[], pathname: string): string | null {
  const resolved = Object.entries(RAIL_ALIASES).find(([prefix]) => isCurrent(pathname, prefix))?.[1] ?? pathname;
  let best: string | null = null;
  let bestLength = -1;
  for (const link of links) {
    for (const page of link.pages) {
      if (isCurrent(resolved, page.href) && page.href.length > bestLength) {
        best = link.href;
        bestLength = page.href.length;
      }
    }
  }
  return best;
}
