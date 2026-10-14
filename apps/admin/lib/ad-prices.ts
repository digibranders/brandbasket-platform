/**
 * The Ads page's Prices tab, as data: each category's three weekly prices side by side (top and side of its list pages,
 * its business pages) and the home page's one price. A placement with no price row is closed to bids, and reads null.
 */
import type { DirectoryAdPrice, DirectoryAdSpotPrice } from "@firstfold/db";

/** What the home page's price is kept under in place of a category (HOME_AD_SCOPE_SLUG in @firstfold/db). */
export const HOME_PRICE_SCOPE = "all";

export interface CategoryPriceRow {
  readonly categorySlug: string;
  readonly label: string;
  /** Weekly prices in paise before GST; null when that placement is closed. */
  readonly topWeekPaise: number | null;
  readonly sideWeekPaise: number | null;
  readonly profileWeekPaise: number | null;
}

export interface PriceBoard {
  /** The home page's weekly price in paise; null while it is closed. */
  readonly homeWeekPaise: number | null;
  /** Every category given, in the order given. */
  readonly rows: readonly CategoryPriceRow[];
}

/** Lays the price tables over the categories ads can run in. */
export function buildPriceBoard(
  categories: readonly { readonly slug: string; readonly label: string }[],
  listPrices: readonly DirectoryAdPrice[],
  spotPrices: readonly DirectoryAdSpotPrice[],
): PriceBoard {
  const listBy = new Map(listPrices.map((price) => [price.categorySlug, price]));
  const profileBy = new Map(
    spotPrices.filter((price) => price.placement === "profile").map((price) => [price.scopeSlug, price.weekPaise]),
  );
  const home = spotPrices.find((price) => price.placement === "home" && price.scopeSlug === HOME_PRICE_SCOPE);
  return {
    homeWeekPaise: home?.weekPaise ?? null,
    rows: categories.map((category) => ({
      categorySlug: category.slug,
      label: category.label,
      topWeekPaise: listBy.get(category.slug)?.topWeekPaise ?? null,
      sideWeekPaise: listBy.get(category.slug)?.sideWeekPaise ?? null,
      profileWeekPaise: profileBy.get(category.slug) ?? null,
    })),
  };
}

/** How many categories have at least one placement open. */
export function openCategoryCount(board: PriceBoard): number {
  return board.rows.filter((row) => row.topWeekPaise !== null || row.sideWeekPaise !== null || row.profileWeekPaise !== null).length;
}
