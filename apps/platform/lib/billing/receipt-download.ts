import { z } from "zod";

/** Where receipts download from, on the app host. */
export const RECEIPTS_DOWNLOAD_PATH = "/billing/receipts";

/** The most receipts one download may name: the length of the list the billing page shows. */
export const MAX_RECEIPTS_PER_DOWNLOAD = 50;

const idsSchema = z.array(z.uuid()).min(1).max(MAX_RECEIPTS_PER_DOWNLOAD);

/**
 * The download link for some receipts, or for every one when `ids` is null. Payment ids are opaque UUIDs, not
 * personal data, so they may sit in the query string.
 */
export function receiptDownloadHref(ids: readonly string[] | null): string {
  if (ids === null) return RECEIPTS_DOWNLOAD_PATH;
  return `${RECEIPTS_DOWNLOAD_PATH}?${new URLSearchParams({ ids: ids.join(",") }).toString()}`;
}

/** Which receipts a download asked for: every one, a list of payment ids, or something that is not a valid request. */
export type ReceiptSelection =
  | { readonly kind: "all" }
  | { readonly kind: "some"; readonly ids: readonly string[] }
  | { readonly kind: "invalid" };

/** Reads the `ids` query parameter: absent means every receipt; otherwise 1 to 50 distinct UUIDs, comma-separated. */
export function parseReceiptSelection(ids: string | null): ReceiptSelection {
  if (ids === null) return { kind: "all" };
  const parsed = idsSchema.safeParse(ids.split(","));
  if (!parsed.success) return { kind: "invalid" };
  return { kind: "some", ids: [...new Set(parsed.data)] };
}
