import { eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businesses } from "../schema";

type Runner = Database | ScopedTransaction;

export class InvalidWebsiteUrlError extends Error {
  constructor(value: string) {
    super(`A website address must be an https:// address with no path, received ${JSON.stringify(value)}.`);
    this.name = "InvalidWebsiteUrlError";
  }
}

/**
 * The origin form of a website address ("https://harbour.example"), or throws. https only, host only: the preview
 * link is built as `<origin>/blog/preview`, so a path or query here would build a broken link. The database's
 * `businesses_website_url_https` check enforces the same shape.
 */
export function normaliseWebsiteUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new InvalidWebsiteUrlError(value);
  }
  if (url.protocol !== "https:" || url.hostname === "" || url.username !== "" || url.password !== "") {
    throw new InvalidWebsiteUrlError(value);
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    throw new InvalidWebsiteUrlError(value);
  }
  return url.origin;
}

/** Staff set or clear where a business's own website lives. */
export async function setBusinessWebsiteUrl(db: Runner, businessId: string, value: string | null): Promise<void> {
  const websiteUrl = value === null || value.trim() === "" ? null : normaliseWebsiteUrl(value);
  await db.update(businesses).set({ websiteUrl }).where(eq(businesses.id, businessId));
}

/**
 * Where a business's own website lives, or null. On the customer connection, row-level security limits this to the
 * signed-in business, so asking about another one reads null.
 */
export async function findBusinessWebsiteUrl(db: Runner, businessId: string): Promise<string | null> {
  const rows = await db
    .select({ websiteUrl: businesses.websiteUrl })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  return rows[0]?.websiteUrl ?? null;
}
