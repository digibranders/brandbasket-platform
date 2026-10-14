"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPayload, NotFound, type Payload } from "payload";
import { toRelationId } from "@fynix/cms";
import config from "@/payload.config";
import { cleanBlogAuthorFields, type BlogAuthorFields } from "@/lib/blog-author-fields";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { BLOG_PAYMENT_REQUIRED_MESSAGE } from "@/lib/server/blog";
import { BlogTaxonomyOwnershipError, requireOwnedTaxonomyDoc } from "@/lib/server/blog-taxonomy";

/**
 * Content → Authors: create, edit, give a photo to and delete the people who write a business's posts. The business
 * id always comes from the paid session, and every client-supplied author or media id is checked against it before
 * anything is written. The post editor's inline "New author" stays in content/blog/taxonomy-actions.ts.
 */

export type AuthorFormResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

const PAYMENT_REQUIRED: AuthorFormResult = { ok: false, message: BLOG_PAYMENT_REQUIRED_MESSAGE };
const GONE: AuthorFormResult = { ok: false, message: "This author no longer exists. Reload the page." };

/** True when `authorId` is this business's own author; false for a missing id or another business's. */
async function ownsAuthor(payload: Payload, authorId: string, businessId: string): Promise<boolean> {
  try {
    await requireOwnedTaxonomyDoc(payload, "blogAuthors", authorId, businessId);
    return true;
  } catch (error) {
    if (error instanceof BlogTaxonomyOwnershipError || error instanceof NotFound) return false;
    throw error;
  }
}

/** "New author": a name is enough to start; the rest is filled in on the author's own page, which this opens. */
export async function createAuthorAction(_previous: AuthorFormResult, formData: FormData): Promise<AuthorFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const cleaned = cleanBlogAuthorFields({
    name: String(formData.get("name") ?? ""),
    role: "",
    bio: "",
    links: { website: "", instagram: "", facebook: "", linkedin: "", x: "" },
  });
  if (!cleaned.ok) return cleaned;

  const payload = await getPayload({ config });
  const created = await payload.create({
    collection: "blogAuthors",
    data: { businessId: access.tenant.businessId, name: cleaned.value.name },
    overrideAccess: true,
  });
  redirect(`/content/authors/${String(created.id)}`);
}

export async function saveAuthorAction(authorId: string, fields: BlogAuthorFields): Promise<AuthorFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const cleaned = cleanBlogAuthorFields(fields);
  if (!cleaned.ok) return cleaned;

  const payload = await getPayload({ config });
  if (!(await ownsAuthor(payload, authorId, access.tenant.businessId))) return GONE;
  const { name, role, bio, links } = cleaned.value;
  await payload.update({
    collection: "blogAuthors",
    id: authorId,
    data: { name, role, bio, ...links },
    overrideAccess: true,
  });
  refresh();
  return { ok: true };
}

/** Attaches a just-uploaded photo. The media id is re-checked against the business, never trusted from the upload. */
export async function setAuthorPhotoAction(authorId: string, mediaId: string): Promise<AuthorFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const payload = await getPayload({ config });
  if (!(await ownsAuthor(payload, authorId, access.tenant.businessId))) return GONE;

  let media: { readonly id: string | number; readonly businessId?: unknown };
  try {
    media = await payload.findByID({ collection: "media", id: mediaId, depth: 0, overrideAccess: true });
  } catch {
    return { ok: false, message: "That upload could not be found. Try again." };
  }
  if (media.businessId !== access.tenant.businessId) {
    return { ok: false, message: "That upload could not be found. Try again." };
  }

  await payload.update({
    collection: "blogAuthors",
    id: authorId,
    data: { photo: toRelationId(mediaId) },
    overrideAccess: true,
  });
  refresh();
  return { ok: true };
}

export async function removeAuthorPhotoAction(authorId: string): Promise<AuthorFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const payload = await getPayload({ config });
  if (!(await ownsAuthor(payload, authorId, access.tenant.businessId))) return GONE;
  await payload.update({ collection: "blogAuthors", id: authorId, data: { photo: null }, overrideAccess: true });
  refresh();
  return { ok: true };
}

/** Deletes the author and returns to the list. Their posts stay, without an author (the column is ON DELETE SET NULL). */
export async function deleteAuthorAction(authorId: string): Promise<AuthorFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const payload = await getPayload({ config });
  if (!(await ownsAuthor(payload, authorId, access.tenant.businessId))) return GONE;
  await payload.delete({ collection: "blogAuthors", id: authorId, overrideAccess: true });
  redirect("/content/authors");
}
