import type { StaffRole } from "@brandbasket/db";
import { staffCan, type StaffCapability } from "@brandbasket/shared/lib/access";

export type ConsoleRailIcon = "today" | "clients" | "inbox" | "calls" | "money" | "ads" | "team" | "settings";

export type RailCountKey = "today" | "leads" | "projects" | "requests" | "calls" | "payments" | "deliveries";

export type RailCountTone = "accent" | "alert" | "quiet";

/** "alert" draws a count in red (late or failed work); "quiet" in grey; the rest use the rattan accent. */
const COUNT_TONES: Readonly<Record<RailCountKey, RailCountTone>> = {
  today: "accent",
  leads: "accent",
  requests: "accent",
  projects: "alert",
  calls: "quiet",
  payments: "accent",
  deliveries: "alert",
};

const TONE_LOUDNESS: Readonly<Record<RailCountTone, number>> = { quiet: 0, accent: 1, alert: 2 };

/** One page of a menu item. `label` is what its tab strip shows; `needs` hides it from roles that cannot open it. */
export interface ConsoleRailPage {
  readonly href: string;
  readonly label: string;
  readonly needs?: StaffCapability;
}

export interface ConsoleRailGroup {
  readonly label: string;
  readonly icon: ConsoleRailIcon;
  /** The counts added up beside the item. */
  readonly countKeys?: readonly RailCountKey[];
  /** Every page the item covers, in tab order. The first page the role may open is where the item links. */
  readonly pages: readonly ConsoleRailPage[];
}

/** A group as one role sees it: only the pages that role may open, and the address the item links to. */
export interface ConsoleRailLink extends ConsoleRailGroup {
  readonly href: string;
}

export type RailCounts = Readonly<Partial<Record<RailCountKey, number>>>;

/** The console's menu, in order. URLs never change when an item is renamed or regrouped. */
export const CONSOLE_RAIL: readonly ConsoleRailGroup[] = [
  { label: "Today", icon: "today", countKeys: ["today"], pages: [{ href: "/", label: "Today" }] },
  {
    label: "Clients",
    icon: "clients",
    countKeys: ["projects"],
    pages: [
      { href: "/clients", label: "List" },
      { href: "/projects", label: "Board" },
    ],
  },
  {
    label: "Inbox",
    icon: "inbox",
    countKeys: ["requests", "leads"],
    pages: [
      { href: "/support", label: "Requests" },
      { href: "/leads", label: "Enquiries" },
    ],
  },
  { label: "Calls", icon: "calls", countKeys: ["calls"], pages: [{ href: "/calls", label: "Calls" }] },
  {
    label: "Money",
    icon: "money",
    countKeys: ["payments"],
    pages: [
      { href: "/payments", label: "Payments", needs: "money" },
      { href: "/invoices", label: "Invoices", needs: "money" },
      { href: "/pricing", label: "Prices", needs: "money" },
      { href: "/coupons", label: "Coupons", needs: "money" },
      { href: "/affiliates", label: "Affiliates", needs: "money" },
    ],
  },
  {
    label: "Ads",
    icon: "ads",
    pages: [
      { href: "/ad-credit", label: "Ad credit" },
      { href: "/ad-results", label: "Ad results", needs: "money" },
    ],
  },
  {
    label: "Team",
    icon: "team",
    pages: [
      { href: "/staff", label: "Staff", needs: "oversight" },
      { href: "/access-log", label: "Compliance", needs: "oversight" },
    ],
  },
  {
    label: "Settings",
    icon: "settings",
    countKeys: ["deliveries"],
    pages: [
      { href: "/settings", label: "Settings" },
      { href: "/support/errors", label: "App errors" },
      { href: "/deliveries", label: "Emails and webhooks" },
    ],
  },
];

function pagesFor(role: StaffRole, group: ConsoleRailGroup): readonly ConsoleRailPage[] {
  return group.pages.filter((page) => page.needs === undefined || staffCan(role, page.needs));
}

/** The menu a role sees: pages it cannot open are left out, and an item left with no page goes too. */
export function railFor(role: StaffRole): readonly ConsoleRailLink[] {
  return CONSOLE_RAIL.flatMap((group) => {
    const pages = pagesFor(role, group);
    const first = pages[0];
    return first === undefined ? [] : [{ ...group, href: first.href, pages }];
  });
}

/** The tabs for the menu item that holds `page`, as `role` may open them; null when the role has no other page to switch to. */
export function tabsFor(role: StaffRole, page: string): { readonly label: string; readonly pages: readonly ConsoleRailPage[] } | null {
  const group = CONSOLE_RAIL.find((candidate) => candidate.pages.some((entry) => entry.href === page));
  if (group === undefined) return null;
  const pages = pagesFor(role, group);
  return pages.length < 2 ? null : { label: group.label, pages };
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
export const RAIL_ALIASES: Readonly<Record<string, string>> = { "/breaches": "/access-log", "/privacy-requests": "/access-log" };

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

export const ROLE_LABELS: Readonly<Record<StaffRole, string>> = { support: "Support", finance: "Finance", admin: "Admin" };
