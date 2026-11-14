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
