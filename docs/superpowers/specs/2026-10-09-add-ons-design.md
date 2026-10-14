# Add-ons: buy, pause and cancel digital marketing from the dashboard

Date: 2026-10-09. Status: decisions confirmed by the owner 2026-10-09; design awaiting review.

## Why

The Add-ons page lists three services (Local SEO, Performance marketing, Press release) and every "Get it" button opens
a WhatsApp chat with a typed message. Nothing is paid in the app, nothing is recorded, and staff learn about a purchase
only if someone reads WhatsApp. A customer who wants to stop a service has to ask. This makes add-ons a real purchase:
paid through Razorpay inside the dashboard, invoiced like every other payment, and managed by the customer (pause,
cancel, resume) and by staff.

Ads bought by bidding, which run on the website, are a separate, larger piece of work and are out of scope here.

## Decisions (confirmed 2026-10-09)

| Question | Decision |
|---|---|
| What is sold | Local SEO and Performance marketing are monthly subscriptions. Press release is a one-time payment per release. |
| Who can buy | Every account: free listing, Care and Premium. |
| Premium discount | 10% off for a Premium member, fixed at purchase. A later change of membership does not change the price. |
| How many | Local SEO and Performance marketing can each be active once per business. Press releases can be bought any number of times. |
| Billing date | Each subscription renews on its own purchase date (bought 12 Oct, renews 12 Nov). Not aligned with the main plan. |
| Ad platform costs | Performance marketing's price is Firstfold's fee only. The customer pays Facebook, Google and the others directly. |
| Before paying | The customer gives no extra information. The popup says the team will contact them after payment; what follows is manual. |
| Cancel | Takes effect at the next billing date. The paid month runs to its end. No refund. |
| Pause | Also takes effect at the next billing date. Nothing is charged while paused. No maximum length. |
| Resume | Any time. The customer pays straight away and a new month starts that day. |
| Undo ("Keep it") | A scheduled cancel or pause can be undone until the billing date, through one quick checkout (see Design). |
| Failed renewal | Razorpay retries 3 times on the next 3 days (fixed by Razorpay). If all fail, the add-on shows "Payment failed" with a Pay now button for 7 more days, then ends. |
| Main plan ends | Add-ons keep running. They are independent of the plan. Closing the whole account ends them at the end of their paid period, as it does the main plan. |
| Refunds | None in the app. A paid press release has no cancel button. Any agreed refund is handled by staff outside the app. |
| Coupons and affiliates | Neither applies to add-ons. |
| Price changes | Existing subscribers keep the price they bought at until they cancel. New buyers pay the new price. |
| Invoices | Every add-on payment gets a GST tax invoice at 18%, SAC 998361, through the GST invoicing system (2026-10-09-gst-tax-invoices-design.md). |
| Where customers manage | On the Add-ons page. Payments and invoices also list on Billing, as every payment does. |
| Staff | See add-ons on the client page; a list of new purchases to contact; set a press release's status, which the customer sees; cancel or pause on a customer's behalf, with the same next-billing-date rule. |
| Website | The website's Press release price says "a month"; it changes to "a release". |

## What the customer sees

### Add-ons page, per add-on

The page keeps today's layout and prices. Each subscription row shows one of these states on the right, under the price:

| State | Shown | Buttons |
|---|---|---|
| Not active | Price (struck-through list price and the Premium price for a member) and "a month" | **Get it** |
| Active | "Active. Renews on 12 Nov 2026 at ₹10,000 + GST." | **Pause**, **Cancel** |
| Ending | "Ends on 12 Nov 2026. You can use it until then." | **Keep it** |
| Pausing | "Pauses on 12 Nov 2026. You can use it until then." | **Keep it** |
| Paused | "Paused since 12 Nov 2026." | **Resume** |
| Payment failing | "Your last payment didn't go through. Razorpay will try again on the next 3 days." | none (Razorpay is retrying) |
| Payment failed | "We couldn't take your payment. Pay by 21 Nov 2026 to keep it running." | **Pay now** |
| Ended | Same as Not active | **Get it** |

The price shown on an active subscription is the price that customer pays, which may differ from today's list price
(price fixed at purchase).

Press release always shows **Get it**. Under it, the customer's own press releases are listed newest first, each with
the date bought and its status: "We'll contact you", "In progress" or "Published". Staff set the status.

Pause and Cancel ask for confirmation in the page itself (the dashboard cannot rely on browser dialogs), saying exactly
what will happen: "Local SEO will stop on 12 Nov 2026. You won't be charged again." with **Cancel Local SEO** and
**Keep it** buttons.

### The popup after "Get it"

A panel (a dialog on desktop, a full-width sheet on a phone) with:

- the add-on's name and one line on what it does;
- the price: list price, the Premium 10% off when it applies, GST at 18%, and the total charged today;
- for a subscription: "Renews every month on the 12th. Pause or cancel any time; it stops at the end of the month you've
  paid for.";
- for Performance marketing: "This is Firstfold's fee. You pay the ad platforms directly.";
- for a press release: "One-time payment.";
- "After you pay, our team will contact you to get started.";
- the billing details the invoice will carry (or the prompt to add them, from the GST work);
- **Checkout**, which opens Razorpay Checkout.

After paying, the customer returns to the Add-ons page with "Payment received. Our team will contact you soon." and the
row shows Active (or the press release appears in the list). Access to nothing changes: add-ons are services staff
deliver, not features the app unlocks.

### Billing page

Add-on payments appear in the monthly billing table with every other payment, each with its tax invoice to download.

## What staff see

- **Client page:** an Add-ons section listing each add-on subscription (state, price paid, next billing date or end
  date, who scheduled a cancel or pause) and each press release with its status. Staff can Pause or Cancel a
  subscription (next billing date, recorded with the staff member) and set a press release's status.
- **New purchases:** a console list of add-on purchases waiting for the team (a new subscription, a resumed one, a press
  release), oldest first, with **Mark contacted**. Marked purchases leave the list.
- **Payments needing attention** and **Missing invoices** (from the GST work) cover add-on payments too.

## Design

### Catalogue and prices

The catalogue stays in code (`apps/platform/lib/add-ons.ts`), as today. The price a business pays is computed at
purchase (list price, less the Premium 10% when the business is a Premium member then) and **stored on the purchase**, so
later price or membership changes never touch an existing subscription. The catalogue moves to `packages/shared` so the
staff console can name add-ons too.

### Subscriptions: one Razorpay subscription per add-on purchase

Each Local SEO or Performance marketing purchase is its own Razorpay subscription on a Razorpay plan for that exact
amount (net price plus 18% GST, from `chargedAmountCents`, as the main plan does). Razorpay plans are created on demand
and remembered per add-on and amount, so a Premium and a non-Premium price are two plans.

The main plan's `subscriptions` table allows one live subscription per business and drives website access, so add-ons
get their own table rather than sharing it. A subscription row records: the business, the add-on, the price paid
(net, list price and Premium discount, tax rate), the Razorpay subscription and plan, the state, the current period,
and any scheduled end (cancel or pause, when, and by whom).

### Cancel and pause: tell Razorpay straight away

Both call Razorpay's cancel at the end of the current cycle the moment the customer (or staff) confirms. Razorpay then
never charges again, so a customer who cancelled can never be charged by mistake, and no scheduled job is needed. Our
row records whether it was a cancel or a pause, and from the billing date shows Ended or Paused.

Razorpay's own pause and resume were considered and not used: Razorpay resumes on the old billing cycle, and the owner
chose a new month from the day of resuming.

### Resume, Keep it and Pay now: a new subscription through checkout

A cancelled Razorpay subscription cannot be revived, so each of these opens Razorpay Checkout for a new subscription on
the same price the customer already pays:

- **Resume** (from Paused): charged now, a new month starts today.
- **Pay now** (Payment failed, within 7 days): charged now, a new month starts today. The halted Razorpay subscription
  is cancelled.
- **Keep it** (Ending or Pausing): a new subscription that starts on the old billing date. The customer authorises it now
  and is first charged on that date, so there is no gap and no double charge. To verify in Razorpay test mode: a
  subscription created with a future start date and its upfront authorisation.

The new row links to the one it continues, so the client page shows one history per add-on.

### Payments, webhooks and invoices

Razorpay events for add-on subscriptions arrive on the existing webhook. The handler looks the subscription id up in the
add-on table before the main plan's, records the payment, and moves the add-on's state (charged, pending, halted,
cancelled, completed). An amount that is not the stored price is kept for staff, as main-plan payments are. Each
recorded add-on payment is invoiced in the same transaction, through the GST invoicing system, with the add-on's name,
"Monthly subscription" and its period, the list price, and the Premium discount as a discount with the note "Premium
member, 10% off". A press release is a one-time Razorpay order, paid and invoiced through the existing charges path
with its own charge kind.

The 7-day grace after Razorpay halts a subscription is worked out from when it halted, whenever the add-on is shown, so
no scheduled job is needed. If the customer instead pays through a Razorpay retry link after the grace, the payment is
accepted and the add-on starts again.

### Account closure and erasure

Closing an account cancels every add-on subscription with Razorpay at the end of its paid period, as it does the main
plan (an add-on still waiting for its first payment is cancelled at once, as an unpaid main-plan checkout is). Nobody is
charged again and no money is refunded. Erasure waits while any add-on subscription is still live, as it waits for the
main plan. Add-on payments and their invoices are financial records and are kept on erasure, like all payments.

## Website

`content/for-business.ts` in the website repo: Press release "a month" becomes "a release", kept in step with
`apps/platform/lib/add-ons.ts`.

## Out of scope

- Ads bought by bidding and shown on the website (separate project).
- Collecting ad spend for the ad platforms.
- Self-serve refunds and credit notes.
- Coupons and affiliate earnings on add-ons.
- Emails to the customer (no email provider yet); the team contacts the customer.
- Any information form before or after payment.

## Testing

- Pure rules (price at purchase, state from Razorpay status plus our schedule plus the grace clock, what each button
  does in each state) as unit tests.
- Database: one live subscription per add-on per business, a scheduled end recorded with who did it, row-level security
  (a customer sees only its own add-ons).
- Webhook: a charge, a retry, a halt, the grace running out, a charge after the grace, a cancel at cycle end, each on
  the fake provider and against the real database.
- Invoices: an add-on payment and a press release each get one invoice with the right line, discount and SAC.
- The Add-ons page in each state, at 375 px and on desktop.
