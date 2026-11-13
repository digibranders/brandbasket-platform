# Annual billing

Owner request, 2026-11-11: every service (Website Management, Social Media Management, Paid Ads Management, Dedicated
Expert Monitoring) can be paid yearly at 10% off its monthly price times 12. Decisions settled with the owner's team the
same day; the checkout mock is `docs/design/annual-billing-options.html` in the BrandBasket workspace (option A chosen).

## Decisions

| Question | Answer |
|---|---|
| How is a year paid | One payment up front on a Razorpay subscription whose plan has `period: "yearly"`; Razorpay renews it every year |
| Yearly price | Monthly price x 12, less 10%, rounded down to a whole rupee or dollar: plans ₹32,389 / $637 (usually ₹35,988 / $708), monitoring ₹64,800 / $1,069 (usually ₹72,000 / $1,188) |
| Who can choose | A new subscription only, at the checkout. Live subscriptions are never moved. A lapse reopens on the interval it had; a customer who cancelled comes back monthly (the reactivation card offers monthly). Keep my plan keeps the interval. Staff-recorded bank transfers stay monthly. apps/platform's old /plan page stays monthly |
| Adding a service mid-year | A charge now for the days left in the paid year, at the service's yearly price; the next renewal takes the new yearly total |
| Dropping a service mid-year | Kept until the year ends, then gone from the renewal. No refunds |
| Referral codes | Allowed. A percentage comes off the first yearly payment; an amount code takes its amount times its months (at most 12, all 12 for a code with no limit). It covers that one payment; renewals are at the yearly price |
| Monitoring free with all three plans | Unchanged on either interval |

## Model

- `subscriptions.billing_interval` (`month` | `year`, default `month`). Every existing row stays `month`.
- On a yearly subscription every amount stored on its lines (`bundled_add_ons`) and on the subscription
  (`bundled_add_on_net_cents`, `discount_amount_cents`) is per year. The renewal amount check, invoices from stored
  lines, the failed-payment grace and Pay now already work per cycle, so they need nothing new.
- A yearly line stores the yearly price as its list price and net, with no offer: the code that reprices a basket on
  an add or a drop resets offers to the package rule, so the 10% must not live there. The checkout works the "12
  months" figure and the saving out from the catalogue (annualListCents) for display only.
- A code on a yearly checkout freezes the first-year discount with `discount_months_left = 1`: one payment, then
  `settleDiscountAfterPayment` ends it and the provider moves to the plan without it, as for a monthly code's last month.
- `provider_bundle_plans` gets `billing_interval` in its unique key, so a yearly provider plan is never reused for a
  monthly amount. Yearly subscriptions always have lines, so they never use `provider_discount_plans`.
- Razorpay: `createPlan` takes the period; a yearly subscription asks for 10 cycles (Razorpay caps a yearly
  subscription at 100; probed in test mode 2026-11-11, where 120 was refused and 10 and 30 were accepted).
- The first payment and a reactivation pay through 12 months on a yearly subscription (`addMonthsUtc(paidAt, 12)`);
  renewals already take Razorpay's `current_end`.
- `billingPeriodProgress` steps back a year, not a month, on a yearly subscription, so the add-on quote prorates over
  the year.

## Surfaces

- Checkout (apps/platform's /plan): a Monthly | Yearly switch with
  "Save 10%" above the lines; yearly lines read "Maintenance, 12 months", then "Paid yearly, 10% off" and, with a code,
  "Code X, first year". The line under Pay: "Your payment covers 12 months, to <date>. Then <amount> (GST included) is
  taken each year for your service."
- Billing and services pages: "Paid yearly", next payment and add or drop sentences say "a year" and "the days left in
  your year".
- Tax invoice: each service line at its yearly price, detailed "Yearly subscription, 11 Nov 2026 to 10 Nov 2027"
  (read from the payment's subscription when the invoice is built, so every payment path gets it).
- Console: the client's billing facts gain "Billed: Yearly" (or Monthly); the clients list marks a yearly amount "a year".
- `GET /api/pricing`: each service gains `annualPrices` (minor units per currency, GST included in rupees) and
  `annualListPrices`; the response gains `annualDiscountBasisPoints: 1000`. Existing fields are unchanged.

All new copy goes to the owner before release.

Not changed, for the owner to decide: a flat affiliate reward is paid per paid month, so a yearly payment earns one
month's flat reward (a percentage reward is a share of the yearly payment, as for any payment).

## Testing

Unit: yearly prices and rounding, yearly lines, the code's first-year amount, period progress over a year, the add-on
quote over a year, invoice wording, the pricing API shape, the checkout ledger and renewal line. Integration: a yearly
checkout records a yearly subscription and lines, its first payment pays through 12 months and issues the yearly
invoice, a renewal at the yearly amount is accepted, an add mid-year charges the share of the year, and a monthly
subscription is unchanged.
