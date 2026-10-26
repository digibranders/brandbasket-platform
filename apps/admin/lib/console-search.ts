import type { ClientSummary, Lead, SupportTicket, TaxInvoice } from "@brandbasket/db";
import { LEAD_STATUS_LABELS } from "@brandbasket/shared/lib/lead-status";
import { matchesClientSearch } from "@/lib/client-search";
import { matchesLeadSearch } from "@/lib/lead-search";
import type { SearchHit } from "./console-search-kinds";

/** How many results of each kind the search shows. */
export const SEARCH_LIMIT_PER_KIND = 8;
const MIN_TERM = 2;
const MAX_TERM = 80;

/** What staff typed, trimmed and lower-cased, or null when it is too short, too long or not text. */
export function normaliseSearchTerm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const term = raw.trim().toLowerCase();
  return term.length >= MIN_TERM && term.length <= MAX_TERM ? term : null;
}

export function clientHits(clients: readonly Pick<ClientSummary, "businessId" | "businessName" | "owner">[], term: string): SearchHit[] {
  return clients
    .filter((client) => matchesClientSearch(client, term))
    .slice(0, SEARCH_LIMIT_PER_KIND)
    .map((client) => ({ kind: "client", label: client.businessName, sub: client.owner?.name ?? "Client", href: `/clients/${client.businessId}` }));
}

export function leadHits(leads: readonly Pick<Lead, "id" | "businessName" | "name" | "email" | "phone" | "status">[], term: string): SearchHit[] {
  return leads
    .filter((lead) => matchesLeadSearch(lead, term))
    .slice(0, SEARCH_LIMIT_PER_KIND)
    .map((lead) => ({ kind: "enquiry", label: lead.businessName, sub: `${lead.name} · ${LEAD_STATUS_LABELS[lead.status]}`, href: `/leads/${lead.id}` }));
}

/** Requests the database already matched on subject or reference. */
export function requestHits(tickets: readonly Pick<SupportTicket, "id" | "subject" | "displayRef">[]): SearchHit[] {
  return tickets.slice(0, SEARCH_LIMIT_PER_KIND).map((ticket) => ({ kind: "request", label: ticket.subject, sub: ticket.displayRef, href: `/support/${ticket.id}` }));
}

/** Invoices the database already matched on number; each opens the register on its month. */
export function invoiceHits(invoices: readonly (Pick<TaxInvoice, "id" | "number" | "issuedOn"> & { readonly recipient: Pick<TaxInvoice["recipient"], "legalName"> })[]): SearchHit[] {
  return invoices
    .slice(0, SEARCH_LIMIT_PER_KIND)
    .map((invoice) => ({ kind: "invoice", label: invoice.number, sub: invoice.recipient.legalName, href: `/invoices?month=${invoice.issuedOn.slice(0, 7)}` }));
}
