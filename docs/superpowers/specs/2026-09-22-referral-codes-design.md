# Referral codes — design

**Date:** 2026-09-22
**Status:** approved, not yet implemented
**Surfaces:** staff console (`apps/admin`), customer dashboard (`apps/platform`), `packages/db`, `packages/billing`

## What this adds

A referral code, created by the superadmin, that a customer types on Check and send before
paying. It takes a percentage off **every** month of that customer's subscription, for as
long as the subscription lives, and it names the person who referred them.

This spec covers **Phase 1 only**: creating codes, redeeming them, charging the discounted
amount, and recording who referred whom. The referrer's reward is stored on the code but
nothing accrues or is paid out — that is Phase 2 (see *Out of scope*).

## Decisions taken

| Question | Decision |
|---|---|
| What the code does to the price | A whole-number percentage off every billing cycle, not just the first |
| Who a referrer is | Anyone (agency, friend), not necessarily a customer |
| What they earn | Cash we owe them, per month the referred customer pays. Paid by bank transfer, marked paid in the console — **Phase 2** |
| How the discount is taken at Razorpay | A Razorpay Offer, created by hand in the Razorpay dashboard; its `offer_id` is pasted into the code |
| Where the customer types it | Check and send (`/onboarding/review`), Apply before Pay |
| Currency scope | One code, one currency. A referrer needing both gets two codes |

## Why a Razorpay Offer

Razorpay Subscriptions charge the Plan's amount; there is no per-subscription price
override. The provider-native way to discount is an Offer linked at subscription creation:

- `offer_id` is a documented parameter on the [Create Subscription API](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/).
- Subscription offers support a **Forever** duration, which is what a recurring discount
  needs (single-use and limited-cycles are the other two).

Offers are created in the Razorpay dashboard, not via API, so the superadmin creates the
offer there once and pastes its `offer_id` when creating the code. This is a deliberate
manual step, not an oversight.

## Why percentages are exact here

A percentage discount normally invites rounding drift, which would trip the webhook's
amount check on every single payment. It does not here, because of the actual plan prices:

| Plan | Minor units | Any whole percent |
|---|---|---|
| `care-usd` | 7,500 cents | `7500 × p / 100 = 75p` — always a whole number |
| `care-inr` | 350,000 paise | `350000 × p / 100 = 3500p` — always a whole number |

So the code stores a **whole-number percent, 1–100**. At checkout we compute
`discountAmountCents = planAmountCents × percent / 100` and **freeze that integer** on the
subscription. Every later comparison uses the frozen integer, never a recomputed
percentage. No floats enter billing, consistent with the rest of the package.

A migration-level check rejects any code whose percent would not divide exactly for its
currency's active plan, so a future plan price cannot silently introduce fractions.

## Data model

### New table: `referral_codes`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | uuidv7, as elsewhere |
| `code` | text unique | Stored normalised uppercase |
| `currency` | `billing_currency` | One code, one currency |
| `discount_percent` | integer | 1–99. 100 is excluded: Razorpay cannot authorise a zero-amount subscription |
| `provider_offer_id` | text null | The `offer_xxx` from the Razorpay dashboard. Null is allowed so the fake provider works locally |
| `referrer_name` | text | |
| `referrer_email` | text | |
| `reward_amount_cents` | integer | What we owe the referrer per paid month. **Stored now, accrued in Phase 2** |
| `active` | boolean, default true | How a code is retired |
| `expires_at` | timestamptz null | |
| `max_redemptions` | integer null | Null means no cap |
| `created_by_staff_id` | text → `users.id` | Who created it |
| `created_at`, `updated_at` | timestamptz | |

Constraints:

- `referral_codes_code_format_check`: `code ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'`
- `referral_codes_percent_check`: `discount_percent between 1 and 99`
- `referral_codes_reward_check`: `reward_amount_cents >= 0`
- `referral_codes_max_redemptions_check`: `max_redemptions is null or max_redemptions > 0`

Privileges: `GRANT SELECT, INSERT, UPDATE ON referral_codes TO fynix_staff` and **nothing
to `fynix_app`**. Customers never read the codes table; validation runs on the staff
connection inside `startCheckoutFor`, exactly as the rest of billing already does. No RLS
policy is needed on a table the tenant role cannot reach.

### New column: `businesses.referral_code_id` (uuid null → `referral_codes.id`)

The code a business has **applied but not yet paid on**. Set by the Apply action, cleared
when the customer removes it. It is also the permanent attribution for the tenant, which is
what Phase 2's ledger reports on.

### New columns on `subscriptions`

| Column | Notes |
|---|---|
| `referral_code_id` | uuid null → `referral_codes.id` |
| `discount_amount_cents` | integer NOT NULL DEFAULT 0 |

`discount_amount_cents` is a **snapshot frozen when the checkout opens**. Editing or
deactivating a code later must never change what an existing customer is charged, nor what
the webhook expects. Existing rows default to 0, which is exactly their current behaviour.

Constraint `subscriptions_discount_check`:
`discount_amount_cents >= 0 and (referral_code_id is null) = (discount_amount_cents = 0)`
— a discount without a code, or a code without a discount, is a bug.

### No `referral_redemptions` table

A redemption *is* a subscription carrying a `referral_code_id`. The redemption count for a
code is the number of its subscriptions that were ever activated. Phase 2's reward ledger
keys off `payments × subscriptions.referral_code_id`, which is the same join. A separate
table would only duplicate this.

## Flow

### 1. Applying the code

On Check and send, inside the `pay-and-send` and `pay` steps, a `ReferralCodeForm`:

- **Not applied:** a text field and an Apply button.
- **Applied:** "`SAVE15` applied — 15% off every month" and a Remove button.

`applyReferralCode` (server action) normalises the input (trim, uppercase), looks the code
up on the staff connection, and on success writes `businesses.referral_code_id`. On failure
it returns a `StepProblem` through the existing `refusedStepState` path, so the field shows
the message and nothing is stored.

A code is refused when it does not exist, is inactive, has expired, has reached
`max_redemptions`, or is for another currency. Every refusal returns the **same** message —
"That code isn't valid." — so the form is not an oracle for which codes exist.

`removeReferralCode` sets the column back to null. Both actions refuse once the business has
paid: an activated subscription's discount is frozen and is not changed from the dashboard.

**Connections.** `fynix_app` holds `SELECT` only on `businesses` and no grant at all on
`referral_codes`, so both actions — and the page's read of the applied code's percent for
display — run on the **staff connection** (`getStaffDb()`), exactly as `startCheckoutFor`
already does. This is the existing rule that customers never write billing rows, not an
exception to it. Every such call still checks the signed-in customer owns the business
before it touches anything.

### 2. The price on the page

`PaymentStepInput` gains `discount: { percent: number; amountCents: number } | null`.
`paymentStep` returns the discounted `amount`, so the button reads "Pay ₹2,975 and send",
and `terms` mentions the ongoing discount. `billingBanner`'s `BannerPrice` uses the same
discounted amount. **The price shown and the price charged are computed from one value.**

### 3. Opening the checkout

`CheckoutTarget` (in `packages/billing/src/checkout.ts`) gains
`referralCodeId: string | null`. `decideCheckout` already replaces an unpaid checkout whose
plan or provider differs; adding the code to that comparison means applying a different code
over an open checkout falls into the existing `replace` branch. One place keeps deciding.

`startCheckoutFor` resolves the business's applied code inside the existing per-business
lock, re-validates it (it could have been deactivated since Apply), computes the frozen
`discountAmountCents`, and refuses if it is not less than `plan.initialAmountCents`.

A second rate-limit bucket, `referral:business:<id>` at 20/hour, sits on the Apply action so
codes cannot be enumerated. The existing `checkout:business:<id>` limit is unchanged.

`StartCheckoutInput` gains `offerId?: string` and `discountAmountCents: number`:

- **Razorpay provider:** passes `offer_id` on `subscriptions.create` when present. Nothing
  else changes; Razorpay applies the offer to every cycle.
- **Fake provider:** charges `plan.initialAmountCents - discountAmountCents`, so the local
  and test path exercises the discounted amount end to end.

`openCheckoutSubscription` writes `referralCodeId` and `discountAmountCents` onto the new
subscription row.

### 4. The webhook

The only change in `apps/platform/lib/server/razorpay-webhook-handler.ts`:

```ts
const base = subscription.activatedAt === null ? plan.initialAmountCents : plan.recurringAmountCents;
const expectedAmount = base - subscription.discountAmountCents;
```

Everything else is untouched. If the pasted `offer_id` does not match the stored percent,
the charge lands as `amount_mismatch` → recorded, activates nothing, flagged for staff, and
the customer is told their payment is under review. **The feature fails safe and loudly**
into the queue that already exists, rather than silently activating a wrong amount.

### 5. Manual payments

`recordManualFirstPayment` in the console honours the business's applied code the same way,
so a bank transfer at the discounted price is not an `amount_mismatch`.

## Staff console

A `Referrals` nav item in `AdminShell`, following the existing Leads pattern:

| Route | What it does |
|---|---|
| `/referrals` | Codes with referrer, percent, currency, redemptions, active state |
| `/referrals/new` | Create: code, currency, percent, Razorpay `offer_id`, referrer name and email, reward per month, optional expiry and cap |
| `/referrals/[codeId]` | Edit the retiring fields (active, expiry, cap) and see which businesses redeemed it |

**The percent, currency and offer id are not editable once a subscription carries the code.**
Editing them would desynchronise our expected amount from the live Razorpay offer. Retire the
code and make a new one instead; the form says so.

## Testing

| Level | What |
|---|---|
| Unit, `packages/billing` | `normaliseReferralCode`, `discountAmountFor(plan, percent)` including exact-division, `decideCheckout` with a differing `referralCodeId` forcing `replace` |
| Unit, platform | `paymentStep` and `billingBanner` with and without a discount; webhook expected-amount arithmetic |
| Integration, `packages/db` | Code queries, the `subscriptions_discount_check` constraint, and an RLS test asserting `fynix_app` **cannot** read `referral_codes` |
| Integration, platform | A full discounted checkout on the fake provider: apply → pay → activated at the discounted amount |
| Integration, admin | Creating a code, and the refusal to edit a redeemed one |

## Out of scope (Phase 2)

- The reward ledger: accruing `reward_amount_cents` per paid month, payable/paid states, a
  payout screen. `reward_amount_cents` is stored on the code so the deal is recorded from
  day one, but nothing reads it yet.
- Reactivation with a code. Reactivation is a staff conversation today and stays that way.
- Referrer self-service (a portal showing what they have earned).
- Changing or removing a code after activation.

## Risks

1. **The pasted `offer_id` and the stored percent can disagree.** Mitigated, not prevented:
   every mismatched charge lands in the attention queue instead of activating. Worth watching
   the first time each code is used.
2. **A Razorpay offer that is not Forever** silently becomes a first-month-only discount, and
   month two trips `amount_mismatch`. The `/referrals/new` form states the requirement
   explicitly.
3. **Plan price changes** could make an existing percent inexact. The migration check covers
   codes at creation; changing a plan price is already a migration, and that migration must
   re-check live codes.

## 2026-09-28: percentage option

The discount and the referrer reward can each be a **flat amount** (as before) or a **percentage**, which staff
choose with an Amount / Percentage switch on `/referrals/new`. The reward's kind can be changed later on the code's
own page; the discount's cannot.

- **Storage.** Enum `referral_value_kind` (`amount`, `percent`). `referral_codes` gains `discount_kind`,
  `discount_percent_basis_points`, `reward_kind`, `reward_percent_basis_points`; `discount_amount_cents` is now
  nullable. Percentages are basis points (12.5% = 1250). Checks hold exactly one half of each pair set: a discount
  is `> 0` cents or 1–9900 bp; a reward is `>= 0` cents or 1–10000 bp with `reward_amount_cents = 0`. Existing codes
  stay `amount`. Migrations 0044 and 0045 (0045 adds explicit `is not null` guards, since a check that evaluates
  to unknown passes).
- **Types.** `ReferralValue = { kind: "amount"; amountCents } | { kind: "percent"; basisPoints }`; queries map rows
  to `code.discount` / `code.reward` and nothing reads the raw columns outside `queries/referrals.ts`.
- **Money.** `discountCentsFor(discount, planAmountCents)` resolves a percentage against the plan's pre-tax price,
  rounded half up in integer arithmetic. Checkout, the manual-payment path and the console all use it, and
  `isChargeableDiscount` is applied to the resolved cents. The resolved figure is frozen onto
  `subscriptions.discount_amount_cents` exactly as before, so the webhook and existing subscriptions are unchanged.
- **Razorpay Offer.** `providerDiscountFor` returns the Offer to create. A flat code needs the discount plus its GST.
  A percentage code gets a **percentage** Offer only when p% of the GST-inclusive price is a whole number of minor
  units and equals our own discounted charge exactly; otherwise it gets the exact **flat** Offer, because Razorpay's
  rounding of a fractional paisa could differ from ours by one and the webhook compares amounts exactly. (10% on
  ₹2,999 + 18% is a flat ₹353.88 Offer; 20% on $69 is a 20% Offer.)
- **Reward.** `rewardCentsFor(reward, customerPaysPreTaxCents)`: a percentage is of what the customer pays each
  month before GST, after the discount, rounded down. Stored and shown only; nothing pays it yet.
- **Words.** `packages/shared/src/lib/billing/referral-value.ts`: "₹500 off" / "12.5% off", "₹200 a month" /
  "10% of each payment". The customer's applied code reads "10% off (₹299.90), every month".
