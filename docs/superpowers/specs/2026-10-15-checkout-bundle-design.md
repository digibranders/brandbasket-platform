# Add-ons taken at the first checkout are paid with the plan

2026-10-15. Replaces the offer card's separate checkout for each add-on.

## Why

Razorpay needs the customer to approve every subscription on its own, so charging the first month of several subscriptions
together still means one approval window per add-on. One subscription for the plan and the add-ons taken at the first
checkout is the only way to give one payment, one approval and one receipt.

## What it does

- The checkout page ticks add-ons on and off in the address (`?addons=social-media,advertising`). The summary lists each as a
  line of the same payment and the Pay button shows the whole total. Only catalogue ids are read; what each costs is decided on
  the server when the payment opens.
- Each add-on carries the 5% lifetime offer, and only the ones ticked here do. The offer is for the first checkout: a business
  that has paid before takes no add-ons with its plan.
- One Razorpay plan is made for the combined net monthly amount (provider_bundle_plans, once per amount). The subscription
  charges the plan's price plus the add-ons, less any code, with GST on all of it, every month.
- The add-ons are frozen in `bundled_add_ons` (pending, then active when the first payment is recorded) and their sum on
  `subscriptions.bundled_add_on_net_cents`. Every amount check (first payment, renewal, the fake provider, the webhook, the
  billing page's next payment) adds that sum to the plan's price. A code comes off the plan only.
- The payment's tax invoice has a line for the plan and one for each add-on, each add-on with its lifetime offer note. The
  provider's amount is the authority and the invoice may differ from it by a paisa a line (the round-off).
- A checkout opened with a different choice of add-ons is replaced, never reused (`bundleKey`), and the pending add-ons of the
  checkout it replaces are removed.
- The Add-ons page lists a bundled add-on as included in the plan payment, with nothing to buy, pause or cancel, and refuses a
  second subscription for it.

## Taking an add-on out afterwards

- The Add-ons page has Remove on each bundled add-on, with a confirm step in the page. It stops at the next billing date and
  stays paid for until then, the same timing as Cancel on a separate add-on.
- The provider is moved first, to a plan at the lower amount from the cycle end (or the plan's own provider plan when nothing is
  left). Then `bundled_add_ons.end_requested_at` is set and `subscriptions.pending_bundled_add_on_net_cents` carries the
  amount the next renewal must arrive at.
- The webhook accepts the next renewal at either amount. At the pending (lower) one it invoices only the add-ons that stay,
  turns the ones asked about to `removed`, and makes the pending amount the billed one. At the old amount (the provider had not
  moved) it records the payment as usual and logs `bundled-renewal-at-old-amount` for staff to refund.
- The billing page's next payment, the stay offer and every plan change made now use the amount after the removal
  (`nextBundledNetCents`).
- The staff console's client page lists the add-ons taken with the plan, with Active, Ending and Removed states and Mark
  contacted. A bundled purchase also appears on the Journey's list of what to set up, like a separate one.
- A subscription that is ended (a checkout replaced before it was paid, or a lapsed plan a reactivation replaces) removes its
  add-ons with it.

## Not done

- An affiliate earns on the plan's price alone, not on the add-ons.
