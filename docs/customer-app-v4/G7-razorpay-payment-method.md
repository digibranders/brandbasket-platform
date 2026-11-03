# G7: changing the payment method of a Razorpay subscription

Spike for gate G7 in plan 61. Research date 3 November 2026. Code was read, not changed. Nothing here has been run against Razorpay: every "documented" below is from razorpay.com/docs, every "unproven" needs the test-mode checks in section 6.

## 1. The answer in two sentences

No. Razorpay has no API that swaps the card or UPI of a running subscription without the customer authorising again, and no documented way to edit or modify a UPI mandate; the only documented in-place route is Razorpay's own card-change flow (the Checkout option `subscription_card_change` and the hosted "Update Payment Method" page), which the docs describe for `pending` and `halted` subscriptions, and whether it also works on a healthy `active` one is unproven. The cleanest self-serve flow that rests only on documented, already-proven primitives is a successor subscription that starts on the old subscription's `current_end`, with the old one cancelled at cycle end once the new one is authorised, which is how Keep my plan works in this repo today.

## 2. What the code does today

- `packages/billing/src/razorpay-provider.ts` calls only: `subscriptions.create` (plan_id, `total_count` 120, quantity 1, `customer_notify: false`, `notes.businessId`, optional `start_at`), `subscriptions.cancel` (with `cancel_at_cycle_end`), `subscriptions.update` (only `plan_id` with `schedule_change_at: "cycle_end"`, for discounts), `subscriptions.fetch` (id and status only), `payments.fetch`, `plans.create`, `orders.create`. It never creates a Razorpay customer or touches a token or mandate. The customer is created by Razorpay when they pay in Checkout, and the mandate is whatever Checkout registers.
- Checkout opens from our own pages (`/billing/pay`, `/restore-account/keep-plan`) with the `subscription_id`. `RazorpaySdkClient` has no way to pass `subscription_card_change`; that is a Checkout option in the browser, so no provider change is needed to use it.
- Add-ons are separate Razorpay subscriptions (`startAddOnSubscription`), each with its own mandate. Any payment method change therefore touches the plan subscription plus every add-on subscription, unless the product decides otherwise.
- Payment method shown in the app comes only from webhooks: `subscription.charged` and `order.paid` carry the payment entity, `readPaymentMethod` in `razorpay-webhook.ts` reads `method`, `card.network/last4/type/issuer`, `vpa`, and the handler stores it in the `payments` row (`payment_method_details` columns). `findCurrentPaymentMethod` shows the newest captured plan payment. Consequence: after a method change the screen is stale until the next charge, unless a charge happens at change time.
- Webhook route: `apps/platform/app/api/webhooks/razorpay/route.ts` verifies the signature, then `handleRazorpayWebhookEvent`. Handled: `subscription.charged`, `order.paid`, `payment.failed`, and the status events `authenticated, activated, pending, halted, cancelled, completed, paused, resumed` (status is re-fetched from Razorpay, not trusted from the event). Not handled (returns `unhandled`): `subscription.updated`, `payment.authorized`, `payment.captured`, `token.*`.
- The request flow in the customer app: `apps/customer/src/features/billing/components/payment-method-request.tsx` sends a billing request ("Please send me a link to change the card or UPI my plan renews from."); the team then sends a Razorpay link by hand.
- A successor mechanism already exists: `startKeepPlanFor` (`apps/platform/lib/server/keep-plan.ts`) opens a new subscription on the same plan with `start_at` at the end of the paid period, with `continuesId` pointing at the old one; on the new one's `active` status `restoreKeptPlan` runs, and its first charge is recorded as a renewal of the old plan (webhook handler lines around 217 to 365).
- Side finding: `changeSubscriptionPlanAtPeriodEnd` calls `subscriptions.update`. Razorpay says UPI and Emandate subscriptions cannot be updated (section 3). If a UPI customer gets a discount through that path it may be refused. Check how callers handle the error.

## 3. What Razorpay documents

All pages are razorpay.com/docs, India versions unless noted.

| Fact | Source |
|---|---|
| Update Subscription (`PATCH /v1/subscriptions/{id}`) takes only `plan_id`, `offer_id`, `quantity`, `remaining_count`, `start_at`, `schedule_change_at` (`now` or `cycle_end`), `customer_notify`. No payment method, token or card field. | https://razorpay.com/docs/api/payments/subscriptions/update-subscription.md and https://razorpay.com/docs/payments/subscriptions/update.md |
| Only `authenticated` and `active` subscriptions can be updated. "There is no state change when a Subscription is updated." Fires `subscription.updated`. | https://razorpay.com/docs/payments/subscriptions/update.md and https://razorpay.com/docs/payments/subscriptions/subscribe-to-webhooks.md |
| UPI and Emandate subscriptions cannot be updated at all. | https://razorpay.com/docs/payments/subscriptions/faqs.md and the update API page |
| "You cannot modify or edit a mandate that has already been created." If anything changes, create a new mandate. | https://razorpay.com/docs/payments/subscriptions/faqs.md |
| UPI mandate cannot be modified by merchant or customer; customer can pause or cancel it in their UPI app; merchant can cancel from the Dashboard. | https://razorpay.com/docs/payments/recurring-payments/upi/faqs.md |
| Card change on a failed subscription: if the customer changes the card while `pending`, Razorpay charges the last invoice automatically and a success moves it to `active`. In `halted`, a card change makes it `active` but invoices created during the halt are not auto-charged and must be charged manually (domestic cards cannot be charged manually). | https://razorpay.com/docs/payments/subscriptions/payment-retries.md |
| Checkout option `subscription_card_change` (1 or true) lets the customer change card details from your checkout; result arrives through `handler` or `callback_url`. | https://razorpay.com/docs/payments/subscriptions/payment-retries.md |
| Hosted page "Update Payment Method", linked from Razorpay's failed-charge email: Card to Card, UPI or Emandate; UPI to Card only; Emandate to Card only. Merchants can filter `halted` and `pending` in the Dashboard and send those customers the subscription link. | same page |
| Razorpay's "Charged Failed" and "Halted" notifications carry an "Update Card" option; a "Card Updated" notification exists. | https://razorpay.com/docs/payments/subscriptions/notifications.md |
| `customer_notify`: `true` means Razorpay sends customer communication, `false` means you do. Our code sends `false`, so Razorpay's failure emails and their update link are probably not sent. Not stated outright for every email. | https://razorpay.com/docs/api/payments/subscriptions/create-subscription.md |
| `short_url` in the subscription response is "the URL to make the authorisation payment". It is not described as a card-change link and nothing says what it does once the subscription is authorised. | same page |
| Subscription states: `pending` customer can authenticate a different card; `halted` returns to `active` when a new card is charged or an older invoice is paid. Nothing is said about changing the method while `active`. | https://razorpay.com/docs/payments/subscriptions/states.md |
| A future `start_at` subscription takes a card authentication of ₹5, auto-refunded; the first recurring charge happens when the billing cycle starts. Cards need 2FA on the first transaction only. | https://razorpay.com/docs/payments/subscriptions/workflow.md and the FAQ |
| Cancel API: `cancel_at_cycle_end` true keeps the subscription running to the end of the cycle then cancels. Fails if the subscription is in its last cycle or has no current cycle (`created`, `authenticated`). Concurrent update, cancel or pause fails with a retry hint. | https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription.md |
| UPI Autopay interoperability: when a customer ports to another UPI app Razorpay updates the stored VPA and UMN itself, keeping `token_id` and `subscription_id`. Eligible mandates only, rolling out in stages from July 2026, no integration change needed. | https://razorpay.com/docs/payments/recurring-payments/autopay-interoperability.md |
| UPI Collect (typing a UPI ID) stopped for new Autopay registrations after 28 February 2026; customers scan a QR or use Intent. Page covers Custom Checkout; its effect on Standard Checkout is not stated. | https://razorpay.com/docs/announcements/upi-collect-migration/recurring-payments/custom-checkout |
| UPI Autopay limits: mandate up to ₹1,00,000, frictionless debits ₹15,000 (all merchants). The Subscriptions setting says UPI is for recurring charges under ₹15,000. | https://razorpay.com/docs/payments/subscriptions/supported-payment-methods.md and the FAQ |
| Test mode: "Charge this now", charge as success or failure, four failures to `halted`, card tokens valid 3 days, cannot test Update Subscription after test charges beyond the first authentication. Test UPI IDs are `success@razorpay` and `failure@razorpay`, but there are no Autopay test instructions. | https://razorpay.com/docs/payments/subscriptions/test.md and https://razorpay.com/docs/payments/payments/test-upi-details/ |

Not found in the docs: any statement that a healthy `active` subscription can change its card; any customer-facing portal for managing subscriptions; any subscription-level token replacement API. The Recurring Payments token APIs belong to the Orders and Payments recurring product, not Subscriptions.

Two things limit confidence: the docs are partly written as a per-country set (the Singapore and US pages describe the same hosted page with different method lists), and the fetch tool summarised the pages, so exact wording should be re-read on razorpay.com before building. Anything plan or account dependent (UPI Autopay enabled, Intent enabled, interoperability migration, card limits above ₹15,000 per debit) must be confirmed on our account.

## 4. Options

### Option A: Razorpay card change on the same subscription

How it works. Our server fetches the subscription (`GET /v1/subscriptions/{id}`), checks status. Our page opens Razorpay Checkout with:

```
{ key, subscription_id, subscription_card_change: true, callback_url or handler, prefill }
```

No new Razorpay API call is needed. The same subscription id keeps its plan, cycle and `charge_at`. Razorpay authenticates the new card (or, for a card subscription, per the hosted-page table, UPI or Emandate) and links it.

What the customer sees. Razorpay's Checkout asking for new card details and 2FA. For a pending or halted subscription they also see the last unpaid amount charged to the new card.

Billing dates and invoices. Cycle unchanged ("failures don't change later billing cycles"). Pending: the last invoice is charged at once to the new method, so `subscription.charged` arrives with the new `method` and `card.last4`, and the existing handler records it and the screen updates. Halted: subscription returns to `active`, but invoices created during the halt are not charged and domestic cards cannot be charged manually. Our site-lapse logic would see an active subscription with unpaid months; we would need a policy (waive, or ask for a new order payment through the existing `startChargePayment` path).

Risks. (1) Unproven on `active`; if Razorpay refuses, nothing is lost but the feature is unavailable for healthy subscriptions. (2) UPI customers can only go to Card by the hosted-page table; a UPI to a different UPI is not offered, and a mandate cannot be edited. (3) No gap in the mandate is possible in the documented states because the old token stays until the new one is authenticated; this needs confirming. (4) No double charge risk, one subscription. (5) With `customer_notify: false` Razorpay's own failure email and "Update Card" link are probably not sent; we must send our own email with a link to our pay page (the dunning email in `packages/email`). (6) The stale payment method label on an `active` subscription, since no charge may follow.

Work in `packages/billing`. Almost none for the Checkout option. Add a `fetchSubscription` read that returns `status`, `current_end`, `charge_at`, `short_url`, `has_scheduled_changes` (extend `RazorpaySdkClient.subscriptions.fetch` and the adapter). Add a typed `ProviderCardChangeOffer` guard (status in `active`, `pending`, `halted` only). In apps: a pay page variant that passes `subscription_card_change`, an email for failed charges, and an action in the customer app replacing "Ask for a link".

Webhook events. `subscription.charged` (already stores the new method), `subscription.activated` and `subscription.pending/halted` (already status-mirrored). Add handling for `subscription.updated` is not needed. For `active` without a charge, decide the source of the new label: the callback's `razorpay_payment_id` fetched with `payments.fetch` (extend it to return `method`, `card`, `vpa`), or a webhook such as `payment.authorized` or `payment.captured` (not handled today). Which of these fire for the card-change authentication is part of the test.

### Option B: Razorpay hosted page through `short_url`

How it works. `GET /v1/subscriptions/{id}` returns `short_url`; we link the customer to it (or the team sends it from the Dashboard, which is today's manual flow). Razorpay's hosted page shows "Update Payment Method" with the table in section 3.

What the customer sees. A Razorpay page, outside our app and our styling.

Billing, invoices, webhooks. As Option A.

Risks. The docs tie this page to failed charges. What `short_url` shows for an `active` subscription is not documented; for an `authenticated` or `active` one it may say the authorisation is complete. We would hand customers a link we cannot predict. Also the link is reusable by anyone who has it, which is a mild exposure.

Work. Same fetch extension. Trivial otherwise. Treat it as a fallback that the team already has, not the self-serve answer.

### Option C: successor subscription starting at the old cycle end, then cancel the old one

How it works, exact calls.

1. Our server locks the business for billing, fetches the old subscription: require `status = active`, `has_scheduled_changes = false`, and `current_end` more than a safe margin away (proposal: at least 48 hours; the margin is the double-charge guard).
2. `POST /v1/subscriptions`:
   ```
   { plan_id: <same plan or the discount plan in use>, total_count: 120, quantity: 1,
     customer_notify: false, notes: { businessId, replacesSubscriptionId },
     start_at: <old current_end, whole seconds> }
   ```
   This is exactly `startCheckout({ startAt })` today, and it returns `RAZORPAY_KEEP_PAY_PATH`-style checkout, so a new pay path is the only addition.
3. The customer authorises in Checkout, free to choose card or UPI. ₹5 is authorised and auto-refunded (workflow doc); nothing is taken now.
4. On the new subscription's `subscription.authenticated` webhook (status re-fetched), the server calls `POST /v1/subscriptions/{old}/cancel` with `{ cancel_at_cycle_end: true }`, after the database commit, using the same pattern as `cancelAtProvider` (log a failure, never undo). Only after the new mandate exists is the old one scheduled to end, so there is never a gap.
5. At the old `current_end`, the old subscription cancels without charging and the new one takes its first charge on the same date.

What the customer sees. Our change dialog, Razorpay Checkout with any method, a confirmation line such as "your new card is used from your next payment on 12 December." Nothing charged now.

Billing dates and invoices. Dates unchanged. The old subscription's last payment is the current month; the new subscription's first charge is recorded as the renewal of the old plan, reusing the Keep my plan accounting (`continuesId`, `restoreKeptPlan` logic, no new ad credit, discount months and bundled add-ons carried). Invoice numbering and tax invoice period come from `subscription.charged` `current_start` and `current_end`, which the new subscription supplies.

Risks.
- Double charge, if the old subscription is not cancelled in time. Mitigations: margin in step 1; cancel retried on a timer until the old one reads `cancelled` or has `has_scheduled_changes`; an alarm to staff if the old `charge_at` is under 24 hours away and the new one is authenticated but the old is not scheduled to cancel. Charges that land on a cancelled subscription are already kept as unapplied for refund (`checkout_replaced` path), which limits the harm.
- Gap, if the customer pays on the old and never authorises the new: no gap, the old keeps running until step 4 succeeds, so abandoning Checkout changes nothing. The new `created` subscription expires on its own at `start_at` (documented `expired` state); cancel it immediately if abandoned, as the existing replaced-checkout code does.
- Cancel at cycle end may be refused in odd states (last cycle, pending plan change, concurrent update). Block the change when `has_scheduled_changes` is true or `pendingPlanId` is set on our row.
- Concurrency with a pending discount change on the old subscription (`subscriptions.update` with `cycle_end`): carry or block.
- Our access rule reads the business's latest subscription; two live rows for one business can collide (a comment in the webhook handler already warns). The successor must stay in a waiting state until the old one ends, as `findWaitingSuccessor` models it.
- The `subscription.cancelled` event for the old one at cycle end must not trigger the "plan ended" team announcement or lapse logic.
- UPI above ₹15,000 per debit is probably refused at the new authorisation. Totals above that need card or Emandate; the dialog should say so before Checkout.
- Add-on subscriptions each need their own successor. Without extra work, a method change moves the plan only and add-ons stay on the old method, which the customer must be told. Recommended v1: move the plan subscription and let add-ons move one by one with the same flow, or block the change until the product decides.

Work in `packages/billing`. `fetchSubscription` read (as above), `startPaymentMethodChange(old, startAt)` as a thin wrapper over the same `subscriptions.create` call, a constant for the margin, and tests next to `razorpay-provider.test.ts`. In `packages/db`: a "replaces" link on subscriptions (can reuse `continuesId` if the keep-plan checks are generalised). In apps/platform: a server action next to `keep-plan.ts` (rate limit, billing lock, provider call outside the transaction) and webhook branches for `authenticated` on a successor and for the first `charged`.

Webhook events. `subscription.authenticated` (new branch: schedule the old cancel), `subscription.activated`, `subscription.charged` (existing renewal-of-predecessor path, method recorded, label updates), `subscription.cancelled` (old, suppress announcement), `subscription.expired` is not in the handled list and the status mapper falls to `incomplete` for unknown names; check `RAZORPAY_STATUS` in `packages/billing/src/status.ts`.

### Option D: cancel now and create a new subscription starting now

Rejected. A new subscription with no `start_at` charges the plan amount at authorisation, so the customer pays twice for the month or we must refund and re-bill. Proration is not supported on a new subscription. Listed only so nobody picks it for being simple.

### Option E: keep the manual request

Today's flow. It has no engineering risk and the team can use Option B per request, but it is slow, and Razorpay's own failed-charge email may not reach customers because of `customer_notify: false`. Keep it as the fallback when a self-serve attempt is refused.

## 5. Recommendation

Decide by test result rather than by guessing, and build in this order.

1. Run the test-mode checks T1 to T4 below (half a day). They decide whether Option A works for `active`.
2. If A works on `active`: ship A for every state (pending, halted, active) as the single self-serve flow. It is the least code, keeps one subscription, dates and invoices untouched. Keep C only for UPI customers who want another UPI or an Emandate, where the table says A cannot do it.
3. If A works only on `pending` and `halted`: ship A as the "your payment failed, fix it" flow (this is the case customers most need and the one Razorpay documents), and ship C for the healthy `active` case. Plan the dialog for the two as one screen: "Change payment method" decides the path server-side from the subscription status.
4. Either way, send our own failed-charge email with the link to the pay page, since `customer_notify: false` likely suppresses Razorpay's.
5. Do not build Option B as the product. Keep it for the team.
6. Add-ons: decide before building C. The simplest honest v1 is that the change covers the plan subscription and each add-on subscription shows its own "change" row, or the dialog moves them together in one Checkout sequence.
7. Keep "Ask for a link" behind the self-serve button as the fallback for refusals, until the feature has run clean for a month.

If the product wants one flow only, Option C is the safe single flow, because every primitive it needs (future `start_at`, cycle-end cancel, successor accounting) already exists and is in production use through Keep my plan. Its cost is the double-charge guard and the add-on count.

## 6. Check in Razorpay test mode before building

Test mode caveats from Razorpay: card tokens last 3 days, and Update Subscription cannot be tested after test charges beyond the first authentication. Use a fresh plan and subscription per check. Record exact responses and the webhook list for each.

T1. Option A on `active`. Create a test subscription, authenticate with a test card (4718 6091 0820 4366), do one "Charge as success". Open Checkout with the `subscription_id` and `subscription_card_change: true` while status is `active`. Does the card-change UI appear, or does Checkout say the subscription is already authorised? If it appears, change the card to a second test card. Then read `charge_at`, `current_end`, `status`, `paid_count` before and after. Then "Charge as success" and read `payments.fetch` for the card last4 to prove the token changed.

T2. Option A on `pending` and `halted`. Fail one charge, change the card, confirm the immediate charge and `subscription.charged` and `subscription.activated`. Repeat with four failures (halted) and look at what happens to the invoices created during the halt and whether "Attempt Charge" is needed. Confirm what the customer sees.

T3. Which webhooks fire for a card change on `active`: `subscription.authenticated`, `subscription.updated`, `payment.authorized`, `payment.captured`, any `token.*`. Then work out the one that carries the new method so the label updates without a charge. Confirm whether `razorpay_payment_id` returns in the handler or `callback_url` and what `payments.fetch` gives for `method`, `card`, `vpa`.

T4. UPI. Authorise with `success@razorpay` (confirm Autopay is enabled on our test account; the docs give no Autopay test steps, and UPI Collect may not be offered, so Intent or QR may be the only path). Try UPI to card and UPI to UPI through `subscription_card_change` and through the `short_url` page; the table says only UPI to card. Note any error text.

T5. `short_url` on `active`: open it (Option B) and record what it shows; also with `customer_notify: false` versus `true`, and whether Razorpay then sends the failed-charge email with "Update Card".

T6. Option C end to end. On a test subscription with a charge due: fetch `current_end` and `charge_at`; create the successor with `start_at = current_end`; authenticate it; confirm it reaches `authenticated` and which webhook says so; call cancel with `cancel_at_cycle_end: true` on the old; confirm old status stays `active` with the right `ended_at` or equivalent, and that "Charge this now" on the old one behaves as expected. A call repeated on a subscription already scheduled to cancel: record the response (the repo notes this is still unconfirmed).

T7. Margins for C: what is the smallest allowed `start_at` lead, and what happens when `start_at` equals the old `current_end` exactly (same-second double charge). Test by a live canary on a weekly ₹1 plan on staff cards, because test mode cannot move the clock; confirm the old subscription does not charge at the cycle end after a cycle-end cancel, and the new one charges once.

T8. `has_scheduled_changes` true: set a `cycle_end` plan update on the old subscription, then cancel at cycle end. Does the cancel succeed, and does the scheduled update still apply?

T9. UPI Autopay limits: does Checkout offer UPI for a plan above ₹15,000 (the Local SEO plan, ₹24,999), and for the bundles? What does the customer see? Also confirm card limits for recurring debits above ₹15,000 on our account.

T10. Existing code: call `subscriptions.update` with `plan_id` and `cycle_end` on a UPI-authorised subscription; the docs say it is refused. Decide what the discount path does then.

Decision rule after T1 to T4: A-on-`active` works and keeps cycle dates, then recommendation 2; otherwise recommendation 3.

## 7. Sources

- https://razorpay.com/docs/payments/subscriptions/payment-retries.md
- https://razorpay.com/docs/sg/payments/subscriptions/payment-retries.md
- https://razorpay.com/docs/payments/subscriptions/update.md
- https://razorpay.com/docs/api/payments/subscriptions/update-subscription.md
- https://razorpay.com/docs/api/payments/subscriptions/create-subscription.md
- https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription.md
- https://razorpay.com/docs/payments/subscriptions/states.md
- https://razorpay.com/docs/payments/subscriptions/faqs.md
- https://razorpay.com/docs/payments/subscriptions/notifications.md
- https://razorpay.com/docs/payments/subscriptions/subscribe-to-webhooks.md
- https://razorpay.com/docs/payments/subscriptions/supported-payment-methods.md
- https://razorpay.com/docs/payments/subscriptions/workflow.md
- https://razorpay.com/docs/payments/subscriptions/test.md
- https://razorpay.com/docs/payments/subscriptions/integration-guide.md
- https://razorpay.com/docs/payments/recurring-payments/upi/faqs.md
- https://razorpay.com/docs/payments/recurring-payments/autopay-interoperability.md
- https://razorpay.com/docs/announcements/upi-collect-migration/recurring-payments/custom-checkout
- https://razorpay.com/docs/payments/payments/test-upi-details/

Repo files read: `packages/billing/src/{provider,razorpay-provider,razorpay-sdk-adapter,razorpay-webhook,status}.ts`, `packages/db/src/queries/billing.ts` (`PaymentMethodDetails`, `findCurrentPaymentMethod`), `apps/platform/app/api/webhooks/razorpay/route.ts`, `apps/platform/lib/server/{razorpay-webhook-handler,keep-plan}.ts`, `apps/customer/src/features/billing/components/payment-method-request.tsx`.
