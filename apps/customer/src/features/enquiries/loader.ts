import "server-only";
import {
  countChatbotLeadsForBusiness,
  countChatbotLeadsSince,
  listChatbotsForBusiness,
  listEnquiries,
  withTenantScope,
  type ChatbotStatus,
  type Enquiry,
  type ScopedTransaction,
} from "@brandbasket/db";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { buildRows, MEASURED_DAYS, PERSON_KINDS, summarise, WINDOW_DAYS, type EnquiryRow, type Summary } from "./rules";

const DAY_MS = 86_400_000;
const PAGE = 200;
const MAX_PAGES = 5;
/** The export reads further than the screen does. */
const EXPORT_MAX_PAGES = 25;

type Reader = Pick<CustomerContext, "tenant">;

async function scoped<T>(customer: Reader, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(getAppDb(), customer.tenant, work);
}

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
  /** More than the screen reads came back, so the oldest rows are not shown. */
  readonly truncated: boolean;
  readonly now: Date;
}

/**
 * The list and the figures above it, from the `enquiries` table through row-level security. Reads back 90 days (the ported
 * "is the website reporting" window), and separately the people who are still waiting for a reply whatever their age, so the
 * New count here agrees with the one on the sidebar.
 */
export async function loadEnquiries(customer: Reader, now: Date = new Date()): Promise<EnquiriesView> {
  const since = new Date(now.getTime() - MEASURED_DAYS * DAY_MS);
  const { recent, waiting } = await scoped(customer, async (tx) => ({
    recent: await readBack(tx, since, MAX_PAGES),
    waiting: await listEnquiries(tx, { status: ["new"], kind: PERSON_KINDS, limit: PAGE }),
  }));
  const byId = new Map<string, Enquiry>();
  for (const record of [...recent.records, ...waiting]) byId.set(record.id, record);
  const rows = buildRows([...byId.values()]);
  const windowStart = now.getTime() - WINDOW_DAYS * DAY_MS;
  return {
    rows: rows.filter((row) => row.receivedAt.getTime() >= windowStart || row.status === "new"),
    summary: summarise(rows, now, recent.complete),
    truncated: !recent.complete,
    now,
  };
}

/** Every enquiry of the business for the CSV, newest first. */
export async function loadEnquiriesForExport(customer: Reader): Promise<readonly Enquiry[]> {
  return scoped(customer, async (tx) => (await readBack(tx, null, EXPORT_MAX_PAGES)).records);
}

export interface ChatAssistantView {
  readonly bots: readonly { readonly id: string; readonly name: string; readonly status: ChatbotStatus; readonly websiteUrl: string | null }[];
  /** Chat leads in all, in the last 7 days and in the last 30. */
  readonly total: number;
  readonly lastWeek: number;
  readonly lastMonth: number;
}

/** The business's chatbots and how many leads they caught. Registered by staff; the customer can only rename. */
export async function loadChatAssistant(customer: Pick<CustomerContext, "tenant" | "businessId">, now: Date = new Date()): Promise<ChatAssistantView> {
  const { businessId } = customer;
  const daysAgo = (days: number): Date => new Date(now.getTime() - days * DAY_MS);
  return scoped(customer, async (tx) => ({
    bots: (await listChatbotsForBusiness(tx, businessId)).map((bot) => ({ id: bot.id, name: bot.name, status: bot.status, websiteUrl: bot.websiteUrl })),
    total: await countChatbotLeadsForBusiness(tx, businessId),
    lastWeek: await countChatbotLeadsSince(tx, businessId, daysAgo(7)),
    lastMonth: await countChatbotLeadsSince(tx, businessId, daysAgo(30)),
  }));
}
