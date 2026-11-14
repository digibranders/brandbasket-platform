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
