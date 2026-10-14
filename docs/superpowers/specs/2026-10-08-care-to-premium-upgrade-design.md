# Moving up from Care to Premium (2026-10-08)

A client on the Care plan can move up to Premium from their dashboard, at any time inside a paid month, on the same
subscription. Premium features open the moment they have paid; Premium's full price starts at the next renewal.

## The money rule

- **Today:** they pay the difference between Premium and Care for the days left in the month they have already paid
  for, with GST on top. `difference = (Premium net − Care net) × daysLeft / daysInPeriod`, each net after the discount
  that plan carries. It is taken as a one-time charge, through the same Razorpay order and test checkout every other
  paid extra uses.
- **From the next renewal:** the subscription is billed at Premium's price. At Razorpay this is the existing
  "change plan at the end of the cycle" call, so the month already paid for is never re-priced.
- **Price protection:** Premium is quoted at the price on sale when they pay, and kept after that, like any plan.
- **Nothing is refunded** if they later leave. The page says what the amount is before they pay.

## What the customer sees

Care dashboard: an **Upgrade** item in the menu, a line on Home, and a button on Billing. `/upgrade` shows what
Premium adds, today's amount and why, and the price from the next renewal. After paying, the dashboard is Premium's
and Billing shows Premium from the renewal date.

## How it is stored

- `plan_upgrades`: one row per upgrade, with the from/to plans, the period it was quoted for, the discount that
  carries over, its charge, and a status: `open` (charge unpaid), `paid` (money taken, entitlement on, provider not yet
  moved), `scheduled` (provider will bill Premium at the renewal), `completed` (the first Premium renewal was
  recorded), `cancelled`.
- `subscriptions.pending_plan_id` and `pending_discount_amount_cents`: the plan the next renewal will bill. While set,
  a business's billing state is read as that plan: its tier is Premium, its price is Premium's. The raw row still
  names the plan Razorpay is billing until the first Premium renewal, which is when `plan_id` is switched.
- `charges.kind = plan_upgrade`, so the Billing page, the receipt and staff's charges list work unchanged.

## Cases

| Case | What happens |
| --- | --- |
| Care, paid, active | Offered. |
| Already Premium | Sent Home. |
| Free listing account | Sent to `/premium`, which sells the plan outright. |
| Paid by bank transfer (manual) | Not offered; staff move them (no recurring billing to change). |
| Leaving (cancel requested / account closing) | Not offered. |
| Payment failing (`past_due`), lapsed, or never paid | Not offered; team handles reactivation. |
| A payment is waiting for staff | Not offered until staff clear it. |
| Premium not on sale, or no Razorpay plan made for it | "Can't take upgrades just yet." |
| Plans have different tax rates | Not offered. |
| Less than an hour left in the period | "Your renewal is due. Try again after it." |
| Difference rounds to under ₹1 | Applied with no payment. |
| A code on the subscription | Carries over to Premium if the code is still active (re-worked against Premium's price), else Premium is full price. Said on the page. |
| A stay offer taken earlier | Ends with the move (it was a discount on Care). Said on the page. |
| Pressing Upgrade twice, or from two tabs | One open upgrade per business; the open one is reused if its quote still stands, else replaced. |
| Charge left unpaid and the month renews | The old quote is stale: the payment is kept on record and flagged for refund, nothing is applied. |
| Same payment delivered twice | Recorded once, applied once. |
| Paid, then Razorpay refuses the plan change | Premium is on, the payment is flagged "finish upgrade", staff retry from the client page. |
| Renewal arrives at Premium's amount | Plan switched, upgrade `completed`. |
| Renewal arrives at Care's amount while upgrade is pending | Accepted as a Care renewal, upgrade stays pending, warned in the log. |
| Staff waive the open upgrade charge | Upgrade `cancelled`. |
| Staff "Move to Premium" | Same routine with no charge, for the cases above that a customer cannot do. |
| Premium → Care | Not built. |

## Not in this change

Downgrades; changing plan on a manual-billing client without staff; USD (Care has no dollar plan).
