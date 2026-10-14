import type { ClientSummary } from "@fynix/db";
import { displayPhone } from "@fynix/shared/server/phone-display";

/**
 * Whether a client matches what staff typed in the Clients search box: the business name, or the owner's name, email
 * or phone. `term` is already trimmed and lower-cased; an empty term matches everyone.
 */
export function matchesClientSearch(client: Pick<ClientSummary, "businessName" | "owner">, term: string): boolean {
  if (term === "") return true;
  const { owner } = client;
  // Both the stored number and its readable layout, so "98765 43210" finds "+919876543210" (as the Leads search does).
  const haystack = [
    client.businessName,
    owner?.name ?? "",
    owner?.email ?? "",
    owner?.phone ?? "",
    owner?.phone ? displayPhone(owner.phone).text : "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}
