import { slugFromInput, slugify } from "./blog-slug";

/**
 * Where one article lives on the business's own website, typed by the customer in one box in the post editor:
 * "geo/article-1" gives example.com/geo/article-1, "article-1" gives example.com/article-1, and a blank box gives the
 * default, example.com/blog/<address from the title>. Stored as `pathPrefix` ("geo", "" for the root, "blog" by
 * default) and `slug`. The blog page itself always stays at example.com/blog.
 *
 * Client sites read both with each post from /api/site/posts and redirect every other address of the article to it.
 * The same rules are written out in the client-site template (lib/blog-path.ts there), which re-checks what it gets.
 */

const DEFAULT_POST_PATH = "blog";

const MAX_PREFIX_LENGTH = 40;
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** First words a client site already uses for its own pages under them. */
const RESERVED_PREFIXES: ReadonlySet<string> = new Set(["api", "category", "preview", "sitemap", "robots"]);

/**
 * Pages a client site has, or commonly has, at the root. An article can't take one of these names on its own; the
 * site's own page would win. A client site with other top-level pages still wins over an article of the same name.
 */
const RESERVED_ROOT_ADDRESSES: ReadonlySet<string> = new Set([
  "blog",
  "api",
  "sitemap",
  "robots",
  "about",
  "contact",
  "services",
  "gallery",
  "pricing",
  "privacy",
  "terms",
]);

export type ArticleAddressResult =
  | { readonly ok: true; readonly pathPrefix: string; readonly slug: string }
  | { readonly ok: false; readonly message: string };

/** What the customer typed in the Web address box, tidied and checked. `title` fills in a missing address. */
export function parseArticleAddress(raw: string, title: string): ArticleAddressResult {
  const typed = raw.trim().replace(/^\/+/, "");
  const trimmed = typed.replace(/\/+$/, "");
  // "geo/" names a prefix with the address still to come from the title; "geo" alone is an article at the root.
  const parts = trimmed === "" ? [] : typed.endsWith("/") && !trimmed.includes("/") ? [trimmed, ""] : trimmed.split("/");
  if (parts.length > 2) {
    return { ok: false, message: 'Use at most one "/", like geo/your-article, or just your-article.' };
  }

  const pathPrefix = parts.length === 2 ? slugify(parts[0] ?? "") : parts.length === 1 ? "" : DEFAULT_POST_PATH;
  const slug = slugFromInput(parts.length === 2 ? (parts[1] ?? "") : (parts[0] ?? ""), title);
  if (!slug.ok) return slug;

  if (parts.length === 2) {
    if (pathPrefix === "" || pathPrefix.length > MAX_PREFIX_LENGTH || !SEGMENT.test(pathPrefix)) {
      return { ok: false, message: "Use letters and numbers before the /, like geo/your-article." };
    }
    if (RESERVED_PREFIXES.has(pathPrefix)) {
      return { ok: false, message: `"${pathPrefix}" is already used by your website. Choose another word.` };
    }
  }
  if (pathPrefix === "" && RESERVED_ROOT_ADDRESSES.has(slug.slug)) {
    return {
      ok: false,
      message: `"${slug.slug}" is already a page on your website. Put the article under a word, like tips/${slug.slug}.`,
    };
  }
  return { ok: true, pathPrefix, slug: slug.slug };
}

/** A stored prefix as it should be used: "blog" when never chosen or no longer valid, "" for the root. */
export function storedPostPath(value: unknown): string {
  if (value === "") return "";
  if (typeof value !== "string") return DEFAULT_POST_PATH;
  return value.length <= MAX_PREFIX_LENGTH && SEGMENT.test(value) && !RESERVED_PREFIXES.has(value)
    ? value
    : DEFAULT_POST_PATH;
}

/** The address as the customer writes it in the box: "geo/article-1", or "article-1" at the root. */
export function formatArticleAddress(pathPrefix: string, slug: string): string {
  return pathPrefix === "" ? slug : `${pathPrefix}/${slug}`;
}
