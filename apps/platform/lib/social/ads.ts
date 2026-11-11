import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import type { SnapshotView } from "@/lib/overview";

/** The ads panel on Social media: each figure is null when it is not known. */
export interface AdsPanel {
  readonly spent: string | null;
  readonly percent: number | null;
  readonly enquiries: number | null;
  readonly adMoney: string | null;
}

/** Null when nothing is known: the panel is left out, never shown as zeros. */
export function adsPanel(input: { readonly snapshot: SnapshotView | null; readonly adCreditCents: number; readonly currency: MoneyCurrency }): AdsPanel | null {
  const spend = input.snapshot?.adSpendCents ?? null;
  const budget = input.snapshot?.adBudgetCents ?? null;
  const hasBudget = budget !== null && budget > 0;
  const { currency } = input;
  const panel: AdsPanel = {
    spent: spend === null ? null : hasBudget ? `${formatMoney(spend, currency)} of ${formatMoney(budget, currency)}` : formatMoney(spend, currency),
    percent: spend === null || !hasBudget ? null : Math.min(100, Math.max(0, Math.round((spend / budget) * 100))),
    enquiries: input.snapshot?.adEnquiries ?? null,
    adMoney: input.adCreditCents > 0 ? formatMoney(input.adCreditCents, currency) : null,
  };
  return Object.values(panel).every((value) => value === null) ? null : panel;
}
