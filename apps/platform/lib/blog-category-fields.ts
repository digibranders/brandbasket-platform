import { cleanLine } from "@fynix/shared/lib/validation/text";
import { META_DESCRIPTION_MAX_LENGTH } from "./blog-seo";
import { MAX_SLUG_LENGTH, slugify } from "./blog-slug";

/**
 * What the category editor saves, and the rules it is cleaned by before anything is written. Pure, so it is tested
 * without Payload. Whether the address is free is the caller's check: it needs the business's other categories.
 */
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

export type CleanBlogCategoryResult =
  | { readonly ok: true; readonly value: CleanBlogCategory }
  | { readonly ok: false; readonly message: string };

function oneLine(raw: string, max: number): string {
  return cleanLine(raw).replace(/\s+/g, " ").slice(0, max).trim();
}

function blankAsNull(value: string): string | null {
  return value === "" ? null : value;
}

export function cleanBlogCategoryFields(fields: BlogCategoryFields): CleanBlogCategoryResult {
  const name = oneLine(fields.name, CATEGORY_NAME_MAX_LENGTH);
  if (name === "") return { ok: false, message: "Give the category a name." };
  const slugTyped = !fields.slugAuto && fields.slug.trim() !== "";
  const slug = slugify(slugTyped ? fields.slug : name).slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
  if (slug === "") {
    return { ok: false, message: slugTyped ? "Use some letters or numbers in the address." : "Use some letters or numbers in the name." };
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
