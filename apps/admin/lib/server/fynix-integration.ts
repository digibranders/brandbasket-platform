import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The shared secret Fynix Sales sends as `Authorization: Bearer <key>` to create coupons here. Unset or shorter than 32
 * characters means the integration is off and the route refuses every request.
 */
export const FYNIX_KEY_MIN_LENGTH = 32;

export function fynixIntegrationKey(): string | null {
  const key = process.env.FYNIX_INTEGRATION_KEY?.trim() ?? "";
  return key.length >= FYNIX_KEY_MIN_LENGTH ? key : null;
}

/** The existing staff user the coupons Fynix creates are recorded against (the table needs a staff id). Null when unset. */
export function fynixCouponStaffUserId(): string | null {
  const id = process.env.FYNIX_COUPON_STAFF_USER_ID?.trim() ?? "";
  return id === "" ? null : id;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Compares digests so neither the length nor the content of the key leaks through timing. */
export function hasValidFynixKey(request: Request, key: string): boolean {
  const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  if (match?.[1] === undefined) return false;
  return timingSafeEqual(digest(match[1]), digest(key));
}

/** The JSON body Fynix posts, turned into the form fields the console's own coupon form uses, so one validator serves both. */
export function couponFormFromJson(body: unknown): FormData | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const formData = new FormData();
  for (const field of ["code", "currency", "discountKind", "discountValue", "discountMonths", "expiresAt", "maxRedemptions"] as const) {
    const value = record[field];
    if (typeof value === "string" || typeof value === "number") formData.set(field, String(value));
  }
  return formData;
}
