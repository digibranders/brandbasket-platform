import "server-only";
import { findBusinessWebsiteUrl, withTenantScope } from "@brandbasket/db";
import { loadWebsitePages } from "@/features/website/loader";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import type { BlogPost, BlogPostSummary, BlogUsage } from "./rules/posts";
import { getBlogPayload } from "./server/payload";
import {
  readAuthor,
  readAuthors,
  readBlogPost,
  readBlogPosts,
  readCategories,
  readCategory,
  readTaxonomyOptions,
  type BlogAuthor,
  type BlogCategory,
  type TaxonomyOption,
} from "./server/store";
import { getBlogUsage } from "./server/usage";

/*
 * The blog's panels. Each read is its own Loaded: a failed read shows that panel's error, never an empty list or "not
 * found" (the old getBlogPost turned every read error into a 404). A missing post, author or category, and another
 * business's, load as null: the page answers notFound() for both alike.
 */

type Customer = Pick<CustomerContext, "tenant" | "billing">;

export function loadPosts(customer: Customer, now: Date): Promise<Loaded<readonly BlogPostSummary[]>> {
  return load("blog.posts", async () => readBlogPosts(await getBlogPayload(), customer.tenant.businessId, now));
}

/** Posts used against the plan; null when there is no plan to count against. */
export function loadUsage(customer: Customer): Promise<Loaded<BlogUsage | null>> {
  return load("blog.usage", async () => getBlogUsage(await getBlogPayload(), customer));
}

export function loadPost(customer: Customer, postId: string, now: Date): Promise<Loaded<BlogPost | null>> {
  return load("blog.post", async () => readBlogPost(await getBlogPayload(), customer.tenant.businessId, postId, now));
}

export function loadTaxonomyOptions(customer: Customer): Promise<Loaded<{ readonly categories: readonly TaxonomyOption[]; readonly authors: readonly TaxonomyOption[] }>> {
  return load("blog.taxonomy", async () => readTaxonomyOptions(await getBlogPayload(), customer.tenant.businessId));
}

/** The business's own website address, read through row-level security; null when none is on file yet. */
export function loadWebsiteUrl(customer: Customer): Promise<Loaded<string | null>> {
  const { tenant } = customer;
  return load("blog.website-url", () => withTenantScope(getAppDb(), tenant, (tx) => findBusinessWebsiteUrl(tx, tenant.businessId)));
}

export function loadAuthors(customer: Customer, now: Date): Promise<Loaded<readonly BlogAuthor[]>> {
  return load("blog.authors", async () => readAuthors(await getBlogPayload(), customer.tenant.businessId, now));
}

export function loadAuthor(customer: Customer, authorId: string, now: Date): Promise<Loaded<BlogAuthor | null>> {
  return load("blog.author", async () => readAuthor(await getBlogPayload(), customer.tenant.businessId, authorId, now));
}

export function loadCategories(customer: Customer, now: Date): Promise<Loaded<readonly BlogCategory[]>> {
  return load("blog.categories", async () => readCategories(await getBlogPayload(), customer.tenant.businessId, now));
}

export function loadCategory(customer: Customer, categoryId: string, now: Date): Promise<Loaded<BlogCategory | null>> {
  return load("blog.category", async () => readCategory(await getBlogPayload(), customer.tenant.businessId, categoryId, now));
}

/** Whether the Website section shows its Pages tab: only when the sitemap sync found pages, as on the other Website tabs. */
export async function loadHasPages(customer: Customer): Promise<boolean> {
  const pages = await loadWebsitePages(customer.tenant);
  return pages.ok && pages.data.length > 0;
}
