# Affiliates and coupons — implementation plan

> **For agentic workers:** executed inline in the session that wrote it (user asked "write the plan and implement it").
> Steps use checkbox syntax. Spec: `docs/superpowers/specs/2026-10-06-affiliates-coupons-design.md`.

> Shipped to development as migrations **0091–0093** (renumbered at merge; the numbers below are the originals).

**Goal:** Split referral codes into coupons and affiliate codes, accrue affiliate earnings per paid month, record
payouts, take discounts at Razorpay through automatically created discounted plans, and let Premium members apply a
code on `/premium`.

**Architecture:** `referral_codes` stays the one code table (`affiliate_id` null = coupon). New `affiliates`,
`affiliate_earnings`, `affiliate_payouts`, `provider_discount_plans` tables. Earnings are written in
`packages/shared/src/server/billing-activation.ts`, the one place every first payment and renewal is recorded, in the
same transaction. Checkout asks `ensureDiscountPlan` for a discounted Razorpay plan id.

**Tech stack:** Next.js 16, Drizzle + Postgres 14 (RLS roles `webfold_app` / `webfold_staff`), Vitest (unit +
integration), pnpm workspace.

**Local environment:** worktree `affiliates-coupons`, DBs `webfold_aff` (copy of `webfold_devlatest`, migrated),
`webfold_aff_test`, `webfold_payload_aff`. Nothing is committed ([[no-commits-without-ask]]): every "commit" step in
this plan is a checkpoint (`pnpm typecheck` + the task's tests), not a git commit.

## Deviations from the spec, decided while planning

1. **Refunds.** Nothing in the codebase marks a payment `refunded`; refunds are handled by hand. Instead of an
   automatic cancel, staff cancel an owed earning on the affiliate page (`Cancel` on the earning row).
2. **Currency mismatch.** A fixed reward has a currency. The console refuses an affiliate code in another currency
   than a fixed reward, and refuses switching a reward to a fixed amount in a currency its codes do not use. Accrual
   still guards: a mismatch writes no earning and logs `affiliate-currency-mismatch`. No new attention enum value.
3. **No-discount codes.** Expressed as `discount_kind` null (both value columns null), allowed only with an
   affiliate, rather than a new enum value (Postgres cannot use a value added by `ALTER TYPE … ADD VALUE` in the
   same transaction).
4. **Accrual location.** In `billing-activation.ts` (`packages/shared`), not inside `recordPaymentAndActivate`:
   `packages/db` cannot import `rewardCentsFor` from `packages/billing` (billing already imports db).
5. **Migrations.** Two: 0084 adds (tables, columns, data copy, checks, grants), 0085 drops the retired columns. Kept
   apart so `drizzle-kit generate` never asks rename-or-drop questions.

## File map

| File | Responsibility |
|---|---|
| `packages/db/src/schema/affiliates.ts` (new) | `affiliates`, `affiliate_earnings`, `affiliate_payouts`, `affiliate_earning_status` |
| `packages/db/src/schema/referrals.ts` | `affiliate_id`; discount kind nullable; referrer/reward/offer columns removed |
| `packages/db/src/schema/billing.ts` | `provider_discount_plans`; relaxed `subscriptions_discount_check` |
| `packages/db/migrations/0084_affiliates_coupons.sql`, `0085_drop_referrer_columns.sql` | generated + hand-added data copy and grants |
| `packages/db/src/queries/referrals.ts` | `ReferralCode` gets `affiliateId`, `discount: ReferralDiscount \| null`; loses referrer/reward/offer; list filter by kind |
| `packages/db/src/queries/affiliates.ts` (new) | affiliate CRUD, accrual context, earning insert/cancel, payout, console lists |
| `packages/db/src/queries/discount-plans.ts` (new) | find / insert `provider_discount_plans` |
| `packages/billing/src/provider.ts`, `razorpay-provider.ts`, `fake-provider.ts` | `offerId` → `providerPlanId` override |
| `packages/billing/src/referral.ts` | drop `providerDiscountFor`; `discountPlanCode` |
| `packages/shared/src/server/billing-activation.ts` + `affiliate-accrual.ts` (new) | write the earning in the payment's transaction |
| `packages/shared/src/lib/billing/terms.ts`, `referral-value.ts` | nullable stated discount; affiliate reward words |
| `apps/platform/lib/server/referrals.ts`, `checkout.ts`, `discount-plans.ts` (new) | zero-discount affiliate codes; discounted plan id at checkout |
| `apps/platform/app/app-host/(protected)/premium/*`, `components/panel/referral-code-form.tsx` | code field on `/premium` |
| `apps/admin/app/(protected)/coupons/**` (moved from `referrals/`) | coupons console |
| `apps/admin/app/(protected)/affiliates/**` (new) | affiliates console: list, new, detail, add code, payouts |
| `apps/admin/lib/server/referral-admin.ts`, `affiliate-admin.ts` (new) | server-side validation for both |
| `apps/admin/components/referral-code-form.tsx`, `affiliate-forms.tsx` (new) | forms |
| `apps/admin/components/console/dock.tsx` | Coupons + Affiliates |

## Tasks

### Task 1: Schema and migrations
- [ ] Add `schema/affiliates.ts`; export from `schema/index.ts`.
- [ ] `referral_codes`: `affiliate_id` FK, discount check allowing `discount_kind is null` only with an affiliate.
- [ ] `provider_discount_plans` in `schema/billing.ts`; subscriptions check → `discount >= 0 and (referral_code_id is not null or discount = 0)`.
- [ ] `pnpm db:generate` → 0084; append: copy referrers into `affiliates` (one per lower(email)), set `affiliate_id`, grants + RLS staff policies for the new tables.
- [ ] Drop `referrer_name`, `referrer_email`, `reward_*`, `provider_offer_id` from the TS schema; `pnpm db:generate` → 0085.
- [ ] Migrate dev + test DBs; integration test: migration copied referrers (seeded before 0084 in `migrator` style is not available, so assert via a fresh insert path instead — see Task 2 tests).

### Task 2: DB queries
- [ ] `referrals.ts`: reshape `ReferralCode`; `createReferralCode` takes `affiliateId`; `listReferralCodes(db, { kind: "coupon" | "affiliate" }, limit)`; `findRedeemableReferralCode` refuses codes of an inactive affiliate.
- [ ] `affiliates.ts`: `createAffiliate`, `updateAffiliate`, `findAffiliateById`, `listAffiliates` (members, earned/owed per currency), `listAffiliateCodes`, `listAffiliateMembers`, `listAffiliateEarnings`, `listAffiliatePayouts`, `findAffiliateAccrualContext`, `insertAffiliateEarning` (on conflict payment_id do nothing), `cancelAffiliateEarning`, `recordAffiliatePayout` (locks the listed owed earnings, refuses a stale set).
- [ ] `discount-plans.ts`: `findProviderDiscountPlan`, `insertProviderDiscountPlan` (on conflict do nothing, read back).
- [ ] Integration tests in `referrals.integration.test.ts` and new `affiliates.integration.test.ts`.

### Task 3: Billing package
- [ ] `StartCheckoutInput.providerPlanId?`; Razorpay uses it over `plan.providerPlanId`; remove `offerId`.
- [ ] Remove `providerDiscountFor` and its tests; add `discountPlanCode(planCode, discountCents)`.
- [ ] Unit test: for a sweep of discounts, `chargedAmountCents(net - d, 0, tax) === chargedAmountCents(net, d, tax)`.

### Task 4: Accrual
- [ ] `packages/shared/src/server/affiliate-accrual.ts`: `accrueAffiliateEarning(tx, { paymentId, subscriptionId, kind })`.
- [ ] Called from `activateFirstPayment` and `activateRenewalPayment` when `!alreadyRecorded`.
- [ ] Integration test: initial + renewal write two earnings; replayed payment writes none; zero reward writes none; coupon writes none.

### Task 5: Platform
- [ ] `referrals.ts`: affiliate code with no discount applies with `amountCents: 0`; `offerId` removed.
- [ ] `discount-plans.ts` + `checkout.ts`: discounted plan id passed when discount > 0 and provider is Razorpay.
- [ ] `/premium`: `ReferralCodeForm` ("Have a code?") above Pay; Pay shows the discounted amount; hidden while waiting; actions `applyMembershipCode` / `removeMembershipCode`.
- [ ] Unit tests for `discountFrom` with a null discount.

### Task 6: Staff console
- [ ] Move `referrals/` → `coupons/`; trim form (no referrer, reward, Offer id); `/referrals` redirects.
- [ ] `affiliate-admin.ts` + `/affiliates`, `/affiliates/new`, `/affiliates/[id]`, `/affiliates/[id]/codes/new`; record payout; cancel earning.
- [ ] Dock: Coupons, Affiliates. `billing-admin.ts` manual payment handles a no-discount affiliate code.
- [ ] Update `referral-admin.test.ts`.

### Task 7: Verify
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm build`.
- [ ] Browser e2e on fake provider: coupon on `/premium`, affiliate code with and without discount, renewal (simulated), payout, cancel.
