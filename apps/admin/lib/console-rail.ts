import type { StaffRole } from "@brandbasket/db";
import { staffCan, type StaffCapability } from "@brandbasket/shared/lib/access";

export type ConsoleRailIcon =
  | "today" | "leads" | "clients" | "projects" | "requests" | "calls"
  | "payments" | "invoices" | "prices" | "coupons" | "affiliates" | "ad-credit"
  | "deliveries" | "errors" | "staff" | "settings" | "compliance";

export type RailCountKey = "today" | "leads" | "projects" | "requests" | "calls" | "payments" | "deliveries";

export interface ConsoleRailLink {
  readonly href: string;
  readonly label: string;
  readonly icon: ConsoleRailIcon;
  readonly countKey?: RailCountKey;
  /** "alert" draws the count in red (late or failed work); "quiet" in grey; default is the rattan accent. */
  readonly countTone?: "accent" | "alert" | "quiet";
  /** Hidden for roles without this capability. */
  readonly needs?: StaffCapability;
}

export interface ConsoleRailSection {
  readonly label: string | null;
  readonly links: readonly ConsoleRailLink[];
}

export type RailCounts = Readonly<Partial<Record<RailCountKey, number>>>;

/** The console's navigation, in order (plan 41, contract C2). Each later phase adds its own entry here. */
export const CONSOLE_RAIL: readonly ConsoleRailSection[] = [
  { label: null, links: [{ href: "/", label: "Today", icon: "today", countKey: "today" }] },
  {
    label: "Work",
    links: [
      { href: "/leads", label: "Enquiries", icon: "leads", countKey: "leads" },
      { href: "/clients", label: "Clients", icon: "clients" },
      { href: "/projects", label: "Projects", icon: "projects", countKey: "projects", countTone: "alert" },
      { href: "/support", label: "Requests", icon: "requests", countKey: "requests" },
      { href: "/calls", label: "Calls", icon: "calls", countKey: "calls", countTone: "quiet" },
    ],
  },
  {
    label: "Money",
    links: [
      { href: "/payments", label: "Payments", icon: "payments", countKey: "payments", needs: "money" },
      { href: "/invoices", label: "Invoices", icon: "invoices", needs: "money" },
      { href: "/pricing", label: "Prices", icon: "prices", needs: "money" },
      { href: "/coupons", label: "Coupons", icon: "coupons", needs: "money" },
      { href: "/affiliates", label: "Affiliates", icon: "affiliates", needs: "money" },
      { href: "/ad-credit", label: "Ad credit", icon: "ad-credit" },
      { href: "/ad-results", label: "Ad results", icon: "ad-credit", needs: "money" },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/deliveries", label: "Deliveries", icon: "deliveries", countKey: "deliveries", countTone: "alert" },
      { href: "/support/errors", label: "Errors", icon: "errors" },
      { href: "/staff", label: "Staff", icon: "staff", needs: "oversight" },
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/access-log", label: "Compliance", icon: "compliance", needs: "oversight" },
    ],
  },
];

/** The rail a role sees: entries it cannot use are left out, and a section left empty goes too. */
export function railFor(role: StaffRole): readonly ConsoleRailSection[] {
  return CONSOLE_RAIL.map((section) => ({ ...section, links: section.links.filter((link) => link.needs === undefined || staffCan(role, link.needs)) })).filter(
    (section) => section.links.length > 0,
  );
}

/** Pages that belong to a rail entry without sitting under its address. */
export const RAIL_ALIASES: Readonly<Record<string, string>> = { "/breaches": "/access-log", "/privacy-requests": "/access-log" };

/** Today only on "/" itself; every other entry on its own address and the pages under it. */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The one entry to mark as the current page: the longest address that matches, so Errors wins over Requests. */
export function currentHref(sections: readonly ConsoleRailSection[], pathname: string): string | null {
  const resolved = Object.entries(RAIL_ALIASES).find(([prefix]) => isCurrent(pathname, prefix))?.[1] ?? pathname;
  let best: string | null = null;
  for (const section of sections) {
    for (const link of section.links) {
      if (isCurrent(resolved, link.href) && (best === null || link.href.length > best.length)) best = link.href;
    }
  }
  return best;
}

export const ROLE_LABELS: Readonly<Record<StaffRole, string>> = { support: "Support", finance: "Finance", admin: "Admin" };
