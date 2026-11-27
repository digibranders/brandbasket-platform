import type { AnalyticsChannel } from "./rules";
import type { PostRow } from "./view";

/** How many posts one page of the table shows. */
export const POSTS_PAGE_SIZE = 5;

export interface PostsPage {
  /** The posts of this page, in the order they are given. */
  readonly rows: readonly PostRow[];
  /** The serial number of the first row of this page (1 on the first page, 6 on the second). */
  readonly firstNumber: number;
  /** How many posts match the filter, over every page. */
  readonly total: number;
  /** The page shown, 1-based, kept inside what exists. */
  readonly page: number;
  readonly pageCount: number;
}

export interface PostsFilter {
  readonly platform: "all" | AnalyticsChannel;
  /** Words to find in the post's text, any case; empty means no search. */
  readonly query: string;
  /** The page asked for, 1-based; a page that does not exist is brought back to the nearest one. */
  readonly page: number;
}

/** The posts that match a network and a search, cut into pages of five. */
export function pagePosts(rows: readonly PostRow[], filter: PostsFilter): PostsPage {
  const words = filter.query.trim().toLowerCase();
  const matching = rows.filter((row) => (filter.platform === "all" || row.platform === filter.platform) && (words === "" || row.title.toLowerCase().includes(words)));
  const pageCount = Math.max(1, Math.ceil(matching.length / POSTS_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(Number.isFinite(filter.page) ? filter.page : 1)));
  const start = (page - 1) * POSTS_PAGE_SIZE;
  return { rows: matching.slice(start, start + POSTS_PAGE_SIZE), firstNumber: start + 1, total: matching.length, page, pageCount };
}
