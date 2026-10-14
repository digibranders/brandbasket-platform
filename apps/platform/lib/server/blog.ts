import "server-only";
import { getPayload, type Payload } from "payload";
import { cache } from "react";
import config from "@/payload.config";
import { blogPublishState, type BlogPublishState } from "@/lib/blog-publish-state";
import { slugList } from "@/lib/blog-slug";
import { storedPostPath } from "@/lib/post-path";
import { requireCustomerAccess } from "./customer-access";

export interface BlogPostImage {
  readonly id: string;
  /** Always this app's own `/content-media/{id}` proxy — see lib/server/content.ts's `ContentImageValue` doc
   * comment for why Payload's raw upload url can never be used any more. */
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** The uploaded file's name, for showing which image this is; null when Payload has none on record. */
  readonly filename: string | null;
  /** Bytes; null when unknown. */
  readonly filesize: number | null;
  readonly mimeType: string | null;
}

export interface BlogPostSummary {
  readonly id: string;
  readonly title: string;
  readonly status: "draft" | "published";
  readonly updatedAt: number;
  readonly publishedAt: number | null;
  readonly categoryName: string | null;
  readonly authorName: string | null;
  /** Draft, scheduled (published with a date still ahead) or published, as of when this was read. */
  readonly publishState: BlogPublishState;
}

export interface BlogPost extends BlogPostSummary {
  readonly slug: string;
  readonly excerpt: string | null;
  /** A Lexical `SerializedEditorState` (or `null` for a post with no body yet) — opaque here, handed straight to
   * `components/panel/rich-text-editor.tsx`, which is the only thing that reads its structure. */
  readonly body: unknown;
  readonly coverImage: BlogPostImage | null;
  /** Blank when none has been written. */
  readonly coverImageAlt: string;
  readonly categoryId: string | null;
  readonly authorId: string | null;
  /** Null when blank: the site API then falls back to the default (lib/blog-seo.ts). */
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly noIndex: boolean;
  /** Where the article lives on the website: "blog" → /blog/<slug>, "" → /<slug> (lib/post-path.ts). */
  readonly pathPrefix: string;
}

interface RawMediaRelation {
  readonly id: string | number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly filename?: string | null;
  readonly filesize?: number | null;
  readonly mimeType?: string | null;
}

interface RawBlogPost {
  readonly id: string | number;
  readonly businessId: string;
  readonly title: string;
  readonly slug: string;
  readonly excerpt?: string | null;
  readonly body?: unknown;
  readonly coverImage?: RawMediaRelation | string | number | null;
  readonly status: "draft" | "published";
  readonly publishedAt?: string | null;
  readonly updatedAt: string;
  readonly category?: unknown;
  readonly author?: unknown;
  readonly metaTitle?: string | null;
  readonly metaDescription?: string | null;
  readonly noIndex?: boolean | null;
  readonly coverImageAlt?: string | null;
  readonly pathPrefix?: string | null;
  readonly previousSlugs?: unknown;
}

/** What every `blog/actions.ts` action answers when the business has not paid, or its plan has lapsed. Lives here
 * rather than in that file because a "use server" module may export only async functions. */
export const BLOG_PAYMENT_REQUIRED_MESSAGE = "Your blog opens once your plan is paid. You can pay from Billing.";

/** Thrown by `blog/actions.ts` when a post id is real but belongs to a different business — the one check nothing
 * else backs now that the multi-tenant plugin is gone (see `lib/server/content.ts`'s `GalleryItemOwnershipError`
 * and `lib/server/content-fields.ts`'s `PageOwnershipError` for the same discipline applied to pages and gallery
 * items). Never thrown for an id that simply doesn't exist; Payload's own `NotFound` covers that — every caller
 * still maps both to the same generic, non-revealing message. */
export class BlogPostOwnershipError extends Error {
  constructor(postId: string) {
    super(`Blog post ${postId} does not belong to this business.`);
    this.name = "BlogPostOwnershipError";
  }
}

/** A post confirmed to be the caller's own, with what the write actions need from it. */
export interface OwnedBlogPost {
  readonly id: string | number;
  readonly slug: string;
  readonly previousSlugs: readonly string[];
  readonly status: "draft" | "published";
  /** As stored (ISO), or null when the post has never been given a publish date. */
  readonly publishedAt: string | null;
  /** The whole stored document at depth 0, for copying a post. */
  readonly doc: Readonly<Record<string, unknown>>;
}

/**
 * Confirms `postId` really belongs to `businessId` before a mutation touches it — `postId` is always client-
 * supplied, so this is the whole defense (see this plan's "Architecture, corrected" note). Payload's own
 * `NotFound` propagates unchanged for an id that doesn't exist at all. Exported for `blog/actions.ts`; every write
 * action there calls this first.
 */
export async function requireOwnedBlogPost(
  payload: Payload,
  postId: string | number,
  businessId: string,
): Promise<OwnedBlogPost> {
  const doc = (await payload.findByID({
    collection: "blogPosts",
    id: postId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as RawBlogPost;
  if (doc.businessId !== businessId) throw new BlogPostOwnershipError(String(postId));
  return {
    id: doc.id,
    slug: doc.slug,
    previousSlugs: slugList(doc.previousSlugs),
    status: doc.status,
    publishedAt: doc.publishedAt ?? null,
    doc: doc as unknown as Readonly<Record<string, unknown>>,
  };
}

function toImage(value: RawBlogPost["coverImage"]): BlogPostImage | null {
  if (value === null || value === undefined || typeof value !== "object") return null;
  return {
    id: String(value.id),
    url: `/content-media/${String(value.id)}`,
    width: value.width ?? 0,
    height: value.height ?? 0,
    filename: value.filename ?? null,
    filesize: value.filesize ?? null,
    mimeType: value.mimeType ?? null,
  };
}

/** A relationship's id whether Payload returned it bare (depth 0) or resolved to a document (depth ≥ 1). */
function relationId(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && "id" in value) return String((value as { readonly id: unknown }).id);
  return null;
}

/** A resolved category's or author's name, or null when there is none or it was not resolved. */
function nameOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("name" in value)) return null;
  const name = (value as { readonly name: unknown }).name;
  return typeof name === "string" ? name : null;
}

function timeOf(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function toSummary(doc: RawBlogPost): BlogPostSummary {
  const publishedAt = timeOf(doc.publishedAt);
  return {
    id: String(doc.id),
    title: doc.title,
    status: doc.status,
    updatedAt: new Date(doc.updatedAt).getTime(),
    publishedAt,
    categoryName: nameOf(doc.category),
    authorName: nameOf(doc.author),
    publishState: blogPublishState(doc.status, publishedAt, Date.now()),
  };
}

function toBlogPost(doc: RawBlogPost): BlogPost {
  return {
    ...toSummary(doc),
    slug: doc.slug,
    excerpt: doc.excerpt ?? null,
    body: doc.body ?? null,
    coverImage: toImage(doc.coverImage),
    coverImageAlt: doc.coverImageAlt ?? "",
    categoryId: relationId(doc.category),
    authorId: relationId(doc.author),
    metaTitle: doc.metaTitle ?? null,
    metaDescription: doc.metaDescription ?? null,
    noIndex: doc.noIndex === true,
    pathPrefix: storedPostPath(doc.pathPrefix),
  };
}

/** Every post for the signed-in customer's own business, newest-edited first — the list page's only read. Selects only
 * what the list shows, and resolves each post's category and author to their names alone (never bodies or cover
 * images). */
export const getBlogPosts = cache(async (): Promise<readonly BlogPostSummary[]> => {
  const { tenant } = await requireCustomerAccess();
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "blogPosts",
    where: { businessId: { equals: tenant.businessId } },
    sort: "-updatedAt",
    depth: 1,
    select: {
      businessId: true,
      title: true,
      status: true,
      updatedAt: true,
      publishedAt: true,
      category: true,
      author: true,
    },
    populate: { blogCategories: { name: true }, blogAuthors: { name: true } },
    limit: 200,
    overrideAccess: true,
  });
  return (result.docs as unknown as readonly RawBlogPost[])
    .filter((doc) => doc.businessId === tenant.businessId)
    .map(toSummary);
});

/**
 * One post, scoped to the signed-in customer's own business — `null` for both "doesn't exist" and "belongs to
 * someone else" (the edit page turns either into the same `notFound()`, never distinguishing the two to the
 * browser).
 */
export const getBlogPost = cache(async (postId: string): Promise<BlogPost | null> => {
  const { tenant } = await requireCustomerAccess();
  const payload = await getPayload({ config });
  let doc: RawBlogPost;
  try {
    doc = (await payload.findByID({
      collection: "blogPosts",
      id: postId,
      depth: 1, // resolves coverImage to a usable id/width/height (see toImage)
      overrideAccess: true,
    })) as unknown as RawBlogPost;
  } catch {
    return null;
  }
  if (doc.businessId !== tenant.businessId) return null;
  return toBlogPost(doc);
});
