import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { BUSINESS_EXTRA_CATEGORIES_MAX, businesses, directoryBusinessCategories } from "../schema";
import type { ScopedTransaction } from "../scope";

/*
 * The extra categories a business lists in (see schema/directory-business-categories.ts). Reads work through row-level
 * security (the customer reads its own rows) and on staff; the write is on the staff connection after the platform has
 * checked the customer and the slugs. The whole set is replaced in one step under the business's row lock.
 */

type Runner = Database | ScopedTransaction;

/** The business's extra categories, in the order its owner put them. */
export async function listExtraCategories(db: Runner, businessId: string): Promise<readonly string[]> {
  const rows = await db
    .select({ slug: directoryBusinessCategories.categorySlug })
    .from(directoryBusinessCategories)
    .where(eq(directoryBusinessCategories.businessId, businessId))
    .orderBy(asc(directoryBusinessCategories.position));
  return rows.map((row) => row.slug);
}

/** The extra categories of each of the businesses given (one read); a business with none is not in the map. */
export async function listExtraCategoriesByBusiness(db: Runner, businessIds: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> {
  const found = new Map<string, string[]>();
  if (businessIds.length === 0) return found;
  const rows = await db
    .select({ businessId: directoryBusinessCategories.businessId, slug: directoryBusinessCategories.categorySlug })
    .from(directoryBusinessCategories)
    .where(inArray(directoryBusinessCategories.businessId, [...new Set(businessIds)]))
    .orderBy(asc(directoryBusinessCategories.businessId), asc(directoryBusinessCategories.position));
  for (const row of rows) {
    const slugs = found.get(row.businessId);
    if (slugs === undefined) found.set(row.businessId, [row.slug]);
    else slugs.push(row.slug);
  }
  return found;
}

/**
 * Makes `slugs` the business's extra categories, in that order. The caller has checked each is a category of the
 * directory and none is the business's main one; this refuses more than BUSINESS_EXTRA_CATEGORIES_MAX or a repeat.
 */
export async function replaceExtraCategories(db: Database, input: { readonly businessId: string; readonly slugs: readonly string[] }): Promise<void> {
  if (input.slugs.length > BUSINESS_EXTRA_CATEGORIES_MAX) {
    throw new RangeError(`A business lists in at most ${String(BUSINESS_EXTRA_CATEGORIES_MAX)} extra categories, not ${String(input.slugs.length)}.`);
  }
  if (new Set(input.slugs).size !== input.slugs.length) throw new RangeError("An extra category is listed twice.");
  await db.transaction(async (tx) => {
    await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1).for("update");
    await tx.delete(directoryBusinessCategories).where(eq(directoryBusinessCategories.businessId, input.businessId));
    if (input.slugs.length === 0) return;
    await tx
      .insert(directoryBusinessCategories)
      .values(input.slugs.map((categorySlug, position) => ({ businessId: input.businessId, categorySlug, position })));
  });
}
