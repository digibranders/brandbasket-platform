import type { BlogPostFields } from "@/app/app-host/(protected)/content/blog/actions";
import type { BlogPost } from "@/lib/server/blog";
import { formatArticleAddress } from "./post-path";

/**
 * What the post editor holds while the customer works: every field except the body, which the editor keeps itself.
 * Pure, so the rules about "Auto" search fields and publish dates are tested without a browser.
 */

export interface EditorFields {
  readonly title: string;
  readonly excerpt: string;
  readonly categoryId: string;
  readonly authorId: string;
  /** "Auto" on means the search title follows the post title (stored as blank). */
  readonly metaTitleAuto: boolean;
  readonly metaTitle: string;
  readonly metaDescriptionAuto: boolean;
  readonly metaDescription: string;
  /** "Hide from Google": asks search engines to leave the post out. */
  readonly noIndex: boolean;
  readonly address: string;
  readonly coverImageAlt: string;
  /** A `<input type="datetime-local">` value in the browser's own time zone, or "" for none. */
  readonly publishedAtLocal: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** An instant as a datetime-local value in this browser's time zone ("2026-09-30T14:05"), or "" for none. */
export function toLocalInputValue(time: number | null): string {
  if (time === null) return "";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local value, read in this browser's time zone, as an ISO instant; "" stays "". Anything unreadable is
 * passed through unchanged so the server refuses it with a message. */
export function fromLocalInputValue(value: string): string {
  if (value.trim() === "") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function fieldsFromPost(post: BlogPost): EditorFields {
  return {
    title: post.title,
    excerpt: post.excerpt ?? "",
    categoryId: post.categoryId ?? "",
    authorId: post.authorId ?? "",
    metaTitleAuto: post.metaTitle === null,
    metaTitle: post.metaTitle ?? "",
    metaDescriptionAuto: post.metaDescription === null,
    metaDescription: post.metaDescription ?? "",
    noIndex: post.noIndex,
    address: formatArticleAddress(post.pathPrefix, post.slug),
    coverImageAlt: post.coverImageAlt,
    publishedAtLocal: toLocalInputValue(post.publishedAt),
  };
}

/** What Save sends. A search field left on "Auto" is sent blank, which the site resolves to its default. */
export function toBlogPostFields(fields: EditorFields, bodyJson: string): BlogPostFields {
  return {
    title: fields.title,
    excerpt: fields.excerpt,
    bodyJson,
    categoryId: fields.categoryId,
    authorId: fields.authorId,
    metaTitle: fields.metaTitleAuto ? "" : fields.metaTitle,
    metaDescription: fields.metaDescriptionAuto ? "" : fields.metaDescription,
    noIndex: fields.noIndex,
    address: fields.address,
    coverImageAlt: fields.coverImageAlt,
    publishedAt: fromLocalInputValue(fields.publishedAtLocal),
  };
}

export function sameFields(a: EditorFields, b: EditorFields): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
