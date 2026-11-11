import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { adCampaignSnapshots, type AdCampaignSnapshot, type AdPlatform } from "../schema";
import { hasPostgresCode, isUuid, UNIQUE_VIOLATION } from "./tenant";

type Runner = Database | ScopedTransaction;

/** What staff type for one campaign's month. Money is in paise; a figure that was not measured is null. */
export interface AdCampaignFigures {
  readonly name: string;
  readonly platform: AdPlatform;
  readonly objective: string;
  readonly spendCents: number;
  readonly budgetCents: number | null;
  readonly impressions: number | null;
  readonly clicks: number | null;
  readonly leads: number | null;
}

export type AdCampaignSaveResult = "saved" | "duplicate" | "not-found";

/** Staff side: adds a campaign to the business's month (`YYYY-MM-01`). A second campaign with the same name that month is refused. */
export async function addAdCampaign(
  db: Database,
  input: { readonly businessId: string; readonly month: string; readonly figures: AdCampaignFigures; readonly staffId: string },
): Promise<Exclude<AdCampaignSaveResult, "not-found">> {
  if (!isUuid(input.businessId)) throw new Error(`businessId must be a UUID, received "${input.businessId}"`);
  try {
    await db.insert(adCampaignSnapshots).values({ businessId: input.businessId, month: input.month, ...input.figures, enteredByStaffId: input.staffId });
    return "saved";
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) return "duplicate";
    throw error;
  }
}

/** Staff side: corrects one campaign of the business in place; its month stays. */
export async function updateAdCampaign(
  db: Database,
  input: { readonly id: string; readonly businessId: string; readonly figures: AdCampaignFigures; readonly staffId: string; readonly now: Date },
): Promise<AdCampaignSaveResult> {
  if (!isUuid(input.id) || !isUuid(input.businessId)) return "not-found";
  try {
    const rows = await db
      .update(adCampaignSnapshots)
      .set({ ...input.figures, enteredByStaffId: input.staffId, updatedAt: input.now })
      .where(and(eq(adCampaignSnapshots.id, input.id), eq(adCampaignSnapshots.businessId, input.businessId)))
      .returning({ id: adCampaignSnapshots.id });
    return rows.length > 0 ? "saved" : "not-found";
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) return "duplicate";
    throw error;
  }
}

/** Staff side. True when there was a row of this business to remove. */
export async function removeAdCampaign(db: Database, input: { readonly id: string; readonly businessId: string }): Promise<boolean> {
  if (!isUuid(input.id) || !isUuid(input.businessId)) return false;
  const rows = await db
    .delete(adCampaignSnapshots)
    .where(and(eq(adCampaignSnapshots.id, input.id), eq(adCampaignSnapshots.businessId, input.businessId)))
    .returning({ id: adCampaignSnapshots.id });
  return rows.length > 0;
}

/** The business's campaigns for a month (`YYYY-MM-01`), by name. Read as the customer inside withTenantScope, or with the staff connection. */
export async function listAdCampaigns(db: Runner, businessId: string, month: string): Promise<AdCampaignSnapshot[]> {
  return db
    .select()
    .from(adCampaignSnapshots)
    .where(and(eq(adCampaignSnapshots.businessId, businessId), eq(adCampaignSnapshots.month, month)))
    .orderBy(asc(adCampaignSnapshots.name));
}
