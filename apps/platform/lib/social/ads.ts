import type { AdCampaignSnapshot, MonthlySnapshot } from "@brandbasket/db";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";

/** The month's ad figures staff entered, each null when it was not entered. */
export interface AdsView {
  readonly spent: string | null;
  readonly budget: string | null;
  /** Spent as a share of the budget, 0 to 100; null without both. */
  readonly percent: number | null;
  readonly leads: number | null;
  readonly costPerLead: string | null;
  /** When staff last updated the figures; null when none is known. */
  readonly updatedAt: Date | null;
}

type SnapshotFigures = Pick<MonthlySnapshot, "adSpendCents" | "adBudgetCents" | "adEnquiries" | "updatedAt">;

/**
 * The month's figures, or null when nothing was entered: the page says so, it never shows zeros. Cost per lead is worked
 * out only from a measured spend and at least one measured lead.
 */
export function adsView(snapshot: SnapshotFigures | null, currency: MoneyCurrency): AdsView | null {
  const spend = snapshot?.adSpendCents ?? null;
  const budget = snapshot?.adBudgetCents ?? null;
  const leads = snapshot?.adEnquiries ?? null;
  if (snapshot === null || (spend === null && budget === null && leads === null)) return null;
  const hasBudget = budget !== null && budget > 0;
  return {
    spent: spend === null ? null : formatMoney(spend, currency),
    budget: hasBudget ? formatMoney(budget, currency) : null,
    percent: spend === null || !hasBudget ? null : Math.min(100, Math.max(0, Math.round((spend / budget) * 100))),
    leads,
    costPerLead: spend === null || leads === null || leads <= 0 ? null : formatMoney(Math.round(spend / leads), currency),
    updatedAt: snapshot.updatedAt,
  };
}

export const CAMPAIGN_PLATFORM_NAMES: Readonly<Record<AdCampaignSnapshot["platform"], string>> = { meta: "Meta", google: "Google" };

/** One campaign's month as the page draws it. A figure staff did not enter is null, never a zero. */
export interface CampaignRow {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly spent: string;
  readonly budget: string | null;
  readonly leads: number | null;
  /** Spend divided by leads, only when leads is above zero. */
  readonly costPerLead: string | null;
  readonly updatedAt: Date;
}

export type CampaignSource = Pick<AdCampaignSnapshot, "id" | "name" | "platform" | "spendCents" | "budgetCents" | "leads" | "updatedAt">;

/** The campaigns in name order. Cost per lead is worked out from the spend and at least one lead; with none it stays null. */
export function campaignRows(rows: readonly CampaignSource[], currency: MoneyCurrency): CampaignRow[] {
  return [...rows]
    .sort((a, b) => a.name.localeCompare(b.name, "en-IN", { sensitivity: "base" }) || a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      platform: CAMPAIGN_PLATFORM_NAMES[row.platform],
      spent: formatMoney(row.spendCents, currency),
      budget: row.budgetCents === null ? null : formatMoney(row.budgetCents, currency),
      leads: row.leads,
      costPerLead: row.leads === null || row.leads <= 0 ? null : formatMoney(Math.round(row.spendCents / row.leads), currency),
      updatedAt: row.updatedAt,
    }));
}

/** The campaigns grouped by platform in name order of the platforms, each group keeping the rows' order. */
export function campaignsByPlatform(rows: readonly CampaignRow[]): { readonly platform: string; readonly rows: readonly CampaignRow[] }[] {
  const groups = new Map<string, CampaignRow[]>();
  for (const row of rows) groups.set(row.platform, [...(groups.get(row.platform) ?? []), row]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "en-IN")).map(([platform, list]) => ({ platform, rows: list }));
}

/** The most recent time staff touched any of the campaigns; null for none. */
export function campaignsUpdatedAt(rows: readonly Pick<CampaignRow, "updatedAt">[]): Date | null {
  return rows.reduce<Date | null>((latest, row) => (latest === null || row.updatedAt > latest ? row.updatedAt : latest), null);
}
