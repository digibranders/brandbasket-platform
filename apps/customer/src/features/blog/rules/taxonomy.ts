import { cleanLine } from "@brandbasket/shared/lib/validation/text";
import { MAX_SLUG_LENGTH, slugify } from "./address";
import { META_DESCRIPTION_MAX_LENGTH } from "./seo";

/**
 * What the author and category editors save, and the rules they are cleaned by before anything is written. Ported from
 * apps/platform lib/author-links.ts, lib/blog-author-fields.ts and lib/blog-category-fields.ts. Whether a category name or
 * address is free is the caller's check: it needs the business's other categories.
 */

/** An author's own website and four social profiles. Client sites print them as links, so only http(s) is ever stored. */
export const AUTHOR_LINK_KINDS = ["website", "instagram", "facebook", "linkedin", "x"] as const;

export type AuthorLinkKind = (typeof AUTHOR_LINK_KINDS)[number];

export type AuthorLinks = Readonly<Record<AuthorLinkKind, string | null>>;

export const AUTHOR_LINK_LABELS: Readonly<Record<AuthorLinkKind, string>> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
};

const MAX_LINK_LENGTH = 300;

export type AuthorLinkResult = { readonly ok: true; readonly value: string | null } | { readonly ok: false };

/**
 * "" is no link; anything else must read as a web address with a dot in its host. People paste these in every shape
 * ("instagram.com/asha", "www.x.com/asha", a full https link), so a missing scheme is added rather than refused.
 */
export function parseAuthorLink(raw: string): AuthorLinkResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > MAX_LINK_LENGTH || /\s/.test(trimmed)) return { ok: false };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false };
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname.includes(".")) return { ok: false };
  return { ok: true, value: url.href };
}

export const AUTHOR_NAME_MAX_LENGTH = 60;
export const AUTHOR_ROLE_MAX_LENGTH = 80;
export const AUTHOR_BIO_MAX_LENGTH = 160;

export interface BlogAuthorFields {
  readonly name: string;
  readonly role: string;
  readonly bio: string;
  readonly links: Readonly<Record<AuthorLinkKind, string>>;
}

export interface CleanBlogAuthor {
  readonly name: string;
  readonly role: string | null;
  readonly bio: string | null;
  readonly links: AuthorLinks;
}

/** A refusal names the field it is about, so the form can show it under that field. */
export type Cleaned<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly field: string; readonly message: string };

/** One line, inner runs of whitespace collapsed, capped. */
function oneLine(raw: string, max: number): string {
  return cleanLine(raw).replace(/\s+/g, " ").slice(0, max).trim();
}

function blankAsNull(value: string): string | null {
  return value === "" ? null : value;
}

export function cleanBlogAuthorFields(fields: BlogAuthorFields): Cleaned<CleanBlogAuthor> {
  const name = oneLine(fields.name, AUTHOR_NAME_MAX_LENGTH);
  if (name === "") return { ok: false, field: "name", message: "Give the author a name." };
  const links: Partial<Record<AuthorLinkKind, string | null>> = {};
  for (const kind of AUTHOR_LINK_KINDS) {
    const parsed = parseAuthorLink(fields.links[kind]);
    if (!parsed.ok) return { ok: false, field: kind, message: `The ${AUTHOR_LINK_LABELS[kind]} link isn't a web address. Paste the full link.` };
    links[kind] = parsed.value;
  }
  return {
    ok: true,
    value: {
      name,
      role: blankAsNull(oneLine(fields.role, AUTHOR_ROLE_MAX_LENGTH)),
      bio: blankAsNull(oneLine(fields.bio, AUTHOR_BIO_MAX_LENGTH)),
      links: links as AuthorLinks,
    },
  };
}

export const CATEGORY_NAME_MAX_LENGTH = 60;
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 300;
/** Longer than Google shows (the editor warns), not unbounded. */
const CATEGORY_META_TITLE_MAX_LENGTH = 200;

export interface BlogCategoryFields {
  readonly name: string;
  readonly description: string;
  /** On: the address follows the name. Off: `slug` is the address as typed. */
  readonly slugAuto: boolean;
  readonly slug: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
}

export interface CleanBlogCategory {
  readonly name: string;
  readonly description: string | null;
  /** The address wanted, before checking it is free. */
  readonly slug: string;
  /** Whether the customer chose the address: a taken one is then refused, not renumbered. */
  readonly slugTyped: boolean;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
}

export function cleanBlogCategoryFields(fields: BlogCategoryFields): Cleaned<CleanBlogCategory> {
  const name = oneLine(fields.name, CATEGORY_NAME_MAX_LENGTH);
  if (name === "") return { ok: false, field: "name", message: "Give the category a name." };
  const slugTyped = !fields.slugAuto && fields.slug.trim() !== "";
  const slug = slugify(slugTyped ? fields.slug : name)
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
  if (slug === "") {
    return slugTyped
      ? { ok: false, field: "slug", message: "Use some letters or numbers in the address." }
      : { ok: false, field: "name", message: "Use some letters or numbers in the name." };
  }
  return {
    ok: true,
    value: {
      name,
      description: blankAsNull(oneLine(fields.description, CATEGORY_DESCRIPTION_MAX_LENGTH)),
      slug,
      slugTyped,
      metaTitle: blankAsNull(oneLine(fields.metaTitle, CATEGORY_META_TITLE_MAX_LENGTH)),
      metaDescription: blankAsNull(oneLine(fields.metaDescription, META_DESCRIPTION_MAX_LENGTH)),
    },
  };
}

/** Whether a stored address is the one "Auto" would give this name (allowing the -2, -3 a clash adds). */
export function slugFollowsName(slug: string, name: string): boolean {
  const base = slugify(name);
  return base !== "" && (slug === base || new RegExp(`^${base}-\\d+$`).test(slug));
}

/** Two names are the same category whatever their case. */
export function sameName(stored: unknown, name: string): boolean {
  return typeof stored === "string" && stored.toLocaleLowerCase() === name.toLocaleLowerCase();
}
