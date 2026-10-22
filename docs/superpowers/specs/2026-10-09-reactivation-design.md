# Reactivation: a lapsed customer pays again from the dashboard

Date: 2026-10-09. Status: approved 2026-10-09.

## Why

A customer whose plan has lapsed (Razorpay gave up on a failed renewal, or they cancelled and the paid period ran
out) is told "Your plan has ended. Get in touch to restart it." and cannot pay. Every lapsed customer costs a staff
conversation, and a customer who wants to come back at 11pm cannot. The platform spec already set the rule this
implements: "A successful payment brings the site back automatically, with no rebuild. Missed months are not charged."

## Decisions (confirmed 2026-10-09)

| Question | Decision |
|---|---|
| Which plan | The tier they were on (Care or Premium), at the price on sale today. A customer who paid the old ₹2,999 Premium returns at ₹6,999. Moving Care to Premium afterwards uses the existing Upgrade flow. |
| Coupons | A code is not applied to a reactivation, but a lapse (a failed payment, a revoked mandate) keeps the code it had for the months it has left (plan 18, decision 4): the discount is repriced on the basket and its months are copied across, and the code's affiliate earns as on a renewal. After the customer's own cancel nothing carries. |
| Renewal still being retried, paid period over | The customer may reactivate now. The retrying Razorpay subscription is cancelled. |
| Staff | Recording a bank transfer in the console reactivates a lapsed client the same way. |
| Currency | INR. Nothing here is specific to a currency, and no USD work is done. |

## What the customer sees

- The billing banner on every dashboard page: "Your plan has ended. Restart it for ₹6,999 a month + GST. Your website
  and content are safe." with a **Reactivate** button to Billing. It replaces today's "get in touch" banner.
- Billing: the plan card shows the plan and the price they will pay now (not the old price they used to pay) and a
  **Reactivate** button. Pressing it opens Razorpay Checkout through the existing `/billing/pay` page.
- After paying, Razorpay returns them to Billing with "Payment received. Your website is back online." (or "That
  payment didn't go through" on a decline). Access returns when the signed webhook lands, as for every payment.
- Missed months are never charged: the new subscription starts on the day they pay.

## Design

Reactivating opens a new Razorpay subscription on the tier's current plan, through the same checkout and webhook path
as a first payment. Reviving the halted Razorpay subscription was rejected: it only exists for a halted subscription,
not a cancelled or completed one, and it leaves missed-month invoices that Razorpay may still try to collect.

### Billing package (`packages/billing/src/checkout.ts`)

`decideCheckout` stops returning `needs-reactivation`. A business with no access whose newest subscription is still
live but lapsed (`active`, `past_due` or `inactive`, with no access) gets `replace`, the same decision an unpaid stale
checkout gets: end that row, open a new one. `cancelled` and `incomplete` behave as today. A payment under review
still blocks everything (it is checked before anything else that could open a checkout). This also unsticks the one
case that used to land on "needs reactivation" without ever paying: a subscription marked `active` by an
`authenticated` event whose first charge never came.

The `needs-reactivation` variant is removed from `CheckoutDecision`, and from every exhaustive switch over it.

### Ending the lapsed row (`packages/db`)

`cancelStaleSubscription` today refuses anything but `incomplete`. It is widened to also end a live row that grants
no access at `now`: status `active`, `past_due` or `inactive` with `paid_through_at` null or not after `now`. The guard
stays in the `UPDATE ... WHERE`, so a renewal that lands in between (moving `paid_through_at` into the future) makes it
match nothing and throw `StaleSubscriptionChangedError`, exactly as an unpaid checkout that got paid does today. The
old row's dates and payments are untouched.

After the commit, the old subscription is cancelled at Razorpay immediately with the existing `cancelAtProvider`
(never at cycle end: there is no paid period left to run out). A failure there is logged, as it is today.

### Opening the checkout (`apps/platform/lib/server/checkout.ts`)

- `openPlanCheckout` applies no new referral code when the business has paid before (`state.hasEverPaid`). A lapse carries the code of the subscription it last paid on (`loadCarriedCode`) when the customer did not cancel themselves and the code has months left (or no limit): the discount is repriced on the reactivation basket and `discount_months_left` is copied across. The code need not still be redeemable, and the redemption cap is not used again (it counts businesses).
- `needs-reactivation` handling is removed.
- New `startReactivationFor(customer, now)`: the checkout rate limit, a check that the business has paid before and
  has no access now (anything else is refused with the existing messages), then `openPlanCheckout` with the business's
  own tier and Billing as where an already-paid business is sent. It does not run the onboarding checks of Check and
  send: a returning client's project is live.
- A server action on Billing calls it and redirects to the checkout.

### Recording the payment (`packages/shared/src/server/billing-activation.ts`)

New `activateReactivationPayment(tx, input)`: records the payment as kind `reactivation` (the enum value and the
receipt wording already exist) at the plan's recurring amount with its tax, sets the period to end at the
`paidThroughAt` it is given, and sets `commitmentEndsAt` to the same date. It does not mark a lead paid, open a
membership. It takes the discount frozen on the new subscription (0 unless a lapse carried a code), counts a month off the code, and accrues an affiliate earning as a renewal does.

A first charge on a subscription is a reactivation when the business already has another activated subscription. This
is read under the business's billing lock, so it is a fact at that moment, not a guess.

- **Razorpay webhook:** `paidThroughAt` is the event's `current_end`, Razorpay's own cycle end, as for renewals. The
  expected amount is the plan's recurring amount with tax, less the discount frozen on the new subscription (none unless a lapse carried a code).
- **Fake provider (local):** one calendar month from payment.
- **Staff bank transfer:** one calendar month from the date the money arrived.

### Webhook bug fixed on the way

The Razorpay webhook never checks the status of the subscription a charge is for. A charge that lands on a replaced
or cancelled subscription goes down the activation path and tries to set that row `active`. The one-live-subscription
index refuses it, the handler throws, and Razorpay retries a payment that is never recorded or flagged. The fake
provider's path already records this as `checkout_replaced` for staff.

The webhook now does the same: a charge on a `cancelled` subscription is recorded with `recordUnappliedPayment`,
reason `checkout_replaced`, and nothing is activated. This is the case a reactivation creates when the old
subscription's retry lands in the seconds before Razorpay cancels it, and staff refund it from the attention queue.

### Staff console (`apps/admin/lib/server/billing-admin.ts`)

`recordManualFirstPayment` follows the new decision: a lapsed client's bank transfer ends the lapsed row, opens a
`manual` subscription on the tier's current plan, and records it with `activateReactivationPayment`. The
`needs-reactivation` notice in `packages/shared/src/lib/billing/manual-payment-notices.ts` goes. The amount shown on
the form is the amount recorded.

### Screens (`apps/platform`)

- `billingBanner` (`packages/shared/src/lib/billing/payment-step.ts`): the `lapsed` case becomes a `pay` banner with
  the current plan's price and a Reactivate action to `/billing`. The `contact` kind is removed if nothing else uses it.
- `PlanSummary`: for a lapsed customer, shows the current plan's price and the Reactivate form instead of
  `PLAN_ENDED_MESSAGE`.
- Check and send's `reactivate` step points to Billing instead of the team.
- `/billing/pay` and its callback: for a client who has paid before, the back link and Razorpay's return go to Billing,
  with `?payment=received` or `?payment=failed`, which Billing shows as a notice.
- `PLAN_ENDED_MESSAGE` is rewritten to no longer tell the customer to get in touch.

## Errors and races

| Case | Outcome |
|---|---|
| Two Reactivate presses | The second reuses the first unpaid checkout (existing 24-hour reuse rule). |
| A retry of the old subscription succeeds before the customer presses Reactivate | They have access again; the decision is `already-paid` and they are sent to Billing. |
| A retry succeeds between the decision and the commit | `StaleSubscriptionChangedError`, nothing opened at Razorpay survives (the existing orphan cleanup), the customer sees "Something changed while we were setting up your payment." |
| A retry of the old subscription lands after the commit, before Razorpay cancels it | Recorded as `checkout_replaced`, flagged for staff to refund. The new subscription is unaffected. |
| The new Razorpay subscription is abandoned | It stays `incomplete`; the customer remains lapsed and can press Reactivate again. |
| A payment under review | Reactivate is refused with the existing "We've received your payment" message. |

## Testing

- `decideCheckout`: every status with and without `hasEverPaid`, including the lapsed live statuses and a payment under
  review.
- `cancelStaleSubscription` (integration, real database): ends a lapsed live row; refuses one with access; refuses one
  whose `paid_through_at` moved into the future.
- `activateReactivationPayment`: kind, amount (with the carried discount), dates, no lead marked, no membership, the affiliate earning and the code's month counted.
- Webhook: a first charge for a returning business records `reactivation` with `current_end`; a charge on a cancelled
  subscription is recorded as `checkout_replaced` and activates nothing.
- Checkout: no new code for a returning business, the lapsed subscription's code carried with its months after a lapse and nothing carried after the customer's own cancel; the lapsed row is cancelled at the provider after the commit.
- Console: a bank transfer for a lapsed client reactivates it.
- Banner and plan card: the lapsed state shows today's price and Reactivate.
- One end-to-end run in Razorpay test mode before release: lapse a test subscription, reactivate, confirm access
  returns and the old subscription is cancelled at Razorpay.

## Out of scope

Choosing a different tier on return, grandfathered prices, a new coupon on reactivation, refunds through the API, USD. A bank transfer recorded in the console for a lapsed client does not carry the code yet.
