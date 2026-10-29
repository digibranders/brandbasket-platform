import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, domains } from "../schema";
import { hasPostgresCode, postgresConstraintOf, UNIQUE_VIOLATION } from "./tenant";

/** The index that allows one non-removed primary domain per business (domains_one_primary_per_business_idx). */
const ONE_PRIMARY_PER_BUSINESS = "domains_one_primary_per_business_idx";

/** The business's slug, which its free address is made from, or null when there is no such business. */
export async function findBusinessSlug(db: Database, businessId: string): Promise<string | null> {
  const rows = await db.select({ slug: businesses.slug }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return rows[0]?.slug ?? null;
}

/**
 * Gives a business a free `<name>.<base domain>` address as its primary domain, from the staff connection, for a business
 * whose build has no domain of its own yet. Mirrors the customer's temporary address (savePrimaryDomain): a pending primary
 * row, ownership confirmed now, and no onboarding lock, since staff act after onboarding. The business is scoped by the
 * explicit `businessId`, not by a tenant session.
 *
 * "exists" means the business already has a non-removed primary domain, which is left as it is. "taken" means another
 * business's live domain holds the hostname.
 */
export async function saveFreeAddressForBusiness(
  db: Database,
  input: { readonly businessId: string; readonly hostname: string },
): Promise<"saved" | "exists" | "taken"> {
  const hostname = input.hostname.trim().toLowerCase();
  const existing = await db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.businessId, input.businessId), eq(domains.isPrimary, true), isNull(domains.removedAt)))
    .limit(1);
  if (existing.length > 0) return "exists";

  try {
    await db.insert(domains).values({
      businessId: input.businessId,
      hostname,
      isPrimary: true,
      status: "pending",
      ownerConfirmedAt: new Date(),
    });
    return "saved";
  } catch (error) {
    if (!hasPostgresCode(error, UNIQUE_VIOLATION)) throw error;
    // Another request may have made the primary domain between the check above and this insert.
    return postgresConstraintOf(error) === ONE_PRIMARY_PER_BUSINESS ? "exists" : "taken";
  }
}
