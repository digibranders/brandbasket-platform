import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { BillingCurrency, PaymentMethodDetails } from "@fynix/db";
import { mintAddOnToken, verifyAddOnToken } from "./fake-add-on-token";
import { mintChargeToken, verifyChargeToken } from "./fake-charge-token";
import {
  CheckoutVerificationError,
  type BillingProvider,
  type ConfirmedAddOnPayment,
  type ConfirmedChargePayment,
  type ConfirmedPayment,
  type CreatePlanInput,
  type StartAddOnSubscriptionInput,
  type StartChargePaymentInput,
  type StartCheckoutInput,
  type StartedAddOnSubscription,
  type StartedChargePayment,
  type StartedCheckout,
} from "./provider";
import { chargedAmountCents } from "./tax";

export interface FakeBillingProviderOptions {
  /** Keys the confirmation token. The app passes BETTER_AUTH_SECRET. */
  readonly secret: string;
  /** Clock for `paidAt` and for the token's expiry; injectable for tests. */
  readonly now?: () => Date;
  /** How long a checkout link stays payable. Defaults to one hour. */
  readonly tokenTtlMs?: number;
}

/** Where the fake checkout sends the customer: the dashboard's own confirm page, which stands in for Razorpay's. */
export const FAKE_CONFIRM_PATH = "/billing/confirm";

/** Where the fake payment for a charge sends the customer: the dashboard's stand-in for Razorpay's payment window. */
export const FAKE_CHARGE_CONFIRM_PATH = "/billing/charges/confirm";

/** Where the fake add-on checkout sends the customer: the dashboard's stand-in for Razorpay's payment window. */
export const FAKE_ADD_ON_CONFIRM_PATH = "/add-ons/confirm";

/** A checkout link is payable for this long; after that the customer starts again from Check and send. */
export const FAKE_CHECKOUT_TOKEN_TTL_MS = 60 * 60 * 1000;

const MIN_SECRET_LENGTH = 32;
const MS_PER_SECOND = 1000;
// v2 added the expiry. A v1 token (no expiry) is refused as malformed rather than read as never expiring.
const TOKEN_VERSION = "v2";
const MAX_TOKEN_LENGTH = 512;
const SUBSCRIPTION_ID_BYTES = 12;
const SUBSCRIPTION_ID_PREFIX = "fake_sub_";
const PAYMENT_ID_PREFIX = "fake_pay_";
const ORDER_ID_PREFIX = "fake_order_";

/** Every simulated payment is made with Razorpay's test Visa, so the billing page has a card to show locally. */
export const FAKE_PAYMENT_METHOD: PaymentMethodDetails = {
  method: "card",
  cardNetwork: "Visa",
  cardLast4: "4242",
  cardType: "credit",
  cardIssuer: null,
  upiVpa: null,
};
const FIELD_SEPARATOR = "|";

const SUBSCRIPTION_ID_PATTERN = /^fake_sub_[0-9a-f]{24}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]{0,9})$/;
const EPOCH_SECONDS_PATTERN = /^[1-9][0-9]{0,10}$/;
const TOKEN_PATTERN = /^v2\.([A-Za-z0-9_-]{1,400})\.([A-Za-z0-9_-]{43})$/;
const CURRENCIES: readonly BillingCurrency[] = ["USD", "INR"];

interface TokenClaims {
  readonly providerSubscriptionId: string;
  readonly businessId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  /** Whole seconds since the epoch after which the token is refused. */
  readonly expiresAtEpochSeconds: number;
}

function isCurrency(value: string): value is BillingCurrency {
  return (CURRENCIES as readonly string[]).includes(value);
}

function canonical(claims: TokenClaims): string {
  return [
    claims.providerSubscriptionId,
    claims.businessId,
    String(claims.amountCents),
    claims.currency,
    String(claims.expiresAtEpochSeconds),
  ].join(FIELD_SEPARATOR);
}

function sign(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(message, "utf8").digest();
}

function assertClaims(claims: TokenClaims): void {
  if (!SUBSCRIPTION_ID_PATTERN.test(claims.providerSubscriptionId)) {
    throw new Error(`Not a fake provider subscription id: ${claims.providerSubscriptionId}`);
  }
  if (!UUID_PATTERN.test(claims.businessId)) throw new Error(`Business id must be a UUID, received ${claims.businessId}`);
  if (!Number.isSafeInteger(claims.amountCents) || claims.amountCents <= 0) {
    throw new RangeError(`Checkout amount must be a positive whole number of minor units, received ${claims.amountCents}`);
  }
  if (!Number.isSafeInteger(claims.expiresAtEpochSeconds) || claims.expiresAtEpochSeconds <= 0) {
    throw new RangeError(`Checkout expiry must be a positive whole number of seconds, received ${claims.expiresAtEpochSeconds}`);
  }
}

function mintToken(secret: string, claims: TokenClaims): string {
  assertClaims(claims);
  const message = canonical(claims);
  const payload = Buffer.from(message, "utf8").toString("base64url");
  return `${TOKEN_VERSION}.${payload}.${sign(secret, message).toString("base64url")}`;
}

/**
 * Checks the signature before reading a single claim, and compares it in constant time. Every failure raises the
 * same kind of error with a reason that never includes the token.
 */
function verifyToken(secret: string, token: string, now: Date): TokenClaims {
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

  const [providerSubscriptionId, businessId, amount, currency, expiresAt, ...rest] = message.split(FIELD_SEPARATOR);
  if (
    providerSubscriptionId === undefined ||
    businessId === undefined ||
    amount === undefined ||
    currency === undefined ||
    expiresAt === undefined ||
    rest.length > 0 ||
    !SUBSCRIPTION_ID_PATTERN.test(providerSubscriptionId) ||
    !UUID_PATTERN.test(businessId) ||
    !MINOR_UNITS_PATTERN.test(amount) ||
    !isCurrency(currency) ||
    !EPOCH_SECONDS_PATTERN.test(expiresAt)
  ) {
    throw new CheckoutVerificationError("the token's contents are not valid", { signatureVerified: true });
  }
  const expiresAtEpochSeconds = Number(expiresAt);
  // Expired at the stated second, not one second after it.
  if (now.getTime() >= expiresAtEpochSeconds * MS_PER_SECOND) {
    throw new CheckoutVerificationError("the checkout has expired", { signatureVerified: true });
  }
  return { providerSubscriptionId, businessId, amountCents: Number(amount), currency, expiresAtEpochSeconds };
}

function readToken(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("token" in payload)) {
    throw new CheckoutVerificationError("no token was supplied");
  }
  const { token } = payload;
  if (typeof token !== "string" || token === "") throw new CheckoutVerificationError("no token was supplied");
  return token;
}

/**
 * A stand-in for Razorpay that runs entirely locally. "Checking out" sends the customer straight to the dashboard's
 * confirm page carrying a signed token, and visiting that page is the payment.
 *
 * The token is the one part written as if it were real, because it is all that stands between a URL and an unlocked
 * dashboard. It is an HMAC-SHA256, keyed with the app's auth secret, over
 * `providerSubscriptionId|businessId|amountCents|currency`, so editing any of those in the URL breaks it. The
 * caller must still check that the token's business is the signed-in customer's, or one customer's link would
 * unlock the dashboard for whoever opened it.
 */
export function createFakeBillingProvider(options: FakeBillingProviderOptions): BillingProvider {
  const { secret } = options;
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`The fake billing provider needs a secret of at least ${MIN_SECRET_LENGTH} characters.`);
  }
  const now = options.now ?? ((): Date => new Date());
  const tokenTtlMs = options.tokenTtlMs ?? FAKE_CHECKOUT_TOKEN_TTL_MS;
  if (!Number.isSafeInteger(tokenTtlMs) || tokenTtlMs < MS_PER_SECOND) {
    throw new RangeError(`The checkout link lifetime must be at least one second, received ${tokenTtlMs}`);
  }

  return {
    name: "fake",

    // Async so that a refused input rejects rather than throwing synchronously, as a real provider's would.
    async startCheckout(input: StartCheckoutInput): Promise<StartedCheckout> {
      const providerSubscriptionId =
        input.existingProviderSubscriptionId ??
        `${SUBSCRIPTION_ID_PREFIX}${randomBytes(SUBSCRIPTION_ID_BYTES).toString("hex")}`;
      // Charged through the same function everything else uses, discount before tax, so the local and test path
      // takes exactly what Razorpay would. It throws for a discount that leaves nothing to charge.
      const amountCents = chargedAmountCents(
        input.plan.initialAmountCents + (input.bundledAddOnNetCents ?? 0),
        input.discountAmountCents ?? 0,
        input.plan.taxRateBasisPoints,
      );
      const token = mintToken(secret, {
        providerSubscriptionId,
        businessId: input.businessId,
        amountCents,
        currency: input.plan.currency,
        expiresAtEpochSeconds: Math.floor((now().getTime() + tokenTtlMs) / MS_PER_SECOND),
      });
      return {
        providerSubscriptionId,
        checkoutUrl: `${FAKE_CONFIRM_PATH}?${new URLSearchParams({ token }).toString()}`,
      };
    },

    async confirmCheckout(payload: unknown): Promise<ConfirmedPayment> {
      const paidAt = now();
      const claims = verifyToken(secret, readToken(payload), paidAt);
      return {
        providerSubscriptionId: claims.providerSubscriptionId,
        businessId: claims.businessId,
        amountCents: claims.amountCents,
        currency: claims.currency,
        // One initial payment per fake subscription, so the id is derived from it: a refreshed confirm page
        // presents the same payment again and is recorded once.
        providerPaymentId: `${PAYMENT_ID_PREFIX}${claims.providerSubscriptionId.slice(SUBSCRIPTION_ID_PREFIX.length)}`,
        paidAt,
        method: FAKE_PAYMENT_METHOD,
      };
    },

    /**
     * The fake provider keeps no state, so there is nothing to cancel: a link minted for a cancelled checkout still
     * verifies until it expires. That is deliberate. It is exactly the late payment a real provider can deliver, and
     * it lets the "payment against a replaced checkout" path be exercised locally. The id is still checked, so a
     * caller that passes the wrong thing finds out here rather than at Razorpay.
     */
    async cancelSubscription(providerSubscriptionId: string): Promise<void> {
      if (!SUBSCRIPTION_ID_PATTERN.test(providerSubscriptionId)) {
        throw new Error(`Not a fake provider subscription id: ${providerSubscriptionId}`);
      }
    },

    async cancelSubscriptionAtPeriodEnd(providerSubscriptionId: string): Promise<void> {
      if (!SUBSCRIPTION_ID_PATTERN.test(providerSubscriptionId)) {
        throw new Error(`Not a fake provider subscription id: ${providerSubscriptionId}`);
      }
    },

    /** The fake provider has no plans of its own: a discounted subscription simply charges less. Nothing to move. */
    async changeSubscriptionPlanAtPeriodEnd(providerSubscriptionId: string): Promise<void> {
      if (!SUBSCRIPTION_ID_PATTERN.test(providerSubscriptionId)) {
        throw new Error(`Not a fake provider subscription id: ${providerSubscriptionId}`);
      }
    },

    /**
     * Opens a fresh "order" for a charge and sends the customer to the confirm page with a signed link naming it.
     * Every attempt gets a new order id, as each Razorpay order would, so an old link pays nothing once replaced.
     */
    async startChargePayment(input: StartChargePaymentInput): Promise<StartedChargePayment> {
      const providerOrderId = `${ORDER_ID_PREFIX}${randomBytes(SUBSCRIPTION_ID_BYTES).toString("hex")}`;
      const token = mintChargeToken(secret, {
        providerOrderId,
        chargeId: input.chargeId,
        businessId: input.businessId,
        amountCents: input.amountCents,
        currency: input.currency,
        expiresAtEpochSeconds: Math.floor((now().getTime() + tokenTtlMs) / MS_PER_SECOND),
      });
      return {
        providerOrderId,
        redirectTo: `${FAKE_CHARGE_CONFIRM_PATH}?${new URLSearchParams({ token }).toString()}`,
      };
    },

    /**
     * Opens a fresh "subscription" for one add-on and sends the customer to the confirm page with a signed link naming
     * it. Every attempt gets a new subscription id, as each Razorpay subscription would. A `startAt` is carried in the
     * link, so confirming a kept add-on reports it as authorised only, with no payment until that day.
     */
    async startAddOnSubscription(input: StartAddOnSubscriptionInput): Promise<StartedAddOnSubscription> {
      const providerSubscriptionId = `${SUBSCRIPTION_ID_PREFIX}${randomBytes(SUBSCRIPTION_ID_BYTES).toString("hex")}`;
      const token = mintAddOnToken(secret, {
        providerSubscriptionId,
        addOnSubscriptionId: input.addOnSubscriptionId,
        businessId: input.businessId,
        amountCents: input.amountCents,
        currency: input.currency,
        startAtEpochSeconds: input.startAt === null ? 0 : Math.floor(input.startAt.getTime() / MS_PER_SECOND),
        expiresAtEpochSeconds: Math.floor((now().getTime() + tokenTtlMs) / MS_PER_SECOND),
      });
      return {
        providerSubscriptionId,
        checkoutUrl: `${FAKE_ADD_ON_CONFIRM_PATH}?${new URLSearchParams({ token }).toString()}`,
      };
    },

    async confirmAddOnPayment(payload: unknown): Promise<ConfirmedAddOnPayment> {
      const paidAt = now();
      const claims = verifyAddOnToken(secret, readToken(payload), paidAt);
      return {
        providerSubscriptionId: claims.providerSubscriptionId,
        // One first payment per fake subscription, so a refreshed confirm page presents the same payment again and is
        // recorded once. A kept add-on has none yet: it is only authorised and first charged on its start date.
        providerPaymentId:
          claims.startAtEpochSeconds > 0
            ? null
            : `${PAYMENT_ID_PREFIX}${claims.providerSubscriptionId.slice(SUBSCRIPTION_ID_PREFIX.length)}`,
        addOnSubscriptionId: claims.addOnSubscriptionId,
        businessId: claims.businessId,
        amountCents: claims.amountCents,
        currency: claims.currency,
        paidAt,
        method: FAKE_PAYMENT_METHOD,
      };
    },

    /** Simulated payments need no plan at a provider: the amount comes from our own plan row. */
    async createPlan(input: CreatePlanInput): Promise<{ readonly providerPlanId: string | null }> {
      chargedAmountCents(input.netMonthlyCents, 0, input.taxRateBasisPoints);
      return { providerPlanId: null };
    },

    async confirmChargePayment(payload: unknown): Promise<ConfirmedChargePayment> {
      const paidAt = now();
      const claims = verifyChargeToken(secret, readToken(payload), paidAt);
      return {
        providerOrderId: claims.providerOrderId,
        // One payment per order, so a refreshed confirm page presents the same payment again and is recorded once.
        providerPaymentId: `${PAYMENT_ID_PREFIX}${claims.providerOrderId.slice(ORDER_ID_PREFIX.length)}`,
        businessId: claims.businessId,
        chargeId: claims.chargeId,
        amountCents: claims.amountCents,
        currency: claims.currency,
        paidAt,
        method: FAKE_PAYMENT_METHOD,
      };
    },
  };
}
