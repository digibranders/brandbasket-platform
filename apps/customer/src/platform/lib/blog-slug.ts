/**
 * Web addresses for blog posts and categories. Pure, so the post and category actions share one definition and it
 * is tested without Payload.
 */

/** "Café Specials & Offers!" → "cafe-specials-offers". Empty when nothing usable is left. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `base`, or the first of `base-2`, `base-3`, … not in `taken`. */
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
export function isSlugTaken(
  slug: string,
  otherPosts: readonly { readonly slug: string; readonly previousSlugs: readonly string[] }[],
): boolean {
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
