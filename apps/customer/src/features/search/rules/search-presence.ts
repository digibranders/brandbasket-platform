import type { SearchDay, SearchList } from "@brandbasket/db";
import { addDays } from "@brandbasket/shared/lib/calendar/local-date";
import { shortDay } from "@/features/website/rules/visits";

/*
 * How people find the customer on Google (plan 62, step 5), from the Search Console numbers the nightly job stores. Only final
 * days are stored. For a pulled range a day Google had no clicks for was written as a measured zero, so a stored 0 is drawn as 0;
 * a day with no stored row was not measured, so it is left out, never drawn as 0 and never summed. Position exists only on days
 * with impressions. No I/O here.
 */

/** Every customer word of the panel, in one place for the owner to review. The switch is off until they say yes. */
export const SEARCH_PRESENCE_COPY = {
  title: "How people find you on Google",
  clicks: "Clicks",
  appeared: "Times you appeared",
  position: "Average position",
  positionNote: "1 is the top of Google",
  changeNote: "on the 28 days before",
  behind: "Google data runs about 3 days behind",
  chartLabel: "Clicks by day",
  foot: "Clicks by day. A day with no clicks shows as zero. The last 3 days are left out until Google has finished counting them.",
  topSearches: "Top searches",
  topPages: "Pages people land on",
  homePage: "Home",
  waitingBanner: "Numbers start within 2 to 3 days. Google is still getting your website ready, so nothing is measured yet.",
  failedWhat: "how people find you on Google",
  homeFigure: "Google clicks",
  websiteLine: "Numbers start within 2 to 3 days",
  websiteLabel: "Visits",
  websiteValue: "Not yet",
} as const;

export const SEARCH_WINDOW_DAYS = 28;
/** The rows read to find the last measured day: the first pull is 60 days, then a day is added each night. */
export const SEARCH_LOOKBACK_DAYS = 120;
/** Rows in each top list. */
export const SEARCH_LIST_ROWS = 5;

export interface SearchWindow {
  readonly from: string;
  readonly to: string;
  readonly previousFrom: string;
  readonly previousTo: string;
}

/** The 28 days ending at `last` (the last measured clicks day, not today), and the 28 before. */
export function searchWindow(last: string): SearchWindow {
  return {
    from: addDays(last, -(SEARCH_WINDOW_DAYS - 1)),
    to: last,
    previousFrom: addDays(last, -(2 * SEARCH_WINDOW_DAYS - 1)),
    previousTo: addDays(last, -SEARCH_WINDOW_DAYS),
  };
}

export interface SearchSummary {
  /** The first and last measured clicks day of the window (`YYYY-MM-DD`): the dates the numbers cover. */
  readonly from: string;
  readonly to: string;
  readonly clicks: number;
  /** Null when no impressions day was measured in the window. */
  readonly impressions: number | null;
  /** The impression-weighted mean of the daily positions, one decimal; null without a day that has both. */
  readonly averagePosition: number | null;
  /** Clicks against the 28 days before: only when both windows were measured in full, the earlier total is above 0 and it changed. */
  readonly change: number | null;
  /** Measured clicks days only, oldest first. */
  readonly days: readonly { readonly day: string; readonly value: number }[];
}

const inRange = (day: string, from: string, to: string): boolean => day >= from && day <= to;

/** The 28 days' numbers ending at the last measured clicks day, or null when no clicks day was ever measured. */
export function searchSummary(rows: readonly SearchDay[]): SearchSummary | null {
  const clicks = rows.filter((row) => row.metric === "clicks");
  const last = clicks.reduce<string | null>((latest, row) => (latest === null || row.day > latest ? row.day : latest), null);
  if (last === null) return null;
  const window = searchWindow(last);
  const current = clicks.filter((row) => inRange(row.day, window.from, window.to)).sort((a, b) => a.day.localeCompare(b.day));
  const previous = clicks.filter((row) => inRange(row.day, window.previousFrom, window.previousTo));
  const first = current[0];
  if (first === undefined) return null;
  const total = current.reduce((sum, row) => sum + row.value, 0);
  const previousTotal = previous.reduce((sum, row) => sum + row.value, 0);
  const full = current.length === SEARCH_WINDOW_DAYS && previous.length === SEARCH_WINDOW_DAYS && previousTotal > 0;
  const difference = total - previousTotal;

  const impressions = rows.filter((row) => row.metric === "impressions" && inRange(row.day, window.from, window.to));
  const impressionsByDay = new Map(impressions.map((row) => [row.day, row.value]));
  let weighted = 0;
  let weight = 0;
  for (const row of rows) {
    const shown = impressionsByDay.get(row.day);
    if (row.metric !== "position" || shown === undefined) continue;
    weighted += row.value * shown;
    weight += shown;
  }

  return {
    from: first.day,
    to: window.to,
    clicks: total,
    impressions: impressions.length === 0 ? null : impressions.reduce((sum, row) => sum + row.value, 0),
    averagePosition: weight === 0 ? null : Math.round((weighted / weight) * 10) / 10,
    change: full && difference !== 0 ? difference : null,
    days: current.map((row) => ({ day: row.day, value: row.value })),
  };
}

/** "3 Oct to 30 Oct, Google data runs about 3 days behind". */
export function searchDateLine(summary: Pick<SearchSummary, "from" | "to">): string {
  return `${shortDay(summary.from)} to ${shortDay(summary.to)}, ${SEARCH_PRESENCE_COPY.behind}`;
}

export interface SearchListRow {
  readonly label: string;
  readonly value: number;
}

export interface SearchLists {
  readonly month: string;
  readonly queries: readonly SearchListRow[];
  readonly pages: readonly SearchListRow[];
}

/** A page as the customer reads it: the path without its origin, and the root as "Home". Null for a key that is not a path. */
export function pageLabel(key: string): string | null {
  let path = key.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }
  if (!path.startsWith("/")) return null;
  return path === "/" ? SEARCH_PRESENCE_COPY.homePage : path;
}

/** The top rows of one list: rows with the same label are added together, zero and malformed rows are left out, biggest first. */
function topRows(list: SearchList | undefined, label: (key: string) => string | null): SearchListRow[] {
  if (list === undefined) return [];
  const totals = new Map<string, number>();
  for (const { key, count } of list.rows) {
    const text = typeof key === "string" ? label(key) : null;
    if (text !== null && typeof count === "number" && Number.isFinite(count) && count > 0) totals.set(text, (totals.get(text) ?? 0) + count);
  }
  return [...totals]
    .map(([text, value]) => ({ label: text, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, SEARCH_LIST_ROWS);
}

/** The searches and landing pages of one month (`YYYY-MM-01`), or null when neither list has a row. */
export function searchLists(month: string, lists: readonly SearchList[]): SearchLists | null {
  const queries = topRows(lists.find((list) => list.dimension === "query"), (key) => (key.trim() === "" ? null : key));
  const pages = topRows(lists.find((list) => list.dimension === "page"), pageLabel);
  return queries.length === 0 && pages.length === 0 ? null : { month, queries, pages };
}

/** What the panel draws once the connection has a measured day. */
export type SearchPresence =
  | { readonly kind: "waiting" }
  | { readonly kind: "measured"; readonly summary: SearchSummary; readonly lists: SearchLists | null };
