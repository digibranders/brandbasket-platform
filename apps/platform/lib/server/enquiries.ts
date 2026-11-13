import "server-only";
import { listEnquiries, withTenantScope, type Enquiry, type ScopedTransaction } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { buildRows, PERSON_KINDS, summarise, WINDOW_DAYS, type EnquiryRow, type Summary } from "@/lib/enquiries/rules";
import { getAppDb } from "./db";

const DAY_MS = 86_400_000;
const PAGE = 200;
/** The screen reads at most this many rows (1,000); the export reads further. */
const MAX_PAGES = 5;
const EXPORT_MAX_PAGES = 25;

type Reader = { readonly tenant: TenantContext };

/** Newest first, page by page, until a row is older than `since` or `maxPages` is used up. */
async function readBack(tx: ScopedTransaction, since: Date | null, maxPages: number): Promise<{ readonly records: Enquiry[]; readonly complete: boolean }> {
  const records: Enquiry[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await listEnquiries(tx, { limit: PAGE, offset: page * PAGE });
    for (const record of batch) {
      if (since !== null && record.receivedAt < since) return { records, complete: true };
      records.push(record);
    }
    if (batch.length < PAGE) return { records, complete: true };
  }
  return { records, complete: false };
}

export interface EnquiriesView {
  /** The last 30 days, plus anyone older who is still waiting for a reply; newest first. */
  readonly rows: readonly EnquiryRow[];
  readonly summary: Summary;
  /** More came back than the screen reads, so the oldest rows are not shown. */
  readonly truncated: boolean;
}

/**
 * The list and the figures above it, from the `enquiries` table through row-level security as the signed-in customer. It reads
 * back the 30 days, and separately the people still waiting for a reply whatever their age, so the New count agrees with the
 * sidebar's.
 */
export async function loadEnquiries(customer: Reader, now: Date = new Date()): Promise<EnquiriesView> {
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const { recent, waiting } = await withTenantScope(getAppDb(), customer.tenant, async (tx) => ({
    recent: await readBack(tx, since, MAX_PAGES),
    waiting: await listEnquiries(tx, { status: ["new"], kind: PERSON_KINDS, limit: PAGE }),
  }));
  const byId = new Map<string, Enquiry>();
  for (const record of [...recent.records, ...waiting]) byId.set(record.id, record);
  const rows = buildRows([...byId.values()]);
  return { rows, summary: summarise(rows, now), truncated: !recent.complete };
}

/** Every enquiry of the business for the CSV, newest first. */
export async function loadEnquiriesForExport(customer: Reader): Promise<readonly Enquiry[]> {
  return withTenantScope(getAppDb(), customer.tenant, async (tx) => (await readBack(tx, null, EXPORT_MAX_PAGES)).records);
}
