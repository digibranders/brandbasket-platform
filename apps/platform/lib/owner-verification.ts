/**
 * Whether an owner may verify their own business with a code to its number, and what to say when they may not. No
 * server imports, so the dashboard's pages can use it (the work itself is lib/server/owner-verification.ts).
 */
import type { DirectoryClaim } from "@firstfold/db";

/** A full international number: the code goes to the number the owner gave for the listing. */
const E164 = /^\+[0-9]{8,15}$/;

export type VerificationEligibility = "ok" | "no_listing" | "rejected" | "no_place" | "no_phone";

export function verificationEligibility(claim: DirectoryClaim | null): VerificationEligibility {
  if (claim === null) return "no_listing";
  if (claim.status === "rejected") return "rejected";
  if (claim.placeId === null) return "no_place";
  if (!E164.test(claim.phone)) return "no_phone";
  return "ok";
}

const MESSAGES: Readonly<Record<Exclude<VerificationEligibility, "ok">, string>> = {
  no_listing: "Add your business to the directory first, then you can verify it.",
  rejected: "This listing was not accepted, so it can't be verified. Email us and we'll sort it out.",
  no_place: "Your business is not in the directory yet. Finish your listing first, then verify it.",
  no_phone: "Your business needs a mobile number with its country code before it can be verified. Add it on Details.",
};

export function verificationRefusalMessage(refusal: Exclude<VerificationEligibility, "ok">): string {
  return MESSAGES[refusal];
}
