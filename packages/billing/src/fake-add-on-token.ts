import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingCurrency } from "@fynix/db";
import { CheckoutVerificationError } from "./provider";

/**
 * The fake provider's signed link for opening one add-on subscription, kept apart from its plan checkout and charge
 * tokens. Each kind is signed with its own prefix ("addon|" here) and carries its own version, so a plan or charge
 * token can never be replayed as an add-on payment or the other way round, even though all share one secret.
 */

const TOKEN_VERSION = "a1";
const SIGNING_PREFIX = "addon|";
const FIELD_SEPARATOR = "|";
const MAX_TOKEN_LENGTH = 700;
const MS_PER_SECOND = 1000;

const FAKE_SUBSCRIPTION_ID_PATTERN = /^fake_sub_[0-9a-f]{24}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MINOR_UNITS_PATTERN = /^[1-9][0-9]{0,9}$/;
const EPOCH_SECONDS_PATTERN = /^[1-9][0-9]{0,10}$/;
const START_AT_PATTERN = /^(0|[1-9][0-9]{0,10})$/;
const TOKEN_PATTERN = /^a1\.([A-Za-z0-9_-]{1,600})\.([A-Za-z0-9_-]{43})$/;
const CURRENCIES: readonly BillingCurrency[] = ["USD", "INR"];

export interface AddOnTokenClaims {
  readonly providerSubscriptionId: string;
  readonly addOnSubscriptionId: string;
  readonly businessId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  /** Whole seconds since the epoch when a kept subscription is first charged; 0 when it starts at once. */
  readonly startAtEpochSeconds: number;
  readonly expiresAtEpochSeconds: number;
}

function isCurrency(value: string): value is BillingCurrency {
  return (CURRENCIES as readonly string[]).includes(value);
}

function canonical(claims: AddOnTokenClaims): string {
  return [
    claims.providerSubscriptionId,
    claims.addOnSubscriptionId,
    claims.businessId,
    String(claims.amountCents),
    claims.currency,
    String(claims.startAtEpochSeconds),
    String(claims.expiresAtEpochSeconds),
  ].join(FIELD_SEPARATOR);
}

function sign(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(`${SIGNING_PREFIX}${message}`, "utf8").digest();
}

export function mintAddOnToken(secret: string, claims: AddOnTokenClaims): string {
  if (!FAKE_SUBSCRIPTION_ID_PATTERN.test(claims.providerSubscriptionId)) {
    throw new Error(`Not a fake provider subscription id: ${claims.providerSubscriptionId}`);
  }
  if (!UUID_PATTERN.test(claims.addOnSubscriptionId)) {
    throw new Error(`Add-on subscription id must be a UUID, received ${claims.addOnSubscriptionId}`);
  }
  if (!UUID_PATTERN.test(claims.businessId)) throw new Error(`Business id must be a UUID, received ${claims.businessId}`);
  if (!Number.isSafeInteger(claims.amountCents) || claims.amountCents <= 0) {
    throw new RangeError(`An add-on amount must be a positive whole number of minor units, received ${claims.amountCents}`);
  }
  if (!Number.isSafeInteger(claims.startAtEpochSeconds) || claims.startAtEpochSeconds < 0) {
    throw new RangeError(`An add-on start must be whole seconds, or 0 for none, received ${claims.startAtEpochSeconds}`);
  }
  if (!Number.isSafeInteger(claims.expiresAtEpochSeconds) || claims.expiresAtEpochSeconds <= 0) {
    throw new RangeError(`Checkout expiry must be a positive whole number of seconds, received ${claims.expiresAtEpochSeconds}`);
  }
  const message = canonical(claims);
  return `${TOKEN_VERSION}.${Buffer.from(message, "utf8").toString("base64url")}.${sign(secret, message).toString("base64url")}`;
}

/** Checks the signature first, in constant time, then the claims and the expiry. Reasons never include the token. */
export function verifyAddOnToken(secret: string, token: string, now: Date): AddOnTokenClaims {
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

  const [providerSubscriptionId, addOnSubscriptionId, businessId, amount, currency, startAt, expiresAt, ...rest] =
    message.split(FIELD_SEPARATOR);
  if (
    providerSubscriptionId === undefined ||
    addOnSubscriptionId === undefined ||
    businessId === undefined ||
    amount === undefined ||
    currency === undefined ||
    startAt === undefined ||
    expiresAt === undefined ||
    rest.length > 0 ||
    !FAKE_SUBSCRIPTION_ID_PATTERN.test(providerSubscriptionId) ||
    !UUID_PATTERN.test(addOnSubscriptionId) ||
    !UUID_PATTERN.test(businessId) ||
    !MINOR_UNITS_PATTERN.test(amount) ||
    !isCurrency(currency) ||
    !START_AT_PATTERN.test(startAt) ||
    !EPOCH_SECONDS_PATTERN.test(expiresAt)
  ) {
    throw new CheckoutVerificationError("the token's contents are not valid", { signatureVerified: true });
  }
  const expiresAtEpochSeconds = Number(expiresAt);
  if (now.getTime() >= expiresAtEpochSeconds * MS_PER_SECOND) {
    throw new CheckoutVerificationError("the add-on link has expired", { signatureVerified: true });
  }
  return {
    providerSubscriptionId,
    addOnSubscriptionId,
    businessId,
    amountCents: Number(amount),
    currency,
    startAtEpochSeconds: Number(startAt),
    expiresAtEpochSeconds,
  };
}
