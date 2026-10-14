import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { claimSignaturePayload } from "@/lib/directory-api";
import { leadsApiToken } from "./website-api-auth";

/**
 * Whether a claim link's signature is the one the website's server made for this business and name (see
 * lib/directory-api.ts, "A claim link"). `business` is the listing key or the place id exactly as the link carries it:
 * the signature covers whichever it is, in the same place. False when the shared secret is not configured: no claim
 * can be trusted then.
 */
export function hasValidClaimSignature(business: string, name: string, signature: string): boolean {
  const token = leadsApiToken();
  if (token === null || signature === "" || signature.length > 100) return false;
  const expected = createHmac("sha256", token).update(claimSignaturePayload(business, name)).digest();
  const given = Buffer.from(signature, "base64url");
  // Buffer decoding forgives padding, stray characters and spare bits in the last character: only the one
  // spelling the website writes counts, so a link has exactly one valid address.
  if (given.toString("base64url") !== signature) return false;
  return given.length === expected.length && timingSafeEqual(given, expected);
}
