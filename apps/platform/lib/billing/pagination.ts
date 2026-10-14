/** How many months of billing the Billing page shows at a time. */
export const BILLING_MONTHS_PER_PAGE = 10;

/** One page of a list: which page it is (from 1), how many there are, and the slice of items it covers. */
export interface PageWindow {
  readonly page: number;
  readonly pageCount: number;
  /** Index of the page's first item. */
  readonly start: number;
  /** Index one past the page's last item, for `slice(start, end)`. */
  readonly end: number;
}

/**
 * The window of `total` items that page `requestedPage` covers, `pageSize` to a page. A page past either end is
 * clamped to the nearest real one, so a list that shrinks under the reader never leaves them on an empty page.
 * An empty list still has one (empty) page.
 */
export function pageWindow(total: number, requestedPage: number, pageSize: number): PageWindow {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError(`A total must be a whole, non-negative number, received ${total}`);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError(`A page size must be a positive whole number, received ${pageSize}`);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isFinite(requestedPage) ? Math.min(pageCount, Math.max(1, Math.trunc(requestedPage))) : 1;
  const start = (page - 1) * pageSize;
  return { page, pageCount, start, end: Math.min(total, start + pageSize) };
}
