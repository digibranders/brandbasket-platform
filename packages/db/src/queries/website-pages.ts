import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { businesses } from "../schema/businesses";
import { websitePages, type WebsitePage } from "../schema/website-pages";
import type { ScopedTransaction } from "../scope";
import { parseSitemap } from "../sitemap";
import { currentBusinessId, isUuid } from "./tenant";

/** Customer side, inside withTenantScope: the business's pages as the last sitemap sync found them. */
export async function listWebsitePages(tx: ScopedTransaction): Promise<WebsitePage[]> {
  const businessId = await currentBusinessId(tx);
  return tx.select().from(websitePages).where(eq(websitePages.businessId, businessId)).orderBy(asc(websitePages.url));
}

/** What a fetch of one sitemap returned. Injected so the sync is tested without the network. */
export interface FetchedText {
  readonly ok: boolean;
  readonly status: number;
  readonly text: string;
}
export type FetchText = (url: string) => Promise<FetchedText>;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;
const MAX_CHILD_SITEMAPS = 10;
const MAX_PAGES = 1000;

export class SitemapTooLargeError extends Error {
  constructor(url: string) {
    super(`The sitemap at ${url} is larger than ${MAX_SITEMAP_BYTES} bytes.`);
    this.name = "SitemapTooLargeError";
  }
}

/** The network fetch the nightly job uses: a time limit, no cookies, and a size cap. */
export const fetchSitemapText: FetchText = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow", headers: { accept: "application/xml, text/xml" } });
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_SITEMAP_BYTES) throw new SitemapTooLargeError(url);
  const text = await response.text();
  if (text.length > MAX_SITEMAP_BYTES) throw new SitemapTooLargeError(url);
  return { ok: response.ok, status: response.status, text };
};

export type WebsitePagesSyncResult =
  | { readonly kind: "synced"; readonly pages: number; readonly removed: number }
  | { readonly kind: "no_website" }
  | { readonly kind: "failed"; readonly reason: string };

async function pageUrlsFrom(sitemapUrl: string, fetchText: FetchText): Promise<string[] | string> {
  const root = await fetchText(sitemapUrl);
  if (!root.ok) return `${sitemapUrl} answered ${root.status}`;
  const parsed = parseSitemap(root.text);
  if (parsed.kind === "invalid") return `${sitemapUrl} is not a sitemap`;
  if (parsed.kind === "urlset") return [...parsed.urls];

  const urls = new Set<string>();
  // shortcut: one level of index, at most MAX_CHILD_SITEMAPS children, https only; nested indexes are skipped.
  for (const child of parsed.sitemaps.filter((url) => url.startsWith("https://")).slice(0, MAX_CHILD_SITEMAPS)) {
    const fetched = await fetchText(child);
    if (!fetched.ok) return `${child} answered ${fetched.status}`;
    const page = parseSitemap(fetched.text);
    if (page.kind !== "urlset") continue;
    for (const url of page.urls) urls.add(url);
  }
  return [...urls];
}

/**
 * Staff side (the nightly job): reads `<websiteUrl>/sitemap.xml` for one business and makes `website_pages` match it.
 * Pages it names are added or have `last_seen_at` moved to `now`; pages it no longer names are removed. A failed
 * fetch, something that is not a sitemap, or an empty one changes nothing, so a broken deploy never empties the list.
 */
export async function syncWebsitePages(
  db: Database,
  businessId: string,
  options: { readonly fetchText?: FetchText; readonly now?: Date } = {},
): Promise<WebsitePagesSyncResult> {
  if (!isUuid(businessId)) throw new Error(`businessId must be a UUID, received "${businessId}"`);
  const fetchText = options.fetchText ?? fetchSitemapText;
  const now = options.now ?? new Date();

  const [business] = await db.select({ websiteUrl: businesses.websiteUrl }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (business?.websiteUrl == null) return { kind: "no_website" };

  let found: string[] | string;
  try {
    found = await pageUrlsFrom(`${business.websiteUrl}/sitemap.xml`, fetchText);
  } catch (error) {
    return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
  if (typeof found === "string") return { kind: "failed", reason: found };
  const pages = found.filter((url) => url.length <= 2000).slice(0, MAX_PAGES);
  if (pages.length === 0) return { kind: "failed", reason: "The sitemap lists no pages" };

  return db.transaction(async (tx) => {
    await tx
      .insert(websitePages)
      .values(pages.map((url) => ({ businessId, url, lastSeenAt: now })))
      .onConflictDoUpdate({ target: [websitePages.businessId, websitePages.url], set: { lastSeenAt: sql`excluded.last_seen_at` } });
    const removed = await tx
      .delete(websitePages)
      .where(and(eq(websitePages.businessId, businessId), lt(websitePages.lastSeenAt, now)))
      .returning({ url: websitePages.url });
    return { kind: "synced", pages: pages.length, removed: removed.length };
  });
}
