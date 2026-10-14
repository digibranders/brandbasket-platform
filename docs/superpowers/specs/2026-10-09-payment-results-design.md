# Payment result screens: what the customer sees after paying, and when a payment bounces

Date: 2026-10-09. Status: approved 2026-10-09 (scope: confirming state and real success states, closing Checkout, payment-bounced notice).

No email and no SMS: customers are not asked for an email at sign-up, and there is no email or SMS provider. Everything
here is in the dashboard.

## What is wrong today

Razorpay's webhook, not the browser, is what activates a plan, so the page the customer returns to is drawn before the
payment is recorded. Each journey handles that differently:

| Journey | Today | Problem |
| --- | --- | --- |
| Premium or Care sign-up | Auto-refreshing "Opening your membership…", then the dashboard | None. This is the pattern to reuse |
| Website client's first payment (Check and send) | `?payment=received` shows "Our team will be in touch shortly to sort out your account" | That is the staff-review message, shown for a normal success. No waiting, no update |
| Reactivation (Billing) | "Payment received" while the lapsed card and its Reactivate button stay on screen | Never updates by itself; invites a second payment |
| One-off charge, paid from Billing | "Confirming with the bank… a minute or two" | Static; never updates by itself |
| Customer closes the Razorpay window | Stuck on "Opening payment…" | No way back |
| Renewal fails and Razorpay retries (`past_due`) | Nothing | No part of the UI reads `past_due`, so a paying customer is not told |

## Design

### 1. One "Confirming your payment" state
`MembershipWaiting` becomes the shared `PaymentWaiting`: the same behaviour (load the page again every 3 seconds, stop
after a minute and say who to write to, with a "Check again" button, the wait remembered per tab in session storage), with
the wording passed in. The sign-up page uses it with its present wording.

What a returned payment shows is decided by one pure function, `paymentReturnView(returned, hasAccess,
paymentUnderReview)`, so every page agrees:

| `?payment=` | Customer state | View |
| --- | --- | --- |
| `received` | payment under review (staff) | `none` (the page's own under-review panel speaks) |
| `received` | has access | `confirmed` |
| `received` | no access yet | `confirming` |
| `failed` | no access | `failed` |
| `failed`, anything else | has access, or no param | `none` |

- **Check and send:** `confirming` replaces the staff-review message and the pay button; `confirmed` says "Payment
  confirmed. Thank you."; the staff-review message shows only when a payment really is under review.
- **Billing, reactivation:** `confirming` replaces the Reactivate card (so there is no second button to press);
  `confirmed` is the plan card with "Payment confirmed. Your website is back online."; `failed` keeps the Reactivate card.
- **Billing, one-off charge:** `?charge=processing` shows `PaymentWaiting` while the business still has an open charge,
  and the "paid" notice once none is open. Advertise and Upgrade keep their own notices.

### 2. Closing the Razorpay window brings the customer back
The launcher gives Checkout an `ondismiss` that sends the browser to the same address a failed payment returns to, so
the customer lands where they started with the existing "couldn't confirm that payment, nothing recorded" notice and the
pay button still there. No new notice and no new return code. A payment that completes after the window was closed is
still recorded by the webhook and shows on the next load.

### 3. "Your last payment didn't go through"
`CustomerBilling` gains `renewalFailing`: the subscription is `past_due` and still inside its paid period (Razorpay is
retrying). Then:
- the dashboard banner (a new kind, `retrying`) says "We couldn't take your last payment. We'll try again. Your website
  stays online until {date}; if it keeps failing it goes offline then." with a button to Billing;
- Billing shows the same words in a card above the plan, plus what to do: keep money in the account, card or UPI the plan
  was bought with, and email support to change it, since there is no in-app card change yet;
- the account bell lists it as an actionable notice.

It disappears the moment a retry succeeds and the status returns to `active`.

## Out of scope
Email, SMS, a card or mandate change screen, staff alerts, and changes to Advertise or Upgrade's own result notices.

## Testing
Pure functions are unit tested (`paymentReturnView`, the banner and notice for `retrying`, the Checkout options' dismiss
hook). The pages are checked on a local production build with the real Razorpay test checkout through the tunnel:
success, failure, closing the window, and a renewal marked `past_due`.
