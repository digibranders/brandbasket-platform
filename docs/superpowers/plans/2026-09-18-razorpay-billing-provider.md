# Razorpay Billing Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake billing provider with a real Razorpay adapter, so a customer's first payment and every monthly renewal actually move money, while every existing screen (Check and send, the billing page, admin) keeps working unchanged because they only ever talk to the `BillingProvider` interface.

**Architecture:** Razorpay Subscriptions (recurring auto-charge) is the mechanism, decided 2026-09-18 to match "cancel anytime, reminded before renewal." The customer authorizes once through Razorpay's own Checkout widget (`checkout.js`, loaded on one small page of ours); Razorpay then auto-charges monthly and tells us what happened two ways:

- **The browser callback** (`callback_url`), a plain cross-site form POST from checkout.razorpay.com back to our domain. This is UX only — it decides where the customer's browser lands next. It is never trusted to activate anything, for two reasons: a cross-site POST does not reliably carry our session cookie (`SameSite=Lax` blocks that), and a client-relayed "I paid" claim is never authoritative on its own.
- **The webhook** (`/api/webhooks/razorpay`), a server-to-server POST authenticated with an HMAC-SHA256 signature over the raw body, keyed with a webhook secret only Razorpay and we know. This is the one place that ever activates a subscription or records a payment from Razorpay. It handles both the first payment and every renewal, which is a simplification over the fake provider: there is no separate "confirm" step for Razorpay at all.

The existing `BillingProvider` interface (`packages/billing/src/provider.ts`) is not changed. `confirmCheckout` is still implemented, to satisfy the contract, but nothing in this app's Razorpay path calls it — see Task 4's docblock for why that is deliberate, not an oversight.

**Tech Stack:** `razorpay` (official Node SDK) for API calls; hand-written `node:crypto` HMAC verification for both signature checks, matching how `fake-provider.ts` already does its own signing rather than trusting a library for the security-critical part; Next.js 16 Route Handlers for the callback and webhook; zod 4 for webhook payload validation; Vitest.

---

## Ground rules for the engineer

- **Read first:** `packages/billing/src/provider.ts`, `fake-provider.ts`, `status.ts`, `select.ts`, `factory.ts` (the interface you are implementing against and the pattern to match); `apps/platform/lib/server/billing.ts`, `checkout.ts`, `payment-confirmation.ts`, `billing-activation.ts`, `provider-cancellation.ts`, `billing-log.ts` (how the platform calls the provider today); `packages/db/src/queries/billing.ts` (every query you will call or extend).
- **Do not commit.** This repo stays uncommitted for now (per user instruction).
- **Do not start a dev server.** The user runs their own. Use the `fynix-platform-verify` preview config if you need to build and check something.
- **Money is integer minor units always** — cents for USD, paise for INR. Razorpay's API is also minor units, so no conversion is needed, but never let a float near any of this.
- **Checkpoint after every task:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Task 2 and Task 6 also touch the database: run `pnpm db:migrate && pnpm db:migrate:test` after their migration steps.
- **Never log a signature, a token, a webhook body, or a key secret.** Follow `billing-log.ts`'s existing rule: log the event name and safe identifiers (business id, subscription id, provider payment id), never the credential that proved them.
- **The two Razorpay secrets are different things.** `RAZORPAY_KEY_SECRET` signs the checkout-widget payment/subscription confirmation (`payment_id|subscription_id`). `RAZORPAY_WEBHOOK_SECRET` signs the webhook body. Do not use one where the other belongs — Razorpay issues them separately and rotates them independently.

---

### Task 1: Dependency, env vars, and turning Razorpay "on" as a supported provider

**Files:**
- Modify: `packages/billing/package.json`
- Modify: `packages/billing/src/select.ts`
- Modify: `apps/platform/.env.example`

- [ ] **Step 1: Add the SDK**

```bash
pnpm --filter @brandbasket/billing add razorpay
```

- [ ] **Step 2: Turn Razorpay on in `select.ts`**

In `packages/billing/src/select.ts`, change:

```ts
export const SUPPORTED_BILLING_PROVIDERS = ["fake"] as const satisfies readonly BillingProviderName[];
```

to:

```ts
export const SUPPORTED_BILLING_PROVIDERS = ["fake", "razorpay"] as const satisfies readonly BillingProviderName[];
```

- [ ] **Step 3: Document the new env vars**

In `apps/platform/.env.example`, replace the `BILLING_PROVIDER` block's comment (it currently says "Razorpay is added when its adapter lands") with:

```
# Who takes payments. Accepted values: fake (a local test checkout; no money moves), razorpay.
# Optional in development, where unset means fake. Required in production: an unset value stops the app rather
# than taking payments with the fake provider. The fake provider is also refused on a real deployment
# (VERCEL_ENV=production, or an https APP_ORIGIN whose host is not localhost), because it hands out paid access
# without taking money. The local verify server (http://app.localhost:3101) is not a real deployment and needs
# nothing extra.
BILLING_PROVIDER=

# Required when BILLING_PROVIDER=razorpay. From the Razorpay dashboard (Settings > API Keys). The key id is not
# secret and is also read by the browser as NEXT_PUBLIC_RAZORPAY_KEY_ID (see below) to open the checkout widget.
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Required when BILLING_PROVIDER=razorpay. From the Razorpay dashboard (Settings > Webhooks), where the webhook
# below (POST {APP_ORIGIN}/api/webhooks/razorpay) must also be registered, subscribed to every subscription.* event
# and payment.failed.
RAZORPAY_WEBHOOK_SECRET=

# Same value as RAZORPAY_KEY_ID. Next.js only exposes NEXT_PUBLIC_* vars to the browser, and the checkout widget
# runs there; duplicating it under both names keeps the server-side read (RAZORPAY_KEY_ID) free of a fixed
# public-exposure assumption.
NEXT_PUBLIC_RAZORPAY_KEY_ID=
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter @brandbasket/billing typecheck
```
Expected: passes (the SDK has its own types; nothing references it yet).

---

### Task 2: Razorpay Plans, and getting their ids into `plans.provider_plan_id`

Razorpay's own "Plan" object (period + amount + currency) is a separate thing from our `plans` table row; `plans.provider_plan_id` is where its id is stored. Create one Razorpay Plan per currency, once, with a script — not by hand in the dashboard, so nothing about pricing is typed in twice.

**Files:**
- Create: `packages/billing/scripts/create-razorpay-plans.ts`
- Create: `packages/db/migrations/0027_razorpay_plan_ids.sql` (values filled in from the script's output, Step 3)

- [ ] **Step 1: Write the script**

```ts
// packages/billing/scripts/create-razorpay-plans.ts
//
// One-off: creates the two Razorpay Plans (USD and INR) this app charges against, and prints their ids so they can
// be written into plans.provider_plan_id (see docs/superpowers/plans/2026-09-18-razorpay-billing-provider.md, Task
// 2). Run once per Razorpay account (test mode, then again in live mode before going live). Re-running it creates
// duplicate plans at Razorpay rather than reusing existing ones, because the Plans API has no "find by name": check
// the dashboard first if you are not sure whether this has already been run.
//
// Usage: RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... pnpm --filter @brandbasket/billing exec tsx scripts/create-razorpay-plans.ts

import Razorpay from "razorpay";

interface PlanToCreate {
  readonly code: "care-usd" | "care-inr";
  readonly currency: "USD" | "INR";
  /** Integer minor units: cents or paise. Must match plans.recurring_amount_cents in the database. */
  readonly recurringAmountCents: number;
}

// Kept in sync with packages/db/migrations (0021_usd_monthly_plan.sql, 0023_inr_3500_plan.sql): both plans are
// monthly from the first payment, so the Razorpay Plan's amount is the one recurring price for both the first
// charge and every renewal.
const PLANS_TO_CREATE: readonly PlanToCreate[] = [
  { code: "care-usd", currency: "USD", recurringAmountCents: 7_500 },
  { code: "care-inr", currency: "INR", recurringAmountCents: 350_000 },
];

async function main(): Promise<void> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (keyId === undefined || keySecret === undefined) {
    throw new Error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before running this script.");
  }
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });

  for (const plan of PLANS_TO_CREATE) {
    const created = await client.plans.create({
      period: "monthly",
      interval: 1,
      item: {
        name: `Fynix care plan (${plan.currency})`,
        amount: plan.recurringAmountCents,
        currency: plan.currency,
      },
      notes: { fynixPlanCode: plan.code },
    });
    console.log(`${plan.code}: ${created.id}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run it against the test-mode keys**

```bash
RAZORPAY_KEY_ID=<your test key id> RAZORPAY_KEY_SECRET=<your test key secret> \
  pnpm --filter @brandbasket/billing exec tsx scripts/create-razorpay-plans.ts
```
Expected output: two lines, `care-usd: plan_XXXXXXXXXXXXXX` and `care-inr: plan_YYYYYYYYYYYYYY`. Keep these ids.

- [ ] **Step 3: Write the migration with the real ids**

Create `packages/db/migrations/0027_razorpay_plan_ids.sql`, replacing the two placeholders below with the ids Step 2 printed:

```sql
-- The Razorpay Plan created for each currency by packages/billing/scripts/create-razorpay-plans.ts (test mode).
-- Re-run that script and this migration (with new values) when switching to live-mode keys.
UPDATE plans SET provider_plan_id = 'plan_XXXXXXXXXXXXXX' WHERE code = 'care-usd';
UPDATE plans SET provider_plan_id = 'plan_YYYYYYYYYYYYYY' WHERE code = 'care-inr';
```

- [ ] **Step 4: Apply and verify**

```bash
pnpm db:migrate && pnpm db:migrate:test
```
Expected: "Migrations applied" twice. Then check: `SELECT code, provider_plan_id FROM plans;` shows both ids.

---

### Task 3: Webhook signature verification and event parsing (pure)

Written and tested before anything touches the database, exactly like `fake-provider.ts`'s token verification: this is the one piece of Razorpay code that stands between an HTTP request and money moving, so it is pure, dependency-free, and fully covered by tests using fixed vectors.

**Files:**
- Create: `packages/billing/src/razorpay-webhook.ts`
- Test: `packages/billing/src/razorpay-webhook.test.ts`
- Modify: `packages/billing/src/index.ts`

- [ ] **Step 1: The failing tests**

```ts
// packages/billing/src/razorpay-webhook.test.ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseRazorpayWebhookEvent, verifyRazorpayWebhookSignature } from "./razorpay-webhook";

const SECRET = "a-test-webhook-secret-at-least-this-long";

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyRazorpayWebhookSignature", () => {
  it("accepts a body signed with the right secret", () => {
    const body = '{"event":"subscription.charged"}';
    expect(verifyRazorpayWebhookSignature(body, sign(body, SECRET), SECRET)).toBe(true);
  });

  it("rejects a body whose signature does not match", () => {
    const body = '{"event":"subscription.charged"}';
    expect(verifyRazorpayWebhookSignature(body, sign(body, "a-different-secret-of-the-same-length"), SECRET)).toBe(
      false,
    );
  });

  it("rejects a tampered body even with the original signature", () => {
    const original = '{"event":"subscription.charged"}';
    const signature = sign(original, SECRET);
    const tampered = '{"event":"subscription.cancelled"}';
    expect(verifyRazorpayWebhookSignature(tampered, signature, SECRET)).toBe(false);
  });

  it("rejects a malformed (non-hex, or wrong-length) signature without throwing", () => {
    const body = '{"event":"subscription.charged"}';
    expect(verifyRazorpayWebhookSignature(body, "not-hex", SECRET)).toBe(false);
    expect(verifyRazorpayWebhookSignature(body, "", SECRET)).toBe(false);
  });
});

describe("parseRazorpayWebhookEvent", () => {
  it("parses a subscription.charged event with its payment and subscription entities", () => {
    const body = JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_abc", status: "active", current_start: 1_700_000_000, current_end: 1_702_678_400 } },
        payment: { entity: { id: "pay_abc", amount: 7_500, currency: "USD", status: "captured" } },
      },
    });
    const parsed = parseRazorpayWebhookEvent(body);
    expect(parsed).toEqual({
      kind: "charged",
      subscriptionId: "sub_abc",
      currentEnd: new Date(1_702_678_400 * 1000),
      paymentId: "pay_abc",
      amountCents: 7_500,
      currency: "USD",
    });
  });

  it("parses a subscription.halted event with no payment entity", () => {
    const body = JSON.stringify({
      event: "subscription.halted",
      payload: { subscription: { entity: { id: "sub_abc", status: "halted" } } },
    });
    expect(parseRazorpayWebhookEvent(body)).toEqual({ kind: "status", subscriptionId: "sub_abc", providerStatus: "halted" });
  });

  it.each(["subscription.activated", "subscription.authenticated", "subscription.pending", "subscription.cancelled", "subscription.completed"])(
    "parses %s as a status event",
    (event) => {
      const body = JSON.stringify({ event, payload: { subscription: { entity: { id: "sub_abc", status: "whatever" } } } });
      const parsed = parseRazorpayWebhookEvent(body);
      expect(parsed?.kind).toBe("status");
    },
  );

  it("returns unhandled for an event this app does not act on", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    expect(parseRazorpayWebhookEvent(body)).toEqual({ kind: "unhandled" });
  });

  it("returns invalid for malformed JSON rather than throwing", () => {
    expect(parseRazorpayWebhookEvent("not json")).toEqual({ kind: "invalid", reason: "malformed JSON" });
  });

  it("returns invalid (not unhandled) when a charged event's payload is the wrong shape", () => {
    const body = JSON.stringify({ event: "subscription.charged", payload: { subscription: { entity: { id: 123 } } } });
    const parsed = parseRazorpayWebhookEvent(body);
    expect(parsed?.kind).toBe("invalid");
  });

  it("returns invalid for a charged event in a currency this app does not bill in", () => {
    const body = JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_abc", current_end: 1_702_678_400 } },
        payment: { entity: { id: "pay_abc", amount: 7_500, currency: "EUR", status: "captured" } },
      },
    });
    const parsed = parseRazorpayWebhookEvent(body);
    expect(parsed).toEqual({ kind: "invalid", reason: "unsupported currency: EUR" });
  });

  it("returns invalid for a charged event whose payment status is not captured", () => {
    const body = JSON.stringify({
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_abc", current_end: 1_702_678_400 } },
        payment: { entity: { id: "pay_abc", amount: 7_500, currency: "USD", status: "failed" } },
      },
    });
    const parsed = parseRazorpayWebhookEvent(body);
    expect(parsed).toEqual({ kind: "invalid", reason: "unexpected payment status: failed" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @brandbasket/billing test -- razorpay-webhook
```
Expected: FAIL — `razorpay-webhook.ts` does not exist yet.

- [ ] **Step 3: Implement it**

```ts
// packages/billing/src/razorpay-webhook.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { BillingCurrency } from "@brandbasket/db";

/**
 * True when `signature` is the HMAC-SHA256 of the exact raw `body` string, keyed with `webhookSecret`. The caller
 * must pass the untouched request body — re-serialising parsed JSON can reorder keys or change whitespace and
 * silently break this check, which is why `parseRazorpayWebhookEvent` takes the same raw string separately rather
 * than being handed an already-parsed object.
 */
export function verifyRazorpayWebhookSignature(body: string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac("sha256", webhookSecret).update(body, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** The real source of truth for supported currencies, so this never silently drifts from the database's enum. */
const CURRENCIES = billingCurrency.enumValues;

function isCurrency(value: string): value is BillingCurrency {
  return (CURRENCIES as readonly string[]).includes(value);
}

const CAPTURED_STATUS = "captured";

const eventNameSchema = z.object({ event: z.string().min(1) });

const chargedSchema = z.object({
  event: z.literal("subscription.charged"),
  payload: z.object({
    subscription: z.object({
      entity: z.object({
        id: z.string().min(1),
        current_end: z.number().int().positive(),
      }),
    }),
    payment: z.object({
      entity: z.object({
        id: z.string().min(1),
        amount: z.number().int().nonnegative(),
        currency: z.string(),
        status: z.string().min(1),
      }),
    }),
  }),
});

const STATUS_EVENTS = [
  "subscription.authenticated",
  "subscription.activated",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
] as const;

const statusSchema = z.object({
  event: z.enum(STATUS_EVENTS),
  payload: z.object({
    subscription: z.object({
      entity: z.object({
        id: z.string().min(1),
        status: z.string().min(1),
      }),
    }),
  }),
});

export type RazorpayWebhookEvent =
  /** A charge (the first payment or a renewal) against a subscription. */
  | {
      readonly kind: "charged";
      readonly subscriptionId: string;
      /** The end of the billing period this charge paid for, as Razorpay itself computed it. */
      readonly currentEnd: Date;
      readonly paymentId: string;
      readonly amountCents: number;
      readonly currency: BillingCurrency;
    }
  /** A lifecycle change with no payment attached: mirror `providerStatus` onto the subscription, nothing else. */
  | { readonly kind: "status"; readonly subscriptionId: string; readonly providerStatus: string }
  /** An event name this app does not act on (e.g. payment.captured). Expected and benign; no logging needed. */
  | { readonly kind: "unhandled" }
  /**
   * Malformed JSON, or an event we DO act on (a charge or a status change) whose payload didn't match what we
   * expect, or a charge reporting a currency or payment status outside what this app handles. `reason` is safe to
   * log — it never includes the raw body. Unlike `unhandled`, the caller should log this loudly: the signature
   * already proved this came from Razorpay, so this likely means a real payment or status change did not get
   * recorded.
   */
  | { readonly kind: "invalid"; readonly reason: string };

/**
 * Reads the webhook event this app acts on out of a raw, already-signature-verified body. Never throws: this
 * function's job is to classify whatever Razorpay sent, not to decide it's broken — even malformed input becomes an
 * `"invalid"` value the caller can act on (typically: log it and still acknowledge with 2xx, since Razorpay retries
 * a non-2xx response, which would just repeat the same bad event forever).
 */
export function parseRazorpayWebhookEvent(body: string): RazorpayWebhookEvent {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { kind: "invalid", reason: "malformed JSON" };
  }

  const named = eventNameSchema.safeParse(json);
  if (!named.success) return { kind: "invalid", reason: "no event name" };

  if (named.data.event === "subscription.charged") {
    const charged = chargedSchema.safeParse(json);
    if (!charged.success) {
      return { kind: "invalid", reason: "subscription.charged payload did not match the expected shape" };
    }
    const { subscription, payment } = charged.data.payload;
    if (!isCurrency(payment.entity.currency)) {
      return { kind: "invalid", reason: `unsupported currency: ${payment.entity.currency}` };
    }
    if (payment.entity.status !== CAPTURED_STATUS) {
      return { kind: "invalid", reason: `unexpected payment status: ${payment.entity.status}` };
    }
    return {
      kind: "charged",
      subscriptionId: subscription.entity.id,
      currentEnd: new Date(subscription.entity.current_end * 1000),
      paymentId: payment.entity.id,
      amountCents: payment.entity.amount,
      currency: payment.entity.currency,
    };
  }

  if ((STATUS_EVENTS as readonly string[]).includes(named.data.event)) {
    const status = statusSchema.safeParse(json);
    if (!status.success) return { kind: "invalid", reason: `${named.data.event} payload did not match the expected shape` };
    return {
      kind: "status",
      subscriptionId: status.data.payload.subscription.entity.id,
      providerStatus: status.data.payload.subscription.entity.status,
    };
  }

  return { kind: "unhandled" };
}
```

Add `billingCurrency` to the file's `@brandbasket/db` import (`import { billingCurrency, type BillingCurrency } from "@brandbasket/db";`) — check `packages/db/src/schema/currency.ts` for its exact export name before assuming.

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @brandbasket/billing test -- razorpay-webhook
```
Expected: PASS.

- [ ] **Step 5: Export it**

In `packages/billing/src/index.ts`, add:

```ts
export { parseRazorpayWebhookEvent, verifyRazorpayWebhookSignature, type RazorpayWebhookEvent } from "./razorpay-webhook";
```

---

### Task 4: The Razorpay `BillingProvider`

**Files:**
- Create: `packages/billing/src/razorpay-provider.ts`
- Test: `packages/billing/src/razorpay-provider.test.ts`
- Modify: `packages/billing/src/index.ts`

- [ ] **Step 1: The failing tests**

These test the parts with no network call: checkout-payload signing/verification, and the shape of what gets sent to the SDK (using a hand-rolled fake of the two SDK methods used, matching how the codebase already avoids over-mocking).

```ts
// packages/billing/src/razorpay-provider.test.ts
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CheckoutVerificationError } from "./provider";
import { createRazorpayProvider } from "./razorpay-provider";

const KEY_ID = "rzp_test_fake";
const KEY_SECRET = "a-test-key-secret-at-least-this-long";

function signPaymentVerification(paymentId: string, subscriptionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`, "utf8").digest("hex");
}

function fakeClient(overrides: Partial<Record<"create" | "cancel" | "fetchPayment", ReturnType<typeof vi.fn>>> = {}) {
  return {
    subscriptions: {
      create: overrides.create ?? vi.fn(),
      cancel: overrides.cancel ?? vi.fn(),
    },
    payments: {
      fetch: overrides.fetchPayment ?? vi.fn(),
    },
  };
}

describe("createRazorpayProvider", () => {
  it("has the name razorpay", () => {
    const provider = createRazorpayProvider({
      keyId: KEY_ID,
      keySecret: KEY_SECRET,
      client: fakeClient() as never,
      resolveBusinessId: async () => null,
    });
    expect(provider.name).toBe("razorpay");
  });

  describe("startCheckout", () => {
    it("creates a subscription on the plan's provider plan id and returns the local pay page as the checkout url", async () => {
      const create = vi.fn().mockResolvedValue({ id: "sub_new123" });
      const provider = createRazorpayProvider({
        keyId: KEY_ID,
        keySecret: KEY_SECRET,
        client: fakeClient({ create }) as never,
        resolveBusinessId: async () => null,
      });
      const result = await provider.startCheckout({
        businessId: "11111111-1111-7111-8111-111111111111",
        businessName: "Acme",
        email: "owner@acme.test",
        plan: {
          id: "plan-row-id",
          code: "care-usd",
          name: "Fynix care plan",
          currency: "USD",
          initialAmountCents: 7_500,
          initialTermMonths: 1,
          recurringAmountCents: 7_500,
          includedPublishesPerMonth: 3,
          extraPublishAmountCents: 300,
          includedChangeHours: 1,
          extraHourAmountCents: 1_500,
          includedBlogPosts: 100,
          blogPostBlockSize: 100,
          extraBlogPostsAmountCents: 500,
          providerPlanId: "plan_razorpay123",
        },
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ plan_id: "plan_razorpay123", customer_notify: false, quantity: 1 }),
      );
      expect(result).toEqual({ providerSubscriptionId: "sub_new123", checkoutUrl: "/billing/pay" });
    });

    it("reuses an existing provider subscription id without creating a new one", async () => {
      const create = vi.fn();
      const provider = createRazorpayProvider({
        keyId: KEY_ID,
        keySecret: KEY_SECRET,
        client: fakeClient({ create }) as never,
        resolveBusinessId: async () => null,
      });
      const result = await provider.startCheckout({
        businessId: "11111111-1111-7111-8111-111111111111",
        businessName: "Acme",
        email: "owner@acme.test",
        plan: { providerPlanId: "plan_razorpay123" } as never,
        existingProviderSubscriptionId: "sub_existing",
      });
      expect(create).not.toHaveBeenCalled();
      expect(result).toEqual({ providerSubscriptionId: "sub_existing", checkoutUrl: "/billing/pay" });
    });

    it("throws when the plan has no provider plan id", async () => {
      const provider = createRazorpayProvider({
        keyId: KEY_ID,
        keySecret: KEY_SECRET,
        client: fakeClient() as never,
        resolveBusinessId: async () => null,
      });
      await expect(
        provider.startCheckout({
          businessId: "11111111-1111-7111-8111-111111111111",
          businessName: "Acme",
          email: "owner@acme.test",
          plan: { providerPlanId: null } as never,
        }),
      ).rejects.toThrow(/no Razorpay plan id/);
    });
  });

  describe("confirmCheckout", () => {
    it("verifies the signature, fetches the payment, and resolves the business id", async () => {
      const signature = signPaymentVerification("pay_1", "sub_1", KEY_SECRET);
      const fetchPayment = vi.fn().mockResolvedValue({ id: "pay_1", amount: 7_500, currency: "USD", created_at: 1_700_000_000 });
      const provider = createRazorpayProvider({
        keyId: KEY_ID,
        keySecret: KEY_SECRET,
        client: fakeClient({ fetchPayment }) as never,
        resolveBusinessId: async (id) => (id === "sub_1" ? "biz_1" : null),
      });
      const result = await provider.confirmCheckout({
        razorpay_payment_id: "pay_1",
        razorpay_subscription_id: "sub_1",
        razorpay_signature: signature,
      });
      expect(result).toEqual({
        providerSubscriptionId: "sub_1",
        providerPaymentId: "pay_1",
        businessId: "biz_1",
        amountCents: 7_500,
        currency: "USD",
        paidAt: new Date(1_700_000_000 * 1000),
      });
    });

    it("rejects a bad signature without calling the API", async () => {
      const fetchPayment = vi.fn();
      const provider = createRazorpayProvider({
        keyId: KEY_ID,
        keySecret: KEY_SECRET,
        client: fakeClient({ fetchPayment }) as never,
        resolveBusinessId: async () => "biz_1",
      });
      await expect(
        provider.confirmCheckout({ razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: "wrong" }),
      ).rejects.toThrow(CheckoutVerificationError);
      expect(fetchPayment).not.toHaveBeenCalled();
    });

    it("rejects a subscription id it cannot resolve to a business", async () => {
      const signature = signPaymentVerification("pay_1", "sub_unknown", KEY_SECRET);
      const provider = createRazorpayProvider({
        keyId: KEY_ID,
        keySecret: KEY_SECRET,
        client: fakeClient({ fetchPayment: vi.fn().mockResolvedValue({ id: "pay_1", amount: 1, currency: "USD", created_at: 0 }) }) as never,
        resolveBusinessId: async () => null,
      });
      await expect(
        provider.confirmCheckout({ razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_unknown", razorpay_signature: signature }),
      ).rejects.toThrow(CheckoutVerificationError);
    });

    it("rejects a malformed payload", async () => {
      const provider = createRazorpayProvider({
        keyId: KEY_ID,
        keySecret: KEY_SECRET,
        client: fakeClient() as never,
        resolveBusinessId: async () => "biz_1",
      });
      await expect(provider.confirmCheckout({})).rejects.toThrow(CheckoutVerificationError);
      await expect(provider.confirmCheckout("not an object")).rejects.toThrow(CheckoutVerificationError);
    });
  });

  describe("cancelSubscription", () => {
    it("cancels immediately (not at cycle end)", async () => {
      const cancel = vi.fn().mockResolvedValue({});
      const provider = createRazorpayProvider({
        keyId: KEY_ID,
        keySecret: KEY_SECRET,
        client: fakeClient({ cancel }) as never,
        resolveBusinessId: async () => null,
      });
      await provider.cancelSubscription("sub_1");
      expect(cancel).toHaveBeenCalledWith("sub_1", { cancel_at_cycle_end: false });
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @brandbasket/billing test -- razorpay-provider
```
Expected: FAIL — `razorpay-provider.ts` does not exist yet.

- [ ] **Step 3: Implement it**

```ts
// packages/billing/src/razorpay-provider.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingCurrency } from "@brandbasket/db";
import {
  CheckoutVerificationError,
  type BillingProvider,
  type ConfirmedPayment,
  type StartCheckoutInput,
  type StartedCheckout,
} from "./provider";

/**
 * The subset of the `razorpay` SDK client this provider calls, so tests can pass a hand-written fake instead of
 * hitting the network. Matches `new Razorpay({ key_id, key_secret })`'s shape.
 */
export interface RazorpaySdkClient {
  readonly subscriptions: {
    create(input: {
      readonly plan_id: string;
      readonly total_count: number;
      readonly quantity: number;
      readonly customer_notify: boolean;
      readonly notes: Readonly<Record<string, string>>;
    }): Promise<{ readonly id: string }>;
    cancel(subscriptionId: string, options: { readonly cancel_at_cycle_end: boolean }): Promise<unknown>;
  };
  readonly payments: {
    fetch(paymentId: string): Promise<{ readonly id: string; readonly amount: number; readonly currency: string; readonly created_at: number }>;
  };
}

export interface RazorpayProviderOptions {
  readonly keyId: string;
  readonly keySecret: string;
  readonly client: RazorpaySdkClient;
  /**
   * Razorpay's payment-verification signature only proves `paymentId|subscriptionId`; it says nothing about which
   * of our businesses that subscription belongs to. This resolves it from our own subscriptions table
   * (`findSubscriptionByProviderId` in packages/db), injected so this package stays free of a database dependency
   * of its own — see `apps/platform/lib/server/billing.ts` for what it is wired to. Returns null for a subscription
   * id this app has never recorded.
   */
  resolveBusinessId(providerSubscriptionId: string): Promise<string | null>;
}

/** A subscription runs until cancelled, but Razorpay's API requires a bound. 1200 monthly cycles is 100 years. */
const EFFECTIVELY_UNBOUNDED_CYCLES = 1_200;

/** Where the checkout-opening page lives; see Task 6. It reads the business's own open subscription from the
 * database rather than trusting a subscription id from the URL, so nothing here needs to carry one. */
export const RAZORPAY_PAY_PATH = "/billing/pay";

const CURRENCIES = ["USD", "INR"] as const;

function isCurrency(value: string): value is BillingCurrency {
  return (CURRENCIES as readonly string[]).includes(value);
}

function signPaymentVerification(paymentId: string, subscriptionId: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`, "utf8").digest();
}

function readConfirmPayload(payload: unknown): { readonly paymentId: string; readonly subscriptionId: string; readonly signature: string } {
  if (typeof payload !== "object" || payload === null) throw new CheckoutVerificationError("the payload is not an object");
  const record = payload as Record<string, unknown>;
  const paymentId = record.razorpay_payment_id;
  const subscriptionId = record.razorpay_subscription_id;
  const signature = record.razorpay_signature;
  if (typeof paymentId !== "string" || paymentId === "") throw new CheckoutVerificationError("razorpay_payment_id is missing");
  if (typeof subscriptionId !== "string" || subscriptionId === "") {
    throw new CheckoutVerificationError("razorpay_subscription_id is missing");
  }
  if (typeof signature !== "string" || signature === "") throw new CheckoutVerificationError("razorpay_signature is missing");
  return { paymentId, subscriptionId, signature };
}

/**
 * Razorpay Subscriptions, backing `BillingProvider`. The customer authorizes once through Razorpay's own Checkout
 * widget (see Task 6); Razorpay then auto-charges every month and reports both the first charge and every renewal
 * through the webhook (Task 8), which is this app's only path that ever activates a subscription from Razorpay.
 *
 * `confirmCheckout` is implemented in full below to satisfy the `BillingProvider` contract, but nothing in this
 * app's Razorpay checkout path calls it: the browser's `callback_url` redirect (Task 7) is a plain cross-site form
 * POST, which cannot be relied on to carry the customer's session (`SameSite=Lax` drops cookies on a cross-site POST
 * navigation) and must not be treated as authoritative regardless, since a client-relayed "I paid" claim proves
 * nothing on its own. The webhook is signed server-to-server and is the only trusted source. This method exists so
 * the type is honoured and so a future caller (admin tooling, or a synchronous best-effort confirmation before the
 * webhook lands) has a correct implementation to call.
 */
export function createRazorpayProvider(options: RazorpayProviderOptions): BillingProvider {
  const { keyId: _keyId, keySecret, client, resolveBusinessId } = options;

  return {
    name: "razorpay",

    async startCheckout(input: StartCheckoutInput): Promise<StartedCheckout> {
      if (input.existingProviderSubscriptionId !== undefined) {
        return { providerSubscriptionId: input.existingProviderSubscriptionId, checkoutUrl: RAZORPAY_PAY_PATH };
      }
      const { providerPlanId } = input.plan;
      if (providerPlanId === null) {
        throw new Error(`Plan ${input.plan.code} has no Razorpay plan id. Run Task 2's script and migration first.`);
      }
      const created = await client.subscriptions.create({
        plan_id: providerPlanId,
        total_count: EFFECTIVELY_UNBOUNDED_CYCLES,
        quantity: 1,
        // We send our own emails (packages/email); Razorpay's would duplicate them.
        customer_notify: false,
        notes: { businessId: input.businessId },
      });
      return { providerSubscriptionId: created.id, checkoutUrl: RAZORPAY_PAY_PATH };
    },

    async confirmCheckout(payload: unknown): Promise<ConfirmedPayment> {
      const { paymentId, subscriptionId, signature } = readConfirmPayload(payload);
      const expected = signPaymentVerification(paymentId, subscriptionId, keySecret);
      let given: Buffer;
      try {
        given = Buffer.from(signature, "hex");
      } catch {
        throw new CheckoutVerificationError("the signature is not valid hex");
      }
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new CheckoutVerificationError("the signature does not match");
      }

      const businessId = await resolveBusinessId(subscriptionId);
      if (businessId === null) {
        throw new CheckoutVerificationError("the subscription is not one we have recorded", { signatureVerified: true });
      }

      const payment = await client.payments.fetch(paymentId);
      if (!isCurrency(payment.currency)) {
        throw new CheckoutVerificationError(`Razorpay reported an unsupported currency: ${payment.currency}`, {
          signatureVerified: true,
        });
      }
      return {
        providerSubscriptionId: subscriptionId,
        providerPaymentId: payment.id,
        businessId,
        amountCents: payment.amount,
        currency: payment.currency,
        paidAt: new Date(payment.created_at * 1000),
      };
    },

    async cancelSubscription(providerSubscriptionId: string): Promise<void> {
      // Immediate, never at cycle end: every caller of BillingProvider.cancelSubscription today (see
      // provider-cancellation.ts) is replacing an *unpaid* checkout before any money has moved, so there is no paid
      // period to let run out.
      await client.subscriptions.cancel(providerSubscriptionId, { cancel_at_cycle_end: false });
    },
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @brandbasket/billing test -- razorpay-provider
```
Expected: PASS.

- [ ] **Step 5: Export it**

In `packages/billing/src/index.ts`, add:

```ts
export { createRazorpayProvider, RAZORPAY_PAY_PATH, type RazorpayProviderOptions, type RazorpaySdkClient } from "./razorpay-provider";
```

---

### Task 5: New database queries for renewals and status sync

**Files:**
- Modify: `packages/db/src/queries/billing.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/billing.integration.test.ts`

- [ ] **Step 1: `updateSubscriptionProviderStatus`**

Add to `packages/db/src/queries/billing.ts`, near `recordPaymentAndActivate`:

```ts
export interface SubscriptionStatusSync {
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
  readonly status: SubscriptionStatus;
  /** Exactly as the provider reported it (e.g. "halted"), for support and reconciliation. */
  readonly providerStatus: string;
  readonly now: Date;
}

/**
 * Mirrors a provider lifecycle event that carries no payment (authorized, pending, halted, cancelled, completed)
 * onto our own status. Never touches paidThroughAt or commitmentEndsAt — those move only when a payment is
 * recorded (recordPaymentAndActivate); this is deliberately the one place that can move a subscription to
 * `inactive` (and so remove access, via hasBillingAccess's no-grace-period rule) without any money changing hands.
 *
 * Returns false when no subscription matches (an event for one we have not recorded, or a stale retry after the row
 * changed provider), so the caller can log it rather than silently doing nothing. Staff connection only.
 */
export async function updateSubscriptionProviderStatus(db: Runner, input: SubscriptionStatusSync): Promise<boolean> {
  const rows = await db
    .update(subscriptions)
    .set({
      status: input.status,
      providerStatus: input.providerStatus,
      lastSyncedAt: input.now,
      ...(input.status === "cancelled" ? { cancelledAt: sql`coalesce(${subscriptions.cancelledAt}, ${input.now})` } : {}),
    })
    .where(
      and(eq(subscriptions.provider, input.provider), eq(subscriptions.providerSubscriptionId, input.providerSubscriptionId)),
    )
    .returning({ id: subscriptions.id });
  return rows.length > 0;
}
```

- [ ] **Step 2: Export it**

In `packages/db/src/index.ts`, add `updateSubscriptionProviderStatus` and `type SubscriptionStatusSync` to the existing `from "./queries/billing"` export block.

- [ ] **Step 3: Integration test**

Add to `packages/db/src/billing.integration.test.ts`. Its existing `openSubscription(businessId, providerSubscriptionId)` helper (near the top of the file) always inserts with `provider: "fake"`, so build a Razorpay one inline with `insertSubscription` and `recordPaymentAndActivate` directly, using the file's existing `requirePlan` and `dbs.staff.db`:

```ts
describe("updateSubscriptionProviderStatus", () => {
  async function openActiveRazorpaySubscription(businessId: string): Promise<{ readonly providerSubscriptionId: string; readonly paidThroughAt: Date }> {
    const providerSubscriptionId = "razorpay_sub_a";
    const plan = await requirePlan("USD");
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "razorpay",
      providerSubscriptionId,
    });
    const paidThroughAt = addMonths(PAID_AT, plan.initialTermMonths);
    await recordPaymentAndActivate(dbs.staff.db, {
      businessId,
      subscriptionId: subscription.id,
      provider: "razorpay",
      providerPaymentId: "razorpay_pay_a",
      kind: "initial",
      amountCents: plan.initialAmountCents,
      currency: plan.currency,
      paidAt: PAID_AT,
      paidThroughAt,
      commitmentEndsAt: paidThroughAt,
      currentPeriodEnd: paidThroughAt,
    });
    return { providerSubscriptionId, paidThroughAt };
  }

  it("updates status, providerStatus and lastSyncedAt without touching paidThroughAt", async () => {
    const { providerSubscriptionId, paidThroughAt } = await openActiveRazorpaySubscription(businessA);
    const now = new Date();

    const updated = await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId,
      status: "inactive",
      providerStatus: "halted",
      now,
    });
    expect(updated).toBe(true);

    const found = await findSubscriptionByProviderId(dbs.staff.db, "razorpay", providerSubscriptionId);
    expect(found?.status).toBe("inactive");
    expect(found?.providerStatus).toBe("halted");
    expect(found?.paidThroughAt).toEqual(paidThroughAt); // unchanged
  });

  it("sets cancelledAt once and does not move it on a repeat event", async () => {
    const { providerSubscriptionId } = await openActiveRazorpaySubscription(businessA);
    const first = new Date();
    await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId,
      status: "cancelled",
      providerStatus: "cancelled",
      now: first,
    });
    const second = new Date(first.getTime() + 60_000);
    await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId,
      status: "cancelled",
      providerStatus: "cancelled",
      now: second,
    });
    const found = await findSubscriptionByProviderId(dbs.staff.db, "razorpay", providerSubscriptionId);
    expect(found?.cancelledAt).toEqual(first);
  });

  it("returns false for a subscription id it does not know", async () => {
    const updated = await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId: "sub_unknown",
      status: "inactive",
      providerStatus: "halted",
      now: new Date(),
    });
    expect(updated).toBe(false);
  });
});
```

Add `findSubscriptionByProviderId` and `updateSubscriptionProviderStatus` to this file's existing import from `./queries/billing`.

- [ ] **Step 4: Run it**

```bash
pnpm --filter @brandbasket/db test:integration
```
Expected: all pass, including the new ones.

---

### Task 6: `activateRenewalPayment`

**Files:**
- Modify: `apps/platform/lib/server/billing-activation.ts`
- Test: `apps/platform/lib/server/billing-activation.test.ts` (create if it does not already exist — check first)

- [ ] **Step 1: The failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { activateRenewalPayment } from "./billing-activation";

vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, recordPaymentAndActivate: vi.fn() };
});

import { recordPaymentAndActivate } from "@brandbasket/db";

describe("activateRenewalPayment", () => {
  it("records a renewal payment, carrying the existing commitmentEndsAt through unchanged", async () => {
    const tx = {} as never;
    const commitmentEndsAt = new Date("2026-10-15T00:00:00.000Z");
    const paidThroughAt = new Date("2026-11-15T00:00:00.000Z");
    const paidAt = new Date("2026-10-14T12:00:00.000Z");

    await activateRenewalPayment(tx, {
      businessId: "biz_1",
      subscriptionId: "sub_1",
      commitmentEndsAt,
      provider: "razorpay",
      providerPaymentId: "pay_1",
      amountCents: 7_500,
      currency: "USD",
      paidAt,
      paidThroughAt,
      providerStatus: "active",
    });

    expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, {
      businessId: "biz_1",
      subscriptionId: "sub_1",
      provider: "razorpay",
      providerPaymentId: "pay_1",
      kind: "renewal",
      amountCents: 7_500,
      currency: "USD",
      paidAt,
      paidThroughAt,
      commitmentEndsAt,
      currentPeriodEnd: paidThroughAt,
      providerStatus: "active",
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @brandbasket/platform test -- billing-activation
```
Expected: FAIL — `activateRenewalPayment` is not exported.

- [ ] **Step 3: Implement it**

Add to `apps/platform/lib/server/billing-activation.ts`, alongside `activateFirstPayment`:

```ts
export interface RenewalPayment {
  readonly businessId: string;
  readonly subscriptionId: string;
  /** The subscription's existing commitment end, carried through unchanged: a renewal never moves it. */
  readonly commitmentEndsAt: Date;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  /** The end of the period this charge paid for. For Razorpay this is the webhook's own `current_end`, not
   * something we compute, because Razorpay is the authority on its own billing cycle boundaries. */
  readonly paidThroughAt: Date;
  readonly providerStatus?: string | null;
}

/**
 * Records a renewal (a charge after the first one) against an already-open subscription. Unlike
 * `activateFirstPayment`, the period this buys comes from the provider rather than being computed from the plan's
 * term, and the commitment date is passed through unchanged rather than recalculated — recordPaymentAndActivate
 * overwrites both dates unconditionally, so both must be supplied correctly by the caller every time.
 */
export async function activateRenewalPayment(tx: ScopedTransaction, payment: RenewalPayment): Promise<RecordedActivation> {
  return recordPaymentAndActivate(tx, {
    businessId: payment.businessId,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    kind: "renewal",
    amountCents: payment.amountCents,
    currency: payment.currency,
    paidAt: payment.paidAt,
    paidThroughAt: payment.paidThroughAt,
    commitmentEndsAt: payment.commitmentEndsAt,
    currentPeriodEnd: payment.paidThroughAt,
    ...(payment.providerStatus === undefined ? {} : { providerStatus: payment.providerStatus }),
  });
}
```

Add `BillingCurrency` to that file's existing `@brandbasket/db` import line.

- [ ] **Step 4: Run it**

```bash
pnpm --filter @brandbasket/platform test -- billing-activation
```
Expected: PASS.

---

### Task 7: The checkout-opening page and the browser callback

**Files:**
- Create: `apps/platform/components/panel/razorpay-checkout-launcher.tsx`
- Create: `apps/platform/app/app-host/billing/pay/page.tsx`
- Create: `apps/platform/app/app-host/billing/pay/callback/route.ts`
- Modify: `apps/platform/lib/server/env.ts` (nothing — see note in Step 1)

- [ ] **Step 1: Why no env.ts change**

`BILLING_PROVIDER` itself is read directly from `process.env` in `resolveBillingProviderName`, not through the zod schema in `lib/server/env.ts`. Follow that existing precedent: read `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` directly from `process.env` in Task 8's `getBillingProvider`, with a clear thrown error naming exactly which one is missing. Do not add them to the zod schema — that would make every deployment (including ones running the fake provider) fail without them.

- [ ] **Step 2: The launcher component**

```tsx
// apps/platform/components/panel/razorpay-checkout-launcher.tsx
"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpayCheckoutLauncherProps {
  readonly keyId: string;
  readonly subscriptionId: string;
  readonly businessName: string;
  readonly email: string;
  readonly callbackUrl: string;
}

/**
 * Loads Razorpay's own checkout.js and opens it immediately for the given subscription. There is no fallback UI
 * behind it (see the page that renders this): if the script fails to load, the customer sees nothing happen, which
 * is why the pay page also renders a plain link straight to email support underneath, in case that happens.
 */
export function RazorpayCheckoutLauncher({
  keyId,
  subscriptionId,
  businessName,
  email,
  callbackUrl,
}: RazorpayCheckoutLauncherProps): null {
  useEffect(() => {
    let cancelled = false;
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (cancelled || window.Razorpay === undefined) return;
      new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: businessName,
        description: "Fynix monthly plan",
        prefill: { email },
        callback_url: callbackUrl,
      }).open();
    };
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      document.body.removeChild(script);
    };
  }, [keyId, subscriptionId, businessName, email, callbackUrl]);

  return null;
}
```

- [ ] **Step 3: The pay page**

```tsx
// apps/platform/app/app-host/billing/pay/page.tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { RazorpayCheckoutLauncher } from "@/components/panel/razorpay-checkout-launcher";
import { PAYMENT_STEP_HREF } from "@/lib/billing/payment-step";
import { getBillingProvider } from "@/lib/server/billing";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { businessDetails } from "@brandbasket/shared/lib/site-config";

export const metadata: Metadata = { title: "Redirecting to payment" };

/**
 * The `checkoutUrl` every Razorpay checkout redirects to (see `RAZORPAY_PAY_PATH`). It reads the business's own
 * open subscription from the database rather than accepting one from the URL, so there is nothing here for a
 * customer to tamper with — visiting this page always opens checkout for your own account's own pending
 * subscription, never anyone else's.
 */
export default async function RazorpayPayPage(): Promise<ReactElement> {
  const provider = getBillingProvider();
  if (provider.name !== "razorpay") notFound();

  const { tenant, user, billing } = await requireCustomerAccess();
  if (billing.hasAccess) redirect(PAYMENT_STEP_HREF);
  const subscription = billing.subscription;
  if (subscription === null || subscription.status !== "incomplete" || subscription.provider !== "razorpay") {
    redirect(PAYMENT_STEP_HREF);
  }

  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (keyId === undefined || keyId === "") throw new Error("NEXT_PUBLIC_RAZORPAY_KEY_ID is not set.");

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-lg text-ink-soft">Opening your payment window…</p>
      <p className="mt-4 text-sm text-ink-soft">
        If nothing happens after a few seconds, email us at{" "}
        <a href={`mailto:${businessDetails.email}`} className="link-underline text-ink">
          {businessDetails.email}
        </a>
        .
      </p>
      <RazorpayCheckoutLauncher
        keyId={keyId}
        subscriptionId={subscription.providerSubscriptionId}
        businessName={tenant.businessName}
        email={user.email}
        callbackUrl={new URL("/billing/pay/callback", process.env.APP_ORIGIN).toString()}
      />
    </div>
  );
}
```

- [ ] **Step 4: The callback route**

```ts
// apps/platform/app/app-host/billing/pay/callback/route.ts
import { PAYMENT_RECEIVED_HREF } from "@/lib/billing/payment-step";

/**
 * Where Razorpay's checkout widget POSTs the browser back to after the customer completes (or fails) authorizing
 * the subscription. This is UX only, never a source of truth — see razorpay-provider.ts's docblock for why a
 * cross-site POST cannot be trusted with activation. It reads nothing from the POST body and writes nothing to the
 * database: it just lands the customer on the same "we've got it, hang on" screen the admin-recorded-payment path
 * already uses, which is correct here too because the webhook (Task 8) usually finishes activation within a second
 * or two of this request arriving.
 */
export async function POST(): Promise<Response> {
  return Response.redirect(new URL(PAYMENT_RECEIVED_HREF, process.env.APP_ORIGIN), 303);
}
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @brandbasket/platform typecheck && pnpm --filter @brandbasket/platform build
```
Expected: passes.

---

### Task 8: `getBillingProvider` wiring, and the webhook route

**Files:**
- Modify: `apps/platform/lib/server/billing.ts`
- Create: `apps/platform/lib/server/razorpay-webhook-handler.ts`
- Test: `apps/platform/lib/server/razorpay-webhook-handler.test.ts`
- Create: `apps/platform/app/api/webhooks/razorpay/route.ts`

- [ ] **Step 1: Wire the provider**

In `apps/platform/lib/server/billing.ts`, change the imports and `getBillingProvider`:

```ts
import "server-only";
import {
  createBillingProvider,
  createRazorpayProvider,
  resolveBillingProviderName,
  type BillingProvider,
} from "@brandbasket/billing";
import { findSubscriptionByProviderId, listReceiptsForBusiness, withTenantScope, type Receipt } from "@brandbasket/db";
import { requireCustomerAccess, type GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { serverEnv } from "@/lib/server/env";
import Razorpay from "razorpay";
```

Replace `getBillingProvider`'s body:

```ts
function requiredRazorpayEnv(name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET"): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} must be set: BILLING_PROVIDER=razorpay needs it.`);
  }
  return value;
}

/**
 * The provider BILLING_PROVIDER names. Outside production an unset value means the fake provider; in production it
 * must be set, and resolving it throws otherwise rather than handing out dashboards for free. The fake provider is
 * also refused on a real deployment unless FYNIX_ALLOW_FAKE_BILLING=1 (see resolveBillingProviderName).
 */
export function getBillingProvider(): BillingProvider {
  if (holder.fynixBillingProvider !== undefined) return holder.fynixBillingProvider;

  const name = resolveBillingProviderName({
    BILLING_PROVIDER: process.env.BILLING_PROVIDER,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    FYNIX_ALLOW_FAKE_BILLING: process.env.FYNIX_ALLOW_FAKE_BILLING,
  });

  if (name === "razorpay") {
    const keyId = requiredRazorpayEnv("RAZORPAY_KEY_ID");
    const keySecret = requiredRazorpayEnv("RAZORPAY_KEY_SECRET");
    holder.fynixBillingProvider = createRazorpayProvider({
      keyId,
      keySecret,
      client: new Razorpay({ key_id: keyId, key_secret: keySecret }),
      resolveBusinessId: async (providerSubscriptionId) => {
        const subscription = await findSubscriptionByProviderId(getStaffDb(), "razorpay", providerSubscriptionId);
        return subscription?.businessId ?? null;
      },
    });
  } else {
    holder.fynixBillingProvider = createBillingProvider(name, { authSecret: serverEnv().BETTER_AUTH_SECRET });
  }
  return holder.fynixBillingProvider;
}

/** Read directly (not through getBillingProvider, which requires the key secrets too): the webhook route only
 * needs the webhook secret, and must not fail to boot in a config that has RAZORPAY_KEY_ID/SECRET but is still on
 * the fake provider during rollout. */
export function razorpayWebhookSecret(): string {
  return requiredRazorpayEnv("RAZORPAY_WEBHOOK_SECRET");
}
```

- [ ] **Step 2: The failing test for the webhook handler**

```ts
// apps/platform/lib/server/razorpay-webhook-handler.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findSubscriptionByProviderId: vi.fn(),
    findPlanById: vi.fn(),
    updateSubscriptionProviderStatus: vi.fn(),
  };
});
vi.mock("./billing-activation", () => ({ activateRenewalPayment: vi.fn(), activateFirstPayment: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: () => ({ transaction: (fn: (tx: unknown) => unknown) => fn({}) }) }));

import { findPlanById, findSubscriptionByProviderId, updateSubscriptionProviderStatus } from "@brandbasket/db";
import { activateFirstPayment, activateRenewalPayment } from "./billing-activation";
import { handleRazorpayWebhookEvent } from "./razorpay-webhook-handler";

const PLAN = { id: "plan_1", currency: "USD", recurringAmountCents: 7_500, initialAmountCents: 7_500, initialTermMonths: 1 };

describe("handleRazorpayWebhookEvent", () => {
  it("activates a renewal when the subscription already has an activatedAt", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_1",
      businessId: "biz_1",
      planId: "plan_1",
      commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

    await handleRazorpayWebhookEvent({
      kind: "charged",
      subscriptionId: "sub_rzp_1",
      currentEnd: new Date("2026-11-01T00:00:00.000Z"),
      paymentId: "pay_1",
      amountCents: 7_500,
      currency: "USD",
    });

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: "biz_1",
        subscriptionId: "sub_row_1",
        commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
        providerPaymentId: "pay_1",
        amountCents: 7_500,
        currency: "USD",
        paidThroughAt: new Date("2026-11-01T00:00:00.000Z"),
      }),
    );
    expect(activateFirstPayment).not.toHaveBeenCalled();
  });

  it("does nothing (and does not throw) for an unknown subscription id", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(null);
    await handleRazorpayWebhookEvent({
      kind: "charged",
      subscriptionId: "sub_unknown",
      currentEnd: new Date(),
      paymentId: "pay_1",
      amountCents: 7_500,
      currency: "USD",
    });
    expect(activateRenewalPayment).not.toHaveBeenCalled();
  });

  it("syncs status for a status event", async () => {
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "halted" });
    expect(updateSubscriptionProviderStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: "razorpay", providerSubscriptionId: "sub_rzp_1", status: "inactive", providerStatus: "halted" }),
    );
  });

  it("does nothing for an unhandled event, and does not touch the database", async () => {
    await handleRazorpayWebhookEvent({ kind: "unhandled" });
    expect(findSubscriptionByProviderId).not.toHaveBeenCalled();
    expect(updateSubscriptionProviderStatus).not.toHaveBeenCalled();
  });

  it("logs an invalid event loudly and does not touch the database", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await handleRazorpayWebhookEvent({ kind: "invalid", reason: "subscription.charged payload did not match the expected shape" });
    expect(findSubscriptionByProviderId).not.toHaveBeenCalled();
    expect(updateSubscriptionProviderStatus).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("confirmation-refused"));
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

```bash
pnpm --filter @brandbasket/platform test -- razorpay-webhook-handler
```
Expected: FAIL — the module does not exist yet.

- [ ] **Step 4: Implement the handler**

```ts
// apps/platform/lib/server/razorpay-webhook-handler.ts
import "server-only";
import { mapRazorpayStatus, type RazorpayWebhookEvent } from "@brandbasket/billing";
import {
  findPlanById,
  findSubscriptionByProviderId,
  lockBusinessForBilling,
  recordUnappliedPayment,
  updateSubscriptionProviderStatus,
} from "@brandbasket/db";
import { activateRenewalPayment, activateFirstPayment } from "./billing-activation";
import { describeError, logBillingEvent } from "./billing-log";
import { getStaffDb } from "./db";

/**
 * Applies one already-signature-verified webhook event. Idempotent: recordPaymentAndActivate (inside both
 * activate* helpers) is keyed on (provider, providerPaymentId), so a retried delivery of the same event writes
 * nothing a second time. Never throws for data it does not recognise — an event for a subscription we have not
 * recorded, or one already superseded, is logged and otherwise ignored, so the webhook route can always
 * acknowledge with 2xx and stop Razorpay from retrying forever.
 */
export async function handleRazorpayWebhookEvent(event: RazorpayWebhookEvent): Promise<void> {
  if (event.kind === "unhandled") return;

  if (event.kind === "invalid") {
    // The signature already proved this came from Razorpay, so a payload we could not parse likely means a real
    // payment or status change did not get recorded — unlike "unhandled", this is always worth a loud log line.
    logBillingEvent("error", "confirmation-refused", {
      businessId: "unknown",
      subscriptionId: null,
      provider: "razorpay",
      reason: "webhook-payload-invalid",
      detail: event.reason,
    });
    return;
  }

  if (event.kind === "status") {
    const status = mapRazorpayStatus(event.providerStatus);
    const updated = await updateSubscriptionProviderStatus(getStaffDb(), {
      provider: "razorpay",
      providerSubscriptionId: event.subscriptionId,
      status,
      providerStatus: event.providerStatus,
      now: new Date(),
    });
    if (!updated) {
      logBillingEvent("warn", "confirmation-refused", {
        businessId: "unknown",
        subscriptionId: null,
        provider: "razorpay",
        providerSubscriptionId: event.subscriptionId,
        reason: "unknown-subscription",
      });
    }
    return;
  }

  await getStaffDb().transaction(async (tx) => {
    const subscription = await findSubscriptionByProviderId(tx, "razorpay", event.subscriptionId);
    if (subscription === null) {
      logBillingEvent("warn", "confirmation-refused", {
        businessId: "unknown",
        subscriptionId: null,
        provider: "razorpay",
        providerSubscriptionId: event.subscriptionId,
        providerPaymentId: event.paymentId,
        reason: "unknown-subscription",
      });
      return;
    }
    await lockBusinessForBilling(tx, subscription.businessId);
    const plan = await findPlanById(tx, subscription.planId);
    const expectedAmount = subscription.activatedAt === null ? plan?.initialAmountCents : plan?.recurringAmountCents;
    if (plan === null || plan === undefined || expectedAmount !== event.amountCents || plan.currency !== event.currency) {
      await recordUnappliedPayment(tx, {
        businessId: subscription.businessId,
        subscriptionId: subscription.id,
        provider: "razorpay",
        providerPaymentId: event.paymentId,
        kind: subscription.activatedAt === null ? "initial" : "renewal",
        amountCents: event.amountCents,
        currency: event.currency,
        paidAt: event.currentEnd, // best available timestamp; the amount mismatch is what staff need to see
        reason: "amount_mismatch",
        now: new Date(),
      });
      logBillingEvent("warn", "confirmation-refused", {
        businessId: subscription.businessId,
        subscriptionId: subscription.id,
        provider: "razorpay",
        providerPaymentId: event.paymentId,
        reason: "amount_mismatch",
      });
      return;
    }

    if (subscription.activatedAt === null) {
      await activateFirstPayment(tx, {
        businessId: subscription.businessId,
        subscriptionId: subscription.id,
        plan,
        provider: "razorpay",
        providerPaymentId: event.paymentId,
        paidAt: event.currentEnd,
      });
    } else {
      await activateRenewalPayment(tx, {
        businessId: subscription.businessId,
        subscriptionId: subscription.id,
        commitmentEndsAt: subscription.commitmentEndsAt ?? event.currentEnd,
        provider: "razorpay",
        providerPaymentId: event.paymentId,
        amountCents: event.amountCents,
        currency: event.currency,
        paidAt: event.currentEnd,
        paidThroughAt: event.currentEnd,
        providerStatus: "active",
      });
    }
  }).catch((error: unknown) => {
    logBillingEvent("error", "checkout-orphaned", {
      businessId: "unknown",
      subscriptionId: null,
      provider: "razorpay",
      providerSubscriptionId: event.subscriptionId,
      reason: "webhook-processing-failed",
      ...describeError(error),
    });
    throw error;
  });
}
```

- [ ] **Step 5: Run it**

```bash
pnpm --filter @brandbasket/platform test -- razorpay-webhook-handler
```
Expected: PASS.

- [ ] **Step 6: The webhook route**

```ts
// apps/platform/app/api/webhooks/razorpay/route.ts
import { parseRazorpayWebhookEvent, verifyRazorpayWebhookSignature } from "@brandbasket/billing";
import { razorpayWebhookSecret } from "@/lib/server/billing";
import { logBillingEvent } from "@/lib/server/billing-log";
import { handleRazorpayWebhookEvent } from "@/lib/server/razorpay-webhook-handler";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * Razorpay's server-to-server notification of every subscription event. Reads the body as raw text (never
 * `request.json()` first) because the signature is computed over the exact bytes Razorpay sent — re-serialising
 * parsed JSON can reorder keys and silently break verification. Always answers 200 once the signature is valid,
 * even for an event we choose not to act on, so Razorpay does not retry it forever; a bad signature is the one
 * case that gets a non-2xx, because that request did not come from Razorpay.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (signature === null || !verifyRazorpayWebhookSignature(body, signature, razorpayWebhookSecret())) {
    logBillingEvent("warn", "confirmation-refused", {
      businessId: "unknown",
      subscriptionId: null,
      provider: "razorpay",
      reason: "webhook-signature-invalid",
    });
    return json({ error: "invalid signature" }, 400);
  }

  await handleRazorpayWebhookEvent(parseRazorpayWebhookEvent(body));
  return json({ received: true }, 200);
}
```

- [ ] **Step 7: Verify**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: all pass.

---

### Task 9: Local end-to-end verification with a real Razorpay test-mode subscription

**Files:** none — this is a manual walkthrough.

- [ ] **Step 1: Start the tunnel and register the webhook**

Start your ngrok-style tunnel pointing at the verify server's port (`fynix-platform-verify`, 3101). In the Razorpay dashboard (test mode), Settings > Webhooks: add `https://<your-tunnel>/api/webhooks/razorpay`, subscribe to every `subscription.*` event, and copy the webhook secret it gives you into `RAZORPAY_WEBHOOK_SECRET`.

- [ ] **Step 2: Set the remaining env vars and build**

Set `BILLING_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` (same as `RAZORPAY_KEY_ID`), `APP_ORIGIN` pointing at your tunnel's https URL (not `http://app.localhost:...` — Razorpay's checkout widget and callback need a real https origin it can reach).

```bash
pnpm build
```
Then restart `fynix-platform-verify`.

- [ ] **Step 3: Walk the funnel**

1. Complete onboarding through Check and send; press "Pay and send".
2. Expect a redirect to `/billing/pay`, then Razorpay's checkout widget opens automatically.
3. Pay with a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-upi-details/).
4. Expect the browser to land on the "payment received" screen within a second or two (the webhook activating in the background).
5. Refresh: expect the dashboard now shows access granted, onboarding sent, and `/billing` shows the first receipt.
6. In the Razorpay dashboard (test mode), find the subscription and use its "Charge now" / test action to simulate a renewal (or wait for the natural cycle in test mode, whichever the dashboard offers at the time).
7. Expect a second receipt (kind "renewal") after the webhook fires, and `paidThroughAt` moved out to match Razorpay's own `current_end`.
8. In the Razorpay dashboard, pause or halt the subscription (or trigger a failed renewal, if the test tools allow it) and confirm the `subscription.halted` (or `subscription.pending`) webhook arrives, and that the dashboard's access reflects it immediately per Task 5's no-grace-period behaviour.

- [ ] **Step 4: Clean up**

Cancel the test subscription in the Razorpay dashboard, and delete the trial business/subscription/payment rows created during the walk, matching Task 10 of the original Phase 1C plan.

---

## Deliberately not in this plan

- **Renewal reminder emails.** The subscription's `paidThroughAt` is already visible on `/billing`; a scheduled job that emails customers before it renews is a separate feature needing its own cron trigger, not built here.
- **Customer self-service cancellation.** `BillingProvider.cancelSubscription` exists and is exercised by the stale-checkout-replacement path, but there is no "cancel my plan" button yet. When it is built, it must call `cancelSubscription` immediately (this is a *paid* cancellation, unlike today's callers) and rely on `paidThroughAt` — already set by the last payment — to keep the site up until the paid period ends, exactly as the "cancel anytime, site stays up to end of paid month" rule requires.
- **Refunds.** Still the "Request refund" button and staff resolution flow noted as future work in the original Phase 1C plan.
- **Switching a live business between currencies, or moving from the fake provider to Razorpay for a business that already has an active fake subscription.** Not needed yet: every business created so far is on the fake provider in test data only.
- **Going live.** This plan targets Razorpay's test mode throughout. Before charging real cards: re-run Task 2's script with live-mode keys and write a new migration for the live plan ids (test and live plans are entirely separate objects at Razorpay); confirm with Razorpay support that the account has international, USD and recurring card payments enabled (the open item from the sales-call notes); and register the webhook again against the live domain.
