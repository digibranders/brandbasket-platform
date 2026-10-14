import "server-only";
import { findClaimForBusiness, findOwnListing, withTenantScope, type DirectoryRef } from "@fynix/db";
import type { SessionUser, TenantContext } from "@fynix/shared/lib/access";
import { leadsSource } from "@/lib/leads";
import { accessRedirect, getCustomerAccess, getCustomerBusinessEntry } from "./customer-access";
import { getAppDb } from "./db";

/**
 * Who the signed-in caller is to a directory business, for everything an owner does to the public page of their own
 * business (answering its reviews, from the dashboard's Reviews page or from the page itself).
 *
 * A verified owner is exactly whoever the Leads page opens leads to (lib/leads.ts, leadsSource): a website client with
 * a directory listing staff placed, or an account whose claim on a directory listing Fynix approved. A claim still
 * waiting for approval, a turned-down one, or an account with no business is not an owner, and an account that is
 * awaiting its membership payment or closing has no dashboard at all, so it answers nothing either.
 */
export type OwnedBusiness =
  | { readonly kind: "signed_out" }
  /** `waiting` is what a free account is told while its business can't be answered for yet; null for everyone else. */
  | { readonly kind: "not_owner"; readonly waiting: "no-business" | "pending" | "rejected" | null }
  | { readonly kind: "owner"; readonly user: SessionUser; readonly tenant: TenantContext; readonly business: DirectoryRef };

export async function getOwnedDirectoryBusiness(): Promise<OwnedBusiness> {
  const access = await getCustomerAccess();
  if (access.kind === "signed-out") return { kind: "signed_out" };
  if (access.kind !== "granted") return { kind: "not_owner", waiting: null };

  const entry = await getCustomerBusinessEntry(access.tenant.userId, access.tenant.businessId);
  // The same door as a free listing account's own pages: one still waiting on its plan has no dashboard to answer from.
  if (accessRedirect(entry, { listingAccount: "allow" }) !== null) return { kind: "not_owner", waiting: null };

  const owned = await withTenantScope(getAppDb(), access.tenant, async (tx) => ({
    listing: await findOwnListing(tx),
    claim: await findClaimForBusiness(tx, access.tenant.businessId),
  }));
  const source = leadsSource({ kind: entry.kind, ownListing: owned.listing?.placement ?? null, claim: owned.claim });
  if (source.state === "open") return { kind: "owner", user: access.user, tenant: access.tenant, business: source.business };
  return { kind: "not_owner", waiting: source.state === "none" ? null : source.state };
}
