"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPayload, NotFound, type Payload } from "payload";
import config from "@/payload.config";
import { cleanBlogCategoryFields, type BlogCategoryFields } from "@/lib/blog-category-fields";
import { firstUnusedSlug } from "@/lib/blog-slug";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { BLOG_PAYMENT_REQUIRED_MESSAGE } from "@/lib/server/blog";
import {
  BlogTaxonomyOwnershipError,
  listTaxonomyDocs,
  requireOwnedTaxonomyDoc,
  type RawTaxonomyDoc,
} from "@/lib/server/blog-taxonomy";

/**
 * Content → Categories: create, edit and delete what posts are filed under. Each category has its own page on the
 * business's website (`/blog/category/<slug>`), so names and addresses are unique within the business. The business id
 * always comes from the paid session; every client-supplied category id is checked against it before anything is
 * written. The post editor's inline "New category" stays in content/blog/taxonomy-actions.ts.
 */

export type CategoryFormResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

const PAYMENT_REQUIRED: CategoryFormResult = { ok: false, message: BLOG_PAYMENT_REQUIRED_MESSAGE };
const GONE: CategoryFormResult = { ok: false, message: "This category no longer exists. Reload the page." };

function sameName(stored: unknown, name: string): boolean {
  return typeof stored === "string" && stored.toLocaleLowerCase() === name.toLocaleLowerCase();
}

/** The caller's own category, or null for a missing id or another business's. Anything else still throws. */
async function ownedCategoryOrNull(payload: Payload, id: string, businessId: string): Promise<RawTaxonomyDoc | null> {
  try {
    return await requireOwnedTaxonomyDoc(payload, "blogCategories", id, businessId);
  } catch (error) {
    if (error instanceof BlogTaxonomyOwnershipError || error instanceof NotFound) return null;
    throw error;
  }
}

/** "New category": a name is enough to start; its own page opens straight after. */
export async function createCategoryAction(_previous: CategoryFormResult, formData: FormData): Promise<CategoryFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { businessId } = access.tenant;
  const cleaned = cleanBlogCategoryFields({
    name: String(formData.get("name") ?? ""),
    description: "",
    slugAuto: true,
    slug: "",
    metaTitle: "",
    metaDescription: "",
  });
  if (!cleaned.ok) return cleaned;

  const payload = await getPayload({ config });
  const others = await listTaxonomyDocs(payload, "blogCategories", businessId);
  const clash = others.find((doc) => sameName(doc.name, cleaned.value.name));
  if (clash !== undefined) return { ok: false, message: `You already have a category called ${String(clash.name)}.` };

  const taken = new Set(others.map((doc) => doc.slug).filter((slug): slug is string => typeof slug === "string"));
  const created = await payload.create({
    collection: "blogCategories",
    data: { businessId, name: cleaned.value.name, slug: firstUnusedSlug(cleaned.value.slug, taken) },
    overrideAccess: true,
  });
  redirect(`/content/categories/${String(created.id)}`);
}

/**
 * Saves the category page. With "Auto" on, the address follows the name (numbered if another category has it); a
 * typed address that another category uses is refused instead, so the customer never gets one they didn't choose.
 * Changing the address moves the category's page on the website; its old address stops working.
 */
export async function saveCategoryAction(categoryId: string, fields: BlogCategoryFields): Promise<CategoryFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { businessId } = access.tenant;
  const cleaned = cleanBlogCategoryFields(fields);
  if (!cleaned.ok) return cleaned;
  const { name, description, slug, slugTyped, metaTitle, metaDescription } = cleaned.value;

  const payload = await getPayload({ config });
  if ((await ownedCategoryOrNull(payload, categoryId, businessId)) === null) return GONE;

  const others = (await listTaxonomyDocs(payload, "blogCategories", businessId)).filter(
    (doc) => String(doc.id) !== categoryId,
  );
  const clash = others.find((doc) => sameName(doc.name, name));
  if (clash !== undefined) return { ok: false, message: `You already have a category called ${String(clash.name)}.` };

  const taken = new Set(others.map((doc) => doc.slug).filter((value): value is string => typeof value === "string"));
  if (slugTyped && taken.has(slug)) {
    return { ok: false, message: "Another of your categories already uses this address. Choose another." };
  }

  await payload.update({
    collection: "blogCategories",
    id: categoryId,
    data: {
      name,
      description,
      slug: slugTyped ? slug : firstUnusedSlug(slug, taken),
      metaTitle,
      metaDescription,
    },
    overrideAccess: true,
  });
  refresh();
  return { ok: true };
}

/** Deletes the category and returns to the list. Posts filed under it stay, without one (ON DELETE SET NULL). */
export async function deleteCategoryAction(categoryId: string): Promise<CategoryFormResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const payload = await getPayload({ config });
  if ((await ownedCategoryOrNull(payload, categoryId, access.tenant.businessId)) === null) return GONE;
  await payload.delete({ collection: "blogCategories", id: categoryId, overrideAccess: true });
  redirect("/content/categories");
}
