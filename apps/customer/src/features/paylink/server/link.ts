import "server-only";
import { findPaymentLinkByTokenHash, paymentLinkState, type PaymentLink } from "@brandbasket/db";
import { hashLinkToken, looksLikeLinkToken } from "@brandbasket/shared/server/link-token";
import { getStaffDb } from "@/lib/db";

/*
 * A staff payment link as the customer app reads it (docs/plans/65): looked up by the hash of the token in the address, on the staff
 * connection (the table is staff-only). A token of the wrong shape is never looked up. Whatever is wrong with a link (never existed,
 * cancelled, expired, already paid) comes back as the same `gone`, so the page cannot be used to learn which.
 */

export type LinkLookup = { readonly kind: "gone" } | { readonly kind: "open"; readonly link: PaymentLink };

export async function lookUpPaymentLink(token: unknown, now: Date): Promise<LinkLookup> {
  if (typeof token !== "string" || !looksLikeLinkToken(token)) return { kind: "gone" };
  const link = await findPaymentLinkByTokenHash(getStaffDb(), hashLinkToken(token));
  if (link === null || paymentLinkState(link, now) !== "open") return { kind: "gone" };
  return { kind: "open", link };
}
