"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPayload, NotFound, type Payload } from "payload";
import { cleanLine, cleanMultiline } from "@brandbasket/shared/lib/validation/text";
import config from "@/payload.config";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { getBlogUsage, isAtBlogLimit } from "@/lib/server/blog-allowance";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { openBlogUnlock, startCustomerChargePayment } from "@/lib/server/charges";
import {
  BLOG_PAYMENT_REQUIRED_MESSAGE,
  BlogPostOwnershipError,
  requireOwnedBlogPost,
  type OwnedBlogPost,
} from "@/lib/server/blog";
import { toRelationId } from "@brandbasket/cms";
import {
  firstUnusedSlug,
  isSlugTaken,
  RESERVED_SLUGS,
  slugify,
  slugList,
  withPreviousSlug,
} from "@/lib/blog-slug";
import { META_DESCRIPTION_MAX_LENGTH } from "@/lib/blog-seo";
import { parseArticleAddress } from "@/lib/post-path";
import {
  BlogTaxonomyOwnershipError,
  requireOwnedTaxonomyDoc,
  type TaxonomyCollection,
} from "@/lib/server/blog-taxonomy";

export type BlogFormResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

const PAYMENT_REQUIRED: BlogFormResult = { ok: false, message: BLOG_PAYMENT_REQUIRED_MESSAGE };

const MAX_TITLE_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 400;
/** A search title longer than Google shows is allowed (the editor warns past META_TITLE_MAX_LENGTH), not unbounded. */
const MAX_META_TITLE_LENGTH = 200;
/** Alt text is a sentence, not an essay. */
const MAX_COVER_ALT_LENGTH = 250;
/** A serialized Lexical editor state for a real post is a few KB; this is a generous ceiling against an abusive
 * payload, not a realistic post length. */
const MAX_BODY_JSON_LENGTH = 200_000;

/** A Lexical `SerializedEditorState` with a single empty paragraph — what a brand-new post's `body` starts as,
 * matching exactly what `components/panel/rich-text-editor.tsx`'s own empty state serializes to, so the editor's
 * first render on the edit page and a freshly created post agree on what "empty" looks like. */
const EMPTY_BODY = {
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
    children: [{ type: "paragraph", format: "", indent: 0, version: 1, direction: null, children: [] }],
  },
} as const;

/** Enough for any real business's blog; past it, a post simply gets a longer numbered address. */
const MAX_SLUG_LOOKUP = 1_000;

/**
 * `base`, or the first of `base-2`, `base-3`, … that none of this business's posts uses yet. A client site finds a
 * post by its address, so two posts sharing one would make the older unreachable. Only the same business's posts
 * count: addresses are per website. Two posts created in the same instant could still collide; nothing enforces
 * uniqueness in the database yet.
 */
async function unusedSlug(payload: Payload, businessId: string, base: string): Promise<string> {
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
    ...(existing.docs as unknown as readonly { readonly businessId?: unknown; readonly slug?: unknown }[])
      .filter((doc) => doc.businessId === businessId)
      .map((doc) => doc.slug)
      .filter((slug): slug is string => typeof slug === "string"),
  ]);
  return firstUnusedSlug(base, taken);
}

/**
 * Creates a bare draft (title only — the body, excerpt and cover image are all edited afterwards on the edit page,
 * the same "create, then fill in" shape the customer-cms-ui plan's Task 5 design used) and redirects straight to
 * it. `requireBillingAccess()`'s `tenant.businessId` is the only source of the business id this ever writes.
 */
export async function createBlogPostAction(_previous: BlogFormResult, formData: FormData): Promise<BlogFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { tenant } = access;

  // Checked here, not only by hiding the button: this action can be called directly. Two creates in the same instant
  // could each see one slot left; the allowance can then be passed by one post, which is not worth a cross-database
  // lock (posts live in Payload's database, charges in ours).
  const usage = await getBlogUsage(access, access.billing.plan);
  if (usage !== null && isAtBlogLimit(usage)) {
    return {
      ok: false,
      message: `You’ve used all ${usage.allowance} of your blog posts. Unlock ${usage.nextBlock.posts} more from your blog page.`,
    };
  }

  const title = cleanLine(String(formData.get("title") ?? "")).slice(0, MAX_TITLE_LENGTH);
  if (title === "") return { ok: false, message: "Give the post a title." };
  const slug = slugify(title);
  if (slug === "") {
    return { ok: false, message: "That title doesn't make a usable web address. Try adding some letters." };
  }

  const payload = await getPayload({ config });
  const post = await payload.create({
    collection: "blogPosts",
    data: {
      businessId: tenant.businessId,
      title,
      slug: await unusedSlug(payload, tenant.businessId, slug),
      excerpt: null,
      body: EMPTY_BODY,
      status: "draft",
    },
    overrideAccess: true,
  });
  redirect(`/content/blog/${post.id}`);
}

/**
 * "Unlock more posts": opens (or reuses) the charge for the next block at the plan's price and sends the customer to
 * pay it. The posts unlock when the payment is recorded, never before. Allowed only when the customer is at their
 * limit, so a stray post of this form cannot sell a block nobody asked for.
 */
export async function unlockBlogPostsAction(): Promise<void> {
  const access = await paidCustomerOrNull();
  if (access === null) redirect("/billing");
  const plan = access.billing.plan;
  const usage = await getBlogUsage(access, plan);
  if (plan === null || !isAtBlogLimit(usage)) redirect("/content/blog");
  const charge = await openBlogUnlock(access.tenant, plan);
  redirectForChargePayment(await startCustomerChargePayment(access, charge.id));
}

/** Everything the edit form saves in one go. `categoryId` and `authorId` are "" for none. */
export interface BlogPostFields {
  readonly title: string;
  readonly excerpt: string;
  readonly bodyJson: string;
  readonly categoryId: string;
  readonly authorId: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly noIndex: boolean;
  /**
   * The Web address box as typed: "geo/article-1", "article-1" (at the root of the site), or "" for the default,
   * blog/<address from the title>. See lib/post-path.ts.
   */
  readonly address: string;
  readonly coverImageAlt: string;
  /** An ISO instant, or "" for none yet: publishing then uses the moment it is published. A date ahead schedules it. */
  readonly publishedAt: string;
}

/** What the editor's buttons ask for: keep the status, or also publish or unpublish, in the same write. */
export type BlogSaveIntent = "save" | "publish" | "unpublish";

interface OwnedDoc {
  readonly id?: unknown;
  readonly businessId?: unknown;
  readonly slug?: unknown;
  readonly previousSlugs?: unknown;
}

/** Every post of this business. `find` is filtered by the business, and the result is checked again here. */
async function businessPosts(payload: Payload, businessId: string): Promise<readonly OwnedDoc[]> {
  const result = await payload.find({
    collection: "blogPosts",
    where: { businessId: { equals: businessId } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return (result.docs as unknown as readonly OwnedDoc[]).filter((doc) => doc.businessId === businessId);
}

/** The current and earlier addresses of every other post of this business: the ones a new address may not take. */
function otherPostsSlugs(
  posts: readonly OwnedDoc[],
  postId: string,
): { readonly slug: string; readonly previousSlugs: readonly string[] }[] {
  return posts
    .filter((doc) => String(doc.id) !== postId)
    .map((doc) => ({ slug: typeof doc.slug === "string" ? doc.slug : "", previousSlugs: slugList(doc.previousSlugs) }));
}

/** "" becomes null; any other id is returned only after confirming it is this business's own. Throws
 * `BlogTaxonomyOwnershipError` or Payload's `NotFound` otherwise. */
async function ownedRelation(
  payload: Payload,
  collection: TaxonomyCollection,
  id: string,
  businessId: string,
): Promise<string | number | null> {
  if (id === "") return null;
  await requireOwnedTaxonomyDoc(payload, collection, id, businessId);
  return toRelationId(id);
}

type PublishDate = { readonly ok: true; readonly value: string | null } | { readonly ok: false };

/** "" is no date; anything else must be a real instant. */
function parsePublishDate(raw: string): PublishDate {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const time = new Date(trimmed).getTime();
  return Number.isNaN(time) ? { ok: false } : { ok: true, value: new Date(time).toISOString() };
}

const POST_GONE: BlogFormResult = { ok: false, message: "This post no longer exists. Reload the page." };

/** The caller's own post, or null when it is missing or another business's. Anything else still throws. */
async function ownedPostOrNull(payload: Payload, postId: string, businessId: string): Promise<OwnedBlogPost | null> {
  try {
    return await requireOwnedBlogPost(payload, postId, businessId);
  } catch (error) {
    if (error instanceof BlogPostOwnershipError || error instanceof NotFound) return null;
    throw error;
  }
}

/**
 * Saves the whole editor, and with `intent` also publishes or unpublishes in the same write, so "Publish" never
 * publishes an older version than the one on screen.
 *
 * `postId`, `categoryId` and `authorId` are client-supplied, and each is checked against the
 * paid session's business before anything is written — see `lib/server/blog.ts` and `lib/server/blog-taxonomy.ts`.
 * `bodyJson` is `rich-text-editor.tsx`'s current Lexical `SerializedEditorState`, parsed and sanity-checked here
 * before being written back as a plain object (Payload's Local API stores a `richText` field's value as-is; it does
 * not itself validate arbitrary client JSON against the registered node types). Blank search fields are stored as
 * null so the site API falls back to its defaults.
 *
 * Publish date: a draft keeps whatever date is typed (or none). Publishing uses the typed date, else the one the post
 * already had, else now; a date ahead makes the post scheduled. Clearing the date of a published post keeps its date.
 */
export async function updateBlogPostAction(
  postId: string,
  fields: BlogPostFields,
  intent: BlogSaveIntent = "save",
): Promise<BlogFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { tenant } = access;

  const cleanedTitle = cleanLine(fields.title).slice(0, MAX_TITLE_LENGTH);
  if (cleanedTitle === "") return { ok: false, message: "Give the post a title." };
  const cleanedExcerpt = cleanMultiline(fields.excerpt).slice(0, MAX_EXCERPT_LENGTH);
  const metaTitle = cleanLine(fields.metaTitle).slice(0, MAX_META_TITLE_LENGTH);
  const metaDescription = cleanMultiline(fields.metaDescription).slice(0, META_DESCRIPTION_MAX_LENGTH);
  const coverImageAlt = cleanLine(fields.coverImageAlt).slice(0, MAX_COVER_ALT_LENGTH);
  const address = parseArticleAddress(fields.address, cleanedTitle);
  if (!address.ok) return { ok: false, message: address.message };
  const typedDate = parsePublishDate(fields.publishedAt);
  if (!typedDate.ok) return { ok: false, message: "That publish date isn't a real date. Pick it again." };

  if (fields.bodyJson.length > MAX_BODY_JSON_LENGTH) {
    return { ok: false, message: "That post is too long. Trim it and try again." };
  }
  let body: unknown;
  try {
    body = JSON.parse(fields.bodyJson);
  } catch {
    return { ok: false, message: "Something went wrong with the editor. Reload the page and try again." };
  }
  if (typeof body !== "object" || body === null || !("root" in body)) {
    return { ok: false, message: "Something went wrong with the editor. Reload the page and try again." };
  }

  const payload = await getPayload({ config });
  const current = await ownedPostOrNull(payload, postId, tenant.businessId);
  if (current === null) return POST_GONE;

  const posts = await businessPosts(payload, tenant.businessId);
  if (address.slug !== current.slug && isSlugTaken(address.slug, otherPostsSlugs(posts, String(current.id)))) {
    return { ok: false, message: "Another of your posts already uses this address. Choose another." };
  }

  let category: string | number | null;
  let author: string | number | null;
  try {
    category = await ownedRelation(payload, "blogCategories", fields.categoryId, tenant.businessId);
    author = await ownedRelation(payload, "blogAuthors", fields.authorId, tenant.businessId);
  } catch (error) {
    if (error instanceof BlogTaxonomyOwnershipError || error instanceof NotFound) {
      return { ok: false, message: "That category or author no longer exists. Reload the page." };
    }
    throw error;
  }

  const status = intent === "publish" ? "published" : intent === "unpublish" ? "draft" : current.status;
  const publishedAt =
    status === "published"
      ? (typedDate.value ?? current.publishedAt ?? new Date().toISOString())
      : typedDate.value;

  await payload.update({
    collection: "blogPosts",
    id: postId,
    data: {
      title: cleanedTitle,
      excerpt: cleanedExcerpt === "" ? null : cleanedExcerpt,
      body,
      category,
      author,
      metaTitle: metaTitle === "" ? null : metaTitle,
      metaDescription: metaDescription === "" ? null : metaDescription,
      noIndex: fields.noIndex,
      coverImageAlt: coverImageAlt === "" ? null : coverImageAlt,
      status,
      publishedAt,
      pathPrefix: address.pathPrefix,
      slug: address.slug,
      // The old address keeps working: client sites redirect every earlier address to the current one.
      previousSlugs: withPreviousSlug(current.previousSlugs, current.slug, address.slug),
    },
    overrideAccess: true,
  });
  refresh();
  return { ok: true };
}

/**
 * Attaches a just-uploaded cover image to this post. `mediaId` is client-supplied (the id `/api/content-media-uploads`
 * just handed back) and is re-checked against `tenant.businessId` here before being attached — never assumed safe
 * just because the upload succeeded, the same discipline `content/actions.ts`'s `addToGalleryAction` applies to a
 * gallery photo.
 */
export async function setCoverImageAction(postId: string, mediaId: string): Promise<BlogFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { tenant } = access;
  const payload = await getPayload({ config });

  if ((await ownedPostOrNull(payload, postId, tenant.businessId)) === null) return POST_GONE;

  let media: { readonly id: string | number; readonly businessId?: unknown };
  try {
    media = await payload.findByID({ collection: "media", id: mediaId, depth: 0, overrideAccess: true });
  } catch {
    return { ok: false, message: "That upload could not be found. Try again." };
  }
  if (media.businessId !== tenant.businessId) {
    return { ok: false, message: "That upload could not be found. Try again." };
  }

  await payload.update({
    collection: "blogPosts",
    id: postId,
    data: { coverImage: toRelationId(mediaId) },
    overrideAccess: true,
  });
  refresh();
  return { ok: true };
}

/** Takes the cover image off the post. The image itself stays in the business's uploads. */
export async function removeCoverImageAction(postId: string): Promise<BlogFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { tenant } = access;
  const payload = await getPayload({ config });
  if ((await ownedPostOrNull(payload, postId, tenant.businessId)) === null) return POST_GONE;
  await payload.update({
    collection: "blogPosts",
    id: postId,
    data: { coverImage: null, coverImageAlt: null },
    overrideAccess: true,
  });
  refresh();
  return { ok: true };
}

/**
 * A new draft copying this post's content and settings — everything but its address history, status and publish
 * date — and opens it. Counts towards the post allowance like any new post.
 */
export async function duplicateBlogPostAction(postId: string): Promise<BlogFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { tenant } = access;

  const usage = await getBlogUsage(access, access.billing.plan);
  if (usage !== null && isAtBlogLimit(usage)) {
    return {
      ok: false,
      message: `You’ve used all ${usage.allowance} of your blog posts. Unlock ${usage.nextBlock.posts} more from your blog page.`,
    };
  }

  const payload = await getPayload({ config });
  const source = await ownedPostOrNull(payload, postId, tenant.businessId);
  if (source === null) return POST_GONE;

  const original = source.doc;
  const title = `${typeof original.title === "string" ? original.title : "Untitled"} (copy)`.slice(0, MAX_TITLE_LENGTH);
  const created = await payload.create({
    collection: "blogPosts",
    data: {
      businessId: tenant.businessId,
      title,
      slug: await unusedSlug(payload, tenant.businessId, slugify(title) || "post"),
      excerpt: original.excerpt ?? null,
      body: original.body ?? EMPTY_BODY,
      coverImage: original.coverImage ?? null,
      coverImageAlt: original.coverImageAlt ?? null,
      pathPrefix: original.pathPrefix ?? null,
      category: original.category ?? null,
      author: original.author ?? null,
      metaTitle: null,
      metaDescription: original.metaDescription ?? null,
      noIndex: original.noIndex === true,
      status: "draft",
    },
    overrideAccess: true,
  });
  redirect(`/content/blog/${String(created.id)}`);
}

/** An unpaid business gets `PAYMENT_REQUIRED` back for the edit form to show. Ownership failure still propagates
 * uncaught: a post id naming another business's post is tampering, not something to explain to the caller. Keeps a
 * publish date the post already has (a scheduled post stays scheduled). */
export async function publishBlogPostAction(postId: string): Promise<BlogFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { tenant } = access;
  const payload = await getPayload({ config });
  const current = await requireOwnedBlogPost(payload, postId, tenant.businessId);
  await payload.update({
    collection: "blogPosts",
    id: postId,
    data: { status: "published", publishedAt: current.publishedAt ?? new Date().toISOString() },
    overrideAccess: true,
  });
  refresh();
  return { ok: true };
}

export async function unpublishBlogPostAction(postId: string): Promise<BlogFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { tenant } = access;
  const payload = await getPayload({ config });
  await requireOwnedBlogPost(payload, postId, tenant.businessId);
  await payload.update({
    collection: "blogPosts",
    id: postId,
    data: { status: "draft" },
    overrideAccess: true,
  });
  refresh();
  return { ok: true };
}

export async function deleteBlogPostAction(postId: string): Promise<BlogFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { tenant } = access;
  const payload = await getPayload({ config });
  await requireOwnedBlogPost(payload, postId, tenant.businessId);
  await payload.delete({ collection: "blogPosts", id: postId, overrideAccess: true });
  redirect("/content/blog");
}
