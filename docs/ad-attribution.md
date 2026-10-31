# Ad attribution and paid-conversion tracking

How Brandbasket knows which ad a paying customer came from, and tells GA4 and Meta about the sale. Plan: `docs/plans/59-ad-attribution-and-paid-conversions.md` in the workspace folder.

## What happens, in order

1. A visitor lands on `/start` from an ad. The page reads `utm_*`, `gclid` and `fbclid` from the address. With the visitor's consent it also reads the Meta cookies (`_fbp`, `_fbc`) and the GA4 client and session ids.
2. The form posts to the website's `/api/start`. The route seals all of that, with the visitor's name, email and mobile, into the `start` token in the sign-up address (good for one hour).
3. The sign-up form (`/login`) carries the token through both steps. When the account is created, `signup_attribution` keeps the ad against the new business (first ad wins). If the visitor allowed measurement, GA4 is sent a `sign_up` event on their own client and session.
4. On the customer's first payment, once the payment has committed, `reportFirstPaymentToAds` sends:
   - GA4 Measurement Protocol `purchase`, if the visitor allowed measurement and a GA client id was read.
   - Meta Conversions API `Purchase`, if the visitor allowed advertising. Email and phone are SHA-256 hashed.
   Both use the provider's payment id as the transaction id (GA4) and event id (Meta). Each send is recorded in `conversion_events`, one row per payment and destination, so the browser confirmation and the Razorpay webhook reporting the same payment send once.
5. The welcome popup also pushes a `purchase` event to the dataLayer, once per payment per browser, for Tag Manager triggers. GA4 counts one purchase per transaction id, so it and the server event are one sale.
6. Staff see the result at console `Money` > `Ad results`: per source, medium, campaign and ad, the leads, accounts, paid customers and the first payments' money without GST.

Only a customer's first applied plan payment is reported. Renewals, reactivations, extras and payments that bought nothing are not.

## Settings

Server environment variables (`apps/platform/.env.example`). A destination is on only when both of its values are set; with none set, nothing is sent.

| Variable | Where it comes from |
|---|---|
| `GA4_MEASUREMENT_ID` | GA4 > Admin > Data streams > the web stream (`G-XXXXXXXX`) |
| `GA4_API_SECRET` | The same stream > Measurement Protocol API secrets > Create |
| `META_PIXEL_ID` | Events Manager > the dataset (pixel) id |
| `META_CAPI_TOKEN` | Events Manager > Settings > Conversions API > Generate access token |
| `META_TEST_EVENT_CODE` | Optional. Events Manager > Test events. While set, Meta shows the events in the Test events tab and does not count them. Remove it when checking is done. |
| `META_GRAPH_VERSION` | Optional, default `v23.0`. Meta retires each version after about two years; check it once a year. |

The nightly job (`scripts/server/run-site-rollup-job.sh`) runs the roll-up and then asks `/api/internal/retry-conversions` to send again any first payment whose send failed, for up to a week and five tries. It uses the same `SITE_ANALYTICS_TOKEN`.

## Checking it works

1. Set the four required variables and `META_TEST_EVENT_CODE` on a test deployment.
2. Open `/start?utm_source=meta&utm_medium=paid_social&utm_campaign=test&utm_content=ad1&fbclid=test123`, allow measurement and advertising in the cookie banner, submit the form, finish sign-up and pay with a Razorpay test card.
3. In the console, `Ad results` shows one lead, one account and one paid row for `meta / paid_social / test / ad1`.
4. In GA4 > Admin > DebugView (or Reports > Realtime) the `sign_up` and `purchase` events appear on the same session. To check the payload without waiting, post it to `https://www.google-analytics.com/debug/mp/collect?...` (the validation endpoint); an empty `validationMessages` list means it is accepted.
5. In Events Manager > Test events the `Purchase` appears with the test code, matched on email and `fbp`/`fbc`.
6. In the database, `select * from conversion_events` has one `sent` row per destination. A `skipped` row says why: `no_attribution`, `no_consent` or `no_ids`. A `failed` row holds the status, never a secret.

## For the SEO and marketing team (Phase 0)

- **One GA4 property.** The website and the dashboard each load their own Tag Manager container (`NEXT_PUBLIC_GTM_ID`). Both must send to the same GA4 property and stream, with cookie domain `auto`, so a session carries from `www.brandbasket.in` to `app.brandbasket.in`.
- **Key events** in GA4: `generate_lead` (map the website's `start_submit` dataLayer event to it in GTM), `sign_up`, `purchase`. A funnel exploration: landing on `/start`, `generate_lead`, `sign_up`, `purchase`.
- **Unwanted referrals** in GA4 (Admin > Data streams > Configure tag settings): add `razorpay.com` and the bank and UPI domains, so coming back from the payment page does not start a new "referral" session.
- **Ad URLs**, lower case, one convention:

| Platform | Parameters |
|---|---|
| Meta | `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}` (Meta adds `fbclid` itself) |
| Google Ads | Auto-tagging on (adds `gclid`); tracking template `{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}` |

- **Google Ads conversions:** link GA4 to Google Ads and import `purchase`. No code is involved.
- **The browser `purchase` event** is `{ event: "purchase", ecommerce: { transaction_id, value, currency, items } }` in the dataLayer, with `{ ecommerce: null }` pushed before it. Use it for GTM triggers; if a GA4 tag on it ever shows two purchases for one sale in DebugView, drop the GA4 tag and keep only the trigger.
- **The cookie banner** offers only the measurement purpose until an advertising tool (Meta pixel, Google Ads tag) is added to the website's container list in `lib/consent.ts`. Until then `fbp` and `fbc` stay empty and no Meta event is sent for lack of advertising consent. Adding that tool needs the owner's yes and the privacy policy wording first.

## Limits

- A sign-up more than an hour after `/start` loses its attribution (the token expires). The lead's text line in the console still names the campaign.
- A customer who did not come through `/start` has no attribution and is not reported.
- Ad results match leads to a campaign by the text line the ad page leaves on the enquiry, and accounts and payments by `signup_attribution`. A campaign row follows a group of people to payment; it is not a day's takings.
- The value reported is the money without GST (the tax invoice's figure, or 18/118 of a rupee price that has no invoice). Dollar payments carry no GST.
- Counsel's view on DPDP consent for the server events is still to be had before they are switched on in production.
