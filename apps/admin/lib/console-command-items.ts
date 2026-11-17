import { z } from "zod";
import type { CommandItem, CommandMode } from "@brandbasket/shared/ui/patterns";
import { CONSOLE_RAIL, type ConsoleRailGroup } from "@/lib/console-rail";
import type { SearchHit } from "@/lib/console-search-kinds";

/** How many opened results the command bar remembers. */
export const RECENT_LIMIT = 5;
export const RECENT_STORAGE_KEY = "console.command-bar.recent";

/** Go to: every page of every menu item. Pages guard themselves, so nothing is filtered by role. */
export function goToItems(rail: readonly ConsoleRailGroup[] = CONSOLE_RAIL): readonly CommandItem[] {
  return rail.flatMap((group) =>
    group.pages.map((page) => ({
      id: `go:${page.href}`,
      group: "go" as const,
      title: group.pages.length === 1 ? group.label : `${group.label}: ${page.label}`,
      href: page.href,
    })),
  );
}

/** The two actions the "nothing matches" state offers. */
export const ADD_ENQUIRY_ACTION: CommandItem = { id: "action:add-enquiry", group: "action", title: "Add enquiry", href: "/leads/new" };
export const NEW_REQUEST_ACTION: CommandItem = { id: "action:new-request", group: "action", title: "New request", href: "/support/new" };

/** Actions: each opens an existing route; the page carries its own guard and its own logging. */
export const ACTION_ITEMS: readonly CommandItem[] = [
  ADD_ENQUIRY_ACTION,
  NEW_REQUEST_ACTION,
  { id: "action:export-payments", group: "action", title: "Export payments", subtitle: "Opens Payments", href: "/payments" },
  { id: "action:privacy-requests", group: "action", title: "Open privacy requests", href: "/privacy-requests" },
];

export const EMPTY_STATE_ITEMS: readonly CommandItem[] = [ADD_ENQUIRY_ACTION, NEW_REQUEST_ACTION];

/** A search result as a command item, in the group of its kind. */
export function hitToItem(hit: SearchHit): CommandItem {
  return { id: `${hit.href}|${hit.label}`, group: hit.kind, title: hit.label, subtitle: hit.sub, href: hit.href };
}

/** `#` shows request references only, so other kinds the server matched on the same text are dropped. */
export function hitsForMode(hits: readonly SearchHit[], mode: CommandMode): readonly SearchHit[] {
  return mode === "requestRef" ? hits.filter((hit) => hit.kind === "request") : hits;
}

const RecentEntry = z.object({
  href: z.string().startsWith("/").refine((href) => !href.startsWith("//"), "Not a path on this site"),
  title: z.string().max(200),
  subtitle: z.string().max(200).optional(),
});
type RecentEntry = z.infer<typeof RecentEntry>;

/** What the browser keeps: the link and the two lines staff already saw, never anything fetched later. */
export function toRecentEntry(item: CommandItem): RecentEntry | null {
  if (item.href === undefined) return null;
  const parsed = RecentEntry.safeParse({ href: item.href, title: item.title, subtitle: item.subtitle });
  return parsed.success ? parsed.data : null;
}

function parseEntries(raw: string | null): readonly RecentEntry[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const parsed = RecentEntry.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The stored list as items; anything unreadable or tampered with is dropped. */
export function parseRecent(raw: string | null): readonly CommandItem[] {
  return parseEntries(raw)
    .slice(0, RECENT_LIMIT)
    .map((entry) => ({ id: `recent:${entry.href}`, group: "recent" as const, title: entry.title, subtitle: entry.subtitle, href: entry.href }));
}

/** The stored text after opening `item`: newest first, no repeats, at most five. */
export function addRecent(raw: string | null, item: CommandItem): string {
  const entry = toRecentEntry(item);
  const kept = parseEntries(raw).filter((existing) => existing.href !== entry?.href);
  return JSON.stringify((entry === null ? kept : [entry, ...kept]).slice(0, RECENT_LIMIT));
}
