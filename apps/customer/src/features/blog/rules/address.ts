/**
 * Web addresses for blog posts and categories. Ported from apps/platform lib/blog-slug.ts and lib/post-path.ts. Pure, so
 * the post and category actions share one definition and the editor shows the same address Save produces.
 *
 * Where one article lives on the business's own website is typed in one box: "geo/article-1" gives
 * example.com/geo/article-1, "article-1" gives example.com/article-1, and a blank box gives the default,
 * example.com/blog/<address from the title>. Stored as `pathPrefix` ("geo", "" for the root, "blog" by default) and
 * `slug`. Client sites read both with each post from the platform's /api/site/posts and redirect every other address of
 * the article to it; the client-site template re-checks what it gets with the same rules.
 */

/** "Café Specials & Offers!" becomes "cafe-specials-offers". Empty when nothing usable is left. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `base`, or the first of `base-2`, `base-3` and so on that is not in `taken`. */
export function firstUnusedSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/**
 * Addresses a client site uses for its own pages under /blog, so no post may take them: `/blog/preview` is where
 * "Preview on my website" lands, and `/blog/category/<slug>` is a category's page.
 */
export const RESERVED_SLUGS: readonly string[] = ["preview", "category"];

/** Long enough for any sensible address; longer ones are cut at a word. */
export const MAX_SLUG_LENGTH = 100;

export type SlugResult = { readonly ok: true; readonly slug: string } | { readonly ok: false; readonly message: string };

/** `slug` whole, or cut at the last "-" that fits within MAX_SLUG_LENGTH. */
function capAtWord(slug: string): string {
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  const cut = slug.slice(0, MAX_SLUG_LENGTH);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/** The address a customer typed for a post, tidied like one made from a title. Blank means "from the title". */
export function slugFromInput(raw: string, title: string): SlugResult {
  const slug = capAtWord(slugify(raw.trim() === "" ? title : raw));
  if (slug === "") return { ok: false, message: "Use some letters or numbers in the address." };
  if (RESERVED_SLUGS.includes(slug)) {
    return { ok: false, message: `"${slug}" is already used by your website. Choose another address.` };
  }
  return { ok: true, slug };
}

/** Whether another post answers at `slug`, now or through one of its earlier addresses (which redirect to it). */
export function isSlugTaken(slug: string, otherPosts: readonly { readonly slug: string; readonly previousSlugs: readonly string[] }[]): boolean {
  return otherPosts.some((post) => post.slug === slug || post.previousSlugs.includes(slug));
}

/** A post's earlier addresses after it moves from `oldSlug` to `newSlug`: each once, never the current one. */
export function withPreviousSlug(previous: readonly string[], oldSlug: string, newSlug: string): string[] {
  const all = oldSlug === newSlug ? previous : [...previous, oldSlug];
  return [...new Set(all)].filter((slug) => slug !== newSlug);
}

/** A stored list of earlier addresses, trusting only strings. */
export function slugList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((slug): slug is string => typeof slug === "string") : [];
}

const DEFAULT_POST_PATH = "blog";
const MAX_PREFIX_LENGTH = 40;
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** First words a client site already uses for its own pages under them. */
const RESERVED_PREFIXES: ReadonlySet<string> = new Set(["api", "category", "preview", "sitemap", "robots"]);

/**
 * Pages a client site has, or commonly has, at the root. An article can't take one of these names on its own; the site's
 * own page would win.
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
    return { ok: false, message: `"${slug.slug}" is already a page on your website. Put the article under a word, like tips/${slug.slug}.` };
  }
  return { ok: true, pathPrefix, slug: slug.slug };
}

/** A stored prefix as it should be used: "blog" when never chosen or no longer valid, "" for the root. */
export function storedPostPath(value: unknown): string {
  if (value === "") return "";
  if (typeof value !== "string") return DEFAULT_POST_PATH;
  return value.length <= MAX_PREFIX_LENGTH && SEGMENT.test(value) && !RESERVED_PREFIXES.has(value) ? value : DEFAULT_POST_PATH;
}

/** The address as the customer writes it in the box: "geo/article-1", or "article-1" at the root. */
export function formatArticleAddress(pathPrefix: string, slug: string): string {
  return pathPrefix === "" ? slug : `${pathPrefix}/${slug}`;
}

/**
 * The address as it will be saved, from what is typed, for showing under the box while the customer types. Ported from
 * components/panel/post-address-field.tsx; parseArticleAddress checks it on Save.
 */
export function shownAddress(value: string, title: string): string {
  const typed = value.trim().replace(/^\/+/, "");
  const trimmed = typed.replace(/\/+$/, "");
  if (trimmed === "") return `${DEFAULT_POST_PATH}/${slugify(title)}`;
  const parts = typed.endsWith("/") && !trimmed.includes("/") ? [trimmed, ""] : trimmed.split("/");
  const slug = slugify(parts[parts.length - 1] ?? "") || slugify(title);
  return parts.length >= 2 ? `${slugify(parts[0] ?? "")}/${slug}` : slug;
}

/** "https://www.asterphysio.com" becomes "asterphysio.com"; null for none or an unreadable address. */
export function siteHost(websiteUrl: string | null): string | null {
  if (websiteUrl === null) return null;
  try {
    return new URL(websiteUrl).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
