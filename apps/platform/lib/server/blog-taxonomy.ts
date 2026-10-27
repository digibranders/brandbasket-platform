import "server-only";
import { getPayload, type Payload } from "payload";
import { cache } from "react";
import config from "@/payload.config";
import { AUTHOR_LINK_KINDS, type AuthorLinks } from "@/lib/author-links";
import { requireCustomerAccess } from "./customer-access";

/**
 * A business's blog categories and authors: reads for the signed-in customer, and the ownership check every write in
 * content/blog/taxonomy-actions.ts and content/blog/actions.ts makes before trusting a client-supplied id.
 */

export interface BlogCategory {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  /** Null when blank: the site then uses the name and description. */
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
}

/** A category with how many posts are filed under it, for the Categories screens. */
export interface BlogCategoryWithStats extends BlogCategory {
  readonly publishedCount: number;
  readonly draftCount: number;
  readonly updatedAt: number;
}

export interface BlogAuthorPhoto {
  readonly id: string;
  /** This app's own `/content-media/{id}` proxy, as for cover images (lib/server/blog.ts). */
  readonly url: string;
}

export interface BlogAuthor {
  readonly id: string;
  readonly name: string;
  readonly bio: string | null;
  readonly role: string | null;
  readonly photo: BlogAuthorPhoto | null;
  readonly links: AuthorLinks;
}

/** An author with how much they have written, for the Authors screens. */
export interface BlogAuthorWithStats extends BlogAuthor {
  readonly publishedCount: number;
  readonly draftCount: number;
  /** When their newest published post went out; null when none has. */
  readonly lastPublishedAt: number | null;
  readonly updatedAt: number;
}

export type TaxonomyCollection = "blogCategories" | "blogAuthors";

export interface RawTaxonomyDoc {
  readonly id: string | number;
  readonly businessId?: unknown;
  readonly name?: unknown;
  readonly slug?: unknown;
  readonly bio?: unknown;
  readonly description?: unknown;
  readonly metaTitle?: unknown;
  readonly metaDescription?: unknown;
  readonly role?: unknown;
  readonly photo?: unknown;
  readonly website?: unknown;
  readonly instagram?: unknown;
  readonly facebook?: unknown;
  readonly linkedin?: unknown;
  readonly x?: unknown;
  readonly updatedAt?: unknown;
}

/** A real category or author id that belongs to another business — the same discipline as BlogPostOwnershipError. */
export class BlogTaxonomyOwnershipError extends Error {
  constructor(collection: TaxonomyCollection, id: string) {
    super(`${collection} ${id} does not belong to this business.`);
    this.name = "BlogTaxonomyOwnershipError";
  }
}

/** Confirms a client-supplied category or author id belongs to `businessId`. Payload's `NotFound` propagates as-is
 * for an id that doesn't exist; callers map both to the same message. */
export async function requireOwnedTaxonomyDoc(
  payload: Payload,
  collection: TaxonomyCollection,
  id: string,
  businessId: string,
): Promise<RawTaxonomyDoc> {
  const doc = (await payload.findByID({
    collection,
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as RawTaxonomyDoc;
  if (doc.businessId !== businessId) throw new BlogTaxonomyOwnershipError(collection, id);
  return doc;
}

/** Every category or author of one business, by name. Filtered again in memory, so a query-layer mistake can never
 * hand one business another's names. */
export async function listTaxonomyDocs(
  payload: Payload,
  collection: TaxonomyCollection,
  businessId: string,
): Promise<readonly RawTaxonomyDoc[]> {
  const result = await payload.find({
    collection,
    where: { businessId: { equals: businessId } },
    sort: "name",
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return (result.docs as unknown as readonly RawTaxonomyDoc[]).filter((doc) => doc.businessId === businessId);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** The photo relation's id whether Payload returned it bare or resolved. */
function photoOf(value: unknown): BlogAuthorPhoto | null {
  const id =
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : typeof value === "object" && value !== null && "id" in value
        ? String((value as { readonly id: unknown }).id)
        : null;
  return id === null ? null : { id, url: `/content-media/${id}` };
}

function toBlogAuthor(doc: RawTaxonomyDoc): BlogAuthor {
  const links = Object.fromEntries(AUTHOR_LINK_KINDS.map((kind) => [kind, textOrNull(doc[kind])])) as AuthorLinks;
  return {
    id: String(doc.id),
    name: stringOr(doc.name, ""),
    bio: textOrNull(doc.bio),
    role: textOrNull(doc.role),
    photo: photoOf(doc.photo),
    links,
  };
}

interface RawPostForStats {
  readonly businessId?: unknown;
  readonly author?: unknown;
  readonly category?: unknown;
  readonly status?: unknown;
  readonly publishedAt?: unknown;
}

interface PostStats {
  published: number;
  drafts: number;
  /** The newest publish date that has already passed; null when none. */
  last: number | null;
}

/** Published and draft counts per author (or category) id, and the newest publish date, from one read of the
 * business's posts. */
async function postStatsBy(
  payload: Payload,
  businessId: string,
  field: "author" | "category",
): Promise<ReadonlyMap<string, PostStats>> {
  const result = await payload.find({
    collection: "blogPosts",
    where: { businessId: { equals: businessId } },
    select: { businessId: true, [field]: true, status: true, publishedAt: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const stats = new Map<string, PostStats>();
  for (const post of result.docs as unknown as readonly RawPostForStats[]) {
    if (post.businessId !== businessId) continue;
    const value = post[field];
    const key = typeof value === "string" || typeof value === "number" ? String(value) : null;
    if (key === null) continue;
    const entry = stats.get(key) ?? { published: 0, drafts: 0, last: null };
    if (post.status === "published") {
      entry.published += 1;
      const time = typeof post.publishedAt === "string" ? new Date(post.publishedAt).getTime() : NaN;
      if (!Number.isNaN(time) && time <= Date.now() && (entry.last === null || time > entry.last)) entry.last = time;
    } else {
      entry.drafts += 1;
    }
    stats.set(key, entry);
  }
  return stats;
}

function updatedAtOf(doc: RawTaxonomyDoc): number {
  const updated = typeof doc.updatedAt === "string" ? new Date(doc.updatedAt).getTime() : NaN;
  return Number.isNaN(updated) ? 0 : updated;
}

function toBlogCategory(doc: RawTaxonomyDoc): BlogCategory {
  return {
    id: String(doc.id),
    name: stringOr(doc.name, ""),
    slug: stringOr(doc.slug, ""),
    description: textOrNull(doc.description),
    metaTitle: textOrNull(doc.metaTitle),
    metaDescription: textOrNull(doc.metaDescription),
  };
}

function categoryWithStats(doc: RawTaxonomyDoc, stats: ReadonlyMap<string, PostStats>): BlogCategoryWithStats {
  const entry = stats.get(String(doc.id));
  return {
    ...toBlogCategory(doc),
    publishedCount: entry?.published ?? 0,
    draftCount: entry?.drafts ?? 0,
    updatedAt: updatedAtOf(doc),
  };
}

function withStats(doc: RawTaxonomyDoc, stats: ReadonlyMap<string, PostStats>): BlogAuthorWithStats {
  const entry = stats.get(String(doc.id));
  return {
    ...toBlogAuthor(doc),
    publishedCount: entry?.published ?? 0,
    draftCount: entry?.drafts ?? 0,
    lastPublishedAt: entry?.last ?? null,
    updatedAt: updatedAtOf(doc),
  };
}

export const getBlogCategories = cache(async (): Promise<readonly BlogCategory[]> => {
  const { tenant } = await requireCustomerAccess();
  const payload = await getPayload({ config });
  return (await listTaxonomyDocs(payload, "blogCategories", tenant.businessId)).map(toBlogCategory);
});

/** Every category of the signed-in business with its post counts: the Categories list. */
export const getBlogCategoriesWithStats = cache(async (): Promise<readonly BlogCategoryWithStats[]> => {
  const { tenant } = await requireCustomerAccess();
  const payload = await getPayload({ config });
  const [docs, stats] = await Promise.all([
    listTaxonomyDocs(payload, "blogCategories", tenant.businessId),
    postStatsBy(payload, tenant.businessId, "category"),
  ]);
  return docs.map((doc) => categoryWithStats(doc, stats));
});

/** One category of the signed-in business, or null for a missing id or another business's. */
export const getBlogCategory = cache(async (categoryId: string): Promise<BlogCategoryWithStats | null> => {
  const { tenant } = await requireCustomerAccess();
  const payload = await getPayload({ config });
  let doc: RawTaxonomyDoc;
  try {
    doc = await requireOwnedTaxonomyDoc(payload, "blogCategories", categoryId, tenant.businessId);
  } catch {
    return null;
  }
  return categoryWithStats(doc, await postStatsBy(payload, tenant.businessId, "category"));
});

export const getBlogAuthors = cache(async (): Promise<readonly BlogAuthor[]> => {
  const { tenant } = await requireCustomerAccess();
  const payload = await getPayload({ config });
  return (await listTaxonomyDocs(payload, "blogAuthors", tenant.businessId)).map(toBlogAuthor);
});

/** Every author of the signed-in business with their post counts: the Authors list. */
export const getBlogAuthorsWithStats = cache(async (): Promise<readonly BlogAuthorWithStats[]> => {
  const { tenant } = await requireCustomerAccess();
  const payload = await getPayload({ config });
  const [docs, stats] = await Promise.all([
    listTaxonomyDocs(payload, "blogAuthors", tenant.businessId),
    postStatsBy(payload, tenant.businessId, "author"),
  ]);
  return docs.map((doc) => withStats(doc, stats));
});

/** One author of the signed-in business, or null for a missing id or another business's. */
export const getBlogAuthor = cache(async (authorId: string): Promise<BlogAuthorWithStats | null> => {
  const { tenant } = await requireCustomerAccess();
  const payload = await getPayload({ config });
  let doc: RawTaxonomyDoc;
  try {
    doc = await requireOwnedTaxonomyDoc(payload, "blogAuthors", authorId, tenant.businessId);
  } catch {
    return null;
  }
  return withStats(doc, await postStatsBy(payload, tenant.businessId, "author"));
});
