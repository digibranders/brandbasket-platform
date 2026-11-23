import { createHmac, timingSafeEqual } from "node:crypto";

/** The secret that signs unsubscribe links. Shorter than this is treated as not set, so no weakly signed link is ever made. */
export const UNSUBSCRIBE_SECRET_MIN_LENGTH = 32;
/** The one-click path the List-Unsubscribe header points at (POST), and that a person's GET is sent on from. */
export const UNSUBSCRIBE_PATH = "/api/unsubscribe";

function signature(address: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${address.trim().toLowerCase()}`).digest("base64url");
}

/** A signed link that unsubscribes this address from optional mail, or null when the secret is not set or too short. */
export function unsubscribeUrl(address: string, env: { readonly secret?: string | undefined; readonly origin: string }): string | null {
  const secret = env.secret?.trim() ?? "";
  if (secret.length < UNSUBSCRIBE_SECRET_MIN_LENGTH) return null;
  const url = new URL(UNSUBSCRIBE_PATH, env.origin);
  url.searchParams.set("e", address.trim().toLowerCase());
  url.searchParams.set("t", signature(address, secret));
  return url.toString();
}

/** Whether `token` is the signature this secret makes for this address. */
export function verifyUnsubscribe(address: string, token: string, secret: string | undefined): boolean {
  const key = secret?.trim() ?? "";
  if (key.length < UNSUBSCRIBE_SECRET_MIN_LENGTH) return false;
  const expected = Buffer.from(signature(address, key));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
