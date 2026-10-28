import "server-only";
import { countChatbotLeadsForBusiness, countChatbotLeadsSince, listChatbotLeadsForBusiness, listChatbotsForBusiness, renameChatbot, withTenantScope, type Chatbot, type ChatbotLead } from "@brandbasket/db";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb } from "./db";

/** How many leads a page of the Leads list shows. */
export const LEADS_PER_PAGE = 10;

/** The business's chatbots, oldest first, read through row-level security as the signed-in customer. */
export async function loadChatbots(customer: Pick<GrantedCustomer, "tenant">): Promise<readonly Chatbot[]> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => listChatbotsForBusiness(tx, tenant.businessId));
}

export interface LeadsPage {
  readonly bots: readonly Chatbot[];
  readonly leads: readonly ChatbotLead[];
  /** Every lead the business has, not only this page's. */
  readonly total: number;
  /** Leads from the last 7 days, and from the last 30, for the figures above the list. */
  readonly lastWeek: number;
  readonly lastMonth: number;
  /** The page shown, 1 to `pageCount`: a request past the end gets the last page. */
  readonly page: number;
  readonly pageCount: number;
}

/**
 * One page of the business's leads, newest first, with its chatbots and how many leads there are in all. Read through
 * row-level security as the signed-in customer, so another business's rows can never come back whatever the query says.
 */
export async function loadLeadsPage(customer: Pick<GrantedCustomer, "tenant">, requestedPage: number, now: Date = new Date()): Promise<LeadsPage> {
  const { tenant } = customer;
  const daysAgo = (days: number): Date => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const total = await countChatbotLeadsForBusiness(tx, tenant.businessId);
    const lastWeek = await countChatbotLeadsSince(tx, tenant.businessId, daysAgo(7));
    const lastMonth = await countChatbotLeadsSince(tx, tenant.businessId, daysAgo(30));
    const pageCount = Math.max(1, Math.ceil(total / LEADS_PER_PAGE));
    const page = Math.min(Math.max(1, Math.trunc(requestedPage)), pageCount);
    return {
      bots: await listChatbotsForBusiness(tx, tenant.businessId),
      leads: await listChatbotLeadsForBusiness(tx, tenant.businessId, LEADS_PER_PAGE, (page - 1) * LEADS_PER_PAGE),
      total,
      lastWeek,
      lastMonth,
      page,
      pageCount,
    };
  });
}

/**
 * Renames one of the signed-in business's bots, through the customer's own connection and tenant scope: row-level security
 * and the column grant (0179) let it change this business's bot names and nothing else. False when no such bot.
 */
export async function renameCustomerChatbot(customer: Pick<GrantedCustomer, "tenant">, chatbotId: string, name: string): Promise<boolean> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => renameChatbot(tx, { chatbotId, businessId: tenant.businessId, name }));
}
