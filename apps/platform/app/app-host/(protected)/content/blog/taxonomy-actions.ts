"use server";

import { refresh } from "next/cache";
import { getPayload, type Payload } from "payload";
import { cleanLine } from "@fynix/shared/lib/validation/text";
import config from "@/payload.config";
import { firstUnusedSlug, slugify } from "@/lib/blog-slug";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { BLOG_PAYMENT_REQUIRED_MESSAGE } from "@/lib/server/blog";
import { listTaxonomyDocs } from "@/lib/server/blog-taxonomy";

/**
 * The post editor's inline "New category" and "New author", so writing a post never means leaving the editor.
 * Everything else about categories and authors is on Content → Categories and Content → Authors
 * (content/categories/actions.ts, content/authors/actions.ts). The business id always comes from the paid session.
 */

/** What the editor needs back to select a newly created entry. */
export interface TaxonomyOption {
  readonly id: string;
  readonly name: string;
}

export type TaxonomyResult =
  | { readonly ok: true; readonly value: TaxonomyOption }
  | { readonly ok: false; readonly message: string };

type Refusal = { readonly ok: false; readonly message: string };

const MAX_NAME_LENGTH = 60;
const MAX_BIO_LENGTH = 160;
const PAYMENT_REQUIRED: Refusal = { ok: false, message: BLOG_PAYMENT_REQUIRED_MESSAGE };

/** One line, inner runs of whitespace collapsed, capped. */
function cleanName(raw: string): string {
  return cleanLine(raw).replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH).trim();
}

function sameName(stored: unknown, name: string): boolean {
  return typeof stored === "string" && stored.toLocaleLowerCase() === name.toLocaleLowerCase();
}

function categoryNameProblem(name: string): Refusal | null {
  if (name === "") return { ok: false, message: "Give the category a name." };
  if (slugify(name) === "") return { ok: false, message: "Use some letters or numbers in the name." };
  return null;
}

/** A category address not used by any other of this business's categories. */
async function freeCategorySlug(payload: Payload, businessId: string, name: string): Promise<string> {
  const docs = await listTaxonomyDocs(payload, "blogCategories", businessId);
  const taken = new Set(docs.map((doc) => doc.slug).filter((slug): slug is string => typeof slug === "string"));
  return firstUnusedSlug(slugify(name), taken);
}

/**
 * Creates a category, or returns the existing one with the same name in any case, so the editor's inline "New
 * category" never makes a duplicate.
 */
export async function createBlogCategoryAction(rawName: string): Promise<TaxonomyResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const { businessId } = access.tenant;

  const name = cleanName(rawName);
  const problem = categoryNameProblem(name);
  if (problem !== null) return problem;

  const payload = await getPayload({ config });
  const existing = (await listTaxonomyDocs(payload, "blogCategories", businessId)).find((doc) =>
    sameName(doc.name, name),
  );
  if (existing !== undefined) return { ok: true, value: { id: String(existing.id), name: String(existing.name) } };

  const created = await payload.create({
    collection: "blogCategories",
    data: { businessId, name, slug: await freeCategorySlug(payload, businessId, name) },
    overrideAccess: true,
  });
  refresh();
  return { ok: true, value: { id: String(created.id), name } };
}

type CleanAuthor = { readonly name: string; readonly bio: string | null };

function cleanAuthor(rawName: string, rawBio: string): CleanAuthor | Refusal {
  const name = cleanName(rawName);
  if (name === "") return { ok: false, message: "Give the author a name." };
  const bio = cleanLine(rawBio).slice(0, MAX_BIO_LENGTH).trim();
  return { name, bio: bio === "" ? null : bio };
}

/** Two authors may share a name (two people called Priya is real), so authors are never de-duplicated. */
async function createBlogAuthor(rawName: string, rawBio: string): Promise<TaxonomyResult> {
  const access = await paidCustomerOrNull();
  if (access === null) return PAYMENT_REQUIRED;
  const author = cleanAuthor(rawName, rawBio);
  if ("ok" in author) return author;

  const payload = await getPayload({ config });
  const created = await payload.create({
    collection: "blogAuthors",
    data: { businessId: access.tenant.businessId, name: author.name, bio: author.bio },
    overrideAccess: true,
  });
  refresh();
  return { ok: true, value: { id: String(created.id), name: author.name } };
}

/** The post editor's inline "New author": a name only; the rest is added on Content → Authors. */
export async function createBlogAuthorByNameAction(rawName: string): Promise<TaxonomyResult> {
  return createBlogAuthor(rawName, "");
}

