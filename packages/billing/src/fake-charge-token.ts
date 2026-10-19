import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingCurrency } from "@brandbasket/db";
import { CheckoutVerificationError } from "./provider";

/**
 * The fake provider's signed link for paying one charge, kept apart from its checkout token. The two are signed with
 * different prefixes ("charge|" here), so a plan-checkout token can never be replayed as a charge payment or the
 * other way round, even though both use the same secret.
 */

const TOKEN_VERSION = "c1";
const SIGNING_PREFIX = "charge|";
const FIELD_SEPARATOR = "|";
const MAX_TOKEN_LENGTH = 600;
const MS_PER_SECOND = 1000;

export const FAKE_ORDER_ID_PATTERN = /^fake_order_[0-9a-f]{24}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MINOR_UNITS_PATTERN = /^[1-9][0-9]{0,9}$/;
const EPOCH_SECONDS_PATTERN = /^[1-9][0-9]{0,10}$/;
const TOKEN_PATTERN = /^c1\.([A-Za-z0-9_-]{1,500})\.([A-Za-z0-9_-]{43})$/;
const CURRENCIES: readonly BillingCurrency[] = ["USD", "INR"];

export interface ChargeTokenClaims {
  readonly providerOrderId: string;
  readonly chargeId: string;
  readonly businessId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly expiresAtEpochSeconds: number;
}

function isCurrency(value: string): value is BillingCurrency {
  return (CURRENCIES as readonly string[]).includes(value);
}

function canonical(claims: ChargeTokenClaims): string {
  return [
    claims.providerOrderId,
    claims.chargeId,
    claims.businessId,
    String(claims.amountCents),
    claims.currency,
    String(claims.expiresAtEpochSeconds),
  ].join(FIELD_SEPARATOR);
}

function sign(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(`${SIGNING_PREFIX}${message}`, "utf8").digest();
}

export function mintChargeToken(secret: string, claims: ChargeTokenClaims): string {
  if (!FAKE_ORDER_ID_PATTERN.test(claims.providerOrderId)) throw new Error(`Not a fake order id: ${claims.providerOrderId}`);
  if (!UUID_PATTERN.test(claims.chargeId)) throw new Error(`Charge id must be a UUID, received ${claims.chargeId}`);
  if (!UUID_PATTERN.test(claims.businessId)) throw new Error(`Business id must be a UUID, received ${claims.businessId}`);
  if (!Number.isSafeInteger(claims.amountCents) || claims.amountCents <= 0) {
    throw new RangeError(`A charge amount must be a positive whole number of minor units, received ${claims.amountCents}`);
  }
  const message = canonical(claims);
  return `${TOKEN_VERSION}.${Buffer.from(message, "utf8").toString("base64url")}.${sign(secret, message).toString("base64url")}`;
}

/** Checks the signature first, in constant time, then the claims and the expiry. Reasons never include the token. */
export function verifyChargeToken(secret: string, token: string, now: Date): ChargeTokenClaims {
  if (token.length > MAX_TOKEN_LENGTH) throw new CheckoutVerificationError("the token is too long");
  const match = TOKEN_PATTERN.exec(token);
  const encodedPayload = match?.[1];
  const encodedSignature = match?.[2];
  if (encodedPayload === undefined || encodedSignature === undefined) {
    throw new CheckoutVerificationError("the token is malformed");
  }
  const message = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const expected = sign(secret, message);
  const given = Buffer.from(encodedSignature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new CheckoutVerificationError("the signature does not match");
  }

  const [providerOrderId, chargeId, businessId, amount, currency, expiresAt, ...rest] = message.split(FIELD_SEPARATOR);
  if (
    providerOrderId === undefined ||
    chargeId === undefined ||
    businessId === undefined ||
    amount === undefined ||
    currency === undefined ||
    expiresAt === undefined ||
    rest.length > 0 ||
    !FAKE_ORDER_ID_PATTERN.test(providerOrderId) ||
    !UUID_PATTERN.test(chargeId) ||
    !UUID_PATTERN.test(businessId) ||
    !MINOR_UNITS_PATTERN.test(amount) ||
    !isCurrency(currency) ||
    !EPOCH_SECONDS_PATTERN.test(expiresAt)
  ) {
    throw new CheckoutVerificationError("the token's contents are not valid", { signatureVerified: true });
  }
  const expiresAtEpochSeconds = Number(expiresAt);
  if (now.getTime() >= expiresAtEpochSeconds * MS_PER_SECOND) {
    throw new CheckoutVerificationError("the payment link has expired", { signatureVerified: true });
  }
  return { providerOrderId, chargeId, businessId, amountCents: Number(amount), currency, expiresAtEpochSeconds };
}
