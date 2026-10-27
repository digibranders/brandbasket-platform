import type { Lead } from "@brandbasket/db";
import { displayPhone } from "@brandbasket/shared/server/phone-display";

/**
 * Whether a lead matches what staff typed: the business, the contact's name, email or phone. `term` is already trimmed
 * and lower-cased. Both the stored number and its readable layout count, so "98765 43210" finds "+919876543210".
 */
export function matchesLeadSearch(lead: Pick<Lead, "businessName" | "name" | "email" | "phone">, term: string): boolean {
  const haystack = [lead.businessName, lead.name, lead.email, lead.phone ?? "", lead.phone === null ? "" : displayPhone(lead.phone).text].join(" ").toLowerCase();
  return haystack.includes(term);
}
