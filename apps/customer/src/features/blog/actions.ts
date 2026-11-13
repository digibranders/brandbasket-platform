"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import { cleanLine } from "@brandbasket/shared/lib/validation/text";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { chargeNoticeHref, chargePayPath } from "@/features/checkout/rules/charge-notices";
import { startCustomerChargePayment } from "@/features/checkout/server/charges";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { formDataObject } from "@/lib/form";
import { firstUnusedSlug, isSlugTaken, slugify, withPreviousSlug } from "./rules/address";
import { EMPTY_BODY } from "./rules/body";
import { POST_GONE_MESSAGE, POST_SLUG_TAKEN_MESSAGE, RELATION_GONE_MESSAGE, TITLE_NO_ADDRESS_MESSAGE } from "./rules/messages";
import { BLOG_PATH, postPath, relationId } from "./rules/paths";
import {
  blogLimitMessage,
  cleanPostFields,
  copyTitle,
  EDITOR_BROKEN_MESSAGE,
  isAtBlogLimit,
  POST_TITLE_MAX_LENGTH,
  publishOutcome,
  TITLE_MISSING_MESSAGE,
  type BlogPostFields,
  type BlogSaveIntent,
} from "./rules/posts";
import { cleanBlogAuthorFields, cleanBlogCategoryFields, sameName } from "./rules/taxonomy";
import { blogWrite, blogWriter, DocId, isRefusal } from "./server/access";
import { getBlogPayload } from "./server/payload";
import {
  businessPostAddresses,
  listTaxonomyDocs,
  ownedOrNull,
  requireOwnedBlogPost,
  requireOwnedTaxonomyDoc,
  unusedPostSlug,
  type TaxonomyCollection,
  type TaxonomyOption,
} from "./server/store";
import { openBlogUnlock } from "./server/unlock";
import { getBlogUsage } from "./server/usage";

/*
 * The post list and the post editor. Ported from apps/platform app/app-host/(protected)/content/blog/actions.ts and
 * taxonomy-actions.ts. The business always comes from the session; every client-supplied post, category and author id is
 * checked against it before anything is written, and a missing id and another business's id get the same answer.
 */

const TitleForm = z.object({ title: z.string().max(2_000).default("") });

/** Creates a bare draft from a title and opens it. The allowance is checked here, not only by hiding the button. */
export async function createPostAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const parsed = TitleForm.safeParse(formDataObject(formData));
  if (!parsed.success) return actionFail(TITLE_MISSING_MESSAGE, { title: TITLE_MISSING_MESSAGE });
  const title = cleanLine(parsed.data.title).slice(0, POST_TITLE_MAX_LENGTH);
  if (title === "") return actionFail(TITLE_MISSING_MESSAGE, { title: TITLE_MISSING_MESSAGE });
  const slug = slugify(title);
  if (slug === "") return actionFail(TITLE_NO_ADDRESS_MESSAGE, { title: TITLE_NO_ADDRESS_MESSAGE });

  return blogWrite("blog.post.create", async () => {
    const payload = await getBlogPayload();
    // Two creates in the same instant could each see one slot left; the allowance can then be passed by one post, which is
    // not worth a lock across two databases (posts live in Payload's, charges in ours).
    const usage = await getBlogUsage(payload, customer);
    if (usage !== null && isAtBlogLimit(usage)) return actionFail(blogLimitMessage(usage));
    const { businessId } = customer.tenant;
    const post = await payload.create({
      collection: "blogPosts",
      data: { businessId, title, slug: await unusedPostSlug(payload, businessId, slug), excerpt: null, body: EMPTY_BODY, status: "draft" },
      overrideAccess: true,
    });
    revalidatePath(BLOG_PATH);
    redirect(postPath(String(post.id)));
  });
}

/**
 * "Unlock more posts": opens (or reuses) the one open charge for the next block at the plan's price and sends the customer
 * to pay it. The posts unlock when the payment is recorded, never before. Only at the limit, so a stray post of this form
 * cannot sell a block nobody asked for.
 */
export async function unlockPostsAction(): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const plan = customer.billing.plan;
  const usage = await getBlogUsage(await getBlogPayload(), customer);
  if (plan === null || !isAtBlogLimit(usage)) redirect(BLOG_PATH);
  const charge = await openBlogUnlock(customer.tenant, plan);
  const started = await startCustomerChargePayment(customer, charge.id);
  switch (started.kind) {
    case "not-found":
      notFound();
    case "not-open":
      redirect(chargeNoticeHref("not-open"));
    case "redirect":
      redirect(started.url);
    case "razorpay":
      redirect(chargePayPath(started.charge.id));
    default: {
      const unhandled: never = started;
      throw new Error(`Unhandled charge payment start: ${JSON.stringify(unhandled)}`);
    }
  }
}

const RelationId = z.union([z.literal(""), DocId]);
const PostFieldsSchema = z.object({
  title: z.string().max(2_000),
  excerpt: z.string().max(5_000),
  bodyJson: z.string(),
  categoryId: RelationId,
  authorId: RelationId,
  metaTitle: z.string().max(2_000),
  metaDescription: z.string().max(5_000),
  noIndex: z.boolean(),
  address: z.string().max(500),
  coverImageAlt: z.string().max(2_000),
  publishedAt: z.string().max(100),
}) satisfies z.ZodType<BlogPostFields>;
const SaveInput = z.object({ postId: DocId, fields: PostFieldsSchema, intent: z.enum(["save", "publish", "unpublish"]) });

/** "" is none; any other id must be this business's own, or null comes back as "gone". */
async function ownedRelation(collection: TaxonomyCollection, id: string, businessId: string): Promise<number | null | "gone"> {
  if (id === "") return null;
  const owned = await ownedOrNull(async () => requireOwnedTaxonomyDoc(await getBlogPayload(), collection, id, businessId));
  return owned === null ? "gone" : relationId(id);
}

/**
 * Saves the whole editor, and with `intent` also publishes or unpublishes in the same write, so Publish never publishes an
 * older version than the one on screen. Changing the address keeps the old one: client sites redirect it to the new one.
 */
export async function savePostAction(postId: string, fields: BlogPostFields, intent: BlogSaveIntent): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const input = SaveInput.safeParse({ postId, fields, intent });
  if (!input.success) return actionFail(EDITOR_BROKEN_MESSAGE);
  const cleaned = cleanPostFields(input.data.fields);
  if (!cleaned.ok) return actionFail(cleaned.message, { [cleaned.field]: cleaned.message });
  const post = cleaned.value;
  const { businessId } = customer.tenant;

  return blogWrite("blog.post.save", async () => {
    const payload = await getBlogPayload();
    const current = await ownedOrNull(() => requireOwnedBlogPost(payload, input.data.postId, businessId));
    if (current === null) return actionFail(POST_GONE_MESSAGE);

    const others = (await businessPostAddresses(payload, businessId)).filter((other) => other.id !== current.id);
    if (post.slug !== current.slug && isSlugTaken(post.slug, others)) return actionFail(POST_SLUG_TAKEN_MESSAGE, { address: POST_SLUG_TAKEN_MESSAGE });

    const category = await ownedRelation("blogCategories", post.categoryId, businessId);
    const author = await ownedRelation("blogAuthors", post.authorId, businessId);
    if (category === "gone" || author === "gone") return actionFail(RELATION_GONE_MESSAGE);

    const { status, publishedAt } = publishOutcome(input.data.intent, current, post.publishedAt, new Date());
    await payload.update({
      collection: "blogPosts",
      id: current.id,
      data: {
        title: post.title,
        excerpt: post.excerpt,
        body: post.body,
        category,
        author,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        noIndex: post.noIndex,
        coverImageAlt: post.coverImageAlt,
        status,
        publishedAt,
        pathPrefix: post.pathPrefix,
        slug: post.slug,
        previousSlugs: withPreviousSlug(current.previousSlugs, current.slug, post.slug),
      },
      overrideAccess: true,
    });
    revalidatePath(postPath(current.id));
    revalidatePath(BLOG_PATH);
  });
}

/** Takes the cover image off the post, and its alt text with it. The image itself stays in the business's uploads. */
export async function removeCoverImageAction(postId: string): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const id = DocId.safeParse(postId);
  if (!id.success) return actionFail(POST_GONE_MESSAGE);
  return blogWrite("blog.post.cover-remove", async () => {
    const payload = await getBlogPayload();
    if ((await ownedOrNull(() => requireOwnedBlogPost(payload, id.data, customer.tenant.businessId))) === null) return actionFail(POST_GONE_MESSAGE);
    await payload.update({ collection: "blogPosts", id: id.data, data: { coverImage: null, coverImageAlt: null }, overrideAccess: true });
    revalidatePath(postPath(id.data));
  });
}

/**
 * A new draft copying this post's content and settings (everything but its address history, search title, status and
 * publish date), opened straight away. Counts towards the allowance like any new post.
 */
export async function duplicatePostAction(postId: string): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const id = DocId.safeParse(postId);
  if (!id.success) return actionFail(POST_GONE_MESSAGE);
  const { businessId } = customer.tenant;
  return blogWrite("blog.post.duplicate", async () => {
    const payload = await getBlogPayload();
    const usage = await getBlogUsage(payload, customer);
    if (usage !== null && isAtBlogLimit(usage)) return actionFail(blogLimitMessage(usage));
    const source = await ownedOrNull(() => requireOwnedBlogPost(payload, id.data, businessId));
    if (source === null) return actionFail(POST_GONE_MESSAGE);
    const original = source.doc;
    const title = copyTitle(original.title);
    const created = await payload.create({
      collection: "blogPosts",
      data: {
        businessId,
        title,
        slug: await unusedPostSlug(payload, businessId, slugify(title) || "post"),
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
    revalidatePath(BLOG_PATH);
    redirect(postPath(String(created.id)));
  });
}

/** Deletes the post (its slot in the allowance is freed) and returns to the list. */
export async function deletePostAction(postId: string): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const id = DocId.safeParse(postId);
  if (!id.success) return actionFail(POST_GONE_MESSAGE);
  return blogWrite("blog.post.delete", async () => {
    const payload = await getBlogPayload();
    if ((await ownedOrNull(() => requireOwnedBlogPost(payload, id.data, customer.tenant.businessId))) === null) return actionFail(POST_GONE_MESSAGE);
    await payload.delete({ collection: "blogPosts", id: id.data, overrideAccess: true });
    revalidatePath(BLOG_PATH);
    redirect(BLOG_PATH);
  });
}

const Name = z.string().max(2_000);

/**
 * The editor's inline "New category": creates one, or returns the existing one with the same name in any case, so the
 * editor never makes a duplicate.
 */
export async function createCategoryInlineAction(rawName: string): Promise<ActionResult<TaxonomyOption>> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const name = Name.safeParse(rawName);
  const cleaned = cleanBlogCategoryFields({ name: name.success ? name.data : "", description: "", slugAuto: true, slug: "", metaTitle: "", metaDescription: "" });
  if (!cleaned.ok) return actionFail(cleaned.message);
  const { businessId } = customer.tenant;
  return blogWrite("blog.category.inline", async () => {
    const payload = await getBlogPayload();
    const others = await listTaxonomyDocs(payload, "blogCategories", businessId);
    const existing = others.find((doc) => sameName(doc.name, cleaned.value.name));
    if (existing !== undefined) return actionOk({ id: String(existing.id), name: String(existing.name) });
    const taken = new Set(others.map((doc) => doc.slug).filter((slug): slug is string => typeof slug === "string"));
    const created = await payload.create({
      collection: "blogCategories",
      data: { businessId, name: cleaned.value.name, slug: firstUnusedSlug(cleaned.value.slug, taken) },
      overrideAccess: true,
    });
    return actionOk({ id: String(created.id), name: cleaned.value.name });
  });
}

/** The editor's inline "New author": a name only, the rest is added on the Authors page. Authors may share a name. */
export async function createAuthorInlineAction(rawName: string): Promise<ActionResult<TaxonomyOption>> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const name = Name.safeParse(rawName);
  const cleaned = cleanBlogAuthorFields({ name: name.success ? name.data : "", role: "", bio: "", links: { website: "", instagram: "", facebook: "", linkedin: "", x: "" } });
  if (!cleaned.ok) return actionFail(cleaned.message);
  return blogWrite("blog.author.inline", async () => {
    const payload = await getBlogPayload();
    const created = await payload.create({ collection: "blogAuthors", data: { businessId: customer.tenant.businessId, name: cleaned.value.name }, overrideAccess: true });
    return actionOk({ id: String(created.id), name: cleaned.value.name });
  });
}
