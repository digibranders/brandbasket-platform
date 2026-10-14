import "server-only";
import {
  findClaimForBusiness,
  readDirectoryStatuses,
  upsertDirectoryVerification,
  withTenantScope,
  type DirectoryClaim,
} from "@firstfold/db";
import { phoneHint } from "@firstfold/shared/lib/appointments/booking-form";
import { verificationEligibility, type VerificationEligibility } from "@/lib/owner-verification";
import { confirmAccountOtp, requestAccountOtp, type AccountOtpConfirmOutcome } from "./account-otp";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

/*
 * An owner marking their own business Verified: a code to the number they gave for the listing (a business
 * verification, see account-otp.ts and VERIFY_OTP_BYPASS in ./env.ts), then the same verification staff make in the
 * console (upsertDirectoryVerification), recorded as made by the owner. The claim comes only from the session's
 * tenant, never from the request. Writes run on the staff connection: the place registry and the verifications are
 * staff-only, like every other write the Business profile makes (./business-profile.ts).
 */

type Customer = Pick<GrantedCustomer, "tenant">;
type Refusal = Exclude<VerificationEligibility, "ok">;

export type OwnerVerificationState =
  | { readonly kind: "unavailable"; readonly refusal: Refusal }
  | { readonly kind: "verified"; readonly verifiedAt: Date }
  | { readonly kind: "ready"; readonly phoneHint: string };

async function readClaim(customer: Customer): Promise<DirectoryClaim | null> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => findClaimForBusiness(tx, tenant.businessId));
}

/** When the business was verified, or null when it has not been. */
async function verifiedAtOf(placeId: string): Promise<Date | null> {
  const statuses = await readDirectoryStatuses(getStaffDb(), { placeIds: [placeId], unplacedKeys: [] });
  return statuses.get(placeId)?.verifiedAt ?? null;
}

/** What the Review tab shows about verification: whether it is done, can be started, or cannot be yet. */
export async function ownerVerificationState(customer: Customer): Promise<OwnerVerificationState> {
  const claim = await readClaim(customer);
  const eligibility = verificationEligibility(claim);
  if (eligibility !== "ok" || claim === null || claim.placeId === null) {
    return { kind: "unavailable", refusal: eligibility === "ok" ? "no_listing" : eligibility };
  }
  const verifiedAt = await verifiedAtOf(claim.placeId);
  return verifiedAt === null ? { kind: "ready", phoneHint: phoneHint(claim.phone) } : { kind: "verified", verifiedAt };
}

export type RequestOwnerVerificationOutcome =
  | { readonly kind: "sent"; readonly otpId: string; readonly phoneHint: string; readonly texted: boolean }
  | { readonly kind: "refused"; readonly refusal: Refusal }
  | { readonly kind: "already_verified" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "limited" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" };

/** Sends the business's number a code (nothing, with VERIFY_OTP_BYPASS on). */
export async function requestOwnerVerification(customer: Customer, clientIp: string, now: Date): Promise<RequestOwnerVerificationOutcome> {
  const claim = await readClaim(customer);
  const eligibility = verificationEligibility(claim);
  if (eligibility !== "ok") return { kind: "refused", refusal: eligibility };
  if (claim === null || claim.placeId === null) return { kind: "refused", refusal: "no_listing" };
  if ((await verifiedAtOf(claim.placeId)) !== null) return { kind: "already_verified" };

  const outcome = await requestAccountOtp({ purpose: "verify_business", phone: claim.phone, send: true }, clientIp, now);
  if (outcome.kind === "sent") return { kind: "sent", otpId: outcome.otpId, phoneHint: outcome.phoneHint, texted: outcome.texted };
  return outcome;
}

export interface OwnerVerificationConfirmation {
  readonly otpId: string;
  readonly code: string;
}

export type ConfirmOwnerVerificationOutcome =
  | { readonly kind: "verified" }
  | { readonly kind: "refused"; readonly refusal: Refusal }
  | Exclude<AccountOtpConfirmOutcome, { readonly kind: "confirmed" }>;

/**
 * Checks the code and, when it is right, verifies the business. A business that cannot verify is refused before the
 * code is used, so a wrong state never costs the owner a try.
 */
export async function confirmOwnerVerification(
  customer: Customer,
  input: OwnerVerificationConfirmation,
  clientIp: string,
  now: Date,
): Promise<ConfirmOwnerVerificationOutcome> {
  const claim = await readClaim(customer);
  const eligibility = verificationEligibility(claim);
  if (eligibility !== "ok") return { kind: "refused", refusal: eligibility };
  if (claim === null) return { kind: "refused", refusal: "no_listing" };

  const outcome = await confirmAccountOtp({ ...input, purpose: "verify_business", phone: claim.phone }, clientIp, now);
  if (outcome.kind !== "confirmed") return outcome;

  await upsertDirectoryVerification(getStaffDb(), {
    listingKey: claim.listingKey,
    businessName: claim.businessName,
    phone: claim.phone,
    staffUserId: customer.tenant.userId,
    now,
  });
  return { kind: "verified" };
}
