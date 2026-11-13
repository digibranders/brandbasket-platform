import "server-only";
import type { Payload } from "payload";
import { firstUnusedSlug, RESERVED_SLUGS, slugList, storedPostPath } from "../rules/address";
import { mediaPath } from "../rules/paths";
import { blogPublishState, type BlogImage, type BlogPost, type BlogPostSummary } from "../rules/posts";
import { AUTHOR_LINK_KINDS, type AuthorLinks } from "../rules/taxonomy";

/*
 * The blog's Payload reads, and the ownership checks every write makes before trusting a client-supplied id. Ported from
 * apps/platform lib/server/blog.ts and lib/server/blog-taxonomy.ts, with the same Local API calls. Nothing else backs these
 * checks: Payload has no row-level security, so every query filters by the session's business and every result is checked
 * again in memory.
 */

/** A real id that belongs to another business. Never shown: callers answer it exactly as a missing id. */
export class BlogOwnershipError extends Error {
  constructor(collection: string, id: string) {
    super(`${collection} ${id} does not belong to this business.`);
    this.name = "BlogOwnershipError";
  }
}

/** Payload's NotFound (an APIError with status 404), read by its status so a minified class name cannot hide it. */
function isPayloadNotFound(error: unknown): boolean {
  return error instanceof Error && (error as { readonly status?: unknown }).status === 404;
}

/** A missing id and another business's id are the same answer. Anything else still throws. */
export async function ownedOrNull<T>(check: () => Promise<T>): Promise<T | null> {
  try {
    return await check();
  } catch (error) {
    if (error instanceof BlogOwnershipError || isPayloadNotFound(error)) return null;
    throw error;
  }
}

interface RawPost {
  readonly id: string | number;
  readonly businessId?: unknown;
  readonly title?: unknown;
  readonly slug?: unknown;
  readonly excerpt?: string | null;
  readonly body?: unknown;
  readonly coverImage?: unknown;
  readonly status?: unknown;
  readonly publishedAt?: string | null;
  readonly updatedAt?: unknown;
  readonly category?: unknown;
  readonly author?: unknown;
  readonly metaTitle?: string | null;
  readonly metaDescription?: string | null;
  readonly noIndex?: boolean | null;
  readonly coverImageAlt?: string | null;
  readonly pathPrefix?: unknown;
  readonly previousSlugs?: unknown;
}

/** A post confirmed to be the caller's own, with what the write actions need from it. */
export interface OwnedBlogPost {
  readonly id: string;
  readonly slug: string;
  readonly previousSlugs: readonly string[];
  readonly status: "draft" | "published";
  /** As stored (ISO), or null when the post has never been given a publish date. */
  readonly publishedAt: string | null;
  /** The stored document at depth 0, for copying a post. */
  readonly doc: Readonly<Record<string, unknown>>;
}

const statusOf = (value: unknown): "draft" | "published" => (value === "published" ? "published" : "draft");
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

/** Confirms `postId` belongs to `businessId`. Payload's NotFound propagates for an id that does not exist. */
export async function requireOwnedBlogPost(payload: Payload, postId: string, businessId: string): Promise<OwnedBlogPost> {
  const doc = (await payload.findByID({ collection: "blogPosts", id: postId, depth: 0, overrideAccess: true })) as unknown as RawPost;
  if (doc.businessId !== businessId) throw new BlogOwnershipError("blogPosts", postId);
  return {
    id: String(doc.id),
    slug: text(doc.slug),
    previousSlugs: slugList(doc.previousSlugs),
    status: statusOf(doc.status),
    publishedAt: doc.publishedAt ?? null,
    doc: doc as unknown as Readonly<Record<string, unknown>>,
  };
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

/** Confirms a client-supplied category or author id belongs to `businessId`. Payload's NotFound propagates as it is. */
export async function requireOwnedTaxonomyDoc(payload: Payload, collection: TaxonomyCollection, id: string, businessId: string): Promise<RawTaxonomyDoc> {
  const doc = (await payload.findByID({ collection, id, depth: 0, overrideAccess: true })) as unknown as RawTaxonomyDoc;
  if (doc.businessId !== businessId) throw new BlogOwnershipError(collection, id);
  return doc;
}

/** Every category or author of one business, by name, filtered again in memory. */
export async function listTaxonomyDocs(payload: Payload, collection: TaxonomyCollection, businessId: string): Promise<readonly RawTaxonomyDoc[]> {
  const result = await payload.find({ collection, where: { businessId: { equals: businessId } }, sort: "name", depth: 0, pagination: false, overrideAccess: true });
  return (result.docs as unknown as readonly RawTaxonomyDoc[]).filter((doc) => doc.businessId === businessId);
}

/** Every post of the business with its current and earlier addresses: the ones a new address may not take. */
export async function businessPostAddresses(payload: Payload, businessId: string): Promise<readonly { readonly id: string; readonly slug: string; readonly previousSlugs: readonly string[] }[]> {
  const result = await payload.find({ collection: "blogPosts", where: { businessId: { equals: businessId } }, depth: 0, pagination: false, overrideAccess: true });
  return (result.docs as unknown as readonly RawPost[])
    .filter((doc) => doc.businessId === businessId)
    .map((doc) => ({ id: String(doc.id), slug: text(doc.slug), previousSlugs: slugList(doc.previousSlugs) }));
}

/** Enough for any real business's blog; past it, a post simply gets a longer numbered address. */
const MAX_SLUG_LOOKUP = 1_000;

/**
 * `base`, or the first numbered address none of this business's posts uses yet. Only the same business's posts count:
 * addresses are per website. Two posts created in the same instant could still collide; nothing enforces uniqueness in the
 * database (as in the old app).
 */
export async function unusedPostSlug(payload: Payload, businessId: string, base: string): Promise<string> {
  const existing = await payload.find({
    collection: "blogPosts",
    where: { and: [{ businessId: { equals: businessId } }, { slug: { like: base } }] },
    depth: 0,
    limit: MAX_SLUG_LOOKUP,
    pagination: false,
    overrideAccess: true,
  });
  const taken = new Set<string>([
    ...RESERVED_SLUGS,
    ...(existing.docs as unknown as readonly RawPost[]).filter((doc) => doc.businessId === businessId).map((doc) => text(doc.slug)),
  ]);
  return firstUnusedSlug(base, taken);
}

/** Every post counts, drafts included; a deleted post frees its slot. */
export async function countBlogPosts(payload: Payload, businessId: string): Promise<number> {
  const { totalDocs } = await payload.count({ collection: "blogPosts", where: { businessId: { equals: businessId } }, overrideAccess: true });
  return totalDocs;
}

/** A relationship's id whether Payload returned it bare (depth 0) or resolved (depth 1 and up). */
function relationIdOf(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && "id" in value) return String((value as { readonly id: unknown }).id);
  return null;
}

function nameOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("name" in value)) return null;
  const name = (value as { readonly name: unknown }).name;
  return typeof name === "string" ? name : null;
}

function timeOf(value: unknown): number | null {
  if (typeof value !== "string" || value === "") return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function imageOf(value: unknown): BlogImage | null {
  const id = relationIdOf(value);
  return id === null ? null : { id, url: mediaPath(id) };
}

function toSummary(doc: RawPost, now: number): BlogPostSummary {
  const publishedAt = timeOf(doc.publishedAt);
  const status = statusOf(doc.status);
  return {
    id: String(doc.id),
    title: text(doc.title),
    status,
    updatedAt: timeOf(doc.updatedAt) ?? 0,
    publishedAt,
    categoryName: nameOf(doc.category),
    authorName: nameOf(doc.author),
    publishState: blogPublishState(status, publishedAt, now),
  };
}

/** The list reads at most this many posts, newest edited first, as the old list did. */
const POST_LIST_LIMIT = 200;

/** The business's posts for the list: only what it shows, with category and author resolved to their names alone. */
export async function readBlogPosts(payload: Payload, businessId: string, now: Date): Promise<readonly BlogPostSummary[]> {
  const result = await payload.find({
    collection: "blogPosts",
    where: { businessId: { equals: businessId } },
    sort: "-updatedAt",
    depth: 1,
    select: { businessId: true, title: true, status: true, updatedAt: true, publishedAt: true, category: true, author: true },
    populate: { blogCategories: { name: true }, blogAuthors: { name: true } },
    limit: POST_LIST_LIMIT,
    overrideAccess: true,
  });
  return (result.docs as unknown as readonly RawPost[]).filter((doc) => doc.businessId === businessId).map((doc) => toSummary(doc, now.getTime()));
}

/** One post of the business, or null for a missing id and for another business's post alike. Any other failure throws. */
export async function readBlogPost(payload: Payload, businessId: string, postId: string, now: Date): Promise<BlogPost | null> {
  return ownedOrNull(async () => {
    const doc = (await payload.findByID({ collection: "blogPosts", id: postId, depth: 1, overrideAccess: true })) as unknown as RawPost;
    if (doc.businessId !== businessId) throw new BlogOwnershipError("blogPosts", postId);
    return {
      ...toSummary(doc, now.getTime()),
      slug: text(doc.slug),
      excerpt: doc.excerpt ?? null,
      body: doc.body ?? null,
      coverImage: imageOf(doc.coverImage),
      coverImageAlt: doc.coverImageAlt ?? "",
      categoryId: relationIdOf(doc.category),
      authorId: relationIdOf(doc.author),
      metaTitle: doc.metaTitle ?? null,
      metaDescription: doc.metaDescription ?? null,
      noIndex: doc.noIndex === true,
      pathPrefix: storedPostPath(doc.pathPrefix),
    };
  });
}

export interface TaxonomyOption {
  readonly id: string;
  readonly name: string;
}

export interface PostCounts {
  readonly publishedCount: number;
  readonly draftCount: number;
}

export interface BlogCategory extends PostCounts {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
}

export interface BlogAuthor extends PostCounts {
  readonly id: string;
  readonly name: string;
  readonly role: string | null;
  readonly bio: string | null;
  readonly photo: BlogImage | null;
  readonly links: AuthorLinks;
  /** When their newest published post went out; null when none has. */
  readonly lastPublishedAt: number | null;
}

interface Stats {
  published: number;
  drafts: number;
  last: number | null;
}

/** Published and draft counts per author or category id, and the newest publish date already passed, from one read. */
async function postStatsBy(payload: Payload, businessId: string, field: "author" | "category", now: Date): Promise<ReadonlyMap<string, Stats>> {
  const result = await payload.find({
    collection: "blogPosts",
    where: { businessId: { equals: businessId } },
    select: { businessId: true, [field]: true, status: true, publishedAt: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const stats = new Map<string, Stats>();
  for (const post of result.docs as unknown as readonly RawPost[]) {
    if (post.businessId !== businessId) continue;
    const key = relationIdOf(post[field]);
    if (key === null) continue;
    const entry = stats.get(key) ?? { published: 0, drafts: 0, last: null };
    if (post.status === "published") {
      entry.published += 1;
      const time = timeOf(post.publishedAt);
      if (time !== null && time <= now.getTime() && (entry.last === null || time > entry.last)) entry.last = time;
    } else {
      entry.drafts += 1;
    }
    stats.set(key, entry);
  }
  return stats;
}

function toCategory(doc: RawTaxonomyDoc, stats: ReadonlyMap<string, Stats>): BlogCategory {
  const entry = stats.get(String(doc.id));
  return {
    id: String(doc.id),
    name: text(doc.name),
    slug: text(doc.slug),
    description: textOrNull(doc.description),
    metaTitle: textOrNull(doc.metaTitle),
    metaDescription: textOrNull(doc.metaDescription),
    publishedCount: entry?.published ?? 0,
    draftCount: entry?.drafts ?? 0,
  };
}

function toAuthor(doc: RawTaxonomyDoc, stats: ReadonlyMap<string, Stats>): BlogAuthor {
  const entry = stats.get(String(doc.id));
  return {
    id: String(doc.id),
    name: text(doc.name),
    role: textOrNull(doc.role),
    bio: textOrNull(doc.bio),
    photo: imageOf(doc.photo),
    links: Object.fromEntries(AUTHOR_LINK_KINDS.map((kind) => [kind, textOrNull(doc[kind])])) as AuthorLinks,
    publishedCount: entry?.published ?? 0,
    draftCount: entry?.drafts ?? 0,
    lastPublishedAt: entry?.last ?? null,
  };
}

/** The business's categories and authors as the editor's pickers need them. */
export async function readTaxonomyOptions(payload: Payload, businessId: string): Promise<{ readonly categories: readonly TaxonomyOption[]; readonly authors: readonly TaxonomyOption[] }> {
  const [categories, authors] = await Promise.all([listTaxonomyDocs(payload, "blogCategories", businessId), listTaxonomyDocs(payload, "blogAuthors", businessId)]);
  const option = (doc: RawTaxonomyDoc): TaxonomyOption => ({ id: String(doc.id), name: text(doc.name) });
  return { categories: categories.map(option), authors: authors.map(option) };
}

export async function readCategories(payload: Payload, businessId: string, now: Date): Promise<readonly BlogCategory[]> {
  const [docs, stats] = await Promise.all([listTaxonomyDocs(payload, "blogCategories", businessId), postStatsBy(payload, businessId, "category", now)]);
  return docs.map((doc) => toCategory(doc, stats));
}

export async function readAuthors(payload: Payload, businessId: string, now: Date): Promise<readonly BlogAuthor[]> {
  const [docs, stats] = await Promise.all([listTaxonomyDocs(payload, "blogAuthors", businessId), postStatsBy(payload, businessId, "author", now)]);
  return docs.map((doc) => toAuthor(doc, stats));
}

/** One category of the business, or null for a missing id and another business's alike. */
export async function readCategory(payload: Payload, businessId: string, id: string, now: Date): Promise<BlogCategory | null> {
  const doc = await ownedOrNull(() => requireOwnedTaxonomyDoc(payload, "blogCategories", id, businessId));
  return doc === null ? null : toCategory(doc, await postStatsBy(payload, businessId, "category", now));
}

/** One author of the business, or null for a missing id and another business's alike. */
export async function readAuthor(payload: Payload, businessId: string, id: string, now: Date): Promise<BlogAuthor | null> {
  const doc = await ownedOrNull(() => requireOwnedTaxonomyDoc(payload, "blogAuthors", id, businessId));
  return doc === null ? null : toAuthor(doc, await postStatsBy(payload, businessId, "author", now));
}
