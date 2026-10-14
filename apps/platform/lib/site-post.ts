import { AUTHOR_LINK_KINDS, type AuthorLinks } from "./author-links";
import { lexicalToHtml, lexicalToPlainText } from "./blog-html";
import { resolveSeo, type ResolvedSeo } from "./blog-seo";
import { slugList } from "./blog-slug";
import { storedPostPath } from "./post-path";

/**
 * The post shape `/api/site/posts` and its preview endpoint send to client websites, and the one mapping from a
 * Payload document to it. Pure, so it is tested without Payload.
 *
 * Changes are ADDITIVE ONLY. Client sites are independently deployed repositories: a removed or retyped field breaks
 * every one of them at once. `categories` stays for sites written before `category` existed.
 */
export interface SitePostCategory {
  readonly slug: string;
  readonly name: string;
  /** Shown at the top of the category's page; null when none was written. */
  readonly description: string | null;
  /** The category page's search title and description, defaults applied: the name, and the description. */
  readonly seo: { readonly title: string; readonly description: string | null };
}

export interface SitePostAuthor {
  readonly name: string;
  readonly bio: string | null;
  /** What they do, e.g. "Head physiotherapist"; null when not given. */
  readonly role: string | null;
  /** Absolute path on this platform, or null, like `coverImagePath`. */
  readonly photoPath: string | null;
  /** Full http(s) addresses; null for each one not given. */
  readonly links: AuthorLinks;
}

export interface SitePost {
  readonly slug: string;
  /** The first part of the article's address: "blog" → /blog/<slug>, "" → /<slug>. Chosen per article (lib/post-path.ts). */
  readonly pathPrefix: string;
  /** Addresses the article had before; client sites redirect each to the current one. */
  readonly previousSlugs: readonly string[];
  readonly title: string;
  readonly excerpt: string | null;
  readonly publishedAt: string | null;
  /** The last edit, for sitemaps and schema.org `dateModified`. */
  readonly updatedAt: string | null;
  /** The post body as HTML, already escaped and with unsafe link schemes stripped. See lib/blog-html.ts. */
  readonly html: string;
  /** Absolute path on this platform, or null. Client sites prefix it with the platform origin. */
  readonly coverImagePath: string | null;
  /** The post's category name as a list of zero or one. Kept for client sites written before `category`. */
  readonly categories: readonly string[];
  readonly category: SitePostCategory | null;
  readonly author: SitePostAuthor | null;
  /** Search title and description with the defaults already applied (lib/blog-seo.ts). */
  readonly seo: ResolvedSeo;
  /** The cover image's description, or null when none was written. */
  readonly coverImageAlt: string | null;
}

/** A Payload `blogPosts` document read at depth 1, typed only as far as this mapping trusts it. */
export interface RawSitePost {
  readonly slug?: unknown;
  readonly title?: unknown;
  readonly excerpt?: unknown;
  readonly publishedAt?: unknown;
  readonly updatedAt?: unknown;
  readonly body?: unknown;
  readonly coverImage?: unknown;
  readonly category?: unknown;
  readonly author?: unknown;
  readonly metaTitle?: unknown;
  readonly metaDescription?: unknown;
  readonly noIndex?: unknown;
  readonly coverImageAlt?: unknown;
  readonly pathPrefix?: unknown;
  readonly previousSlugs?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Where a client website fetches a published post's image; public, unlike the dashboard's `/content-media/<id>`. */
export const SITE_MEDIA_PATH_PREFIX = "/api/site/media/";

/** Null unless the relation was resolved (depth ≥ 1) to a document carrying both fields. */
function categoryOf(value: unknown): SitePostCategory | null {
  const doc = asRecord(value);
  const name = nonBlank(doc?.name);
  const slug = nonBlank(doc?.slug);
  if (doc === null || name === null || slug === null) return null;
  const description = nonBlank(doc.description);
  return {
    slug,
    name,
    description,
    seo: { title: nonBlank(doc.metaTitle) ?? name, description: nonBlank(doc.metaDescription) ?? description },
  };
}

/** A media relation as a `/api/site/media/<id>` path, whether it arrived as a bare id or resolved. */
function mediaPath(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return `${SITE_MEDIA_PATH_PREFIX}${String(value)}`;
  const resolved = asRecord(value);
  return resolved === null || resolved.id === undefined ? null : `${SITE_MEDIA_PATH_PREFIX}${String(resolved.id)}`;
}

function authorOf(value: unknown): SitePostAuthor | null {
  const doc = asRecord(value);
  const name = nonBlank(doc?.name);
  if (doc === null || name === null) return null;
  const links = Object.fromEntries(AUTHOR_LINK_KINDS.map((kind) => [kind, nonBlank(doc[kind])])) as AuthorLinks;
  return { name, bio: nonBlank(doc.bio), role: nonBlank(doc.role), photoPath: mediaPath(doc.photo), links };
}

export function toSitePost(post: RawSitePost): SitePost {
  const title = typeof post.title === "string" ? post.title : "";
  const excerpt = nonBlank(post.excerpt);
  const category = categoryOf(post.category);
  return {
    slug: typeof post.slug === "string" ? post.slug : "",
    pathPrefix: storedPostPath(post.pathPrefix),
    previousSlugs: slugList(post.previousSlugs),
    title,
    excerpt,
    publishedAt: nonBlank(post.publishedAt),
    updatedAt: nonBlank(post.updatedAt),
    html: lexicalToHtml(post.body),
    coverImagePath: mediaPath(post.coverImage),
    categories: category === null ? [] : [category.name],
    category,
    author: authorOf(post.author),
    seo: resolveSeo({
      title,
      excerpt,
      bodyText: lexicalToPlainText(post.body),
      metaTitle: nonBlank(post.metaTitle),
      metaDescription: nonBlank(post.metaDescription),
      noIndex: post.noIndex === true,
    }),
    coverImageAlt: nonBlank(post.coverImageAlt),
  };
}
