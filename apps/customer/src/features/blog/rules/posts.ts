import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { cleanLine, cleanMultiline } from "@brandbasket/shared/lib/validation/text";
import { formatArticleAddress, parseArticleAddress } from "./address";
import { META_DESCRIPTION_MAX_LENGTH } from "./seo";
import type { Cleaned } from "./taxonomy";

/**
 * Posts: where one stands, what the editor holds, what Save accepts, and the post allowance. Ported from apps/platform
 * lib/blog-publish-state.ts, lib/blog-editor-fields.ts, the checks in content/blog/actions.ts and lib/server/blog-allowance.ts.
 */

/**
 * Where a post stands. A published post whose publish date is still ahead is "scheduled": the platform's site API leaves it
 * out until that moment, so it goes live on its own.
 */
export type BlogPublishState = "draft" | "scheduled" | "published";

export function blogPublishState(status: "draft" | "published", publishedAt: number | null, now: number): BlogPublishState {
  if (status === "draft") return "draft";
  return publishedAt !== null && publishedAt > now ? "scheduled" : "published";
}

export const PUBLISH_STATE_LABELS: Readonly<Record<BlogPublishState, string>> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
};

export interface BlogImage {
  readonly id: string;
  /** This app's tenant-checked media route. */
  readonly url: string;
}

export interface BlogPostSummary {
  readonly id: string;
  readonly title: string;
  readonly status: "draft" | "published";
  readonly updatedAt: number;
  readonly publishedAt: number | null;
  readonly categoryName: string | null;
  readonly authorName: string | null;
  readonly publishState: BlogPublishState;
}

export interface BlogPost extends BlogPostSummary {
  readonly slug: string;
  readonly excerpt: string | null;
  /** A Lexical document, or null for a post with no body yet. Opaque here: only the editor reads its structure. */
  readonly body: unknown;
  readonly coverImage: BlogImage | null;
  /** Blank when none has been written. */
  readonly coverImageAlt: string;
  readonly categoryId: string | null;
  readonly authorId: string | null;
  /** Null when blank: the site falls back to the default (rules/seo.ts). */
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly noIndex: boolean;
  /** Where the article lives on the website: "blog" gives /blog/<slug>, "" gives /<slug>. */
  readonly pathPrefix: string;
}

/** Everything the editor saves in one go. `categoryId` and `authorId` are "" for none. */
export interface BlogPostFields {
  readonly title: string;
  readonly excerpt: string;
  readonly bodyJson: string;
  readonly categoryId: string;
  readonly authorId: string;
  /** Blank means Auto: the site uses the post title. */
  readonly metaTitle: string;
  /** Blank means Auto: the summary, else the start of the post. */
  readonly metaDescription: string;
  readonly noIndex: boolean;
  /** The Web address box as typed: "geo/article-1", "article-1" (the root of the site), or "" for blog/<from the title>. */
  readonly address: string;
  readonly coverImageAlt: string;
  /** An ISO instant, or "" for none yet: publishing then uses the moment it is published. A date ahead schedules it. */
  readonly publishedAt: string;
}

/** What the editor's buttons ask for: keep the status, or also publish or unpublish, in the same write. */
export type BlogSaveIntent = "save" | "publish" | "unpublish";

/** What the editor holds while the customer works: every field except the body, which the Lexical editor keeps itself. */
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
  /** An `<input type="datetime-local">` value in the browser's own time zone, or "" for none. */
  readonly publishedAtLocal: string;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** An instant as a datetime-local value in this browser's time zone ("2026-09-30T14:05"), or "" for none. */
export function toLocalInputValue(time: number | null): string {
  if (time === null) return "";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local value, read in this browser's time zone, as an ISO instant; "" stays "". Anything unreadable passes
 * through unchanged so the server refuses it with a message. */
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

export const POST_TITLE_MAX_LENGTH = 200;
export const POST_EXCERPT_MAX_LENGTH = 400;
/** A search title longer than Google shows is allowed (the editor warns past META_TITLE_MAX_LENGTH), not unbounded. */
export const POST_META_TITLE_MAX_LENGTH = 200;
/** Alt text is a sentence, not an essay. */
export const COVER_ALT_MAX_LENGTH = 250;
/** A real post's Lexical document is a few KB; this is a ceiling against an abusive payload, not a realistic length. */
export const BODY_JSON_MAX_LENGTH = 200_000;

export const TITLE_MISSING_MESSAGE = "Give the post a title.";
export const EDITOR_BROKEN_MESSAGE = "Something went wrong with the editor. Reload the page and try again.";

/** A post's fields cleaned and checked, ready to write once the address, category and author are confirmed free and owned. */
export interface CleanPost {
  readonly title: string;
  readonly excerpt: string | null;
  readonly body: object;
  readonly categoryId: string;
  readonly authorId: string;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly noIndex: boolean;
  readonly coverImageAlt: string | null;
  readonly pathPrefix: string;
  readonly slug: string;
  /** The typed publish date as an ISO instant, or null for none. */
  readonly publishedAt: string | null;
}

const blankAsNull = (value: string): string | null => (value === "" ? null : value);

/** Save's checks, in the old order: title, address, date, body. Blank search fields are stored as null. */
export function cleanPostFields(fields: BlogPostFields): Cleaned<CleanPost> {
  const title = cleanLine(fields.title).slice(0, POST_TITLE_MAX_LENGTH);
  if (title === "") return { ok: false, field: "title", message: TITLE_MISSING_MESSAGE };
  const address = parseArticleAddress(fields.address, title);
  if (!address.ok) return { ok: false, field: "address", message: address.message };

  let publishedAt: string | null = null;
  if (fields.publishedAt.trim() !== "") {
    const time = new Date(fields.publishedAt.trim()).getTime();
    if (Number.isNaN(time)) return { ok: false, field: "publishedAt", message: "That publish date isn't a real date. Pick it again." };
    publishedAt = new Date(time).toISOString();
  }

  if (fields.bodyJson.length > BODY_JSON_MAX_LENGTH) return { ok: false, field: "body", message: "That post is too long. Trim it and try again." };
  let body: unknown;
  try {
    body = JSON.parse(fields.bodyJson);
  } catch {
    return { ok: false, field: "body", message: EDITOR_BROKEN_MESSAGE };
  }
  if (typeof body !== "object" || body === null || !("root" in body)) return { ok: false, field: "body", message: EDITOR_BROKEN_MESSAGE };

  return {
    ok: true,
    value: {
      title,
      excerpt: blankAsNull(cleanMultiline(fields.excerpt).slice(0, POST_EXCERPT_MAX_LENGTH)),
      body,
      categoryId: fields.categoryId,
      authorId: fields.authorId,
      metaTitle: blankAsNull(cleanLine(fields.metaTitle).slice(0, POST_META_TITLE_MAX_LENGTH)),
      metaDescription: blankAsNull(cleanMultiline(fields.metaDescription).slice(0, META_DESCRIPTION_MAX_LENGTH)),
      noIndex: fields.noIndex,
      coverImageAlt: blankAsNull(cleanLine(fields.coverImageAlt).slice(0, COVER_ALT_MAX_LENGTH)),
      pathPrefix: address.pathPrefix,
      slug: address.slug,
      publishedAt,
    },
  };
}

/**
 * The status and publish date one save writes. Publishing uses the typed date, else the one the post already had, else
 * now; a date ahead makes the post scheduled. A draft keeps whatever is typed (or none). Clearing the date of a published
 * post keeps its date.
 */
export function publishOutcome(
  intent: BlogSaveIntent,
  current: { readonly status: "draft" | "published"; readonly publishedAt: string | null },
  typedPublishedAt: string | null,
  now: Date,
): { readonly status: "draft" | "published"; readonly publishedAt: string | null } {
  const status = intent === "publish" ? "published" : intent === "unpublish" ? "draft" : current.status;
  const publishedAt = status === "published" ? (typedPublishedAt ?? current.publishedAt ?? now.toISOString()) : typedPublishedAt;
  return { status, publishedAt };
}

/** A copy's title: the original's with " (copy)", within the title limit. */
export function copyTitle(original: unknown): string {
  return `${typeof original === "string" ? original : "Untitled"} (copy)`.slice(0, POST_TITLE_MAX_LENGTH);
}

/** How many posts the business has, how many it may have, and what the next block of posts costs. */
export interface BlogUsage {
  /** Every post counts, drafts included; a deleted post frees its slot. */
  readonly used: number;
  readonly allowance: number;
  /** Posts in the next block and its price (GST included for rupees), in minor units of the plan's currency. */
  readonly nextBlock: { readonly posts: number; readonly amountCents: number; readonly currency: MoneyCurrency };
}

/** True when the customer may not create another post until they unlock more. No plan means no limit is applied. */
export function isAtBlogLimit(usage: BlogUsage | null): boolean {
  return usage !== null && usage.used >= usage.allowance;
}

/** What creating or duplicating a post answers at the limit. */
export function blogLimitMessage(usage: BlogUsage): string {
  return `You've used all ${usage.allowance} of your blog posts. Unlock ${usage.nextBlock.posts} more from your blog page.`;
}
