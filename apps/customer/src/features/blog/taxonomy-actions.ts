"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionFail, type ActionResult } from "@/lib/action-result";
import { formDataObject } from "@/lib/form";
import { firstUnusedSlug } from "./rules/address";
import { AUTHOR_GONE_MESSAGE, CATEGORY_GONE_MESSAGE, CATEGORY_SLUG_TAKEN_MESSAGE, categoryNameTakenMessage } from "./rules/messages";
import { authorPath, BLOG_AUTHORS_PATH, BLOG_CATEGORIES_PATH, categoryPath } from "./rules/paths";
import { AUTHOR_LINK_KINDS, cleanBlogAuthorFields, cleanBlogCategoryFields, sameName, type BlogAuthorFields, type BlogCategoryFields } from "./rules/taxonomy";
import { blogWrite, blogWriter, DocId, isRefusal } from "./server/access";
import { getBlogPayload } from "./server/payload";
import { listTaxonomyDocs, ownedOrNull, requireOwnedTaxonomyDoc } from "./server/store";

/*
 * The Authors and Categories pages: create, edit and delete. Ported from apps/platform content/authors/actions.ts and
 * content/categories/actions.ts. The business comes from the session; every client-supplied id is checked against it.
 * Deleting an author or a category keeps their posts (the relation is set to none).
 */

const NO_LINKS = { website: "", instagram: "", facebook: "", linkedin: "", x: "" };
const NameForm = z.object({ name: z.string().max(2_000).default("") });
const Text = z.string().max(2_000);

const AuthorFieldsSchema = z.object({
  name: Text,
  role: Text,
  bio: Text,
  links: z.object(Object.fromEntries(AUTHOR_LINK_KINDS.map((kind) => [kind, Text])) as Record<(typeof AUTHOR_LINK_KINDS)[number], typeof Text>),
}) satisfies z.ZodType<BlogAuthorFields>;

const CategoryFieldsSchema = z.object({
  name: Text,
  description: Text,
  slugAuto: z.boolean(),
  slug: Text,
  metaTitle: Text,
  metaDescription: Text,
}) satisfies z.ZodType<BlogCategoryFields>;

const BROKEN_FORM_MESSAGE = "Something went wrong with the form. Reload the page and try again.";

function ownsAuthor(authorId: string, businessId: string): Promise<boolean> {
  return ownedOrNull(async () => requireOwnedTaxonomyDoc(await getBlogPayload(), "blogAuthors", authorId, businessId)).then((doc) => doc !== null);
}

/** "New author": a name is enough to start; their own page opens straight after for the rest. */
export async function createAuthorAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const parsed = NameForm.safeParse(formDataObject(formData));
  const cleaned = cleanBlogAuthorFields({ name: parsed.success ? parsed.data.name : "", role: "", bio: "", links: NO_LINKS });
  if (!cleaned.ok) return actionFail(cleaned.message, { [cleaned.field]: cleaned.message });
  return blogWrite("blog.author.create", async () => {
    const payload = await getBlogPayload();
    const created = await payload.create({ collection: "blogAuthors", data: { businessId: customer.tenant.businessId, name: cleaned.value.name }, overrideAccess: true });
    revalidatePath(BLOG_AUTHORS_PATH);
    redirect(authorPath(String(created.id)));
  });
}

export async function saveAuthorAction(authorId: string, fields: BlogAuthorFields): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const input = z.object({ authorId: DocId, fields: AuthorFieldsSchema }).safeParse({ authorId, fields });
  if (!input.success) return actionFail(BROKEN_FORM_MESSAGE);
  const cleaned = cleanBlogAuthorFields(input.data.fields);
  if (!cleaned.ok) return actionFail(cleaned.message, { [cleaned.field]: cleaned.message });
  return blogWrite("blog.author.save", async () => {
    if (!(await ownsAuthor(input.data.authorId, customer.tenant.businessId))) return actionFail(AUTHOR_GONE_MESSAGE);
    const { name, role, bio, links } = cleaned.value;
    await (await getBlogPayload()).update({ collection: "blogAuthors", id: input.data.authorId, data: { name, role, bio, ...links }, overrideAccess: true });
    revalidatePath(authorPath(input.data.authorId));
    revalidatePath(BLOG_AUTHORS_PATH);
  });
}

/** Takes the photo off the author. The image stays in the business's uploads. */
export async function removeAuthorPhotoAction(authorId: string): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const id = DocId.safeParse(authorId);
  if (!id.success) return actionFail(AUTHOR_GONE_MESSAGE);
  return blogWrite("blog.author.photo-remove", async () => {
    if (!(await ownsAuthor(id.data, customer.tenant.businessId))) return actionFail(AUTHOR_GONE_MESSAGE);
    await (await getBlogPayload()).update({ collection: "blogAuthors", id: id.data, data: { photo: null }, overrideAccess: true });
    revalidatePath(authorPath(id.data));
  });
}

export async function deleteAuthorAction(authorId: string): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const id = DocId.safeParse(authorId);
  if (!id.success) return actionFail(AUTHOR_GONE_MESSAGE);
  return blogWrite("blog.author.delete", async () => {
    if (!(await ownsAuthor(id.data, customer.tenant.businessId))) return actionFail(AUTHOR_GONE_MESSAGE);
    await (await getBlogPayload()).delete({ collection: "blogAuthors", id: id.data, overrideAccess: true });
    revalidatePath(BLOG_AUTHORS_PATH);
    redirect(BLOG_AUTHORS_PATH);
  });
}

/** "New category": a name is enough to start; its own page opens straight after. Names are unique whatever their case. */
export async function createCategoryAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const parsed = NameForm.safeParse(formDataObject(formData));
  const cleaned = cleanBlogCategoryFields({ name: parsed.success ? parsed.data.name : "", description: "", slugAuto: true, slug: "", metaTitle: "", metaDescription: "" });
  if (!cleaned.ok) return actionFail(cleaned.message, { name: cleaned.message });
  const { businessId } = customer.tenant;
  return blogWrite("blog.category.create", async () => {
    const payload = await getBlogPayload();
    const others = await listTaxonomyDocs(payload, "blogCategories", businessId);
    const clash = others.find((doc) => sameName(doc.name, cleaned.value.name));
    if (clash !== undefined) {
      const message = categoryNameTakenMessage(String(clash.name));
      return actionFail(message, { name: message });
    }
    const taken = new Set(others.map((doc) => doc.slug).filter((slug): slug is string => typeof slug === "string"));
    const created = await payload.create({
      collection: "blogCategories",
      data: { businessId, name: cleaned.value.name, slug: firstUnusedSlug(cleaned.value.slug, taken) },
      overrideAccess: true,
    });
    revalidatePath(BLOG_CATEGORIES_PATH);
    redirect(categoryPath(String(created.id)));
  });
}

/**
 * Saves a category. With Auto on, the address follows the name (numbered if another category has it); a typed address that
 * another category uses is refused instead. Categories keep no earlier addresses: the old address stops working.
 */
export async function saveCategoryAction(categoryId: string, fields: BlogCategoryFields): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const input = z.object({ categoryId: DocId, fields: CategoryFieldsSchema }).safeParse({ categoryId, fields });
  if (!input.success) return actionFail(BROKEN_FORM_MESSAGE);
  const cleaned = cleanBlogCategoryFields(input.data.fields);
  if (!cleaned.ok) return actionFail(cleaned.message, { [cleaned.field]: cleaned.message });
  const { name, description, slug, slugTyped, metaTitle, metaDescription } = cleaned.value;
  const id = input.data.categoryId;
  const { businessId } = customer.tenant;
  return blogWrite("blog.category.save", async () => {
    const payload = await getBlogPayload();
    if ((await ownedOrNull(() => requireOwnedTaxonomyDoc(payload, "blogCategories", id, businessId))) === null) return actionFail(CATEGORY_GONE_MESSAGE);
    const others = (await listTaxonomyDocs(payload, "blogCategories", businessId)).filter((doc) => String(doc.id) !== id);
    const clash = others.find((doc) => sameName(doc.name, name));
    if (clash !== undefined) {
      const message = categoryNameTakenMessage(String(clash.name));
      return actionFail(message, { name: message });
    }
    const taken = new Set(others.map((doc) => doc.slug).filter((value): value is string => typeof value === "string"));
    if (slugTyped && taken.has(slug)) return actionFail(CATEGORY_SLUG_TAKEN_MESSAGE, { slug: CATEGORY_SLUG_TAKEN_MESSAGE });
    await payload.update({
      collection: "blogCategories",
      id,
      data: { name, description, slug: slugTyped ? slug : firstUnusedSlug(slug, taken), metaTitle, metaDescription },
      overrideAccess: true,
    });
    revalidatePath(categoryPath(id));
    revalidatePath(BLOG_CATEGORIES_PATH);
  });
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult> {
  const customer = await blogWriter();
  if (isRefusal(customer)) return customer;
  const id = DocId.safeParse(categoryId);
  if (!id.success) return actionFail(CATEGORY_GONE_MESSAGE);
  return blogWrite("blog.category.delete", async () => {
    const payload = await getBlogPayload();
    if ((await ownedOrNull(() => requireOwnedTaxonomyDoc(payload, "blogCategories", id.data, customer.tenant.businessId))) === null) return actionFail(CATEGORY_GONE_MESSAGE);
    await payload.delete({ collection: "blogCategories", id: id.data, overrideAccess: true });
    revalidatePath(BLOG_CATEGORIES_PATH);
    redirect(BLOG_CATEGORIES_PATH);
  });
}
