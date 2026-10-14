# The Care plan (2026-10-07)

There are now three plans on Fynix: **Free** (the directory listing), **Care** and **Premium**. The comparison table
the website shows (Free / Care / Premium, 16 rows) is the source of truth for what each includes.

**Care** is the website only:

| Included in Care | Not in Care (Premium only) |
| --- | --- |
| Next.js business website | Fynix listing management, images, videos |
| Website management | No competitor ads on the listing |
| OyeChats professional chatbot | Appointment management system |
| Server and hosting | Homepage featured placement, better listing ranking |
| | Google Business Profile, Facebook, Instagram management |
| | 10% off Fynix digital marketing |

Premium is everything in Care, plus everything in the right-hand column.

## What changed

1. **Sign-up.** The "Do you have your own website?" question is gone. Creating an account shows the three plans at
   once: Free listing, Care, Premium, each with its price. Care and Premium **pay first** (the same as Premium did
   in the single-entry design), then the dashboard opens.
2. **Plans have a tier.** `plans.tier` (`care` | `premium`). One active plan per currency **and tier**. Every plan
   that existed before is Premium's. A Care plan is seeded at ₹2,999 + 18% GST (INR only); staff set the real price
   in the console's Pricing page, which also creates the Razorpay plan.
3. **A business's tier** is its subscription's plan's tier. Before it has subscribed, it is what it chose at sign-up
   (`signup_choice = care`), otherwise Premium. `findBillingState` returns it as `tier`.
4. **Held until paid.** An owner who chose Care is held on `/care`, as one who chose Premium is held on `/premium`.
   Paying opens the website project, exactly as Premium's payment does.
5. **Care dashboard.** A Care client sees Home, Set up your website, Your project, Your details, Content, Billing.
   Appointments, Patients, Listing, Leads, Photos, Videos and Advertise are Premium's: their pages send a Care client
   Home, and their menu items are not drawn. Home shows the four things Care includes and one line about Premium.
6. **Staff console.** Pricing sets Care's and Premium's monthly prices separately. Clients show their plan. Premium-only
   switches (Appointments module) are not offered on a Care client.

## Not in this change

- Moving a Care client up to Premium (a plan change on an existing subscription). Staff do it by hand for now.
- Care in USD. Only the rupee plan exists.
- A chatbot or hosting page: there is no data behind them yet, so Home states what is included and the team sets them up.
