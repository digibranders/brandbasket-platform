import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { type BusinessPriceOverride, businessPriceOverrides } from "../schema";
import type { ScopedTransaction } from "../scope";
import { isUuid } from "./tenant";

type Runner = Database | ScopedTransaction;

/**
 * Custom recurring prices kept after a deal is paid (docs/plans/66). Staff-only: `bb_app` holds no grant on the table, so every
 * call runs on the staff connection, the customer app's included.
 */

export interface PriceOverrideInput {
  readonly businessId: string;
  readonly addOn: BusinessPriceOverride["addOn"];
  readonly billingInterval: "month" | "year";
  readonly netCents: number;
  readonly paymentLinkId?: string | null;
  readonly setByStaffId?: string | null;
}

/** Sets the price for one service and period, replacing the one there. */
export async function upsertPriceOverride(db: Runner, input: PriceOverrideInput): Promise<BusinessPriceOverride> {
  const rows = await db
    .insert(businessPriceOverrides)
    .values({
      businessId: input.businessId,
      addOn: input.addOn,
      billingInterval: input.billingInterval,
      netCents: input.netCents,
      paymentLinkId: input.paymentLinkId ?? null,
      setByStaffId: input.setByStaffId ?? null,
    })
    .onConflictDoUpdate({
      target: [businessPriceOverrides.businessId, businessPriceOverrides.addOn, businessPriceOverrides.billingInterval],
      set: { netCents: input.netCents, paymentLinkId: input.paymentLinkId ?? null, setByStaffId: input.setByStaffId ?? null },
    })
    .returning();
  const row = rows[0];
  if (row === undefined) throw new Error("Price override upsert returned no row");
  return row;
}

export async function listPriceOverridesForBusiness(db: Runner, businessId: string): Promise<readonly BusinessPriceOverride[]> {
  if (!isUuid(businessId)) return [];
  return db
    .select()
    .from(businessPriceOverrides)
    .where(eq(businessPriceOverrides.businessId, businessId))
    .orderBy(asc(businessPriceOverrides.addOn), asc(businessPriceOverrides.billingInterval));
}

/** Removes the price for one service and period. False when there was none. */
export async function clearPriceOverride(db: Runner, input: { readonly businessId: string; readonly addOn: string; readonly billingInterval: "month" | "year" }): Promise<boolean> {
  if (!isUuid(input.businessId)) return false;
  const rows = await db
    .delete(businessPriceOverrides)
    .where(
      and(
        eq(businessPriceOverrides.businessId, input.businessId),
        eq(businessPriceOverrides.addOn, input.addOn),
        eq(businessPriceOverrides.billingInterval, input.billingInterval),
      ),
    )
    .returning({ id: businessPriceOverrides.id });
  return rows.length === 1;
}
