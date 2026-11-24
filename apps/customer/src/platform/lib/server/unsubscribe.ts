import "server-only";
import { suppressEmailAddress } from "@brandbasket/db";
import { verifyUnsubscribe } from "@brandbasket/email";
import { getStaffDb } from "./db";

/**
 * The address a signed unsubscribe link names, or null when the link is missing a part or its signature does not match
 * (EMAIL_UNSUBSCRIBE_SECRET signs it, and an unset secret refuses every link). Opening a link never changes anything: a link
 * scanner must not unsubscribe anyone, so only a POST (the button, or a mail client's one-click) calls unsubscribeAddress.
 */
export function readUnsubscribeLink(params: { readonly e?: string | null; readonly t?: string | null }): string | null {
  const address = params.e?.trim().toLowerCase() ?? "";
  const token = params.t ?? "";
  if (address === "" || token === "" || address.length > 320) return null;
  return verifyUnsubscribe(address, token, process.env.EMAIL_UNSUBSCRIBE_SECRET) ? address : null;
}

/**
 * Stops optional mail (monthly reports, preview and request emails) to this address. Receipts, sign-in codes and security
 * mail still go. Staff connection: the person has no session, and only this code path writes the list.
 */
export async function unsubscribeAddress(address: string): Promise<void> {
  await suppressEmailAddress(getStaffDb(), address, "unsubscribe");
}
