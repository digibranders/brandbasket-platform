# Services and entitlements (domain-architect audit)

Commit c702f6c7, branch development. Source is truth. Labels: V = Verified in code, H = Reported in historical document (unverified), I = Inferred, U = Unknown. Paths are relative to brandbasket-platform.

## 1. What is actually sold (V)

Catalogue: `packages/shared/src/lib/billing/add-ons.ts`
- 4 ids: `managed-website`, `social-media`, `paid-ads`, `expert-monitoring` (add-ons.ts:22, ADD_ONS at :60-103). All "monthly".
- Prices (GST inside for INR, none for USD): website, social, ads each INR 2,999 (299,900 paise) / USD 59; monitoring INR 6,000 / USD 99 (add-ons.ts:63-98).
- Monitoring is free when all three plans are in the basket: `monitoringIncludedWith` (add-ons.ts:117-119) and `readBundleSelection` drops it (bundle.ts:34-39). It is billable on its own only if a basket has at least one plan and not all three.
- Annual billing exists: 10% off 12 months, rounded down to whole rupee (add-ons.ts:134-158; `billing_interval` enum schema/billing.ts:32). Checkout takes `?billing=yearly` (features/checkout/rules/membership.ts:33).
- Package offers: `PACKAGE_OFFERS = []` (packages.ts:36). No discounts on new baskets. Old rows keep stored discounts. Ad credit (`subscriptions.ad_credit_cents`) survives only on old rows (checkout.ts:112, 341; admin Ad credit page).
- First-month offer (INR 1 / USD 1) on `social-media` and `paid-ads` only, monthly, not bank transfer, once per business per plan (trial.ts:13-47; DB unique index `bundled_add_ons_one_trial_idx` schema/add-ons.ts:155-158; checkout.ts:437-452, `planFirstPayment`). Not a website offer.
- Plan row: one tier `managed`, price 0 (schema/billing.ts:88 `planTier`; comment :94). The money is the sum of `bundled_add_ons` lines (`subscriptions.bundled_add_on_net_cents`).
- Legacy remnants: `plan_upgrades` (Care to Premium, schema/billing.ts:595), `charges.kind` `listing_promotion|directory_ad|plan_upgrade|press_release` (billing.ts:484), `press_releases`, separate `add_on_subscriptions` (add-ons.ts:26). `insertAddOnSubscription` has no non-test caller in apps/ or packages/shared (grep), so separate add-on Razorpay subscriptions are no longer created; webhook still handles old rows (razorpay-webhook-handler.ts:107-108, 191-195). Status: legacy, still read.
- Public price API `/api/pricing` serves the catalogue (app/api/pricing/route.ts:15).

### Conflicts with CLAUDE.md commercial rules (decisions needed)
| # | CLAUDE.md says | Code does | Label |
|---|---|---|---|
| D1 | "billed monthly" | Yearly interval at 10% off is live (add-ons.ts:134, checkout `?billing=yearly`). Not mentioned in CLAUDE.md. | V |
| D2 | "no package discounts ... only offer is monitoring free with all three" | A INR 1 / USD 1 first month on Social and Ads exists (trial.ts; docs/plans/63 cited in code only, not in this repo). Also referral coupons and affiliate codes exist (checkout.ts:361-369, admin coupons/affiliates). | V |
| D3 | "usually INR 4,999" and "usually USD 79" strike-through | Not present in platform catalogue (grep 4_999/4999: no hit). Lives in website repo if anywhere. | V (absent here), U (website) |
| D4 | "no ad money" | `adCreditCents` and "Ad money added by us each month" row still render (social-screens.tsx:117-121, loadAds uses `subscription.adCreditCents`). Old rows only. | V |
| D5 | "Website Management... free website build" | No code charge for a build; plan row is 0 and website line is INR 2,999 monthly, matching copy. | V |
| D6 | Copy "Paid Ads Management ... for up to INR 10,000 a month of your budget" (add-ons.ts:79) | Nothing in code enforces a budget cap. | V (no enforcement) |

## 2. How checkout creates purchases (V)

Caller chain: sign-up -> `/checkout` -> `startPaymentAction` (features/checkout/actions.ts:51) -> `startMembershipCheckoutFor` (checkout.ts:311) -> `openPlanCheckout` (checkout.ts:~430).
1. Owner-only (`requireOwner()` without `write`, actions.ts:52). Billing details required first (checkout.ts:326; INR GST invoice depends on them).
2. Rate limit `checkout:business:<id>` 10 per hour (checkout.ts:53, 321).
3. `entry.kind === "listing"` selects the sign-up path; else `startCheckoutFor` which assumes the website alone (`WEBSITE_ALONE`) (actions.ts:62-66, checkout.ts:293). So a `website`-kind business that is unpaid can only buy the website at this entry; services beyond are added later via Plan & billing.
4. `readBundleSelection` normalises the basket: catalogue ids only, deduped, monitoring dropped for all-three or no-plan baskets (bundle.ts:34). Social-only, Ads-only and Social+Ads baskets are valid: no website required (checkout rules plans.ts:55-60 NO_WEBSITE_STEPS).
5. Under `lockBusinessForBilling` (staff connection) the basket is priced again (`packageLines`), code re-validated, `planFirstPayment` decides trial, `decideCheckout` (packages/billing/src/checkout.ts) returns already-paid / payment-under-review / reuse / create / replace (checkout.ts:~515-556).
6. Provider is called with no transaction open; a second short transaction re-checks the newest subscription and writes `subscriptions` (status `incomplete`) + `bundled_add_ons` (`pending`) via `openCheckoutSubscription` (billing.ts:~660). Failure after provider call cancels the orphan at provider (checkout.ts:241-251).
7. Payment recorded by webhook `subscription.charged` or by the confirm page. `activateFirstPayment` -> `recordPaymentAndActivate` (billing.ts:1042): idempotent insert on (provider, provider_payment_id), subscription becomes `active`, `paid_through_at` set, lead marked paid; `activateBundledAddOns` flips lines `pending` to `active`; `openMembershipForListingBusiness` flips `businesses.kind` listing to website and creates the onboarding project only if a website line is in the basket (billing-activation.ts:132-160, directory-ads.ts:789-802). A tax invoice is issued in the same transaction (billing-activation wrappers, per comment billing.ts:1040).
8. Independent later add: Plan & billing `addServiceAction` -> `addBundledAddOnFor` -> `startCombinedAddOn` (one combined Razorpay subscription, moves the billing date) or older charge path (`startAddOn`, charge kind `add_on`) (features/billing/actions.ts:31; server/add-ons.ts:~213; shared/server/basket-change.ts:466, added-service.ts:318). Needs `requireOwner({write:true})`.
9. Independent cancel: `cancelServiceAction` -> `removeBundledAddOnFor` sets `end_requested_at`; line stays active and billed until next billing date; refused for the only remaining service (that is account closing) (billing/actions.ts:69, comment :64). Completed by renewal webhook (`completeBundledAddOnChanges`, razorpay-webhook-handler.ts imports).
10. Reactivate: `reactivateAction` -> `startReactivationFor`: only when billing status `lapsed`; a lapse reopens the basket it lapsed with; a self-cancel lets the customer re-choose at list, forfeiting the package offer (checkout.ts:~385-400, 222). Trial not offered to reactivations (checkout.ts:437).

## 3. Independence matrix: Website, Social, Ads (V unless stated)

| Capability | Website | Social | Paid Ads | Evidence |
|---|---|---|---|---|
| Buy alone at sign-up | yes | yes | yes | bundle.ts:34, plans.ts:55-60 |
| Add later alone | yes | yes | yes (Plan & billing only; no dashboard pitch, see 4) | server/add-ons.ts:213; shell rules |
| Cancel one, keep others | yes | yes | yes, not the last one | billing/actions.ts:69 |
| Separate renewal date | no, one subscription, one monthly payment | no | no | schema add-ons.ts:117 (lines inside subscription) |
| Separate Razorpay subscription | no (legacy `add_on_subscriptions` rows only) | legacy only | legacy only | add-ons.ts:26; no caller of insert |
| Own entitlement key | `website` (billing line + `hasWebsite`) | `social` | none, shares `social` | guard-rules.ts:11,96-101 |
| First-month INR 1 | no | yes | yes | trial.ts:20 |
| Own status for the work | project status machine | deliverables + external posting service | none; staff-entered figures | see state-machines.md |

Renewal is basket-level: all lines renew in one payment; removal and additions take effect at the renewal webhook (razorpay-webhook-handler.ts imports `completeBundledAddOnChanges`, `setPendingOfferDiscounts`, `renewalBundledLines`). "Renew Social but not Ads" is only expressible as "cancel Ads from next billing date".

## 4. Paid Ads mapped to the social key: exact impact (V)

Definition chain
- `SERVICES = ["website","social","search"]` (guard-rules.ts:11). There is no `ads` key.
- `SERVICE_OF_ADD_ON = { "social-media": "social", "paid-ads": "social" }` (packages/db/src/queries/service-setup.ts:43). `boughtSetupServicesFrom` adds `social` for either add-on in `pending|active` (not ending) bundled lines, or legacy add-on subscription `active|scheduled|past_due` (service-setup.ts:47-56).
- `servicesFrom` combines (guard-rules.ts:96-101). Loaded into `CustomerContext.services` (lib/guards.ts:74-79).
- Same collapse in three more places: `SERVICE_KEY_OF` (features/billing/rules.ts:39-46; features/start/rules.ts:88-93), nav `ADS_LINK` (shell/rules.ts:89, 118).

Callers
- Nav: Paid Ads link is `service:"social"`, marked `bought: link.bought` of Social (shell/rules.ts:118).
- `/ads` page: `requirePaid()` then `services.includes("social")` else `NotBought service="social"` (app/(app)/ads/page.tsx:9-10).
- `/social`, `/social/review`, `/social/analytics`: same check (social/page.tsx:17; review/page.tsx:14; analytics/page.tsx:16).
- Writes: `requireService("social",{write:true})` in features/social/actions.ts:24, social/accounts/actions.ts:23, legacy-social/actions.ts (10 call sites), review-actions.ts:27, brand-actions.ts:29,122, api/social-posts/picture/route.ts:18. Reads: api/social-posters/image:19, social-carousels/slide:22.
- Admin: campaigns section and `campaign-actions` gate on `listBoughtServices(...).includes("social")` (admin/app/(protected)/clients/[businessId]/campaign-actions.ts:55; components/console/campaigns-section.tsx:97); numbers form service is only `social|search` (admin/lib/numbers-form.ts:38); DB CHECK `monthly_snapshots_service_check` and `service_setup_service_check` allow only `social, search` (schema/client-activity.ts:~34, ~106). Staff-entered ad numbers live in `monthly_snapshots` service `social` with `ad_spend_cents`, `ad_budget_cents` (client-activity.ts:~89-90) and `ad_campaign_snapshots` (:130).

Impact by customer type
- Ads-only customer (only `paid-ads`):
  - Gets full Social media entitlement: `/social`, `/social/review`, `/social/analytics`, the posting-service actions and image routes all open (guard `social`). Entitlement leak (free Social surface), I for whether the external posting service then does work for them (depends on social-auto workspace, U).
  - Sidebar shows Social media as bought and offers no "Add Social"; `NotBought` is never shown for it.
  - Setup asks and checklist mix Social asks (Instagram and Facebook pages, offers) with ad budget (checklist rules-items.ts:32-33; loader.ts:40).
  - Kickoff panel names the plan "social media" (calls/components/kickoff-panel.tsx:15). Request intent "Posts or ads" maps to kind `social` (requests/rules.ts:110).
  - Reports have no ads service: services are `website|social|search` (reports/rules.ts:14; report-states.ts:7), so ad figures ride the `social` report.
- Social-only customer (only `social-media`):
  - `/ads` renders as bought: `SocialAds` with empty "No ad figures for this month yet" (social-screens.tsx:105-124). Sidebar Paid Ads link looks bought.
  - Cannot be sold Paid Ads from the dashboard: `/ads` never shows `NotBought` for them; `ADD_ON_OF` in setup/rules.ts has only `social: "social-media"` (setup/rules.ts:60) and `readAddParam` maps only `website` and `social` (billing/rules.ts:62), so `?add=` cannot preselect Paid Ads. Plan & billing services list still lists `paid-ads` (`servicesToList` lists every catalogue id, add-ons.ts:127).
  - Staff can enter campaigns and ad figures for them (admin gate is `social`).
- Neither bought: `/ads` shows `NotBought` pitching Social Media Management at Social's price with Add link `/billing?add=social` (setup/rules.ts:60-125). A visitor on the Paid Ads page is sold the wrong product. V.
- Website-only: `/ads` and `/social` show `NotBought` for Social. Correct for Social; wrong product for Ads (same).
- Cancellation: cancelling only Social from a Social+Ads basket leaves `social` true through the Ads line (guard `social` is union). Customer can keep using Social surfaces and posting writes while paying only for Ads. V (logic of service-setup.ts:50).
- Pending lines count: `boughtSetupServicesFrom` includes `pending` lines (service-setup.ts:50), so an unpaid checkout counts as `social`; blocked in practice by `requirePaid` (guards.ts:100-103), but admin `listBoughtServices` has no payment filter, so staff can enter numbers for an unpaid basket. I.
- Early drop: a line with `end_requested_at` set is excluded at once from `services` (guard-rules.ts:97, service-setup.ts:50) although billing keeps it paid to month end; the Website follows the paid-month rule for writes (`holdsService`, guard-rules.ts:81-85) but Social does not. Inconsistent. V.

Is `search` legacy? V: yes for sale. "Local SEO + AEO is no longer sold" (shell/rules.ts:112; migration 0222 per add-ons.ts:10; billing/rules.ts:59-60 comment). Still live as an entitlement for old rows: `SERVICES` includes it, `deliverables` kinds `page|listing` map to `search` (deliverable-states.ts:15-17), `service_setup`/`monthly_snapshots` CHECKs allow it, `bundled_add_ons_add_on_check` does NOT include a search id (add-ons.ts:~170), and `add_on_subscriptions_add_on_check` only allows social-media|paid-ads (add-ons.ts:79). So no row can currently create `search` through the CHECK-constrained add-on tables: it is reachable only via data that predates those CHECKs (U: whether any production rows exist). Treat `search` as dead for new customers, vestigial in types, nav, requests (requests/rules.ts:111), reports, admin forms, lead plan ids (`growth`, `search` leads-api.ts:59) and checklists.

## 5. Smallest-safe corrected entitlement model (proposal, I)

Goal: stop the leak and the wrong pitch without touching billing.
1. Add `ads` to `Service` in `apps/customer/src/lib/guard-rules.ts` (`SERVICES = ["website","social","ads","search"]`). Map `paid-ads -> "ads"` in exactly three tables: `SERVICE_OF_ADD_ON` (packages/db service-setup.ts:43; widen `SetupService`), `SERVICE_KEY_OF` in billing/rules.ts:39 and start/rules.ts:88.
2. Pages: `/ads` checks `includes("ads")`; `/social*` checks `includes("social")`. Nav `ADS_LINK.service = "ads"`. `NotBought` gets an `ads` variant with `paid-ads` copy and `?add=ads` handled by `readAddParam`.
3. Persistence without a risky migration: keep `monthly_snapshots.service='social'` and `ad_campaign_snapshots` as they are (store ads figures as today). Only the entitlement check changes. Move to `service='ads'` later with a migration widening the two CHECKs (client-activity.ts) and the admin numbers form.
4. Admin: `campaign-actions.ts:55` and `campaigns-section.tsx:97` check `ads`; numbers form unchanged for now.
5. Social write guards (`requireService("social")`) stay; they now mean Social only.
6. Early-drop consistency: for Social and Ads use the same paid-month rule the Website has (`holdsService`), not "excluded when `end_requested_at` set".
7. Tests to add: `shell/rules.test.ts` ads-only and social-only; `guard-rules.test.ts` for the new key; integration test `service-setup.test.ts` for paid-ads; fix the stale membership.test.ts labels ("website and SEO" for ["managed-website","paid-ads"], membership.test.ts:132-133).
Risk: staff pages, reports and the posting-service workspace logic that assume `social` covers ads (U for the external service); do 1-4 behind one release.

## 6. DIY vs Done For You management modes (V: none)
grep for diy, done-for-you, do-it-yourself, management_mode, self-serve over apps and packages `.ts/.tsx`: no hit outside generated font blobs, an unrelated "DIY" hit in `google-provision.ts` and a `payment-method-request.tsx` hit that is unrelated copy. No enum, column, flag or route models a management mode. The product is single-mode managed: staff do the work, customer approves (website preview, social posts) or reads figures (ads). Any website copy about DIY is outside this repo (U). Customer self-serve exists only as editing inputs (checklist, blog editor in `/content` and `/website/blog`, connect social accounts via `startConnectAction`).

## 7. Other facts
- Managed website entitlement on writes follows `hasWebsiteService` = billing access and an active `managed-website` line (packages/billing/src/access.ts:48-54). A dropped website runs to paidThroughAt.
- Billing status mapping: unpaid / paid / lapsed (shared/lib/billing/status.ts:12,52). Lapsed keeps read access via `paid:"ever"` (guard-rules.ts:54-56).
- Expert Monitoring has no surface-level entitlement: `SERVICE_KEY_OF["expert-monitoring"] = null` (billing/rules.ts:44); `/monitoring` is a permanent redirect to Home after `requireCustomer()` (app/(app)/monitoring/page.tsx:5-8); monitoring has no screen of its own (V).
- Referral and affiliate discount is applied once on the basket net (checkout.ts:361-369); a basket of trial-only lines refuses a code (checkout.ts:87).
