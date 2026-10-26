import "server-only";
import { findTaxInvoicesByNumber, listClients, listLeads, listSupportTicketsForStaff } from "@brandbasket/db";
import type { SearchHit } from "@/lib/console-search-kinds";
import { clientHits, invoiceHits, leadHits, requestHits, SEARCH_LIMIT_PER_KIND } from "@/lib/console-search";
import { getStaffDb } from "./db";

/** Searches clients, enquiries, requests and (for roles that see money) invoice numbers for a normalised term. */
export async function runConsoleSearch(term: string, includeInvoices: boolean): Promise<readonly SearchHit[]> {
  const db = getStaffDb();
  const [clients, leads, tickets, invoices] = await Promise.all([
    listClients(db),
    listLeads(db, {}),
    listSupportTicketsForStaff(db, { search: term, limit: SEARCH_LIMIT_PER_KIND }),
    includeInvoices ? findTaxInvoicesByNumber(db, term, SEARCH_LIMIT_PER_KIND) : Promise.resolve([]),
  ]);
  return [...clientHits(clients, term), ...leadHits(leads, term), ...requestHits(tickets.items), ...invoiceHits(invoices)];
}
