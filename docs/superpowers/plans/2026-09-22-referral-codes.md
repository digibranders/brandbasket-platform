# Referral codes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A superadmin-created referral code that a customer applies on Check and send, taking a whole-number percentage off every month of their subscription, charged through a Razorpay Offer.

**Architecture:** The code lives in a staff-only `referral_codes` table. `businesses.referral_code_id` holds an applied-but-unpaid code; `subscriptions.discount_amount_cents` freezes the money at checkout so later edits to a code can never change an existing charge. The Razorpay provider passes `offer_id` on subscription create; the webhook subtracts the frozen discount from the plan amount before its equality check, so a mismatch still lands in the existing attention queue.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Drizzle + PostgreSQL with RLS, zod, Vitest, Razorpay Subscriptions.

**Spec:** `docs/superpowers/specs/2026-09-22-referral-codes-design.md`

## Progress (2026-09-22)

**Tasks 1–9 are done.** `pnpm typecheck` clean; `pnpm lint` clean; unit tests green across every workspace
(billing 192, shared 340, admin 64, platform 398, db 34, cms 5, email 24, auth 17); integration 196 + 12.
Migration `0030_referral_codes.sql` is applied to the dev and test databases.

**Task 10's `pnpm build` is blocked by someone else's file.** `packages/cms/src/index.ts` imports its siblings
with `.js` extensions (`./config.js`, `./collections/BlogPosts.js`) while the files on disk are `.ts`, so
Turbopack cannot resolve any of the six and both apps fail to build. That file belongs to the concurrent
"Superadmin and admin flow" session's package extraction and was deliberately left alone. Nothing in the referral
work touches it; the fix is that session's to make.

### Two defects found and fixed while building Task 9

1. `activateFirstPayment` recorded `plan.initialAmountCents`, so a discounted payment would have been **recorded
   at the full price** even though Razorpay took less. It now takes `discountAmountCents` and records what was
   actually charged; the term is deliberately unaffected. Covered by four tests in
   `packages/shared/src/server/billing-activation.test.ts`.
2. Both `referral-code-form.tsx` client components imported from `@firstfold/billing`, whose index re-exports the
   Razorpay provider and, through it, `@firstfold/db` and the `pg` driver — pulling Postgres into the browser
   bundle. `packages/billing` now has a `./referral` subpath export (that module imports nothing) and both forms
   use it.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/billing/src/referral.ts` | Pure rules: normalise a typed code, compute the frozen discount, exact-division guard |
| `packages/billing/src/checkout.ts` | `CheckoutTarget.referralCodeId` so a different code replaces an open checkout |
| `packages/billing/src/provider.ts` | `StartCheckoutInput.offerId` / `.discountAmountCents` |
| `packages/billing/src/razorpay-provider.ts` | Pass `offer_id` to `subscriptions.create` |
| `packages/billing/src/fake-provider.ts` | Charge the discounted amount locally |
| `packages/db/src/schema/referrals.ts` | `referral_codes` table |
| `packages/db/src/schema/businesses.ts` | `referral_code_id` column |
| `packages/db/src/schema/billing.ts` | `referral_code_id`, `discount_amount_cents` on `subscriptions` |
| `packages/db/migrations/0030_referral_codes.sql` | Tables, constraints, grants |
| `packages/db/src/queries/referrals.ts` | Every referral read and write |
| `apps/platform/lib/server/referrals.ts` | Apply / remove / resolve for checkout, on the staff connection |
| `apps/platform/components/panel/referral-code-form.tsx` | The Apply / Remove field |
| `apps/admin/app/(protected)/referrals/**` | Staff list, create, detail |

---

## Task 1: Pure referral rules

**Files:**
- Create: `packages/billing/src/referral.ts`
- Test: `packages/billing/src/referral.test.ts`
- Modify: `packages/billing/src/index.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { MAX_REFERRAL_CODE_LENGTH, discountAmountFor, dividesExactly, normaliseReferralCode } from "./referral";

describe("normaliseReferralCode", () => {
  it("trims and uppercases", () => {
    expect(normaliseReferralCode("  save15 ")).toBe("SAVE15");
  });

  it("returns null for input that is not a code", () => {
    for (const input of ["", "   ", "ab", "has space", "sym!bol", "a".repeat(MAX_REFERRAL_CODE_LENGTH + 1)]) {
      expect(normaliseReferralCode(input)).toBeNull();
    }
  });

  it("accepts hyphens inside, never at the start", () => {
    expect(normaliseReferralCode("friend-15")).toBe("FRIEND-15");
    expect(normaliseReferralCode("-friend")).toBeNull();
  });
});

describe("discountAmountFor", () => {
  it("takes a whole percentage off the plan's minor units", () => {
    expect(discountAmountFor(350_000, 15)).toBe(52_500);
    expect(discountAmountFor(7_500, 15)).toBe(1_125);
  });

  it("refuses a percentage that would not divide exactly", () => {
    expect(() => discountAmountFor(101, 15)).toThrow(RangeError);
  });

  it("refuses a percentage outside 1-99", () => {
    for (const percent of [0, 100, -5, 1.5]) expect(() => discountAmountFor(350_000, percent)).toThrow(RangeError);
  });
});

describe("dividesExactly", () => {
  it("is true only when the discount is a whole number of minor units", () => {
    expect(dividesExactly(350_000, 15)).toBe(true);
    expect(dividesExactly(101, 15)).toBe(false);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

`pnpm --filter @firstfold/billing test -- referral` → FAIL, module not found.

- [x] **Step 3: Implement `referral.ts`**

`normaliseReferralCode` trims, uppercases and tests `^[A-Z0-9][A-Z0-9-]{2,23}$`, returning `null` rather than throwing, so callers treat a malformed code exactly like an unknown one. `dividesExactly(amount, percent)` is `(amount * percent) % 100 === 0`. `discountAmountFor` validates `Number.isInteger(percent) && percent >= 1 && percent <= 99`, then `dividesExactly`, then returns `(amount * percent) / 100`.

- [x] **Step 4: Run the test, expect PASS. Export from `index.ts`.**

- [x] **Step 5: Commit** — `feat(billing): add referral code rules`

---

## Task 2: A different code replaces an open checkout

**Files:**
- Modify: `packages/billing/src/checkout.ts`
- Test: `packages/billing/src/checkout.test.ts`

- [x] **Step 1: Failing test** — an `incomplete` subscription inside the reuse window, same plan and provider, but `latest.referralCodeId !== target.referralCodeId`, must decide `replace`, not `reuse`. A matching code (including both `null`) still decides `reuse`.
- [x] **Step 2:** Run, watch it fail.
- [x] **Step 3:** Add `referralCodeId: string | null` to both `CheckoutTarget` and `LatestSubscription`, and add `latest.referralCodeId === target.referralCodeId` to the existing `reusable` conjunction.
- [x] **Step 4:** Run the whole billing suite — every existing `decideCheckout` test needs the new field, so fix those call sites.
- [x] **Step 5: Commit** — `feat(billing): replace a checkout when the referral code changes`

---

## Task 3: Schema and migration

**Files:**
- Create: `packages/db/src/schema/referrals.ts`
- Modify: `packages/db/src/schema/index.ts`, `businesses.ts`, `billing.ts`
- Create: `packages/db/migrations/0030_referral_codes.sql`

- [x] **Step 1:** Write `referrals.ts` with the table and the four checks from the spec (code format, percent 1–99, reward ≥ 0, max_redemptions > 0).
- [x] **Step 2:** Add `referralCodeId` to `businesses`; add `referralCodeId` and `discountAmountCents` (NOT NULL DEFAULT 0) plus `subscriptions_discount_check` to `subscriptions`.
- [x] **Step 3:** `pnpm --filter @firstfold/db db:generate`, then hand-edit the generated SQL to append the grants block:

```sql
GRANT SELECT, INSERT, UPDATE ON referral_codes TO webfold_staff;
-- webfold_app is deliberately granted nothing: customers never read the codes table.
GRANT UPDATE (referral_code_id) ON businesses TO webfold_staff;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY referral_codes_staff_all ON referral_codes FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
```

- [x] **Step 4:** `pnpm db:migrate && pnpm db:migrate:test`, both clean.
- [x] **Step 5: Commit** — `feat(db): add referral codes schema`

---

## Task 4: Referral queries

**Files:**
- Create: `packages/db/src/queries/referrals.ts`
- Test: `packages/db/src/referrals.integration.test.ts`
- Modify: `packages/db/src/queries/billing.ts`, `packages/db/src/index.ts`

- [x] **Step 1: Failing integration test** covering: insert a code and read it back by code and by id; an inactive, expired or capped code is excluded by `findRedeemableReferralCode`; `setBusinessReferralCode` round-trips; and **`webfold_app` cannot select from `referral_codes`** (expect `insufficient_privilege`).
- [x] **Step 2:** Run, watch it fail.
- [x] **Step 3:** Implement the queries. `findRedeemableReferralCode(db, { code, currency, now })` filters on `active`, `expires_at`, currency, and a `max_redemptions` count of activated subscriptions carrying the code.
- [x] **Step 4:** Add `referralCodeId` and `discountAmountCents` to `SUBSCRIPTION_COLUMNS`, the `Subscription` interface, `NewSubscription`, and `insertSubscription`'s `values`.
- [x] **Step 5:** Run the integration suite, expect PASS.
- [x] **Step 6: Commit** — `feat(db): add referral code queries`

---

## Task 5: Providers carry the offer

**Files:**
- Modify: `packages/billing/src/provider.ts`, `razorpay-provider.ts`, `fake-provider.ts`
- Test: `packages/billing/src/razorpay-provider.test.ts`, `fake-provider.test.ts`

- [x] **Step 1: Failing test** — `startCheckout` with `offerId: "offer_abc"` passes `offer_id` to `subscriptions.create`; without one, the key is absent entirely (not `undefined`, which the SDK would serialise). The fake provider's checkout amount is `plan.initialAmountCents - discountAmountCents`.
- [x] **Step 2:** Run, watch it fail.
- [x] **Step 3:** Add `offerId?: string` and `discountAmountCents: number` to `StartCheckoutInput`; spread `...(offerId === undefined ? {} : { offer_id: offerId })` into the create call; widen `RazorpaySdkClient.subscriptions.create`'s input; subtract in the fake provider.
- [x] **Step 4:** Run the billing suite, expect PASS.
- [x] **Step 5: Commit** — `feat(billing): pass the Razorpay offer through checkout`

---

## Task 6: Applying a code on the server

**Files:**
- Create: `apps/platform/lib/server/referrals.ts`
- Test: `apps/platform/lib/server/referrals.test.ts`
- Modify: `apps/platform/lib/server/checkout.ts`

- [x] **Step 1: Failing test** for `applyReferralCodeFor`: an unknown, inactive, expired, wrong-currency or malformed code all return the **same** refusal message; a good one writes `businesses.referral_code_id`; a business that has already paid is refused.
- [x] **Step 2:** Run, watch it fail.
- [x] **Step 3:** Implement `applyReferralCodeFor`, `removeReferralCodeFor` and `resolveAppliedDiscount`, all on `getStaffDb()`, with a `referral:business:<id>` rate limit of 20/hour.
- [x] **Step 4:** In `startCheckoutFor`, resolve the applied code inside the existing lock, compute the frozen `discountAmountCents`, refuse if it is not less than `plan.initialAmountCents`, pass `referralCodeId` into `CheckoutTarget`, and hand `offerId` / `discountAmountCents` to `provider.startCheckout` and `openCheckoutSubscription`.
- [x] **Step 5:** Run platform unit tests, expect PASS.
- [x] **Step 6: Commit** — `feat(platform): apply referral codes at checkout`

---

## Task 7: The price the customer sees

**Files:**
- Modify: `packages/shared/src/lib/billing/payment-step.ts`, `terms.ts`
- Create: `apps/platform/components/panel/referral-code-form.tsx`
- Modify: `apps/platform/app/app-host/(protected)/onboarding/review/{page.tsx,actions.ts}`
- Test: `packages/shared/src/lib/billing/payment-step.test.ts`

- [x] **Step 1: Failing test** — `paymentStep` with a discount returns the discounted `amount`, and `billingBanner`'s price matches it. Without a discount, every existing expectation is unchanged.
- [x] **Step 2:** Run, watch it fail.
- [x] **Step 3:** Add `discount: AppliedDiscount | null` to `PaymentStepInput` and `BannerInput`; derive the amount from `plan.initialAmountCents - discount.amountCents`.
- [x] **Step 4:** Build `ReferralCodeForm` (Apply when none, code + Remove when applied) and the `applyReferralCode` / `removeReferralCode` actions; render the form inside the `pay-and-send` and `pay` branches.
- [x] **Step 5:** Run shared + platform tests, expect PASS.
- [x] **Step 6: Commit** — `feat(platform): show the referral discount on Check and send`

---

## Task 8: The webhook and manual payments

**Files:**
- Modify: `apps/platform/lib/server/razorpay-webhook-handler.ts`, `apps/admin/lib/server/billing-admin.ts`
- Test: `apps/platform/lib/server/razorpay-webhook-handler.test.ts`

- [x] **Step 1: Failing test** — a `subscription.charged` event for a subscription with `discountAmountCents: 52_500` against a ₹3,500 plan **activates** at 297,500 paise, and the undiscounted 350,000 now trips `amount_mismatch`.
- [x] **Step 2:** Run, watch it fail.
- [x] **Step 3:** Subtract `subscription.discountAmountCents` from the base amount. One line.
- [x] **Step 4:** Make `recordManualFirstPayment` honour the business's applied code the same way, so a discounted bank transfer is not a mismatch.
- [x] **Step 5:** Run both suites, expect PASS.
- [x] **Step 6: Commit** — `feat(billing): expect the discounted amount on charge`

---

## Task 9: The staff console

**Files:**
- Create: `apps/admin/app/(protected)/referrals/{page.tsx,actions.ts}`, `referrals/new/{page.tsx,actions.ts}`, `referrals/[codeId]/page.tsx`
- Create: `apps/admin/components/referral-code-form.tsx`
- Create: `apps/admin/lib/server/referral-admin.ts` + test
- Modify: `apps/admin/components/admin-shell.tsx`

- [x] **Step 1: Failing test** for `createReferralCodeFor`: a duplicate code, a percent outside 1–99, a percent that would not divide exactly for the chosen currency's plan, and a missing referrer are each refused with a field-specific message.
- [x] **Step 2:** Run, watch it fail.
- [x] **Step 3:** Implement the admin server module with a zod schema, then the three pages and the nav entry.
- [x] **Step 4:** Refuse edits to percent, currency and `offer_id` once any subscription carries the code; the form explains why.
- [x] **Step 5:** Run admin tests, expect PASS.
- [x] **Step 6: Commit** — `feat(admin): manage referral codes`

---

## Task 10: Full verification

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm test:integration`
- [ ] `pnpm build` — **blocked** by `packages/cms/src/index.ts`'s `.js` imports (not this feature's file)
- [ ] Manual: create a code in the console, apply it on Check and send, confirm the button shows the discounted price, pay on the fake provider, confirm the subscription activates at the discounted amount.
