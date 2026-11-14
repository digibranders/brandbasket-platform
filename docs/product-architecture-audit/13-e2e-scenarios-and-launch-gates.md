# E2E scenarios and launch gates

No scenario here has been run. Each is a specification. Environment recipe, coverage map, historical claim recheck and money risk register follow.


---

<!-- source: journey-qa/e2e-scenarios-and-launch-gates.md -->

# E2E scenarios and launch gates

Commit c702f6c7 (development), 2026-11-14. This is a plan. No scenario below was run, so none is claimed to pass. Every "expected" line is derived from source and must be pinned on the first real run. Labels: Verified in code | Reported in historical document | Inferred | Unknown.

Feeds deliverable 13. Environment, safe commands and fixture gaps are in `e2e-environment-and-fixtures.md`. Coverage overlap uses IDs from `test-coverage-map.md`.

## 0. Ground rules for every scenario

1. Run only against an isolated local database on `http://localhost:3197` (customer) and `http://console.brandbasket.localhost:3199` (console). Never an https origin, never production, never `next.brandbasket.in` (production data).
2. `BREVO_API_KEY`, Razorpay keys, `GA4_*`, `META_*`, `VERCEL_API_TOKEN`, Turnstile and Google keys are unset. `BILLING_PROVIDER=fake` except webhook scenarios (section 3, group W) which use a local secret and a stubbed Razorpay.
3. Each money scenario creates its own business by the real sign-up (`e2e+<unique>@example.test`), never a shared persona, so reruns do not collide. Shared personas (Kulkarni, Reddy, ...) are read-only except where a scenario says it resets its change (as `flows.spec.ts:150` does for business hours).
4. Staff roles: `support` (seeded `staff+seed-v4@example.test`), `finance` and `admin` (created by hand, see environment doc section 4).
5. Assertions read the database through the staff connection (`e2e/support.ts` pattern) and the outbox table `email_messages` (`to_address`, `template`, `subject`, `status` in `sent|local_only|failed`, `body_redacted`). With Brevo unset, rows are `local_only` and keep links and codes.
6. Viewports: 375x812, 768x1024, 1440x900. Existing config only has 1440 and 390 (`playwright.config.ts:28-41`). Add `tablet` and `phone-375` projects.
7. A scenario "passes" only if every expected line holds. Any mismatch is a finding, not a test change.
8. Idempotency pattern for payments: perform the action, capture row counts (`payments`, `tax_invoices`, `subscriptions`, `email_messages` by template), repeat the action, assert counts unchanged.

Seed roles used below: OM (Om Sweets), PAT (Patel, preview), KUL-O/E/V (Kulkarni owner, editor, viewer; all three services, live), RED (Reddy, lapsed, website+social), CHA (Chatterjee, renewal failing), IYE (Iyer, unpaid), AFF (affiliate), STF-S/F/A (staff support, finance, admin), NEW (fresh sign-up created by the scenario). New fixtures required are marked NEW-FIXTURE.

## 1. Sign-up, OTP, sign-in, links

### A-01 Sign-up with real code (bypass off)
- Precondition: `EMAIL_CODE_BYPASS` unset, Brevo unset. Fresh address.
- Steps: `/signup`, fill business name, name, email, state, mobile, password, tick terms, "Email me a code". Read the 6-digit code from `email_messages` (template `signup-code`). Enter it.
- Customer: account created, signed in, lands on `/start` (basket) per `features/entry/actions.ts:93` for a sign-up.
- Admin: a lead appears (`recordLeadForSignup`, `listing-account.ts`), visible at `/leads` for support.
- DB: `users` +1 (email confirmed), `businesses` +1 kind `listing` with `signup_choice='managed'`, `business_members` owner +1, consent record for terms, one `email_messages` row template `signup-code`.
- Evidence: `features/entry/server/listing-account.ts:120-190`. Overlap: `flows.spec.ts:43` (bypass on).

### A-02 Wrong code, expiry, tries, rate limit
- Steps: enter a wrong code 5 times; wait or move `expires_at` past 10 minutes; request resend repeatedly; repeat from one IP past the limit.
- Customer: "That code isn't right. N tries left." then lockout copy, "That code has run out. Send a new one." after expiry, a retry-after message at the limit.
- DB: no `users` row until success. Rate-limit rows keyed `join:client:<ip-hash>`.
- Evidence: `listing-account.ts:129-145` (copy), `:151-155` (limit after proof). Overlap: unit only.

### A-03 Duplicate email and duplicate mobile
- Steps: sign up with an existing address, then a taken mobile.
- Customer: `EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE` and `PHONE_TAKEN_MESSAGE`; the code is not spent for a taken mobile (`listing-account.ts:123-127`).
- Overlap: unit (`actions.test.ts`).

### A-04 Password policy and breached password
- Steps: 7 characters, no symbol, a known-breached password.
- Expected: refused with field error; focus moves to the invalid field (`ui/field.tsx:33-42`, `E2E-REVIEW-2.md` R2-02 fixed, Verified in code).
- Unknown: whether the sign-up form calls the breached-password service (the staff script does, `packages/auth/scripts/breached-password.ts`).

### A-05 Sign-in, bad password, rate limit, safe `next`
- Steps: bad password x N; valid sign-in; `/login?next=https://evil.example` and `next=/invite/<token>`.
- Expected: "Too many sign-in attempts" after the limit (`e2e/auth.setup.ts:12`); `next` honoured only for invite pages (`rules/account-entry.ts:34-40`). Overlap: `links.spec.ts` (safe next).

### A-06 Password reset: valid, expired, used, wrong host
- Seed token rows as `links.spec.ts` does. Expected: valid link resets and signs out everywhere; expired and used show a dead-link state; response has `referrer: no-referrer`. Outbox: template `password-reset` with `body_redacted=false` locally. Overlap: `links.spec.ts` (3 tests Reported passing).

### A-07 Staff setup link (`/setup/<token>`) valid, used, expired, revoked
- Expected: three states (`setup/[token]/page.tsx`); redeem creates user and business, then signs in (`features/entry/server/setup.ts:190-215`).
- Known gap to assert: no Payload tenant is created by the redemption ("shortcut" comment at `setup.ts:207`); check `payload` tenant row count and whether the blog screen works for the new business. Reported in historical document (FINAL-PARITY G-6c), still open in code.

## 2. Checkout and money (fake provider)

### P-01 Website-only happy path
- Persona NEW. Steps: `/start` answers, `/checkout`, Pay, fake `/billing/confirm?token=...`, "Pay ₹2,999" (price incl. 18% GST, `packages/shared/src/lib/billing/add-ons.ts:51-56`).
- Customer: welcome page, workspace unlocked; Plan & billing shows plan, next renewal date, a receipt.
- Admin: STF-F `/payments` shows one captured payment, `/invoices` one tax invoice, client page billing tab present.
- DB: `subscriptions` +1 active (unique live per business, `schema/billing.ts:250`), `payments` +1 `captured`, `bundled_add_ons` line `managed-website` active, `tax_invoices` +1 with serial in `tax_invoices_series_serial_idx`, `projects` +1 onboarding, outbox receipt email (template from `payment-emails`).
- Overlap: `flows.spec.ts:48`.

### P-02 Double press, refresh, back after paying (idempotency)
- Steps: on the fake confirm page press Pay twice quickly; reload the confirm URL after paying; browser Back to confirm.
- Expected: one payment, one invoice, one receipt email; refreshed confirm page "records nothing and just moves on" (`app/(pay)/billing/confirm/page.tsx:42`).
- Evidence: `billing.integration.test.ts:343` (same payment twice), `payment-invoicing.integration.test.ts:570`. Overlap: db level only; no browser.

### P-03 Cancel on the test page, retry, expired token
- Steps: Cancel (`cancelHref` MEMBERSHIP_PATH); set token expiry past 1 hour (token TTL 3600 s, `fake-provider.ts:51`) then press Pay; tamper one character of the token.
- Expected: "This checkout link has expired or isn't for your account, so nothing has been recorded" (`confirm/page.tsx:49-56`); no payment row; a fresh Checkout creates a new token. Overlap: `fake-provider.test.ts` unit.

### P-04 Role at checkout
- Steps: KUL-E and KUL-V open `/checkout`, `/billing/confirm`; an unpaid business's invited editor opens `/checkout`.
- Expected: non-owner is sent Home (`requireOwner`, `confirm/page.tsx:20`); for an unpaid business the loader returns `owner-only` rather than looping (`checkout/loader.ts:90-92`). Overlap: none.

### P-05 Failed payment, renewal failing (CHA)
- Steps: sign in CHA; open Home and Plan & billing; open `/billing/payment`.
- Customer: banner that a renewal failed while access runs to `paidThroughAt` (`renewalFailingUntil`, `lib/billing/status.ts:53`); a way to update the payment method. Writes still allowed (billing status `paid`).
- Admin: STF-F `/payments` shows the failed attempt and an attention item; client billing tab shows past_due.
- DB: `payments` row `failed` with `failure_reason`, subscription `past_due`.
- Overlap: `sweep.spec.ts` renders the page; no assertion on the failure copy.
- Fixture for decline simulation: fake provider has none. NEW-FIXTURE: call `recordFailedPayment` (`packages/db/src/queries/staff-payments.ts:52-67`) on a fresh business, as the seed does.

### P-06 Lapsed (RED) and reactivation
- Steps: RED opens Home, a write page (Requests new), Website; then reactivates through Plan & billing and pays on the fake page.
- Expected: reads allowed, writes redirect to `/billing` (`guard-rules.ts:50-52`); checkout redirects lapsed to `/billing` (`checkout/loader.ts:89-90`); after payment a `reactivation` payment, one new invoice, site unpaused. Overlap: `flows-one-way.spec.ts:37` (one-way; leaves RED reactivated, so the persona is consumed: use NEW with `paid_through_at` moved back).

### P-07 Cancel a service and keep it; cancel the account
- Steps: KUL-O "Cancel a service", confirm, then "Keep" before the period ends; then Settings, Delete account (owner only).
- Expected: `cancelServiceAction` is `requireOwner({ write: true })` (`features/billing/actions.ts`): editor and viewer refused; cancel sets `end_requested_at`, service stays to month end (`guard-rules.ts:73-80`); keep restores. Provider cancel at period end goes through `cancelAtProvider` (Inferred; fake provider no-op).
- DB: `bundled_add_ons.end_requested_at` set then cleared; no payment row. Overlap: `flows.spec.ts:187`.

### P-08 Add a service after sign-up
- Steps: NEW paid website-only; add Social at `/billing` (combined subscription plan 63).
- Expected: second payment of the prorated upfront amount, one more invoice line, `bundled_add_ons` +1 `social-media`, `subscriptions` successor chain with only one live (`schema/billing.ts:250-253`). Overlap: `flows.spec.ts:48` (add and cancel), integration `added-service`, `bundled-first-payment`.

### P-09 Annual interval
- Steps: `/checkout?interval=year` (if the page offers it, `readBillingInterval`).
- Expected: 10% off twelve months (`ANNUAL_DISCOUNT_BASIS_POINTS=1000`, `add-ons.ts:123`), invoice states the annual amount. Unknown: whether the UI offers it today. Overlap: unit `bundle.test`; no browser. Note `CLAUDE.md` workspace says "billed monthly".

### P-10 Refund (staff)
- Steps: STF-F opens client billing tab, "Mark refunded" on the payment with an amount and a reason; repeat as STF-S; repeat on a failed and on an already refunded payment; amount above the payment.
- Expected: finance and admin only (`refund-actions.ts` uses `requireStaffCan("money")`); support is sent to `/no-access` and an `access.denied` access-log row is written (`staff-role.ts:15-22`). `payments.status='refunded'`, `refunded_amount_cents`, reason, staff id; unpaid affiliate earnings cancelled, paid ones reported (`staff-payments.ts:90-128`). Second press: `not-refundable`. Over amount: `amount-too-high`.
- Customer side (Inferred from code, no coupling found): access is NOT revoked, no credit note is issued, no email is sent. Assert exactly that, and record it as a product decision for the owner (`invoice-reconciliation.ts:26` calls it "Refunded after an invoice was issued (no credit note)").
- Overlap: unit `refund-actions.test.ts`; 1 integration.

## 3. Webhooks, first-payment recovery, jobs (Razorpay path)

Requires the Razorpay stub (environment doc section 5). Signature: HMAC-SHA256 hex of the raw body, header `x-razorpay-signature` (`api/webhooks/razorpay/route.ts:23-26`).

### W-01 Signature and parse
- Steps: no header; wrong signature; valid signature with unknown event; valid with malformed `subscription.charged`.
- Expected: 400 `{"error":"invalid signature"}` for the first two and a `webhook_signature_invalid` security event (`route.ts:27-35`); 200 `{"received":true}` for the others; ignored or failed rows in the webhook log (`noteWebhook`). No DB payment change.

### W-02 First payment by webhook (happy) and redelivery
- Steps: checkout under razorpay (stub returns a subscription id), deliver `subscription.charged` once, then the same body 3 times, then 2 concurrently.
- Expected: one `payments` row, one invoice, one receipt email; plan active. Concurrent delivery converges through `lockBusinessForBilling` and `payments_provider_id_idx`. Evidence: handler doc `razorpay-webhook-handler.ts:56-69`; `billing.integration.test.ts:343`. Gap: concurrent delivery untested (map section 2 row 4).

### W-03 Webhook missed, ordinary first payment (commit c702f6c7)
- Steps: owner pays at the (stubbed) provider, no webhook is sent, owner reloads `/checkout`.
- Expected: `recordFirstPaymentIfHeld` asks the provider for the first charge, records it through the handler, redirects to the welcome page (`loader.ts:96-97`); recovered payment has `method=null` (`razorpay-webhook-handler.ts` `recordChargeFromRazorpay`, event built with `method: null`). If the owner never returns, nothing recovers it, because the 10-minute job only covers first-month offer checkouts (`first-payment-check.ts:38`). Assert that deliberately and file it as a gap (map F-3). Overlap: unit mocks only.

### W-04 Webhook missed, first-month offer
- Steps: leave an offer checkout open more than 10 minutes (`SETTLE_MS`), POST `/api/internal/check-first-payments` with `PAYMENT_RECONCILE_TOKEN`.
- Expected: 503 without the token set; 401 wrong token; with a stubbed payment 200 `{checked,found,failed}`; running it again returns `found:0` (already recorded, `recordUpfrontFromRazorpay` early return); provider error gives 502.

### W-05 Out-of-order and unapplied payments
- Steps: `halted` status event arriving after a successful renewal; a charge on a cancelled subscription; wrong amount; a renewal on a replaced subscription.
- Expected: status is re-read from the provider, not trusted from the event (`handler:116`); the other three are stored as unapplied payments with `attention_reason` (`checkout_replaced`, `amount_mismatch`, ...) and shown to finance at `/payments`; no plan activation. Evidence: `handler:225-290`, integration `:402`.

### W-06 Order paid (change quote, add-on charge)
- Expected: `order.paid` for an unknown order is logged and ignored with 200 (`charges.ts` `recordRazorpayChargePayment`); for a known order it marks the charge paid and starts the change request in the same transaction (`packages/db/src/queries/charges.ts:436-440`). Replay once: unchanged.

### J-01 Erase job: dry run, then real, then replay
- Steps: NEW closes the account (Settings, Delete), set `account_closures.erase_after` into the past; POST `/api/internal/erase-closed-accounts?dryRun=1&limit=5` then without `dryRun`, then again; also with another member present, a live subscription, a staff account.
- Expected: dry run returns `would-erase` and changes nothing; real run erases once; replay finds nothing due; skip reasons `subscription-live`, `other-members`, `staff-account`, `not-due` (`account-erasure.ts:102-110`); payments, invoices, subscriptions and charges are kept, the tax invoice keeps name and address for 8 years (`account-erasure.ts` header). Bad query: 400 for `dryRun=2` or `limit=0`. Restore before the deadline: closure `restored_at` set, nothing erased.
- Race to probe: restore after `findBlock` but before `eraseRows` (CMS content is deleted first, `account-erasure-run.ts:72-80`). Hard to time in a browser; do it in an integration test with injected `ErasureDeps`.
- Overlap: `account-erasure.integration.test.ts` 20, `account-closures.integration.test.ts` 18; no route test.

### J-02 Background jobs do not corrupt data
- Steps: snapshot row counts and checksums of `payments`, `subscriptions`, `tax_invoices`, `bundled_add_ons`, `projects`, `deliverables`, `email_messages` on an idle seeded database. Run each internal job twice (`start-builds-after-kickoff`, `roll-up-site-analytics`, `retry-conversions`, `sync-site-hosting` dry run, `check-first-payments`, `erase-closed-accounts?dryRun=1`) and the scripts `pnpm reports:run`, `site-health:run`, `retention:run`.
- Expected: second run changes nothing beyond timestamps the job owns; no payment, invoice, subscription or entitlement row changes; no customer email without a triggering event. The Vercel pause or unpause is not exercised (no token); record that.

## 4. Service combinations (entitlements)

Create each with the real sign-up and `/checkout?services=...` (`readSelectedServices`, `checkout/rules/membership.ts:64`). NEW-FIXTURE for every row except KUL.

| ID | Basket | Expected customer navigation and pages | Expected admin | DB evidence |
|---|---|---|---|---|
| S-01 website only | `managed-website` | Website, Business, Blog; `/social` and `/ads` show NotBought (`app/(app)/social/page.tsx:15`, `ads/page.tsx:11`) | client page shows website project, no social tabs | `bundled_add_ons` 1 line; `listBoughtSetupServices`=[] |
| S-02 social only | `social-media` | Social media and Paid Ads pages open; `/website` redirects Home (`guard-rules.ts:70-72`, test line 67); no kickoff website build expected: assert what Home says | no website project or a project in a non-website state; Unknown | services=["social"] |
| S-03 ads only | `paid-ads` | Same two pages as S-02 (finding F-2: ads and social share the `social` flag, `service-setup.ts:32`); assert and record whether "Social media" content is offered to a customer who bought only ads | console ad section | services=["social"] |
| S-04 website + social | two lines | Website and Social; Paid Ads page also open (same flag) | | |
| S-05 all three | `managed-website`, `social-media`, `paid-ads` | all pages; monitoring included at no cost (`monitoringIncludedWith`, `add-ons.ts:110-112`); `/monitoring` redirects Home | `expert-monitoring` not billed | `payments.amount` = 3 x 2,999 incl. GST; no monitoring line billed |
| S-06 monitoring alone | `?services=expert-monitoring` | Unknown whether purchasable and what unlocks; run and record | | |
| S-07 drop one of three | KUL-style then cancel Paid Ads | monitoring becomes billable at the next renewal (`servicesToList`, `add-ons.ts:117-119`) | | integration `razorpay-webhook-handler.integration.test.ts:455` |
| S-08 USD | NEW-FIXTURE with country outside India | no GST mention beside a dollar price, $59 each (root CLAUDE.md, `add-ons.ts:52`) | | `businesses.currency='USD'` |

For each: assert at 375, 768 and 1440 that no nav item or CTA points to a page the guard will redirect (the sweep's `unswept-link` check does a version of this, `sweep.spec.ts:176`). Guard map: `lib/guards.ts:96-117`, pure rules `lib/guard-rules.ts:44-70`.

## 5. Roles and invitations

### R-01 Owner invites editor and viewer (happy)
- KUL-O Settings, Team, Invite someone: email, role. Expected: `business_invites` row (role check editor|viewer, `schema/business-invites.ts:39`), outbox template `business-invite` with the accept URL (7 days, `BUSINESS_INVITE_DAYS=7`), rate limit 20 per hour per owner (`team/actions.ts:42`). Opening the link changes nothing until the button is pressed. Overlap: `flows.spec.ts:205`.

### R-02 Invitee with no account
- Steps: open the link signed out, choose "Create an account" (`inviteSignUpHref`), complete sign-up with the invited address, then accept.
- Expected per code (Inferred, finding F-1): the sign-up makes a personal business, accept adds a second membership, the app shows the oldest (the personal one), the invitee lands on `/checkout` of an empty business and never sees the inviter's workspace. If the run shows the invited workspace, F-1 is wrong. This is the highest-value new test.
- DB: two `business_members` rows for the user; one `business_invites.accepted_at` set.

### R-03 Invitee with an existing business (owner of another)
- Expected: invite consumed, redirect Home, still the first business (`access.ts:33-41`). Assert the copy tells the person what happened (none found in code).

### R-04 Wrong address, expired, revoked, used, malformed, signed out
- Overlap: `links.spec.ts` (all seven, Reported passing). Add: attempts per user rate limit (10 per hour, `team/actions.ts:44`).

### R-05 Role matrix (KUL-O, KUL-E, KUL-V)
- For each write: send request, approve post, approve preview (PAT), save hours, save blog post, create author, cancel service, add service, invite, remove member, delete account, download receipt, change billing details, book call, save enquiry note.
- Expected: viewer refused everywhere with `VIEWER_MESSAGE`; editor allowed on content writes, refused on billing, team, receipts and delete (owner only: `requireOwner` in `checkout/actions.ts`, `billing/actions.ts`, `team/actions.ts`, `settings/actions.ts`, receipts route); owner allowed. A refusal never leaves a partial write. Evidence per action in coverage map F-7. Overlap: per-action unit tests; E2E only for blog viewer (`blog-editor.spec.ts:153`).

### R-06 Remove a member mid-session
- Owner removes the editor while the editor has the app open. Expected: the editor's next page load sends them to sign in or to their next business (`removeBusinessMember`, `queries/memberships.ts:34-42`); owner cannot remove self or another owner.

### R-07 Staff roles in the console
| Role | Must open | Must be refused (send to `/no-access` and log `access.denied`) |
|---|---|---|
| support STF-S | Today, Clients, Requests, Enquiries, Calls, Outbox, Projects | Payments, Invoices, Prices, Coupons, Affiliates, Ad results (`console-rail.ts:74-86`, `money`), Access log (`oversight`), Settings integrations (`integrations`), build rules (`buildRules`), client billing tab (`billing/page.tsx:77` hides it) |
| finance STF-F | all support pages plus money pages and refund | Access log, integrations, build rules, privacy requests and breaches (`oversight`) |
| admin STF-A | everything | none |
- Direct-URL and direct server-action calls (replay the form POST) must be refused as well as the nav hiding them. Evidence: `staff-role.ts`, `packages/shared/src/lib/access.ts:55-70`. A customer session must open nothing (`requireStaffAccess` checks an active staff record, `apps/admin/CLAUDE.md`). Session life 12 hours. Overlap: 13 unit files; no browser test; 16 action files untested.
- Access log: opening a customer-data page writes a row visible to admin at `/access-log` (`logStaffAccess`).

## 6. Isolation (IDOR negatives)

Persona pair: KUL-O (victim) and PAT or NEW (attacker). Collect victim ids by DB query. Expected for all: no victim data in the response; status 404 (pages, `notFound()`), bare 401 for media and attachment routes when signed out, redirect when signed out for pages; never 200.

| ID | Request as attacker | Expected | Evidence |
|---|---|---|---|
| X-01 | `GET /requests/<victim ticket>` | 404 "not found" same as nonexistent | `requests/[id]/page.tsx` ("the same not found") |
| X-02 | `GET /billing/charges/<victim charge>/pay`, `/checkout/charges/<id>` | 404 | `(pay)/checkout/charges/[id]/page.tsx:53` |
| X-03 | server action `payChargeAction` with a victim charge id | refused, no order opened | `features/checkout/actions.ts` (owner) plus RLS |
| X-04 | `GET /billing/receipts?ids=<victim payment>` | 404; bad ids 400 | `receipts.ts` |
| X-05 | `GET /media/<victim media>` and `/deliverable-images/<victim>` | 404; signed out 401 | `media/[mediaId]/route.ts:9-13` |
| X-06 | `GET /support-attachments/<victim>` | not served (user-scoped query `getSupportAttachmentForUser`); signed out redirects to login (finding F-052 in parity audit, still true: `requireSignedIn`) | `support-attachments/[attachmentId]/route.ts` |
| X-07 | blog: open or save `/website/blog/<victim post id>` | refused; Payload has no row-level security, so this is the weakest layer (`features/blog/server/access.ts:12-13`) | `requireOwnedBlogPost` |
| X-08 | forged `acceptQuoteAction` form with a victim request id | `actionFail` not found; no charge | `requests/actions.ts:173-182` |
| X-09 | accept an invite addressed to someone else | `wrong_email` refusal | `business-invites.ts:121` |
| X-10 | fake checkout token minted for business A used by business B | refused, nothing recorded | `confirm/page.tsx:36-47`, token binds business id |
| X-11 | staff-only API with a customer cookie: console login with a customer account | refused (console cookie is a different host-only cookie; customer user is not staff) | `apps/admin/CLAUDE.md` |
| X-12 | customer cookie replay to `/api/internal/*` | 401 (bearer tokens only) | route files |
| X-13 | SQL level: customer role selects other business rows | zero rows | `rls.integration.test.ts` (overlap) |

## 7. Lifecycle: kickoff, preview, social, requests

### K-01 Kickoff booking (OM)
- Steps: open Home, Book kickoff (local stand-in scheduler needs `site_settings.setup_call_url`, `e2e/support.ts:ensureBookingLink`). Expected: booking row, confirmation email in outbox, Home milestone moves; when staff mark the call held, `start-builds-after-kickoff` moves the project to building and sets the first preview 48 hours out (`kickoff-sync.ts:38`). Overlap: `flows.spec.ts:48`.

### K-02 Preview approve and request changes (PAT)
- Approve: project `preview` to approved, notice "approved", staff notified; second press shows "not-ready" (`website/actions.ts:42-52`). Changes: ticket `website_change` created in one transaction with the round counted; double submit makes one ticket (submission key); rounds used up refused (`actions.ts:83-130`). Viewer and lapsed refused. Overlap: `flows-one-way.spec.ts:17` approve only; the PAT persona is consumed.

### K-03 Social post approval (KUL)
- NEW staff-side helper `postForApproval`; owner approves; viewer refused; approve twice is harmless ("which is also what makes a second press harmless", `social/actions.ts:17-20`). Lapsed owner: refused (`requireService("social", {write:true})`). Overlap: `flows.spec.ts:137`.

### K-04 Change request to quote to pay (KUL)
- Request, staff quote (`sendChangeQuote`), customer "Accept and pay": opens charge once (double press same charge), opens payment (`startCustomerChargePayment`), fake page, pay; request starts. Historical gap G-1 (Razorpay dead-end) is fixed in code: `requests/actions.ts:182-188`. Re-verify under the Razorpay stub that a Razorpay order exists before the pay page (`charges/[id]/page.tsx:57` redirects to `/billing` when `providerOrderId` is null). Overlap: `flows.spec.ts:101` fake only.

## 8. Expired links, back and forward, timeouts

| ID | Scenario | Expected |
|---|---|---|
| T-01 | Back after sign-out on a workspace page | redirect to `/login`; no cached private page content visible (check `Cache-Control` on pages) |
| T-02 | Back after paying to `/checkout` | redirect to welcome or Home, no second payment (`checkout/loader.ts:94-97`) |
| T-03 | Forward into a consumed invite or reset link | dead-link state, nothing changes |
| T-04 | Open two tabs, pay in one, press Pay in the other | one payment (see P-02) |
| T-05 | Session expiry mid-form (customer) and staff session 12 hours | action redirects to sign in; typed text preserved or a clear error; a dropped save request outside the Business profile may show the route error screen (open item O-2 in `E2E-REVIEW-2.md`; Inferred still open: 58 client files reference actions, 25 contain a `catch`, only `use-section-form.ts:9` is known to turn a dropped request into a message) |
| T-06 | Brevo timeout 10 s and one retry (`brevo.ts:24-27`) | request still succeeds, outbox row `failed` with a reason (`brevo.ts:171-175`); requires a Brevo stub, so run only at unit or integration level; mark Unknown for browser |
| T-07 | Razorpay call hangs (checkout page asks Razorpay on load) | page must degrade (`first-payment-lookup.ts` never throws); no SDK timeout is configured (`checkout/server/billing.ts:58`), Unknown behaviour; test with a stub that never answers |
| T-08 | Fake token, OTP (10 minutes), invite (7 days), setup (7 days), reset token expiry | each shows its expired state at expiry minus 1 second (allowed) and plus 1 second (refused) |

## 9. Outbox and email assertions

Run these as database assertions inside the scenarios above.

| ID | Trigger | Expected `email_messages` row |
|---|---|---|
| M-01 | sign-up code | template `signup-code`, to the address, body kept (local) |
| M-02 | password reset request for known and unknown address | same row shape for both so timing and rows do not reveal accounts (`brevo.ts` comment on `createEmailDelivery`, "writes the same row for every address") |
| M-03 | invite sent | `business-invite`; if send fails the invite is revoked and the owner sees `INVITE_SEND_FAILED_MESSAGE` (`team/actions.ts:67-85`) |
| M-04 | payment received | one receipt per recorded payment, none for an unapplied payment (`handler:179-193`) |
| M-05 | staff reply to a request, quote sent, preview ready | one customer email each, link points at `APP_ORIGIN` (check the admin env conflict in environment doc section 2) |
| M-06 | staff opens Outbox | `outbox.list` access-log row; redacted rows have `body_redacted=true` and cannot be resent |
| M-07 | no email on refund | assert zero new rows after STF-F marks a refund (current behaviour) |
| M-08 | total mail for a full run | no row addressed outside `@example.test` |

## 10. Responsive, keyboard and screen reader

For S-01, S-05, P-01, P-05, R-01, K-02 and each admin money page, run at 375x812, 768x1024 and 1440x900:
- No horizontal scroll (`sweep.spec.ts` overflow check at 390 only), no clipped CTA, tap targets reachable, sticky bars not covering fields.
- axe tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`, all impacts, not only serious and critical (`sweep.spec.ts:164`), and remove entries from `e2e/known-issues.ts` as they are fixed (E2E-08, 09, 10, 23, 24, 25 are suppressed today).
- Admin console has no axe run or keyboard test at all (Verified: no admin e2e). Add Tab order and focus visibility for login, Today, a client page, Payments, the refund form.
- Keyboard (existing `keyboard.spec.ts` covers customer sign in, sign up, forgot password, `/start`, checkout, Home, Requests, Enquiries, Billing, Team, Business, Blog, dialogs, Ctrl K): add the fake confirm page (Pay and Cancel order), invite accept page, restore-account page, cancel-service dialog confirm and Escape, the refund form, toasts and banners announced (`role="alert"`).
- Screen reader risks to test by hand (VoiceOver Safari, NVDA Firefox), because automation cannot: Base UI select and combobox names (`choose()` helper uses role names; real announcement unverified); focus after a refused submit (R2-02 fixed); status changes after Pay (is "payment received" announced); skeleton and loading states (only Business has `loading.tsx`, O-1 open); table nested interactive controls (E2E-24 suppressed); dialogs open with focus on the Close button, not the first field (left as designed in `E2E-REVIEW-2.md`); live regions for the removed-member and approve toasts; heading order on the checkout page; amounts read as "rupees" not "R S".
- Reduced motion: console honours it (`apps/admin/CLAUDE.md`, `app/console.css`); verify the customer app.

## 11. Admin and customer together (two contexts)

One Playwright test holds two browser contexts: customer on `localhost:3197`, staff on `console.brandbasket.localhost:3199`, sharing the isolated DB.

| ID | Flow | Check |
|---|---|---|
| C-01 | customer sends a request, staff replies, customer replies | message order, unread badge, one email per reply, staff access-log rows |
| C-02 | staff sends a quote, customer pays, staff sees paid and the request in progress | M-04, charge paid, change request started |
| C-03 | customer pays, staff finance sees payment and invoice, downloads invoice PDF | invoice total equals payment; access-log row for the download (`logStaffAccessOrThrow` on exports) |
| C-04 | staff marks preview ready, customer approves, staff sees project state | `projects.status` transitions only forward (`projects.integration.test.ts:142`) |
| C-05 | customer requests account deletion, staff sees closure in `/leaving`, customer restores | `account_closures.restored_at` set, no erase on the job |
| C-06 | staff creates a coupon (finance), customer applies it at checkout, invoice shows discount | `referral-checkout` integration overlap; support role cannot create the coupon |
| C-07 | affiliate earning accrues on a payment, staff marks that payment refunded | owed earning cancelled; paid earning reported (`staff-payments.ts:112-127`) |

## 12. Launch gate checklist (pass or fail)

A gate passes only with a run log, a commit hash and a database snapshot id attached. "Not run" is a fail.

Money
- [ ] G-M1 P-01, P-02, P-03: one payment, one invoice, one receipt, per paid checkout; refresh and double press add nothing.
- [ ] G-M2 W-02 and W-05 pass including two concurrent deliveries of one event.
- [ ] G-M3 W-03 and W-04 pass; the ordinary-first-payment gap (timer does not cover it) has an owner decision recorded (extend the job or accept reload recovery).
- [ ] G-M4 P-05 and P-06: failed renewal keeps access to `paidThroughAt`; lapsed is read-only; reactivation takes one payment.
- [ ] G-M5 P-10: refund policy decision recorded (no access change, no credit note, no email today), staff roles enforced.
- [ ] G-M6 `PAYMENT_RECONCILE_TOKEN` and the first-payment timer are enabled in production (`install.sh:453` leaves it off; Unknown today) and `ACCOUNT_ERASE_TOKEN` and erase timer enabled only after J-01 passes and the owner decides (`install.sh:449`).
- [ ] G-M7 Production deploy check passes (`pnpm env:check`, `check_customer_env`, `deploy/vps/brandbasket-platform-release:168-176`); fake billing and code bypass absent.

Entitlements and roles
- [ ] G-E1 S-01 to S-05 pass at 375, 768 and 1440 with no dead navigation; S-02 and S-03 outcome documented (ads and social share a flag).
- [ ] G-E2 R-02 passes or F-1 is fixed (invited person reaches the inviter's workspace).
- [ ] G-E3 R-05 viewer matrix: no write succeeds for a viewer; editor refused on billing, team, receipts, delete.
- [ ] G-E4 R-07: support, finance, admin matrix through UI, direct URL and replayed action POST.
- [ ] G-E5 X-01 to X-12 all refuse; blog (Payload, no RLS) explicitly passes X-07.

Data safety
- [ ] G-D1 J-01 dry run, real run, replay and each skip reason pass; restore-versus-erase race has a test.
- [ ] G-D2 J-02: every job run twice leaves payments, subscriptions, invoices, entitlements and outbox unchanged.
- [ ] G-D3 `pnpm test:integration` green on a fresh `_test` database (CI job `Migrations and integration tests`), run by a human and logged; not run by this audit.
- [ ] G-D4 no E2E mail addressed outside `@example.test` (M-08), no call to any production URL (network log empty of `brandbasket.in`, `razorpay.com`, `brevo.com`).

UX and accessibility
- [ ] G-U1 axe: zero violations at all impacts on sign-up, checkout, Home, Billing, Team, each admin money page, or each remaining one has a dated owner-signed exception in `known-issues.ts`.
- [ ] G-U2 keyboard-only completion of P-01, R-01, K-02 and the admin refund; focus visible and logical, Escape closes dialogs and returns focus.
- [ ] G-U3 VoiceOver and NVDA pass on checkout, confirm page, invite accept, a dialog and a form error.
- [ ] G-U4 no horizontal scroll or clipped primary action at 375, 768 and 1440 on the listed pages.
- [ ] G-U5 admin console has at least one Playwright project (login, role refusal, refund).

Email
- [ ] G-X1 M-01 to M-08 pass; Brevo failure leaves a `failed` row and does not fail the action (integration or stub run); Unknown for production sender authentication.

Known open items that must be closed or accepted in writing before launch (from historical documents, re-verified in `historical-claims-recheck.md`): O-1 loading states, O-2 dropped-request handling, O-3 in-app unsaved-changes warning, G-3 server error visibility (system email and native inbox), G-5 runtime environment assertions, G-6 data checks, G-8 affiliate link, G-9 Teams cards, G-10 legal links on checkout.


---

<!-- source: journey-qa/e2e-environment-and-fixtures.md -->

# E2E environment and fixtures

Commit c702f6c7, branch development, audited 2026-11-14. Read-only audit: nothing below was run. Labels: Verified in code | Reported in historical document | Inferred | Unknown.

## 1. What "staging-only" means in this repo (read first)

- Verified in code: no real staging environment is deployed or described as running. `deploy/vps/nginx/brandbasket-next.conf.example:1-2` describes `https://next.brandbasket.in` as "behind Cloudflare Access, on production data with a test account. NOT APPLIED". A staging copy on production data is not isolated. Do not use it for this plan. Use a throwaway local or CI-style stack with its own databases.
- Verified in code: an https `APP_ORIGIN` makes the app treat itself as a real deployment (`packages/billing/src/select.ts:47-60`). On a real deployment: the fake billing provider throws unless `BRANDBASKET_ALLOW_FAKE_BILLING=1` (`select.ts:86`); `EMAIL_CODE_BYPASS` is ignored (`apps/customer/src/features/entry/server/env.ts:29-31`); mail needs `BREVO_API_KEY` (`packages/email/src/brevo.ts:241-245`); and the deploy script refuses a customer env file that sets `EMAIL_CODE_BYPASS` or `BRANDBASKET_ALLOW_FAKE_BILLING` (`deploy/vps/brandbasket-platform-release:171-174`). So an https staging with fake billing cannot be deployed by the standard release path. Recommended: run the E2E stack on `http://*.localhost` origins (not "real"), which keeps fake billing and the outbox legal.
- Verified in code: timers (erase, first-payment check, site hosting, google provision, kickoff builds) live on the VPS (`deploy/vps/systemd/`). `install.sh:449-453` installs erase, site-hosting, site-health, google-provision and first-payment-check timers "NOT enabled". Whether production enabled them is Unknown. A local stack has no timers, so every job must be called by hand with its bearer token.

## 2. Safe local topology

| Piece | Value | Evidence |
|---|---|---|
| Customer app | `http://localhost:3197` (`pnpm dev:customer`, `next dev -p 3197`) | `apps/customer/package.json:6`, README |
| Staff console | `http://console.brandbasket.localhost:3199` (`pnpm dev:admin`) | `apps/admin/CLAUDE.md`, README |
| Customer host alias | `app.brandbasket.localhost` is only used by the older workspace guide (port 3198) | root workspace CLAUDE.md; conflicts with repo README |
| Browser | Chrome or Firefox (resolve `*.localhost`) | README |
| Cookies | host-only per origin, so one browser profile can hold customer and staff sessions side by side | `CLAUDE.md` data access rules |

Config conflicts found (Verified in config, values masked, no secret read):
1. `apps/customer/.env.local` has `APP_ORIGIN=http://localhost:3197` but `apps/admin/.env.local` has `APP_ORIGIN=http://app.brandbasket.localhost:3198`. Links the console emails (setup links, request notices, domain-ready) therefore point at port 3198, where nothing listens. Fix in the E2E env, not in the repo.
2. Both env files name the database `brandbasket_platform_dev`; the README says `brandbasket_platform`; Playwright `e2e/support.ts:34` only allows `.../brandbasket_platform_v4`; the v4 seed allows `brandbasket_platform_v4`, `_v4b`, `_preview` (`packages/db/scripts/seed-v4-states.ts:92`). Three names for the same job. A new name such as `brandbasket_platform_e2e` is allowed by neither the seed nor the Playwright helper. Use `brandbasket_platform_v4b`, which the seed allows; the Playwright helper only allows `_v4`, so its `LOCAL_DATABASE` regex (`e2e/support.ts:34`) needs a one-line widening in a later implementation task.
3. `apps/customer/.env.local` has `BREVO_API_KEY` set and `BILLING_PROVIDER=fake`, `EMAIL_CODE_BYPASS=true`. With a Brevo key the app sends real mail AND stores a redacted outbox copy: `createAppEmailTransport` returns the dual transport when a key exists (`packages/email/src/brevo.ts:239-240`) and sign-up codes, reset links and invite links use `outboxCopy` withheld bodies (`packages/email/src/templates/signup-code.ts:38`, `password-reset.ts:29`, `staff-invite.ts:27`, `setup-link.ts:41`). Consequences: (a) E2E mail to `@example.test` goes to a real provider; (b) codes and links are NOT readable in the outbox. The E2E env must leave `BREVO_API_KEY` unset. Then `createOutboxTransport(db, { keepLinksForLocalDevelopment: true })` stores full bodies (`brevo.ts:246`, `outbox.ts:12-20`).
4. The playbook (`docs/redesign-29-oct-2026/antigravity-e2e-audit-playbook.md`) names `apps/platform`, port 3198 and a broken migration 0194. `apps/platform` no longer exists (commit 90d76d5f). Reported in historical document; Unknown whether the migration history problem still exists. Verify by migrating an empty database first (CI does exactly this: `.github/workflows/ci.yml:138`).

## 3. Isolated database recipe (commands to run later, with the owner's go-ahead)

`loadLocalEnv()` never overrides variables already in the shell ("Variables already set in the environment win", `packages/db/src/local-env.ts:45`). So an isolated stack needs no edit to any `.env.local`. Do not run any of this against `brandbasket_platform_dev`.

```bash
# 0. from the repo root, in a fresh shell; print the target before every destructive step
createdb brandbasket_platform_v4b
psql -d brandbasket_platform_v4b -c 'select current_database()'
# 1. roles are cluster-wide and already exist from README setup; db:roles is idempotent
pnpm db:roles
# 2. export a COMPLETE isolated environment (owner + three roles + payload) in the shell only
export DATABASE_URL_OWNER='postgresql://<os-user>@localhost:5432/brandbasket_platform_v4b'
export DATABASE_URL='postgresql://bb_app:<pw>@localhost:5432/brandbasket_platform_v4b'
export DATABASE_URL_STAFF='postgresql://bb_staff:<pw>@localhost:5432/brandbasket_platform_v4b'
export DATABASE_URL_PUBLIC='postgresql://bb_public:<pw>@localhost:5432/brandbasket_platform_v4b'
# 3. unset anything that makes real calls
unset BREVO_API_KEY RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET
export BILLING_PROVIDER=fake EMAIL_CODE_BYPASS=true
export APP_ORIGIN=http://localhost:3197 ADMIN_ORIGIN=http://console.brandbasket.localhost:3199
# 4. migrate (db:migrate maps --target=dev to DATABASE_URL_OWNER, scripts/migrate.ts:8-11)
pnpm db:migrate
# 5. seed (refuses non-localhost and any database not in SEEDABLE_DATABASES, seed-v4-states.ts:269-270)
pnpm --filter @brandbasket/db db:seed:v4
# 6. run the apps (each in its own terminal; reuse a running one per the dev-server policy)
pnpm dev:customer ; pnpm dev:admin
```

Notes:
- `<pw>` values are in `apps/customer/.env.local`; copy them by hand, never print them. Payload (`DATABASE_URL_PAYLOAD`, `brandbasket_platform_payload`) is shared by both apps and not isolated by the above; blog scenarios write to it. Create a second Payload database and export `DATABASE_URL_PAYLOAD` only if blog scenarios run. Unknown whether `pnpm cms:migrate` accepts a second database without an env file edit.
- Integration tests are the only suites allowed to truncate; they refuse any database not ending `_test` (`packages/db/src/testing/index.ts:25-36, 82-90`). Never point `DATABASE_URL_TEST` at a non-test database.
- The seed appends credentials to `../../local-test-logins.txt` (two levels above the repo; `seed-v4-states.ts:1365`). `e2e/accounts.ts:16` reads passwords from there. Never print or copy that file.

## 4. Fixtures that exist (Verified in code, `seed-v4-states.ts`)

| Persona | Email pattern | State | Services |
|---|---|---|---|
| Om Sweets | `owner+om-sweets@example.test` | kickoff stage (from `db:seed:kickoff`, `e2e/accounts.ts:13`) | website |
| Patel Tiffin Kitchen | `owner+patel-tiffin-kitchen@example.test` | preview ready, one round used | website |
| Kulkarni Physio & Wellness | owner, `editor+kulkarni-physio-wellness@`, `viewer+kulkarni-physio-wellness@example.test` | live, a month in | website + social + paid-ads (all three, monitoring included) |
| Reddy Driving School | `owner+reddy-driving-school@` | lapsed | website + social |
| Chatterjee Photo Studio | `owner+chatterjee-photo-studio@` | last renewal failed, inside paid period | website |
| Iyer Filter Coffee House | `owner+iyer-filter-coffee-house@` | unpaid sign-up | website (chosen, unpaid) |
| Affiliate Rohan Mehta + pending affiliate | `affiliate+seed-v4@`, `affiliate+pending-seed-v4@example.test` | codes, earnings, one payout, one refunded month | n/a |
| Staff | `staff+seed-v4@example.test` | console role **support only** | n/a |

Fixture gaps (Verified: the SPECS list at `seed-v4-states.ts:140-205` is all INR and only these five):
- No social-only, no ads-only, no website+ads, no monitoring-only business.
- No USD business, no annual-interval business, no business with two memberships, no cancelled-then-reactivated beyond Reddy's one-way flow, no refunded payment on a customer business (only on affiliate member rows).
- No finance or admin staff. `pnpm staff:create --email ... --name ... --role finance|admin` is interactive: it uses a hidden password prompt (`packages/auth/scripts/create-staff.ts:8`) and queries the Have I Been Pwned range API (`breached-password.ts:3`, sends 5 hash characters only). An agent cannot answer the prompt. Either run it by hand once per role, or add a seed step that inserts `staff_members` rows the way `ensureStaff` does (`seed-v4-states.ts:309-311`).
- Add these as a new, separate seed (for example `seed-e2e-matrix.ts`) with the same guards. Do not extend the shared v4 seed in place.

Per-test isolated data (preferred over shared seeds): the E2E helpers write directly through `@brandbasket/db` on the staff connection (`e2e/support.ts`: `quoteAsStaff`, `postForApproval`, `ensureBookingLink`) and clean up. Use fresh sign-ups (`fillSignUp`) with `e2e+<unique>@example.test` addresses for money scenarios so that no shared persona is mutated.

## 5. Fake billing provider: what it can and cannot do

Verified in code (`packages/billing/src/fake-provider.ts`):
- Checkout opens `/billing/confirm?token=...` (first payment), `/billing/charges/confirm` (charges), `/restore-account/keep-plan` (keep plan). Token: v2 HMAC over subscription, business, amount, currency and expiry; 1 hour TTL (`FAKE_CHECKOUT_TOKEN_TTL_MS`, line 51). A pay action re-checks signature, expiry and business (`app/(pay)/billing/confirm/page.tsx:36-47`). Every simulated payment is a Visa 4242.
- It has a Pay and a Cancel button only. It cannot simulate decline, timeout, 3DS, a late or missing webhook, a duplicate webhook, a refund or a dispute.
- `recordChargeFromRazorpay` and `checkFirstPayments` return early unless the provider is razorpay (`first-payment-lookup.ts:15`, `first-payment-check.ts:36`). So "webhook-missed first payment" cannot be exercised on the fake provider.

How to cover the rest without real credentials (Inferred, to be built):
1. Webhook scenarios: POST signed synthetic events to `/api/webhooks/razorpay`. The signature is HMAC-SHA256 hex of the raw body with `RAZORPAY_WEBHOOK_SECRET` in header `x-razorpay-signature` (`apps/customer/src/app/api/webhooks/razorpay/route.ts:23-26`). Use a made-up local secret (32+ characters), set `BILLING_PROVIDER=razorpay` with dummy `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` strings. Event shapes: `subscription.charged`, `invoice.paid`, `order.paid`, `payment.failed` and eight status events (`packages/billing/src/razorpay-webhook.ts:30-173`). Fixtures live in the unit tests there.
2. Danger: status events call `getRazorpayProvider().fetchSubscriptionStatus` (`razorpay-webhook-handler.ts:109`), and the "missed payment" recovery calls Razorpay's API. With dummy keys these calls fail (a real network call to Razorpay with bad credentials). Stub the provider at the process boundary (an HTTP stub for `api.razorpay.com` or a test-only injection) before running those scenarios. Do not give the stack real test-mode keys unless the owner supplies Razorpay TEST keys and agrees (this audit used none).
3. Only the webhook path can be driven in isolation; opening checkout under `BILLING_PROVIDER=razorpay` also calls Razorpay to create subscriptions and orders.

## 6. Internal job endpoints (call by hand with a local token)

All are POST with `Authorization: Bearer <token>`; 503 when the token is unset, 401 when wrong (Verified: `check-first-payments/route.ts:18-20`, `erase-closed-accounts/route.ts:19-22`).

| Route | Token env | Safe to call on E2E DB | Notes |
|---|---|---|---|
| `/api/internal/check-first-payments` | `PAYMENT_RECONCILE_TOKEN` | Only with a Razorpay stub | no-op under fake |
| `/api/internal/erase-closed-accounts?dryRun=1&limit=N` | `ACCOUNT_ERASE_TOKEN` | Yes, `dryRun=1` first; real run deletes data permanently | erases only closures past `erase_after` |
| `/api/internal/start-builds-after-kickoff` | `KICKOFF_SYNC_TOKEN` | Yes | `KICKOFF_AUTO_START=off` limits to held calls |
| `/api/internal/sync-site-hosting` | `SITE_HOSTING_SYNC_TOKEN` | Dry run only; needs `VERCEL_API_TOKEN` to act, leave unset | pauses lapsed sites at Vercel |
| `/api/internal/roll-up-site-analytics`, `/retry-conversions` | `SITE_ANALYTICS_TOKEN` | Yes; retry-conversions sends to GA4 and Meta only when their keys are set, leave unset | |

## 7. Reading codes and links (OTP, reset, invite, setup)

- With `EMAIL_CODE_BYPASS=true` any 6 digits confirm a sign-up. This hides the real code path. For OTP scenarios keep bypass OFF and read the code from the outbox (console `/outbox`, or `email_messages.body_text`). Needs `BREVO_API_KEY` unset (section 2, item 3). Code: 10 minutes, 5 tries, rate limited (README, Reported; limits in `features/entry/server/account-email-code.ts`, Unknown exact numbers not re-read).
- On any https origin the outbox is not a mailbox: bodies of codes and links are withheld. A test mailbox (a Brevo-independent catcher such as MailHog or Mailpit on an SMTP relay) would need new transport code; none exists. Unknown whether the owner wants that.
- Existing specs bypass the mailbox by inserting tokens directly (`e2e/links.spec.ts` inserts `business_invites` and `setup_invites` rows with `hashInviteToken`). Keep that for expiry and replay scenarios.

## 8. What is needed for authorised browser inspection later

1. Owner approval to start two dev servers (or reuse running ones: check `lsof -nP -iTCP -sTCP:LISTEN | grep -E 'node|next'` and confirm cwd is this repo, per the dev server policy; never kill another project's port).
2. A named isolated database (section 3) and a shell-only env export, with `BREVO_API_KEY`, Razorpay keys, `GA4_*`, `META_*`, `VERCEL_API_TOKEN`, Google and Turnstile keys unset.
3. Seeded logins in `local-test-logins.txt` (the v4 seed writes it). Staff finance and admin accounts created by hand.
4. For Playwright: `E2E_BASE_URL` (default `http://localhost:3197`, `playwright.config.ts:9`), projects `desktop` 1440x900 and `mobile` 390x844 (`:28-41`). Admin has no Playwright project, config or spec. Add one with its own `baseURL` `http://console.brandbasket.localhost:3199`.
5. Rate limits are per address or IP and bite repeated sign-ins (`e2e/auth.setup.ts:12-30` waits 65 seconds on "Too many sign-in attempts"). Use saved storage state and unique addresses.
6. Tools: Playwright 1.64.1 and `@axe-core/playwright` 4.14.0 are already dependencies (`apps/customer/package.json:54-55`). Playwright is not run in CI (`.github/workflows/ci.yml` has no e2e step; Verified by reading the step list).
7. Screen reader checks (VoiceOver, NVDA) need a person; no tool in the repo drives them (also noted as not covered in `E2E-REVIEW-2.md`).


---

<!-- source: journey-qa/test-coverage-map.md -->

# Test coverage map

Commit c702f6c7 (development), 2026-11-14. Static inventory only. Nothing was executed, so no claim here says a test passes. Labels: Verified in code | Reported in historical document | Inferred | Unknown.

## 1. Inventory (Verified by `find` and `grep`)

| Area | Unit test files | Integration test files (`*.integration.test.ts`) | Playwright |
|---|---|---|---|
| apps/customer | 365 (`features` 197, `platform` 99, `app` 29, `lib` 12, `ui` 6, `components` 2, other folders such as `legacy-social` and `src` root 20; integration files excluded) | 6 | 8 spec files in `apps/customer/e2e/` |
| apps/admin | 212 (`lib` 139, `app` 50, `components` 23) | 0 | none (no config, no spec) |
| packages/db | 30 | 118 (24 test dormant directory and clinic code) | n/a |
| packages/shared | 185 | 19 | n/a |
| packages/auth | 5 | 3 | n/a |
| packages/billing | 20 | 0 | n/a |
| packages/email | 11 | 1 | n/a |
| packages/cms | 1 | 0 | n/a |
| Total | 829 | 147 | 8 |

829 + 147 = 976 test files, matching the figure in the brief. A rough regex for `it(`/`test(` calls finds about 10,092 test cases. The count includes dormant code (24 db integration files for directory, patients, practitioners, appointments) and duplicated `apps/customer/src/platform/lib/server/*` copies (section 5).

Playwright (`apps/customer/playwright.config.ts`): projects `setup`, `desktop` 1440x900 (all specs) and `mobile` 390x844 (only `sweep.spec.ts`). Test counts by spec (Verified, counted `test(` calls): `flows` 8, `keyboard` 17, `links` 14, `states` 7, `affiliate` 4, `blog-editor` 3, `flows-one-way` 2, `sweep` 1 generator over about 33 routes times 8 accounts times 2 sizes. Accounts: Om Sweets, Patel, Kulkarni owner, editor, viewer, Reddy, Chatterjee, Iyer (`e2e/accounts.ts`).

CI (`.github/workflows/ci.yml:34-80`) runs lint, typecheck, `pnpm -r test` and build; a second job migrates an empty database and runs `pnpm test:integration` (`:83-148`). Playwright is not in CI (Verified, no step). Playwright specs depend on a seeded `brandbasket_platform_v4` database and a password file outside the repo, so they cannot run in CI as written.

Every Playwright result in `E2E-REVIEW-2.md` (56 of 56 passing) is Reported in historical document. Not re-run here.

## 2. Coverage by journey and state machine

Legend: U unit, I integration (database), E Playwright. "Mock" means the unit test fakes the database or provider.

| # | Journey or state machine | U | I | E | Verdict |
|---|---|---|---|---|---|
| 1 | Sign-up and email code (OTP) | `features/entry` 27 files incl. `actions.test.ts`, `rules/account-entry.test.ts`, `rules/membership.test.ts`; `packages/auth` password rules | `packages/db/src/account-otps.integration.test.ts`, `packages/auth/src/create-account`, `email-account`, `create-auth` integration; `apps/customer/src/features/entry/server/mobile-sign-in.integration.test.ts` | `flows.spec.ts:43,48` sign-up (bypass on), `keyboard.spec.ts` | Covered below the browser. Gap: no E2E with the bypass off (real code read from outbox), no E2E for wrong code, expiry, 5-try lockout, per-IP limits. Bypass skips the match (`features/entry/server/env.ts:29-31`), so the existing E2E never exercises code comparison. |
| 2 | Checkout, fake provider | `features/checkout` 33 files | `payment-step`, `bundled-first-payment`, `first-month-offer`, `service-lines-payment`, `referral-checkout`, `reactivation-basket` (packages/shared) | `flows.spec.ts:48` sign up to paid | Well covered for amounts. No E2E for a viewer or editor reaching `/checkout`, a tampered or expired token (unit only: `fake-provider.test.ts`), a double press, or cancel then retry. |
| 3 | First-payment reconciliation (webhook missed) | `first-payment-check.test.ts`, `first-payment-lookup.test.ts`, `loader.test.ts` (all mock Razorpay) | none for `recordChargeFromRazorpay` or `recordFirstPaymentIfHeld`; `listUnpaidOfferCheckouts` 1 | none | Unit-only. The newest commit (c702f6c7) added the ordinary-first-charge path; its tests mock `findSubscriptionCharge`. No integration test proves the recovered payment activates the plan and issues one invoice. |
| 4 | Razorpay webhook handling and idempotency | `razorpay-webhook-handler.test.ts` 119 cases; `route.test.ts` 3 (signature); `packages/billing/src/razorpay-webhook.test.ts` | `razorpay-webhook-handler.integration.test.ts` 12 (renewal delivered twice at :217, amount mismatch flagged :402); `billing.integration.test.ts:343` same payment twice; `payment-invoicing.integration.test.ts:570` one invoice for a payment delivered twice | none | Sequential redelivery covered. Concurrent delivery (two requests at once, relying on `lockBusinessForBilling` and `payments_provider_id_idx`) has no test: no `Promise.all` in any webhook or billing integration file. Status events that call Razorpay (`:109`) are mock-only. |
| 5 | Entitlements per service combination | `lib/guard-rules.test.ts` (website, social, search, owner, lapsed); `features/website/rules/website.test.ts`; `packages/billing/src/status.test.ts`, `access.test.ts` | `packages/db/src/service-setup-bought.integration.test.ts` (paid-ads counts as social); `service-packages`, `service-lines` | `sweep.spec.ts` routes per seeded account only | Gap: the catalog is website, social, search; Paid Ads maps to social (`packages/db/src/queries/service-setup.ts:32`). A paid-ads-only and a social-only business see the same two pages (`app/(app)/ads/page.tsx:11`, `app/(app)/social/page.tsx:15`). No test names that. No fixture has social-only or ads-only. `/ads` is not in the sweep route list. |
| 6 | Invitations and roles (owner, editor, viewer) | `features/team` 4 files; `app/invite/[token]/page.test.tsx`; viewer refusal tests per action (blog `server/access.ts:17`, business, social, website) | `business-invites` covered by `customer-v4.integration.test.ts` (Unknown exact cases) and `rls.integration.test.ts` | `links.spec.ts` (accept right address, wrong address, expired, revoked, used, signed out), `flows.spec.ts:205` invite and revoke, `blog-editor.spec.ts` viewer refused | Good for tokens. Gap: invitee who signs up through `inviteSignUpHref` gets a personal business first and then sees only that business (section 4, F-1). Seeded editor and viewer are created without a business of their own, so the E2E never hits it. |
| 7 | Kickoff (call booking, build start) | `features/calls` 4; `kickoff-sync.test.ts`; `calcom-webhook.test.ts`; `start-builds-after-kickoff/route.test.ts` | `kickoff-build.integration.test.ts`, `setup-call-*`, `team-calls` | `flows.spec.ts:48` books kickoff on local stand-in scheduler | Covered. Real Cal.com or Calendly signature path is unit-only. |
| 8 | Preview and approval (project state machine) | `features/website/actions.test.ts`, `rules/*.test.ts`, `website-screen` states | `projects.integration.test.ts:142` (no double approve), `project-lifecycle`, `project-preview-versions`, `project-feedback` | `flows-one-way.spec.ts:17` approve preview | Covered. Gap: no E2E for "send changes" (feedback) or rounds used up, and no viewer or lapsed attempt. |
| 9 | Social review and approval | `features/social` 12 files | `deliverables.integration.test.ts`, `deliverable-queries` | `flows.spec.ts:137` approve post | Covered. `legacy-social/` actions (the posting service branch, `social/page.tsx:17`) have no test in this inventory beyond what I did not open (Unknown). |
| 10 | Ads (customer Paid Ads page, admin ad campaigns, ad credit) | `social-screens` states | `ad-campaigns`, `ad-funnel`, `ad-credit-due`, `directory-ads` (dormant) | `sweep.spec.ts` route `/social/ads` only (now a redirect to `/ads`, `app/(app)/social/ads/page.tsx`) | Thin. Admin `app/(protected)/ads/actions.ts` (12 actions, 4 money-gated) has no test file. |
| 11 | Billing, cancellation, reactivation, keep plan | `features/billing` 6; `keep-plan` copy in `features/checkout/server` | `keep-plan.integration.test.ts`, `add-on-ends`, `add-on-activation`, `reactivation-basket`, `added-service` | `flows.spec.ts:187` cancel service then keep, `flows-one-way.spec.ts:37` lapsed to reactivated | Covered for happy paths. Gap: payment failure UI (Chatterjee) appears only in the sweep; no assertion on dunning copy or on what a retry does. |
| 12 | Charges (change quotes, blog unlock, add-on charges) | `charges.test.ts` (two copies) | `charges.integration.test.ts`, `charges-razorpay-orders.integration.test.ts` | `flows.spec.ts:101` request to quote to pay | `startPaidChangeRequest` (`packages/db/src/queries/change-request-payment.ts:13`) has no direct test; reached through `recordChargePayment` only. |
| 13 | Tax invoicing and reissue | `tax-invoicing.test.ts`, `tax-invoice.test.ts`, `gst.test.ts` | `tax-invoicing`, `tax-invoice-reissue`, `payment-invoicing` | `flows.spec.ts:175` download invoice | Well covered. Unique indexes exist (`schema/tax-invoices.ts:144-146`). |
| 14 | Refunds | `refund-actions.test.ts`, `refund-form` | `staff-payments.integration.test.ts` (1 file references `markPaymentRefunded`) | none | The console only marks a payment refunded; it moves no money (`refund-actions.ts` doc comment, "owner decision 2"). No test that a refund changes access, issues a credit note or alerts the customer (code does none of these). |
| 15 | Account closure and erasure | `account-exit.test.ts`, `account-exit-rules.test.ts`, `account-erasure-run` (1 unit), `support-account-erasure.test.ts` | `account-closures.integration.test.ts` 18, `account-erasure.integration.test.ts` 20 | `flows.spec.ts` none; `sweep` opens `/settings/delete` only | Rows covered at db level. `app/api/internal/erase-closed-accounts/route.ts` has no test; `realErasureDeps` has no test. The CMS-then-rows ordering is untested (section 4, F-4). |
| 16 | Admin role guards (support, finance, admin) | 13 test files mention `staffCan` or `requireStaffCan`; `console-rail.test.ts`; most action files have a sibling test | none under `apps/admin` | none | Guards exist (39 `requireStaffCan("money")`, 16 `"oversight"`, 3 `"integrations"`, 1 `"buildRules"`; Verified by grep). 16 of 43 admin action files have no test, including pricing, coupons, affiliates, support replies, privacy requests, breaches, reports, ads (list in section 3). No test proves a support user is refused each money action. |
| 17 | Outbox and email | `packages/email` templates 11 files incl. `templates.test.ts:128` (token absent from redacted copy), `outbox.test.ts`, `brevo.test.ts` | `support-alert-outbox.integration.test.ts`, `emails.integration.test.ts`, `payment-emails.integration.test.ts` | none read email | Dual transport and redaction covered. Gap: no test that a Brevo failure leaves a `failed` outbox row and the user action still succeeds (`brevo.ts:171-175`, behaviour Verified, test not found); no test of admin resend. |
| 18 | Cross-tenant isolation (IDOR) | `app/invite`, `customer-tenant.test.ts` | `rls.integration.test.ts` 16, `customer-v4.integration.test.ts` 22, `service-setup-bought.integration.test.ts:117` | none | Database level only. No HTTP test of `/requests/[id]`, `/billing/charges/[id]`, `/media/[id]`, `/deliverable-images/[id]`, `/support-attachments/[id]`, `/billing/receipts?ids=`, blog ids (Payload, no RLS, `features/blog/server/access.ts:12-13`) with another business's ids. |
| 19 | Internal jobs | `check-first-payments`, `retry-conversions`, `start-builds-after-kickoff`, `sync-site-hosting` route tests | `site-analytics-pipeline.integration.test.ts` | none | No test for `erase-closed-accounts` or `roll-up-site-analytics` routes. |
| 20 | Accessibility | `tokens.contrast.test.ts` (WCAG ratios), `copy.test.ts` | none | `keyboard.spec.ts` 17 tests; `sweep.spec.ts:164` axe wcag2a, 2aa, 21aa, 22aa, serious and critical only | Customer app at 1440 and 390 only. No admin axe. No 768 or 375. Known axe issues are suppressed through `e2e/known-issues.ts` (E2E-23, 24, 25 axe rules). No screen reader run. |
| 21 | Responsive | none | none | `sweep` desktop 1440 and mobile 390 | 768 and 375 absent; admin absent (the console has a `phone-bar.tsx`, `apps/admin/CLAUDE.md`). |

## 3. Critical paths with no test (Verified by grep for the function or route)

- `apps/admin/app/(protected)/pricing/actions.ts`, `coupons/new/actions.ts`, `coupons/[codeId]/actions.ts`, `coupons/[codeId]/delete-actions.ts`, `affiliates/new/actions.ts`, `affiliates/[affiliateId]/actions.ts` (5 actions), `affiliates/[affiliateId]/codes/new/actions.ts`: all call `requireStaffCan("money")`, none has a test. Also untested: `support/[ticketId]/actions.ts` and `support/new/actions.ts` (they email customers), `privacy-requests/actions.ts`, `breaches/actions.ts`, `reports/actions.ts`, `ads/actions.ts`, `deals/actions.ts`, `geography/actions.ts`, `staff-invite/[token]/actions.ts`.
- `packages/db/src/queries/change-request-payment.ts` `startPaidChangeRequest` and `waiveChangeChargesForErasure`: no direct test (the latter is reached by `account-erasure.integration.test.ts:351`).
- `plan-upgrades.ts` (14 exports): no direct test except a mock mention of `completePlanUpgradeAtRenewal`. `openPlanUpgrade` has no caller outside `packages/db/src/index.ts:1109`, so the feature is dormant; `recordChargePayment` still calls `applyPaidPlanUpgrade` (`charges.ts:436`) with no test of that branch.
- `apps/customer/src/app/api/internal/erase-closed-accounts/route.ts` and `realErasureDeps` (`platform/lib/server/account-erasure.ts`).
- `retryConversions` (no unit or integration test names it; the route has `route.test.ts`).
- `app/api/leads`, `app/api/t`, `app/api/site/posts`, `app/api/site/posts/preview`, `app/api/privacy-requests/*` (4 routes), `app/api/error-reports`: no `*.test.ts` in the route directory (they may be covered through library tests; Inferred).
- Concurrent webhook delivery for the same payment id.
- Accepting an invite after signing up with the invited address (F-1 below).

## 4. Findings from the coverage review

- F-1 (Verified in code, outcome Inferred): invitee sign-up creates a personal business and the invite then adds a second membership; the app shows only the oldest. `features/entry/server/listing-account.ts:175` calls `createUnlistedAccountBusiness` on every sign-up (including a sign-up reached from an invite link, `app/invite/[token]/page.tsx` via `inviteSignUpHref`). `packages/db/src/queries/business-invites.ts:124` inserts the second membership. `packages/shared/src/lib/access.ts:33-41` picks `memberships[0]`, ordered by `created_at` (`queries/memberships.ts:25`). Expected result: the editor or viewer lands in their own empty unpaid business (`/checkout`), never in the inviter's. Seeded editor and viewer have no business of their own, so E2E misses it.
- F-2 (Verified): `/ads` and `/social` use the same `social` service flag, so ads-only and social-only customers see each other's pages. No test or fixture distinguishes them.
- F-3 (Verified): the timer job `check-first-payments` only asks about first-month offer checkouts (`first-payment-check.ts:38`, `listUnpaidOfferCheckouts`). An ordinary first charge whose webhook never arrives is recovered only when the owner reloads `/checkout` (`features/checkout/loader.ts:96-97`). The unit file `deploy/vps/systemd/brandbasket-first-payment-check.timer` is installed but "NOT enabled" by `install.sh:453`; production state Unknown.
- F-4 (Verified): in `runAccountErasure` the CMS content is deleted before the database rows are erased and re-checked under lock (`platform/lib/account-erasure-run.ts:72` then `:80`). If the closure is restored in that window, `eraseRows` returns `skipped` after the website content is already gone. Window is small; no test.
- F-5 (Verified): duplicate server modules. `apps/customer/src/platform/lib/server/{billing,charges,checkout,keep-plan,add-ons,onboarding,referrals,billing-details,...}.ts` and `features/checkout/server/*` are near copies (diff 31 lines for checkout, 86 for charges, 39 for keep-plan). The webhook imports the `platform` copies of `billing`, `charges` and `add-ons` (`razorpay-webhook-handler.ts:36-38`); the dashboard imports the `features/checkout/server` copies. `checkout.ts`, `keep-plan.ts` and `onboarding.ts` under `platform/` have no importer outside the `platform/` folder (grep). Their tests (`charges.test.ts` and `checkout.test.ts` exist twice) inflate the count and can pass while the live copy drifts.
- F-6 (Verified): E2E `e2e/support.ts:34` refuses any database but `brandbasket_platform_v4`, and specs need `local-test-logins.txt`; neither runs in CI.
- F-7 (Verified): no test asserts that a viewer is refused every write action; refusal tests exist per action but there is no matrix test (grep of actions without a `viewer` or `canWrite` check found `features/blog` via helper `blogWriter`, `features/checklist` via helper at `actions.ts:78-81`, and owner-only actions through `requireOwner`; no unguarded write found).

## 5. Tests that are only unit level for money

`first-payment-lookup`, `payment-failure` (`recordRazorpayPaymentFailure` 2 unit, 0 integration), `removeBundledAddOnsOf` (1 unit, 0 integration), `accrueAffiliateEarning` (1 unit, 0 integration), `acceptQuoteAction` (3 unit, 0 integration, E2E covers fake only), `inviteAction` (3 unit, 0 integration), `handleCalcomWebhook`, `syncSiteHosting`, `startBuildsAfterKickoff` (unit with mocks), the Razorpay SDK adapter (mock client; no timeout option is passed to `new Razorpay(...)`, `features/checkout/server/billing.ts:58`; SDK default timeout Unknown).


---

<!-- source: journey-qa/historical-claims-recheck.md -->

# Historical claims recheck

Commit c702f6c7 (development), 2026-11-14. Sources rechecked: `docs/customer-app-v4/E2E-REVIEW-2.md` (written 2026-11-03) and `docs/customer-app-v4/FINAL-PARITY-AUDIT.md` (2026-11-03, code `f4248a6f`). Method: read the current source and tests at the paths cited. Nothing was executed. "Fixed" means the code now does what the document asked; it does not mean the tests pass (not run).

Status words: Fixed | Still open | Partly | Superseded | Not re-verified. Labels: Verified in code | Reported in historical document | Inferred | Unknown.

Context that changes how to read both documents (Verified in code): `apps/platform` was deleted in commit 90d76d5f. `apps/` now holds only `admin` and `customer`. Every sentence in the parity audit that says a route "stays on platform" (`/api/site`, `/api/t`, `/api/leads`, `/api/pricing`, webhooks, jobs, `/content-media`) is superseded: those routes now live in `apps/customer/src/app/api/*` and `app/content-media` (`CLAUDE.md`, `apps/customer/CLAUDE.md`). The nginx split files named in the audit no longer exist as such; `deploy/vps/nginx/` holds `sites-brandbasket`, `sites-brandbasket-http`, `snippets-brandbasket-proxy.conf` and `brandbasket-next.conf.example`.

## 1. E2E-REVIEW-2.md

| Claim | Status | Evidence now |
|---|---|---|
| R2-01 Old addresses answered 307, fixed with `permanentRedirect` in 17 route files and the sign-up branch of login | Fixed | 39 route files under `apps/customer/src/app` call `permanentRedirect`; `app/(app)/details/page.tsx:7`; `app/(auth)/login/page.tsx:21` (`permanentRedirect(signUp)`), signed-in hop stays `redirect` at `:23` as stated; `app/old-paths.test.ts:170-176` asserts `permanentRedirect` and no `redirect` for the moved paths. A grep for plain `redirect(` in `(app)/details`, `oyechats`, `website/enquiries`, `content` found none. |
| R2-02 Focus moves to first invalid control after a refused submit (`ui/field.tsx`) | Fixed | `ui/field.tsx:33-42` (querySelector `[aria-invalid="true"]`, `first.focus()`, not when focus already on an invalid control); tests in `ui/form-controls.test.tsx` |
| R2-03 Cmd or Ctrl K opens search with focus on the input; `Dialog` takes `initialFocus` | Fixed | `ui/dialog.tsx:22,33`; `features/shell/components/command-search.tsx:57` |
| R2-04 A dropped save on Business profile shows "We could not save that. Try again." and keeps the change | Fixed | `features/business/components/use-section-form.ts:9` (`SAVE_FAILED`); test `business.test.tsx` present |
| R2-05 Post published a moment ago no longer reads "Scheduled" (clock floored at last save) | Fixed | `features/blog/components/post-editor.tsx:84-86` (`Math.max(useNow(), post.updatedAt)`); `post-editor.test.tsx` exists |
| R2-06 Author and category editors warn on unsaved changes | Fixed | `features/blog/components/taxonomy-editors.tsx:52-53` (`beforeunload`); `taxonomy-editors.test.tsx` exists |
| R2-07 Plan & billing shows an error when the payment result cannot be read | Fixed | `features/billing/components/billing-screens.tsx:160` (`PanelError ... what="the result of your payment"`); `features/billing/states.test.tsx:54` |
| O-1 Only Business profile has a loading skeleton | Still open, slightly changed | `find app -name loading.tsx`: `app/(app)/business/loading.tsx` and `app/affiliate/(portal)/loading.tsx`; no `Suspense` in `app`, `features`, `components`, `ui` |
| O-2 A dropped request on most forms shows the route error screen and loses typed text (33 client components, 3 handle it) | Still open (count Unknown) | No shared helper in `lib/action-result.ts`; now 58 client files reference actions and 25 contain `catch`; different counting method from the document, so the ratio is not comparable |
| O-3 Unsaved changes lost on in-app link | Still open | `beforeunload` only in `post-editor.tsx:190-191` and `taxonomy-editors.tsx:52-53`; no router interception |
| O-4 Home "Book a call" disappears silently when booking details fail | Still open | `features/home/components/home-screen.tsx:55` returns `null` when `!panels.booking.ok` |
| O-5 Help and calls shows two identical error banners | Not re-verified | |
| O-6 Panels left out when empty (Pages, Campaigns, Team waiting, Enquiries by day) | Not re-verified; owner decisions | |
| O-7 New copy "We could not load the result of your payment." | Fixed in code, copy approval Unknown | `states.test.tsx:54` asserts it; whether the owner approved is not recorded |
| D-01 Dev server 500 under parallel first compiles; needs a production build to close | Unknown | Not re-tested; no production build run here |
| "Left as designed": `/billing/pay` goes to `/checkout/pay` which 404s with the fake provider | Verified | fake provider has `/billing/confirm` pages (`fake-provider.ts:34-48`) |
| "Left as designed": dialogs other than search open with focus on Close | Not re-verified (still the default in `ui/dialog.tsx`) | affects screen reader and keyboard tests (scenarios section 10) |
| Test totals: 56 of 56 new spec tests pass; 221 unit files, 2595 tests | Reported in historical document, stale | Now 365 customer unit test files and 829 across the repo. Not re-run. |
| Spec still contains the E2E-01 workaround | Verified, stale | `e2e/flows.spec.ts:50-56` rewrites the sign-up POST body although the form now posts `phoneCountry` (`features/entry/components/sign-up-form.tsx:109`); the first test titled "E2E-01, fixed" (`:43-46`) only waits for the code field. Remove the rewrite and assert the full path |
| Not covered: 390 keyboard, screen reader, real phone, production build, accepting a setup link | Still open | scenarios sections 1, 8, 10 |

## 2. FINAL-PARITY-AUDIT.md section 3 (ranked gaps)

| Gap | Document said | Status | Evidence now |
|---|---|---|---|
| G-1 Quote "Accept and pay" dead-ends on Razorpay | `acceptQuoteAction` returned the pay path only | Fixed | `features/requests/actions.ts:173-189` now calls `startCustomerChargePayment` and returns the fake `redirect` url or the charge page for `razorpay`. The pay page still redirects to `/billing` if the order is missing (`app/(pay)/checkout/charges/[id]/page.tsx:57`), now guarded by the action creating it first. Razorpay path has no integration test with the action (`charges-razorpay-orders.integration.test.ts` covers the order); scenario K-04 |
| G-2 Email logo 404 | file only in `apps/platform/public/email` | Fixed | `apps/customer/public/email/email-logo.png` exists; `src/app/email-assets.test.ts` asserts it for `emailLogoUrl()`. Live URL not re-checked (no network) |
| G-3 No error visibility beyond Sentry | browser capture, native inbox, system-error email, Teams billing alerts not wired | Partly | Wired now: `instrumentation-client.ts:17` (`installBrowserErrorCapture("platform", ...)`) and `instrumentation.ts:10-11` (`startBillingErrorAlerts`). Still Sentry only: `lib/report.ts:11-17` (`reportError`), `instrumentation.ts:15-21` (`onRequestError`); no native inbox row, no system-error email. `NEXT_PUBLIC_SENTRY_DSN` is in `deploy/build.env.example:12` as a comment; whether the GitHub build sets it is Unknown |
| G-4 GA4 and Meta keys missing from customer env templates | none in `.env*.example` | Fixed in templates | `apps/customer/.env.example:121-128`, `.env.production.example:167-168`. VPS file Unknown |
| G-5 Start-up checks are four variables | only `serverEnv()` | Still open at runtime; mitigated at deploy | `apps/customer/src/lib/env.ts:7-14` (4 variables); `instrumentation.ts:6-9` does not call `assertRuntimeEnvironment` (only admin does, `apps/admin/instrumentation.ts:6-8`). Deploy runs `pnpm env:check` and `check_customer_env` (`deploy/vps/brandbasket-platform-release:157-176`), which only checks file present, bypass and fake-billing absent, secret length |
| G-6a `listing` accounts now get the full dashboard | guards have no `kind` check | Still open | `lib/guards.ts` (154 lines) has no `kind` test. Data check `select count(*) from businesses where kind='listing'` is not run (and sign-ups are created as kind `listing` first, `listing-account.ts:175`, so the count is not a defect signal by itself) |
| G-6b Paid-before-cutover customers have no "Send" path, `onboardingSubmittedAt` never set | | Still open | `features/checklist/actions.ts:44-48` ("There is no send step"); only reader is `calls.ts:97`, `timeline.ts:100` |
| G-6c Setup redemption no longer creates the Payload tenant | | Still open | `features/entry/server/setup.ts:207` "shortcut" comment |
| G-7 Owner-only billing (pay, codes, billing details, reactivate, service changes, closure, receipts) | | Still open, by design | `receipts/route.ts:9` (`requireOwner`); `features/checkout/actions.ts`, `billing/actions.ts` use `requireOwner` |
| G-8 Affiliate who is also a customer loses the rail link | | Still open | `grep -ril affiliate features/shell` finds nothing |
| G-9 Teams cards dropped for new request and reply | | Still open | `features/requests` has no Teams reference; Teams only in `features/website/alerts.ts` and `platform/lib/server/teams*.ts` |
| G-10 Terms and Privacy links missing on checkout | | Still open (Inferred from absence) | `app/(pay)/layout.tsx` carries Help (mailto) and Sign out; no `terms` or `privacy` href in `features/checkout/components` |
| G-11 `/robots.txt` and `/.well-known/security.txt` 404 | | Fixed | `app/robots.ts` (`disallow: "/"`); `app/.well-known/security.txt/route.ts`; `icon.png` exists in `app/` too |
| G-12 Smaller losses | list of eight | See rows below | |
| G-12a `?page=N` dropped in enquiries redirects | | Still open | `features/enquiries/components/enquiries-screen.tsx` reads `tab` only (`:122`); the page has no `page` param |
| G-12b Website page shows only newest preview version | | Partly | `features/website/loader.ts:121-125` now loads the version list, but `components/website-screen.tsx:100` uses `versions[0]` only |
| G-12c "Your changes", "Recent changes", "Change it yourself" cards dropped | | Still open | no such card text under `features/website` |
| G-12d Per-lead message count and last activity gone | | Not re-verified | |
| G-12e Blog has no sidebar link | | Still open (Inferred) | no `/website/blog` in `features/shell`; reachable as a Website tab |
| G-12f `/support-attachments` signed out redirects, closing account reads screenshots | | Still open | `app/support-attachments/[attachmentId]/route.ts:8-12` uses `requireSignedIn` |
| G-12g `/icon.png` 404 | | Fixed | `app/icon.png` present |
| G-12h `/invite/<token>` and `/affiliate/setup/<token>` can reach GTM and Clarity after consent | | Still open | `features/consent/consent.ts:61` `SECRET_PATHS` lists reset-password, setup, billing and checkout confirm only |
| G-12i nginx brute-force zone misses `/signup`, `/setup`, `/invite`, `/affiliate/setup` | | Still open | `deploy/vps/nginx/sites-brandbasket:77` regex `(login|join|forgot-password|reset-password|restore-account)` |
| G-12j `claim` and `notice` params | | Still open, by design | parity rows L-022, L-045, L-046 |
| G-12k Deep links lost at sign-in (both apps) | | Still open | `rules/account-entry.ts:34-40` only honours invite pages |

## 3. Appendix rows with a verdict other than KEPT or MOVED (each row below was checked in current source or is marked Not re-verified)

| Row | Document verdict | Status now | Evidence |
|---|---|---|---|
| R-019, M-026 receipts owner-only, signed-out redirect not 401 | PARTIAL | Still open | `app/billing/receipts/route.ts:2,9` |
| R-037, R-038, R-040 `?page=` lost | PARTIAL | Still open | G-12a |
| R-051, M-062, F-101 affiliate dual role | PARTIAL / MISSING | Still open | G-8 |
| R-056, R-057, F-037, F-038, I-028, I-029, I-100, L-052, M-070 dormant directory and listing pictures | DROPPED | Superseded by the stated decision (plan 61:116) | routes absent; dormant tables still tested (24 db integration files) |
| R-071 host gate dropped | DROPPED | Still true, low risk | `app/layout.tsx`, no host check |
| R-075, I-034, L-060 robots | MISSING | Fixed | G-11 |
| R-076, I-035, L-061 security.txt | MISSING | Fixed | G-11 |
| R-080, I-032, L-017 email logo | MISSING | Fixed | G-2 |
| M-020 | MISSING path | Fixed | G-1 |
| M-022 unapplied payment reasons | PARTIAL | Not re-verified | `features/checkout/server/payment-confirmation.ts:103` |
| M-023, F-025 Send step | DROPPED/PARTIAL | Still open | G-6b |
| M-040 role narrowing on money | PARTIAL | Still open, by design | G-7 |
| M-041 settings behind unpaid hold | PARTIAL | Still open | `app/(app)/layout.tsx:16` redirects every `(app)` route, settings included, to `/checkout` for an awaiting-first-payment account |
| M-051, I-089 Teams billing alerts | MISSING | Fixed | `instrumentation.ts:10-11` |
| M-052, F-094, F-095, F-096, I-087, L-089, L-091 native error inbox and system-error email | PARTIAL / MISSING | Still open | `lib/report.ts`, `instrumentation.ts:15-21`; boundary `app/route-error.tsx:17-25` not re-read |
| I-088, L-088 browser capture | MISSING | Fixed | `instrumentation-client.ts:17` |
| M-053, I-052, I-061, I-090, L-090 boot checks | PARTIAL | Still open | G-5 |
| M-059, L-002 Payload tenant at setup | PARTIAL | Still open | G-6c |
| M-069 legal links at payment | DROPPED | Still open | G-10 |
| F-006 feedback error handling | PARTIAL | Not re-verified | `features/website/actions.ts:120-127` maps three error types; others report and show `FAILED_MESSAGE` |
| F-008, F-009, F-010, F-011 website history cards | PARTIAL / DROPPED | Still open | G-12b, G-12c |
| F-034 closure clash list | PARTIAL | Not re-verified | |
| F-039 `kind=listing` no gate | DROPPED | Still open | G-6a |
| F-042, F-045 Teams cards on requests | PARTIAL | Still open | G-9 |
| F-052 attachments | PARTIAL | Still open | G-12f |
| F-059, F-061 booking link and booking code email | DROPPED | Not re-verified; no cited decision | |
| F-065 per-lead counts | PARTIAL | Not re-verified | |
| F-067 enquiry data writers | UNVERIFIED | Superseded | writers now in `apps/customer/src/app/api/site/events/route.ts`, `api/webhooks/oyechats/route.ts` (each has a route test) |
| F-086 Blog sidebar link | MISSING | Still open | G-12e |
| I-027 error reports route | PARTIAL | Still open (no route test: `app/api/error-reports` has none) | |
| I-066 old-only env vars | DROPPED | Not re-verified | |
| I-068 Sentry env | | Unknown | G-3 |
| I-093 split regex completeness | PARTIAL | Superseded | platform app removed, routes served by customer |
| I-101, I-102 add-ons confirm and advertise | DROPPED | Verified still no page | `fake-provider.ts` constant `FAKE_ADD_ON_CONFIRM_PATH="/add-ons/confirm"` has `app/add-ons` redirect only |
| L-022, L-045, L-046 | DROPPED | Still true | |
| L-062 `/icon.png` | PARTIAL | Fixed | `app/icon.png` |
| L-063 Cal.com or Calendly | UNVERIFIED | Unknown | no external call made |
| L-070 referral from URL | UNVERIFIED | Not re-verified | |
| L-075 consent on secret paths | PARTIAL | Still open | G-12h |
| L-079, L-080 GA4 and Meta | PARTIAL | Template fixed, VPS Unknown | G-4 |
| L-098 live nginx | UNVERIFIED | Unknown | needs SSH, not done |

## 4. KEPT and MOVED rows (about 250)

Not individually re-read. Method checks that support them (Verified): `app/old-paths.test.ts` asserts route files exist and that 28 moved paths use `permanentRedirect`; `E2E-REVIEW-2.md` Reported following 65 old paths over HTTP (not re-run). The document itself warns that `old-paths.test.ts` "only proves a route file exists" and never checks redirect targets or query strings (`FINAL-PARITY-AUDIT.md:21`); the current test file adds the permanence assertion but still no target assertion (Verified, lines 170-176). Sampled and found consistent: R-012 (`/billing/pay` permanent to `/checkout/pay`), R-019 owner guard, R-020 (`/services` to `/billing` with query), R-025 and R-026 (checklist redirects), R-075.

## 5. New contradictions found while rechecking

- Root `CLAUDE.md` says the customer app serves `/api/*` and the jobs; `README.md` still lists `apps/customer` as "dashboard, public APIs, webhooks, timer jobs" (consistent) but `docs/customer-app-v4/*` and the playbook still name `apps/platform` (stale).
- `apps/customer/src/features/checkout/server/first-payment-lookup.ts` comment (and `checkout.ts` copy) says "apps/platform records it within minutes". No platform app exists; only the first-month offer checkouts are recorded by timer (coverage map F-3).
- Root workspace `CLAUDE.md` lists the dashboard at `app.brandbasket.localhost:3198`; repo `CLAUDE.md` and `package.json` use `localhost:3197`; `apps/admin/.env.local` uses `:3198` (environment doc section 2).
- Pricing: workspace `CLAUDE.md` (2026-11-11) says no package discounts and no ad money; code agrees on discounts (`PACKAGE_OFFERS` empty, `packages.ts:32`) but `adCreditCentsFor` and `adCreditCentsAtCheckout` and the whole `ad-credit` console section (admin `app/(protected)/ad-credit`, `ad-credit-due.integration.test.ts`) are still present. With `offerFor(services)` returning nothing the credit evaluates to 0; confirm no code path still grants credit (Inferred). The "billed monthly" line also coexists with a 10% annual interval (`add-ons.ts:123`). Both are owner decisions to confirm.


---

<!-- source: journey-qa/money-and-data-risk-register.md -->

# Money and data risk register

Commit c702f6c7 (development), 2026-11-14. Static review of paths where a charge, an entitlement or a deletion could be wrong or applied twice. Nothing was executed; "guarded by test X" means test X exists and targets the behaviour, not that it passes. Severity: High (customer money or irreversible data), Medium, Low. Labels: Verified in code | Reported in historical document | Inferred | Unknown.

## 1. Payments and webhooks

| ID | Path | Failure mode | Existing guard (Verified) | Test that guards it | Gap and action | Sev | Conf |
|---|---|---|---|---|---|---|---|
| MR-01 | `apps/customer/src/app/api/webhooks/razorpay/route.ts:19-52`, `platform/lib/server/razorpay-webhook-handler.ts:70-560` | Same event delivered twice or in a burst records two payments or two invoices | Raw-body HMAC check (`:23-26`); `payments_provider_id_idx` unique on (provider, payment id) (`schema/billing.ts:430`); per-business advisory lock `lockBusinessForBilling` and a post-lock re-read (`handler:209-224`); `onConflictDoNothing` plus read-back (`queries/charges.ts:408-415`); `tax_invoices_payment_id_idx` unique | `razorpay-webhook-handler.integration.test.ts:217` (renewal twice), `billing.integration.test.ts:343`, `payment-invoicing.integration.test.ts:570` | No test delivers two copies concurrently (no `Promise.all` in webhook, billing or charges integration files). Add one. Webhook has no timestamp or replay window; safe only because every write is idempotent | Medium | High |
| MR-02 | `handler:225-290` | Money lands on a cancelled, replaced or already-superseded subscription: customer paid, buys nothing | Stored as unapplied payment with `attention_reason` (`checkout_replaced`, `already_paid`, `amount_mismatch`, ...), no activation, no receipt email; staff refund by hand (`schema/billing.ts:69-78`) | integration `:402` (amount flagged), `recordUnappliedPayment` (5 unit, 3 integration) | Refund is a manual process outside the product; no SLA, no customer notice. Assert the finance queue (`/payments` attention) in scenario W-05 | High | High |
| MR-03 | `features/checkout/loader.ts:96-97`, `server/first-payment-lookup.ts`, `handler:724-737` `recordChargeFromRazorpay` | Ordinary first payment taken, webhook late or refused, owner never returns: plan stays unpaid | Page-load recovery asks Razorpay and records through the webhook path, once per payment id (`:731`); returns the customer to the welcome page | `first-payment-lookup.test.ts`, `loader.test.ts` (mocks) | The 10-minute job covers only first-month offer checkouts (`first-payment-check.ts:38`). Extend the job to ordinary first charges or accept; no integration test of the recovered payment (also stored with `method: null`, so the card is not shown). Newest commit, least tested | High | High |
| MR-04 | `api/internal/check-first-payments/route.ts`, `deploy/vps/systemd/brandbasket-first-payment-check.timer` | Reconciliation never runs | Bearer `PAYMENT_RECONCILE_TOKEN` (503 if unset, 401 wrong); batch 100; `SETTLE_MS` 10 min | `route.test.ts`, `first-payment-check.test.ts`, `listUnpaidOfferCheckouts` integration 1 | `install.sh:453` installs the timer "NOT enabled" and the repo cannot show whether production enabled it. Unknown. Gate G-M6 | High | Medium |
| MR-05 | `handler:98-148` status events | Out-of-order `halted` after a renewal cuts off a paying customer | Status is re-read from Razorpay (`fetchSubscriptionStatus`), not taken from the event; a read failure throws so Razorpay redelivers | unit tests in `razorpay-webhook-handler.test.ts` (mock) | The Razorpay SDK is built with no timeout (`new Razorpay({ key_id, key_secret })`, `features/checkout/server/billing.ts:58`; `platform/lib/server/billing.ts:125`; admin `billing-provider.ts:60`). A hung call holds the webhook request and the checkout page render. Behaviour of the SDK default is Unknown | Medium | Medium |
| MR-06 | `handler:36-38` vs `features/checkout/server/*` | Two copies of billing code drift | The webhook imports `platform/lib/server/{billing,charges,add-ons}`; the dashboard imports `features/checkout/server/{billing,charges,...}` (diffs of 229, 86 and 345 lines for billing, charges, add-ons because each copy keeps only its own half; `checkout.ts`, `keep-plan.ts`, `onboarding.ts` differ by 31, 39 and 181 lines and the `platform` copies have no importer) | each copy has its own tests | Delete the dead `platform` copies of `checkout`, `keep-plan`, `onboarding` and their tests; add a test that both `basketDeps` agree. Dead code with passing tests gives false confidence | Medium | High |
| MR-07 | `packages/billing/src/select.ts:47-96`, `deploy/vps/brandbasket-platform-release:171-174` | Fake provider on a customer-reachable server hands out paid access free | `resolveBillingProviderName` throws on a real deployment unless `BRANDBASKET_ALLOW_FAKE_BILLING=1`; the release script refuses a file that sets it; unset `BILLING_PROVIDER` in production throws (`select.ts:66-72`) | `select.test.ts`, `fake-provider.test.ts` | Residual: an `http://` public origin counts as not real (`isRealDeployment` needs https), so a plain-http staging host on the internet would run the fake provider. Keep Cloudflare Access in front; never expose http | Medium | High |
| MR-08 | `app/(pay)/billing/confirm/page.tsx:36-47`, `packages/billing/src/fake-provider.ts` | Fake checkout token forged, replayed or used cross-business | HMAC over subscription, business, amount, currency, expiry (1 hour); owner-only page and action; every check repeated in the action | `fake-provider.test.ts` | Fake path only. Key is `BETTER_AUTH_SECRET`; same secret signs sessions, so a leak is already total | Low | High |
| MR-09 | `acceptQuoteAction` `features/requests/actions.ts:173-189`, `packages/db/src/queries/charges.ts:436-440` | Quote paid but work not started, or charge opened twice | `acceptChangeQuote` opens or reuses the charge; `startCustomerChargePayment` creates one Razorpay order per charge (`charges_provider_order_idx` unique, `schema/billing.ts:554`); work starts inside the payment transaction (`startPaidChangeRequest`) | `charges-razorpay-orders.integration.test.ts`, `actions.test.ts` (3), E2E `flows.spec.ts:101` (fake) | `startPaidChangeRequest` has no direct test. There is no unique index for one open `change_hours` charge per request (indexes exist only for blog unlock, plan upgrade, listing promotion, `schema/billing.ts:556-564`); idempotency rests on `acceptChangeQuote` logic (Unknown which test pins it) | Medium | Medium |
| MR-10 | `charges.ts:424-446` branches for `plan_upgrade`, `directory_ad`, `listing_promotion`, `press_release` | Dormant feature branches run on a payment | None needed if no caller opens those charges: `openPlanUpgrade` has no caller outside the db index export | none for `applyPaidPlanUpgrade` | Remove dead branches or test them. A charge of such a kind can only exist if inserted by staff tools or old rows | Low | Medium |

## 2. Entitlements, plans, add-ons

| ID | Path | Failure mode | Guard | Test | Gap | Sev | Conf |
|---|---|---|---|---|---|---|---|
| MR-11 | `packages/db/src/queries/service-setup.ts:32-48`, `app/(app)/ads/page.tsx:11`, `app/(app)/social/page.tsx:15` | Paid Ads is treated as Social: an ads-only buyer is offered the Social media page and a social-only buyer the Paid Ads page; the service model has no ads entitlement of its own | none; by design comment "Paid Ads Management is set up in the Social area" | `service-setup-bought.integration.test.ts:102`, `guard-rules.test.ts:90-99` | Owner to confirm. If social-only should not see Paid Ads, split the flag; add S-02 and S-03 scenarios | Medium | High |
| MR-12 | `packages/db/src/queries/service-setup.ts:43` | A `pending` bundled line counts as bought | status in (`pending`, `active`) and `end_requested_at` null; paid guard still requires a payment | integration `:91` | A pending add-on shows the service before it has been paid for if the business has paid for another line; assert in S-08 and P-08 | Low | Medium |
| MR-13 | `packages/shared/src/server/added-service.ts`, `basket-change.ts`, `add-on-activation.ts` | Add or drop a service gives wrong prorated charge, a second live subscription, or a free service | `subscriptions_one_live_per_business_idx`, `subscriptions_one_successor_idx` (`schema/billing.ts:250-253`); lock before reading; unapplied payment kept for staff when the add-on cannot open (`queries/charges.ts:450-458`) | `added-service`, `add-on-activation`, `add-on-ends`, `add-on-after-signup`, `reactivation-basket` integration; `basket-change.test.ts` | `removeBundledAddOnsOf` unit only (`handler:147,456`); concurrent add and cancel not tested | Medium | Medium |
| MR-14 | `handler:555,579` (`cancelAtProvider` calls), `packages/shared/src/server/provider-cancellation.ts:23-43` | Provider cancel fails after our records say cancelled: customer billed after cancelling | Never throws, logs `provider-cancel-failed`, which now raises a Teams System alert (`instrumentation.ts:10-11`) | `provider-cancellation` unit 2, integration 1 | No automatic retry or queue; staff must cancel by hand at Razorpay. A leftover fake subscription after switching providers can never be cancelled from the app (`:34-40`). Add a retry job or a staff action | High | High |
| MR-15 | `packages/shared/src/lib/billing/add-ons.ts:110-119` | Monitoring billed when it should be free (or the reverse) when a plan is dropped from three | `monitoringIncludedWith` rule; `servicesToList` | integration `razorpay-webhook-handler.integration.test.ts:455` and unit | Add S-07 browser scenario | Medium | Medium |
| MR-16 | `add-ons.ts:123`, `readBillingInterval` in `checkout/rules/membership.ts` | Annual interval at 10% off is priced or invoiced wrongly; conflicts with "billed monthly" in the workspace guide | `ANNUAL_DISCOUNT_BASIS_POINTS`; invoice code | unit `bundle`, `tax-invoice` | Owner confirm the interval is meant to be live; add P-09 | Medium | Medium |
| MR-17 | `packages/shared/src/lib/billing/packages.ts:32,147-157`, admin `ad-credit` | Ad credit still computed and shown though the owner removed ad money (2026-11-11) | `PACKAGE_OFFERS` is empty so `offerFor` should return nothing (Inferred) | `ad-credit-due.integration.test.ts`, `packages` unit | Confirm no path grants credit; remove the console section or label it | Medium | Medium |

## 3. Staff money actions

| ID | Path | Failure mode | Guard | Test | Gap | Sev | Conf |
|---|---|---|---|---|---|---|---|
| MR-18 | `apps/admin/app/(protected)/clients/[businessId]/billing/refund-actions.ts`, `packages/db/src/queries/staff-payments.ts:90-128` | Payment marked refunded when no money moved (or money refunded in Razorpay but not marked); refund has no effect on access; no credit note or email | `requireStaffCan("money")`; row lock (`.for("update")`), only `captured` payments, amount 1..payment; cancels owed affiliate earnings, reports paid ones; access-log entry | `refund-actions.test.ts`, `staff-payments.integration.test.ts` (1 file mentions it) | "Moves no money (owner decision 2)". No provider call, no reconciliation with Razorpay, no GST credit note (`invoice-reconciliation.ts:26` calls it out). Entitlement unchanged by design, confirm. A partial refund sets status `refunded` for the whole payment, so reports cannot tell partial from full except by `refunded_amount_cents` | High | High |
| MR-19 | `apps/admin/lib/server/billing-admin.ts:123-300` `recordManualFirstPayment`, `charges-admin.ts:73-112` `markClientChargePaid`, `waiveClientCharge`, `resolveFlaggedPayment` | Staff records a bank transfer twice or against the wrong business; a manual payment replaces a customer's open checkout | `lockBusinessForBilling`; charge must be `open` inside the lock; provider payment id `manual_charge_<uuid>` so the unique index does not stop a duplicate on its own; open checkout cancelled at the provider after commit | `billing-admin.test.ts`, `charges-admin.test.ts`, `invoices-admin.test.ts` | Doc comment says the caller must be an admin but the action capability is `money` (finance and admin; Verified 39 `requireStaffCan("money")` uses). Duplicate protection for `recordManualFirstPayment` rests on state checks, not a unique reference. Add a test for two staff recording the same transfer | Medium | Medium |
| MR-20 | admin `pricing/actions.ts`, `coupons/*`, `affiliates/*` actions | Price, coupon or payout changed by the wrong role, or silently | each calls `requireStaffCan("money")` | none (no test file for any of these 7 files) | Add role-refusal tests for support; add audit entries (`recordStaffAction`) check | High | High |
| MR-21 | `queries/affiliates.ts`, `shared/src/server/affiliate-accrual.ts` | Earning accrued twice or kept after refund; payout with tax withheld wrong | accrual keyed on payment; `markPaymentRefunded` cancels owed earnings | `affiliates.integration.test.ts`; `affiliate-accrual` 1 unit, 0 integration | Accrual outcome not covered at db level; a payout already paid for a refunded payment is only reported (`paidEarnings`), no clawback | Medium | Medium |
| MR-22 | `shared/src/server/tax-invoicing.ts`, `queries/tax-invoices.ts:31-43` | Invoice number gap or duplicate; wrong GST split; lock contention | atomic series row upsert held until the payment transaction commits (so a rolled-back invoice returns its number); unique indexes on payment, number, (prefix, year, serial) | `tax-invoicing`, `tax-invoice-reissue`, `payment-invoicing` integration | Long webhook transactions serialise all invoicing for the series; `isConnectionFailure` handling exists. Reissue after refund not modelled | Medium | Medium |

## 4. Data deletion and background jobs

| ID | Path | Failure mode | Guard | Test | Gap | Sev | Conf |
|---|---|---|---|---|---|---|---|
| MR-23 | `api/internal/erase-closed-accounts/route.ts`, `platform/lib/account-erasure-run.ts:62-97`, `packages/db/src/queries/account-erasure.ts:188-466` | Wrong account erased, or content deleted for an account that was restored | Bearer `ACCOUNT_ERASE_TOKEN`; 30-day grace; `findBlock` (staff account, other members, live subscription, not due) checked twice, the second under the closure row lock (`:262-300`); `dryRun`; `limit` 1..100; financial records kept | `account-erasure.integration.test.ts` 20, `account-closures.integration.test.ts` 18, one unit for the run | CMS website content is deleted before the locked re-check (`account-erasure-run.ts:72` then `:80`); a restore in between leaves a live account with its website content gone. Files and Vimeo videos are removed after the commit and failures are only reported. Route and `realErasureDeps` untested. Timer not enabled by the installer (`install.sh:449`); production state Unknown | High | High |
| MR-24 | `account-erasure.ts` header, `waiveChangeChargesForErasure` | Open charges of an erased account stay payable or erased accounts keep personal data in `email_messages` | open charges waived (`account-erasure.integration.test.ts:351`); `emailMessages` listed among erased tables | integration | Outbox rows addressed to the erased user: confirm erased or anonymised (Unknown); tax invoices keep name and address for 8 years by design | Medium | Medium |
| MR-25 | `sync-site-hosting` route, `shared/src/server/site-hosting.ts`, `packages/billing/src/site-status.ts` | A paying customer's website is paused, or a lapsed one never is | Bearer `SITE_HOSTING_SYNC_TOKEN`; `VERCEL_API_TOKEN` needed to act; dry run; timer installed not enabled (`install.sh:450`) | `site-status.test.ts`, `website-hosting.integration.test.ts`, `sync-site-hosting/route.test.ts` | Pause is derived from billing status; any billing misread (MR-05, MR-02) becomes an outage. Add a browser scenario that a failed-renewal customer inside `paidThroughAt` is not paused (P-05) | High | Medium |
| MR-26 | `start-builds-after-kickoff` route, `kickoff-sync.ts` | A build starts for the wrong project or twice | idempotent by design ("Safe to run as often as wanted", `kickoff-sync.ts:38`); `KICKOFF_AUTO_START` | `kickoff-sync.test.ts`, route test, `kickoff-build.integration.test.ts` | Run twice in J-02 | Low | Medium |
| MR-27 | `retry-conversions`, `features/conversions`, `platform/lib/conversions/*` | Duplicate or leaked conversion events to GA4 and Meta | retry route with `SITE_ANALYTICS_TOKEN`; keys optional | `conversions.test.ts` (7 files), `conversion-events.integration.test.ts` | `retryConversions` function itself is not named by any test; make sure no real keys are present in E2E | Low | Medium |
| MR-28 | `packages/email/src/brevo.ts:122-175` | Email sent twice or lost; user action fails because email failed | Brevo has no idempotency key, so a retry after a timed-out response can double-send (`brevo.ts:122` comment); failures are recorded as `failed` and never thrown (`:171-175`); one retry at 500 ms, timeout 10 s | `brevo.test.ts`, `outbox.test.ts` | Receipts and invite emails can duplicate on timeout; a `failed` row only notifies staff by looking at the Outbox. Redacted rows (`body_redacted`) can never be resent | Medium | High |
| MR-29 | `packages/email/src/brevo.ts:239-246` with local `.env.local` | E2E or dev mail goes to a real provider; E2E cannot read codes | with a Brevo key the dual transport sends and stores a redacted copy | `app-transport.test.ts` | `apps/customer/.env.local` and `apps/admin/.env.local` both have `BREVO_API_KEY` set (value not read). Any local run that reaches an email path may send mail. Unset in the E2E shell | High | High |
| MR-30 | `apps/admin/.env.local` `APP_ORIGIN` points to port 3198; customer is 3197 | Staff-sent links (setup, request replies) lead to a dead port locally; in production the same drift would break customer emails | `pnpm env:check` compares APP_ORIGIN between customer and admin files (`production-env-check.ts` `SHARED_EQUAL`) | `production-env-check.test.ts` (Unknown file name) | Local file only, but shows the check does not run for dev files | Low | High |

## 5. Data integrity, invitations, isolation

| ID | Path | Failure mode | Guard | Test | Gap | Sev | Conf |
|---|---|---|---|---|---|---|---|
| MR-31 | `features/entry/server/listing-account.ts:175`, `queries/business-invites.ts:124`, `shared/src/lib/access.ts:33-41` | Invited editor or viewer who signed up through the invite link never reaches the inviter's workspace; invite is consumed | invite accept is transactional and email-bound | `business-invites` (customer-v4 integration), `links.spec.ts` | Every sign-up makes a personal business; the app shows the oldest membership only. Seeded editor and viewer have no personal business, so tests miss it. Product bug candidate, not a money bug, but it also leaves an unpaid orphan business and lead per invitee (`recordLeadForSignup`) | High | Medium |
| MR-32 | `features/blog/server/access.ts:12-17`, Payload database | Cross-tenant blog read or write (no RLS in Payload) | viewer refusal and `requireOwnedBlogPost`/`requireOwnedTaxonomyDoc` in code only | `blog-editor.spec.ts` viewer, blog unit tests | No test with another business's post id (scenario X-07). The weakest layer for tenant isolation | High | Medium |
| MR-33 | `apps/admin/.../clients/[businessId]/*` | Console has no RLS: a query missing its business id leaks across clients | `apps/admin/CLAUDE.md` rule, `openClientTab` helper guards pages; access log | `client-page.test.ts` | Spot-checked pages use `openClientTab`; not every query re-read. Unknown for admin `lib/server/*` | Medium | Low |
| MR-34 | `apps/customer/src/app/api/leads`, `api/site/*`, `api/privacy-requests/*`, `api/error-reports` | Public endpoints accept bad input, are abused, or leak | tokens, origin checks, rate limits in library code | library unit tests; no route test in 9 directories (coverage map section 3) | Add route-level tests for auth and limits | Medium | Medium |
| MR-35 | admin and customer `app/*/actions.ts` without sibling tests (16 admin files) | A role guard is removed in a refactor without a failing test | each action calls a guard | none for those 16 | Add one parametrised test that calls every exported action as support and as an anonymous user and expects a redirect | High | High |

## 6. Top order of work

1. MR-03 and MR-04: decide and test ordinary first-payment recovery, confirm the timer is enabled.
2. MR-18: record the refund policy (access, credit note, email, partial refunds).
3. MR-23 and MR-14: reorder the erase steps or add a final lock check before CMS deletion; add a retry for failed provider cancels.
4. MR-31 and MR-32: prove or fix invitation landing and blog tenant isolation.
5. MR-20, MR-35: role-refusal tests for untested admin actions.
6. MR-01: one concurrent-delivery integration test.
7. MR-29: remove Brevo and Razorpay credentials from any shell used for E2E.


---

<!-- source: domain-architect/security-and-release-safety.md -->

# Security and release safety (domain-architect audit)

Commit c702f6c7. Labels: V Verified in code, H Reported in historical document, I Inferred, U Unknown. Risk kinds are kept apart: CODE-PATH risk (reachable in source) versus RUNTIME-FAILURE (observed). No runtime failure was observed or tested in this audit; no production config was read (only repo templates and unit files). Nothing here asserts what production env contains.

## 1. Authentication, cookies, separation (V)
- Customer and console are separate origins with host-only cookies; no `crossSubDomainCookies` and no `Domain=` cookie anywhere in `apps/` or `packages/` (grep clean). Better Auth is used only through server actions; no Better Auth HTTP route exists (no `app/api/auth`; lib/auth.ts:35-38 comment). Plugin `nextCookies` only (packages/auth/src/create-auth.ts:149).
- Session lifetime: 7 days customer (create-auth.ts:36), 12 hours staff (create-auth.ts:42; admin CLAUDE.md). Password reset revokes other sessions (create-auth.ts:113).
- Account creation is gated by `hasAccountCreationGrant` in a Better Auth `user.create.before` hook (create-auth.ts:136-146), so only server code with a grant can create users. V.
- Staff sign-in: `requireStaffAccess` checks session plus an active `staff_members` row; a customer session opens nothing (admin CLAUDE.md; shared/server/staff-access.ts). Cloudflare Access in front in production (H: CLAUDE.md and docs/deployment/cloudflare-access.md; U runtime).
- Customer lock on closing accounts: `getCustomerAccess` treats an open closure as no workspace (guards.ts:60-63).
- Absent file: both apps reference `proxy.ts` host routing in comments (api/content-media-uploads/route.ts:46-48, api/site/posts/preview/route.ts:7, api/leads/route.ts:5) but `proxy.ts` and `middleware.ts` do not exist in `apps/customer` or `apps/admin` (find; only `templates/client-site/proxy.ts`). So no global gate: every page, action and route must guard itself (matches CLAUDE.md rule). Routes that mention a Host check implement it inline (content-media-uploads:56-65, product-photos). I: security headers come only from `next.config.ts` (customer :25-48, admin :33-37) with `frame-ancestors 'none'` (security-headers.ts:211).
- Brute force: sign-in limiter module `packages/shared/src/lib/sign-in-limits.ts`; Turnstile helper for forms (admin login uses `checkHuman(formData,"staff_sign_in")`, admin/app/login/actions.ts:9). Per-IP rate keys use hashed IPs (`ip-key.ts`).

## 2. RBAC: staff roles (V)
Roles `support`, `finance`, `admin` (packages/shared/src/lib/access.ts:56-75). Capabilities: `money` = finance+admin; `oversight`, `integrations`, `buildRules` = admin only. Support has everything not listed.
Enforcement is per action file (`requireStaffCan(cap)` in admin/lib/server/staff-role.ts, refusal logged as `access.denied`). Audit of every `*actions*.ts` under apps/admin/app (grep): 
- money-gated: coupons, affiliates, pricing, refund, invoice, payments exports, ad price tables, and in clients/[businessId]/actions.ts: recordManualPayment, addCharge, markChargePaid, waiveCharge, resolvePaymentAttention, endAddOn, addClientAddOn, removeClientAddOn, retryAddOnProvider.
- oversight-gated: staff admin, privacy requests, breaches, client people (2 of 3).
- Only `requireStaffAccess` (any role incl. support): preview send, resend, mark live, launch checks, set website URL, hosting, timezone, modules, chatbots (add, status, operator key, remove), domain moves, kickoff mark held, change-request quotes (`sendQuoteAction` sets a price, request-actions.ts:65), deliverable add/move/delete, ad numbers and campaigns, reports (2 of 3 funcs), `cancelProjectAction` (website/actions.ts:54), `rotateSiteApiTokenAction` (actions.ts:~, rotates a customer's site token), marking leads, exports of leads CSV, media/deliverable image serving.
- Findings: (F1) `sendQuoteAction`/`startWithoutQuoteAction` set a customer-facing price and open a payable charge but require no money capability (I, behavioural; reads as policy choice, decision needed). (F2) `cancelProjectAction` by support (does not touch billing, project-staff.ts:41). (F3) `setChatbotOperatorKeyAction` handles a secret (operator key) at plain staff level; stored sealed? (`secret-seal.ts` exists in shared/server; U that the chatbot key uses it). (F4) support can export all leads (leads/export/route.ts:18). All CODE-PATH, not runtime failures.
- `ads/actions.ts`, `directory/actions.ts`, `deals/actions.ts`, `geography/actions.ts` (dormant directory) are reachable as server actions even though pages 404: `sellsDirectory` is read only in `directory-only.tsx` and one site-details component (grep), none of the action files check it. They still call `requireStaffAccess`. CODE-PATH risk of dormant writes by any staff.
- Compliance log: pages call `logStaffAccess` (best effort) through `loadClientPage` (lib/server/client-page.ts:26) and many list pages (56 files reference it); exports call `logStaffAccessOrThrow`. Gaps (V): `/media/[mediaId]`, `/deliverable-images/[id]`, `/directory-pictures/[id]`, `/staff-ad-pictures/[id]` serve customer files after only `getStaffAccess()` and do not log. Settings, pricing, coupons pages are unlogged (not customer data).

## 3. Tenant isolation: scopes, RLS, bypass (V)
- Three DB roles with three pools: `bb_app` (RLS), `bb_staff` (allow-all policies), `bb_public` (insert leads, rate limits, outbox), plus `bb_cms` (packages/db/src/roles.ts). The customer app builds each pool from different env URLs (`DATABASE_URL`, `DATABASE_URL_STAFF`, `DATABASE_URL_PUBLIC`, apps/customer/src/lib/db.ts:12-55). Isolation therefore depends on `DATABASE_URL` actually logging in as `bb_app`. No runtime assertion of `current_user` was found (grep `current_user`/`bb_app` in db client and instrumentation: none). `withTenantScope` only sets GUCs (`app.user_id`, `app.business_id`) and does NOT `SET ROLE`; it states it must be passed the app database (scope.ts:46-50, 96-106). CODE-PATH risk: if the customer app's `DATABASE_URL` pointed at a privileged role, every scoped query would silently be unscoped. Production env not inspected (U). A startup assertion `select current_user` would close this. (`withCustomerRole` does `set local role bb_app` for staff-pool transactions, scope.ts:67-84.)
- Staff pool in the customer app: 74 non-test files import `getStaffDb` (grep), of which about 40 sit in `src/platform/lib/server/` and `features/*/server`. `lib/db.ts:19-52` documents each sanctioned use. Sampled for IDOR (inputs from client): `removeMemberAction(userId)` scoped by session `businessId` and never owner (queries/memberships.ts:34-40); `revokeInviteAction` via RLS; `cancelCallAction(callId)` via `cancelTeamCallFor(customer,...)` (U body not read); `approveChangeAction`/`declineQuoteAction` via DB function checking business (change-requests.ts:314-322); `payChargeAction` charge id checked through RLS (checkout/actions.ts:131-145); upload routes take business from session. No unscoped id-from-request lookup found in the sample. This is a sample, not proof (U for remaining ~30 files).
- Public site routes resolve business from a per-business site token (`findTenantBySiteToken`) or public site key, then use the staff pool (site/events, site/info). The token, not the body, selects the tenant. V. CORS is `*` on these (site-cors.ts:9). A site token sent from browsers would be public (I); `rotateSiteApiTokenAction` exists for rotation.
- Admin pool: single staff connection, no RLS (admin CLAUDE.md). Every admin query must name business explicitly; `/api/client-brand-assets` takes `businessId` from the query string (staff, logged via `recordStaffAction`). Admin has no tenant scope concept, by design.
- Dual guard stacks (V): customer `@/lib/guards` (session -> memberships -> billing) coexists with legacy `@/platform/lib/server/customer-tenant`/`billing.ts` used by `api/content-media-uploads`, `api/product-photos`, `content-media/[mediaId]`. Billing helper copies are near-duplicated: `platform/lib/server/{checkout,charges,billing,keep-plan,add-ons,referrals,teams,payment-emails,onboarding-alert}.ts` versus `features/checkout/server/*` (diff of 15 to 352 lines each; checkout.ts 551 vs 556 lines, diff 51; discount-plans identical). The webhook uses the `platform/lib/server` set (razorpay-webhook-handler.ts:30-41), the checkout actions use the `features/checkout/server` set. Drift risk: a rule fixed in one stack (e.g. expected amount, rate limit constant `CHECKOUT_RATE_LIMIT` imported from ./checkout) not in the other. CODE-PATH risk, I for behavioural divergence.
- Server-action guards: all customer actions sampled call a guard from `@/lib/guards` as first line (billing, checkout, calls, team, website, settings). `lookupPincodeAction` needs only `requireCustomer`. `acceptInviteAction` needs `requireSignedIn`. Viewer checks are per action (`context.role === "viewer"`), not in the guard: a new write action that forgets the check lets viewers write (CODE-PATH, V pattern in website/actions.ts:43,85 and calls/actions.ts:97). RLS `viewer` role migration 0216 backs this at DB level for business data (schema businesses.ts:9; U for staff-pool writes, which bypass RLS: e.g. `approvePreviewAction` runs on staff DB and relies on the in-code viewer check).

## 4. Webhooks, callbacks, timer jobs (V)
- Razorpay: raw-body HMAC with `x-razorpay-signature`, 400 on bad, security-event counter, body hash stored (razorpay/route.ts:20-49). Handler locks business, re-reads under lock, matches amount frozen at checkout, records mismatches as attention payments; idempotent by (provider, payment id). Unknown subscription is logged and ignored with 200 (handler:101-110 region), which would lose a payment event for a subscription row we never recorded (provider call succeeded, local record failed: orphan is cancelled at provider, checkout.ts:241-251). Handler exceptions become 500 so Razorpay redelivers (I about Razorpay's retry schedule; external).
- Cal.com and OyeChats: HMAC (constant-time), unconfigured secret acts on nothing (calcom-webhook.ts:15). OyeChats business comes from stored bot record not body.
- Timer jobs: static bearer secrets, one per job, compared by SHA-256 digest with `timingSafeEqual`; unset secret yields 503 not open access. Calls come from the VPS itself (`brandbasket-*-job` scripts using `curl` on 127.0.0.1; deploy/vps/systemd). Installed state of these units and tokens on the VPS: U. Routes are also reachable on the public host (no proxy gate) so protection is only the token (V). Token reuse: `SITE_ANALYTICS_TOKEN` covers both rollup and retry-conversions, and `LEADS_API_TOKEN` is both the leads token and the helper's `LEADS_API_TOKEN_MIN_LENGTH` for the other tokens (V website-api-auth.ts, first-payment-check.ts:30).
- Razorpay browser callbacks (`/billing/pay/callback`, `/billing/charges/callback`, `/restore-account/keep-plan/callback`) are unauthenticated POST redirects that never trust the result and do not read signatures; destination chosen among allow-listed marks (V; no open redirect).
- Public intake: `/api/leads` token + honeypot + three rate limits; `/api/t` public key, host allow-list; `/api/privacy-requests/*` token (U whether live). No CAPTCHA on `/api/leads`; the website server is trusted to screen bots (comment lead-intake.ts) (V).

## 5. Rate limiting (V)
Postgres bucket table `rateLimitBuckets` through `consumeRateLimit(db, key, rule)` (packages/db/src/rate-limit.ts:44). Used by checkout (10/h), add-on checkout (10/h), join (5/h) and join-code (10/h), support (5 per 10 min, 20/day), uploads (hourly allowance), site events/hits, leads, error-reports, invite accept. No in-memory limiter. Fails closed? U for DB error path (callers differ: leads returns "failed"). Keys are hashed before storage (`bucketKeyFor`, rate-limit.ts, V), so raw emails are not stored in `rate_limit_buckets`. Each hit does an upsert and a delete, so a hot key serialises (V). The table is `rateLimitBuckets` (schema/rate-limits.ts:4).

## 6. Payment lifecycle and reconciliation (V/I)
See state-machines.md sections 5 and 6. Safety properties confirmed: amount frozen at checkout and compared; business-level advisory row lock; unique provider payment id; unapplied money recorded and shown as "payment under review"; staff refund is bookkeeping only (no provider call, refund-actions.ts:10). Gaps: (G1) no timer for ordinary first charge (offer-only reconciliation, first-payment-check.ts:38); (G2) no GST credit note on refund; (G3) webhook bodies not stored so lost events cannot be replayed locally; (G4) `authenticated` -> `active` before payment (relies on paid_through_at for access, access.ts:29); (G5) manual payments carry reference and staff id but no maker-checker; same staff can record and mark applied (resolvePaymentAttention is money-gated but single-person) (I).

## 7. Outbox and email (V)
`email_messages` is a log, not a queue; send is inline through `createAppEmailTransport` (Brevo) else outbox only; failed rows are retried manually (Deliveries page). Password reset and OTP emails are written through the insert-only `bb_public` role (lib/auth.ts:19-23). Redacted bodies keep sign-in links out of the outbox (`outboxCopy.linkWithheld`, outbox.ts:19-25). Risk: transient Brevo failure on OTP or receipt has no automatic retry (V by absence); receipts can be reissued (`tax-invoice-reissue.ts` exists).

## 8. Audit logging (V)
Staff: `staff_access_log` (DPDP) plus `activity` via `recordStaffAction` for writes. Customer: no per-action audit table beyond domain rows (activity events written by staff, security events counter `noteSecurityEvent` for bad signatures and sign-ins). Webhook and alert outcomes in `webhook_events` (90-day retention). The customer's own export of enquiries and privacy export are not logged (V).

## 9. Release and rollback (V code, H runbook)
- CI (`.github/workflows/ci.yml`) lint, typecheck, unit tests, build; separate integration job with Postgres, roles, migrations (CLAUDE.md; file not opened here for steps, I). Deploy (`.github/workflows/deploy.yml`) runs on `workflow_run` success for `main` with an environment gate (deploy.yml:13-34).
- VPS release script: migrations run before any restart; health check is `GET /login` on each unit (brandbasket-platform-release:48-49, 99-102); on failure it switches the symlink back to the previous release (:200-211). "Switching a symlink back does not undo migrations: every migration must keep working with the code before it" (release script :33-34; docs/deployment/brandbasket-vps.md:264). Services migration 0184 is forward-only (H).
- Weaknesses: health path `/login` proves rendering, not DB or Razorpay (I; whether /login queries the DB is U). Customer and admin have no health route (script comment :48). Autodeploy and CI timers are paused while GitHub deploy is used (CLAUDE.md H; unit files exist in deploy/vps/systemd so they could be re-enabled, I). 224 migrations (packages/db/migrations) with a migration-journal test (`migration-journal.test.ts`).
- Backups: nightly backup 02:15 UTC and weekly restore test (timers in deploy/vps/systemd); outcomes U.
- Failure notification: `10-notify-failure.conf` drop-in emails the team when a timer service fails (V unit present; U installed).

## 10. Other code-path risks worth tracking
1. Entitlement leak: `social` guard open to Paid Ads buyers (services doc).
2. `content-media/[mediaId]` accepts a staff session on the customer host: harmless if cookies are host-only; it also means one route has two principals (V).
3. Customer export routes (`/enquiries/export`, `/reports/[month]/pdf`) allow lapsed customers (`requirePaid()` = ever paid) by design (CLAUDE: lapsed keeps read access, guard-rules.ts:54).
4. Uploads: images only, size and decode checks in shared `media-upload`; JPEG-only for posting service picture route (`looksLikeJpeg`).
5. Dormant public API: `/api/product-photos`, `/api/privacy-requests/contribution*` and `/api/site/info` booking fields still serve clinic or directory features (dormant-code.md).


---

<!-- source: admin-operations/plan-status-recheck.md -->

# Plan status recheck: `docs/redesign-29-oct-2026/admin-console-plan-status.md`

Re-verified against source at c702f6c7 (development). Labels: Verified in code | Reported in historical document | Inferred | Unknown. Paths relative to `brandbasket-platform/`. The status document is dated 29 October 2026 and names branch `plan-all`; the audited tree is a later `development`. The implementation plan itself (`admin-console-implementation-plan.md`) refers to `apps/platform`, which no longer exists (commit 90d76d5f removed it); the customer app is `apps/customer`.

## A. "Still not built" list

| # | Item in the status document | Verdict | Evidence |
|---|---|---|---|
| 1 | Replacing the kickoff timer for good (switch exists, default on) | Still open, owner decision | `KICKOFF_AUTO_START` default "on" when unset (`apps/customer/src/platform/lib/server/env.ts:128-134`); fallback 24h (`packages/db/src/queries/kickoff-build.ts:14`); timer enabled by install only when the release dir exists (`deploy/vps/install.sh:447`). Whether production has it set is Unknown |
| 2 | Automatic deployment verification | Still open | `site-check.ts` checks DNS, a private-address block list and an HTTPS fetch only (`apps/admin/lib/server/site-check.ts:1-30`); the eight manual launch checks still gate Mark live (`packages/db/src/queries/project-launch-checks.ts:6-15`) |
| 3 | Monthly Social and SEO commitments not data-backed | Still open | catalogue states none: `social-media` line says "up to 4 platforms" but lists 3 platforms (`packages/shared/src/lib/billing/add-ons.ts:58-66`); the customer's "12 of 14 posts out" is derived from planned posts (`apps/customer/src/features/social/rules.ts:139`); no code enforces a count. Local SEO + AEO is no longer sold and its branches are unreachable (`service-setup.ts:29-31`) |
| 4a | Payment lapse policy | Still open | `billingNeedsAttention` is "Display only; it never moves a stage" (`apps/admin/lib/billing-attention.ts:5-14`); hosting pause timer installed but not enabled (`deploy/vps/install.sh:450`); no lapse list in Today or rail |
| 4b | What counts as an extra revision round | Partly: a counter, notice and manual grant exist; the rule is not defined | `isPastIncludedRounds` notice (`website/page.tsx:105,138-142`), `grantRoundAction` any staff (`website/actions.ts:73-79`), default rounds editable by admin (`settings/actions.ts:82`) |
| 4c | Who may edit customer notes and deadlines | Still open: any staff | `planLaunchAction` and `grantRoundAction` use `requireStaffAccess` only (`website/actions.ts:73-91`) |
| 5 | Finance and system page restyle | Unknown | visual only; not assessed in this read-only audit |
| 6 | List pages that read customer data without writing an access log | Fixed (list pages now log) | Today `today.view` (`page.tsx:25`), clients (`clients/page.tsx:66`), leads (`leads/page.tsx:19`), calls (`calls/page.tsx:56`), projects (`projects/page.tsx:61`), support (`support/page.tsx:35`), outbox (`outbox/page.tsx:8`), affiliates (`affiliates/page.tsx:51`), coupons (`coupons/page.tsx:37`), ad credit (`ad-credit/page.tsx:21`); commit `ed40ec29` "Log staff access to customer list pages". Still unlogged: `/support/errors*`, `/ad-results`, `/pricing`, `/settings`, `/leads/new`. Also 16 written actions are missing from `STAFF_ACCESS_ACTIONS` so the Compliance filter cannot select them |
| 7 | Access log for finance | Still open | `console-rail.ts:93-95` (`needs: "oversight"` on Staff and Compliance); `access.ts:64` |
| 8 | Ad credit has no role gate | Still open, and now also dormant | `ad-credit/page.tsx:20` uses `requireStaffAccess`; `console-rail.ts:85` has no `needs`; `PACKAGE_OFFERS = []` (`packages/shared/src/lib/billing/packages.ts:32`) |
| 9 | Browser E2E automation and a console feature flag | Still open | no `e2e` script in `apps/admin/package.json`; the customer app has Playwright (`apps/customer/package.json:13`, `apps/customer/e2e/*`); no console flag found |
| 10 | Production data rehearsal | Unknown | no production access; not in scope |
| 11 | Customer review history per preview version | Still open | preview versions carry `version`, `previewUrl`, `sentAt`, `sentByStaffId` only (`packages/db/src/queries/project-preview-versions.ts:53-61`); feedback is listed per round (`website/page.tsx:81-82`), with no version link |

## B. "Things a reviewer should know"

| Statement | Verdict | Evidence |
|---|---|---|
| `setup_call_outcomes` notes never written by the UI | Still true | `recordKickoffOutcome(..., note: null)` (`calls/kickoff-actions.ts:57`, `kickoff-complete.ts:41-49`) |
| Free address needs `CLIENT_SITE_BASE_DOMAIN` for the admin app | Still true | `website/page.tsx:99,217,231` |
| Eight-column board scrolls sideways, not a phone layout | Still true | `projects/page.tsx:104` |
| Shared dev and test DB broken at migration 0194 | Unknown | not inspected |

## C. "Built" claims spot-checked

| Claim | Verdict | Evidence |
|---|---|---|
| Status decides next steps, not `onboardingSubmittedAt` | Fixed | `client-next-step.ts:14-18` |
| Launch reads owner and domain before writing | Fixed | `markLiveAction` maps `no-owner` and `no-domain` before commit (`actions.ts:244-264`) |
| Eight manual launch checks gate Mark live | Built | `project-launch-checks.ts:6-15`; `ProjectLaunchChecksMissingError` `actions.ts:255` |
| Resend preview and launch emails with email failure as an outcome | Built | `actions.ts:230-241,281-295` |
| Eight board columns and Needs action, Late, On hold, All | Built | `project-board.ts:31-40,102-127` |
| Today groups Overdue, Due today, Waiting; failed lists show a notice | Built | `today-queue.ts:159-195`; `page.tsx:46-53` |
| Kickoff wrap-up with three no-show buttons | Built | `calls/kickoff-wrap-up.tsx:20-24` |
| Clients table shows build stage and Build filter | Built | `clients/page.tsx:132-143,187` |
| Delivery tab renamed Website with Customer sees lines | Renamed; the "Customer sees" lines are only for website stages | `client-tabs.ts:15-21`; `delivery-tab.tsx` |
| Services panel: build controls only for website customers | Built | `website/page.tsx:208-209` |

## D. New or changed since the status document
* The client page now has five tabs (Overview, Website, Plan and billing, Messages, People); the plan describes the earlier shape. Verified in code (`client-tabs.ts:15-21`).
* The console menu is eight grouped items (`console-rail.ts`, commit `019eaf7d`). The plan and status document do not describe it.
* Directory, Ads, Deals and Geography are switched off through `DirectoryOnly` (`directory-only.tsx`).
* A staff invite and password-reset flow exists (`app/staff-invite`, `app/forgot-password`) though `apps/admin/CLAUDE.md` still says accounts come only from `staff:create`.
* `docs/STAFF-ACCESS.md:36` lists Affiliates among the switched-off sections; they are live and finance-gated.
* Cloudflare Access: `apps/admin/CLAUDE.md` says "behind Cloudflare Access"; `docs/deployment/cloudflare-access.md:3` says "Status: not done". Unknown which is true now.

