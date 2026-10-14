import { BRAND, featureShownTo, type Brand } from "@/lib/brand";
import type { MembershipTier } from "@/lib/plan-features";

/*
 * The Free / Care / Premium comparison on the Upgrade page: the sixteen rows the customer reads across, and the short
 * lists the two plan cards show. Browser-safe and pure, so the page and its tests share one table.
 */

/** A column of the table. Free is the listing account's own plan, Care and Premium are the two it can move up to. */
export type ComparisonColumnId = "free" | MembershipTier;

/** A cell: a tick, a blank, or a short word as written ("Allowed", "Hot & Growing"). */
export type ComparisonCell = boolean | string;

export interface ComparisonRow {
  readonly id: string;
  readonly label: string;
  /** How Premium's card says a row whose cell is text, where the table's label alone would read wrongly as a list item. */
  readonly premiumSentence?: string;
  readonly free: ComparisonCell;
  readonly care: ComparisonCell;
  readonly premium: ComparisonCell;
}

export const COMPARISON_COLUMNS: readonly { readonly id: ComparisonColumnId; readonly name: string }[] = [
  { id: "free", name: "Free" },
  { id: "care", name: "Care" },
  { id: "premium", name: "Premium" },
];

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  { id: "listing", label: "Business listing", free: true, care: true, premium: true },
  { id: "images", label: "Images", free: true, care: true, premium: true },
  { id: "videos", label: "Videos", free: false, care: false, premium: true },
  {
    id: "competitor-ads",
    label: "Competitor ads on your listing",
    premiumSentence: "No competitor ads on your listing",
    free: "Allowed",
    care: "Allowed",
    premium: "Not allowed",
  },
  { id: "listing-management", label: "Business listing management", free: false, care: false, premium: true },
  { id: "website", label: "Next.js business website", free: false, care: true, premium: true },
  { id: "website-management", label: "Website management", free: false, care: true, premium: true },
  { id: "chatbot", label: "OyeChats professional chatbot", free: false, care: true, premium: true },
  { id: "hosting", label: "Server and hosting", free: false, care: true, premium: true },
  { id: "appointments", label: "Appointment management system", free: false, care: false, premium: true },
  {
    id: "featured",
    label: "Homepage featured placement",
    premiumSentence: "Homepage featured placement: Hot & Growing",
    free: false,
    care: false,
    premium: "Hot & Growing",
  },
  { id: "ranking", label: "Better listing ranking", free: false, care: false, premium: true },
  { id: "google-business", label: "Google Business Profile management", free: false, care: false, premium: true },
  { id: "facebook", label: "Facebook account management", free: false, care: false, premium: true },
  { id: "instagram", label: "Instagram account management", free: false, care: false, premium: true },
  {
    id: "marketing-discount",
    label: "Digital marketing services",
    premiumSentence: "10% off digital marketing services",
    free: false,
    care: false,
    premium: "10% off",
  },
];

/** The table's rows: without those about a listing the product does not sell. */
export function comparisonRowsFor(brand: Brand): readonly ComparisonRow[] {
  return COMPARISON_ROWS.filter((row) => featureShownTo(row.id, brand));
}

/** What a cell says in words, for a screen reader that cannot see the tick: every cell has one. */
export function cellWords(row: ComparisonRow, column: ComparisonColumnId): string {
  const cell = row[column];
  if (typeof cell === "string") return cell;
  return cell ? "Included" : "Not included";
}

/**
 * What a plan card lists: the rows the plan ticks, and for Premium the rows that carry a word, said as a sentence.
 * Free's own rows are not listed anywhere: nobody buys the plan they are on.
 */
export function planListFor(tier: MembershipTier, brand: Brand = BRAND): readonly string[] {
  return comparisonRowsFor(brand).flatMap((row) => {
    const cell = row[tier];
    if (cell === true) return [row.label];
    if (tier === "premium" && typeof cell === "string") return [row.premiumSentence ?? row.label];
    return [];
  });
}
