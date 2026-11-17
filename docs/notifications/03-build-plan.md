# Build plan (Phase 3)

Owner go-ahead: "lets build them", 2026-11-17, after seeing the mock of every notification. The matrix in `02-target-matrix.md` and its four recorded answers are the spec. Draft copy in the matrix is used as written, and every string is listed in each package report so the owner can change it. New strings live in one module per channel (bell, email, push, teams), so a wording change is one edit.

Rules for every package: `docs/implementation/AGENT-RULES.md`; tests first; no real email, push or payments in development (fake providers and the outbox); never edit `.env*`, never print secrets; no em or en dashes in any text; PRs into `development`, never `main`, no deploy. Release 2 is merged, so customer and console screens are no longer reserved, but re-read a file before editing it and rebase often.

## Order and branches

Stacked, because every package after N1 needs its schema and entry point. Each branch starts from the previous one, and each PR says what it is stacked on. The owner merges N1 first, then the rest retarget `development`.

| Pkg | Branch | Scope | Needs |
|---|---|---|---|
| N1 | `notify/01-foundation` | All new schema, one server entry point `notify()`, stored bell, preferences | none |
| N2 | `notify/02-kickoff` | Decision D33 end to end | N1 |
| N3 | `notify/03-email-reliability` | Email queue, retries, bounces, suppression, unsubscribe | N1 |
| N4 | `notify/04-push` | Web push in both apps | N1 |
| N5 | `notify/05-events` | Wire money, website, requests, account events to `notify()` | N1, N3, N4 |
| N6 | `notify/06-webhooks-ops` | Replay window, event ids, Cal.com and OyeChats fixes, Teams retry, timers, failure alerts | N1 |
| N7 | `notify/07-social-receiver` | social-auto receiver and customer notices | N1, blocked on payload and signing details |

Only N1 adds migrations (next number 0229). Later packages that find they need a column ask N1's owner or add a clearly separate migration after N1 merges.

## N1 Foundation

Schema (one migration, with RLS policies, role grants, and entries in `account-erasure.ts` and `account-export.ts`):
1. `notifications`: id, business id (nullable for staff), recipient user id (nullable for staff), audience (`customer` or `staff`), event key, title, body, link, created at, read at, dedupe key (unique with audience and recipient). Retention: kept 90 days, purged by the nightly maintenance.
2. `notification_preferences`: add `push` and `bell` booleans next to `email`; topics add `calls` and `social`; update the check constraint. Mandatory events are defined in code and ignore preferences.
3. `push_subscriptions`: id, audience, user id, endpoint (unique), p256dh, auth, user agent, created at, last success at, revoked at. One row per browser.
4. `kickoff_prompt_state`: per booked call, first notified at, last popup shown at, answered at (server side dismissal and the 15 minute repeat).
5. Email queue columns on `email_messages`: status `pending` and `bounced`, `next_attempt_at`, `attempts` limit; `email_suppressions` (address, reason, created at).
6. `webhook_events`: event id and received at for dedupe, with a unique index per source and event id; replay window needs no table.

Server entry point `notify()` in `packages/shared/src/server/notify.ts`:
`notify({ event, audience, dedupeKey, data })`. An event registry (typed, in `packages/shared/src/lib/notification-events.ts`) maps each event key to its topic, whether it is mandatory, which channels it uses and its copy builders. `notify()` writes the bell row, queues the email, sends push through the provider, checks preferences per person (mandatory events skip the check, optional events fail closed on a lookup error), dedupes by key, and never throws into the caller (it records the failure). Every other package only calls `notify()`.

Customer bell: reads stored rows plus the existing live sources (quotes, waiting, replies) so nothing regresses. Refreshes on window focus and every 60 seconds while visible, using the existing server loader, no websocket. Mark read per row.
Console: bell in the console shell reading staff rows, same component pattern.

Settings screen: add Bell, Email and Push columns to the existing notification table. Mandatory events are listed as "Always sent" and cannot be switched off. Remove the dead topics `product_news` and `new_enquiry` from the customer table only if the owner agrees; otherwise leave them and say so in the report.

Tests: unit tests for the registry and `notify()` (preferences, mandatory, dedupe, failure isolation); integration tests for RLS, erasure and export of the new tables, and the purge.

## N2 Kickoff (D33)

Remount `KickoffPromptPopup` in `apps/admin/app/(protected)/layout.tsx` using server state: shows every pending call, answered state saved, repeats every 15 minutes until answered (from `kickoff_prompt_state`, not browser memory). The Today card and Today row open the same prompt; remove the duplicate row. Call end event from the existing 15 minute sweep (`start-builds-after-kickoff`): once per call, staff bell, push and email, plus one push if still open after 2 hours. Customer notices from `notify()`: booked, one hour before (new job in the same sweep), call completed, they did not join, reschedule, fallback started ("We started your website"). Staff keep "Started without call confirmation". Share the "within 24 hours" sentence in one string. Console UI follows `apps/admin/DESIGN.md`.

## N3 Email reliability

Do not make the transport throw: receipts are sent from the Razorpay webhook handler and a Brevo outage must not turn into webhook 500s. Instead write a `pending` row and drain it on the existing 15 minute timer with backoff (3 attempts, then `failed` and a Today row). Make `hasEmailContaining` ignore `failed` rows. Fix the callers that assume a throw: team invite, preview and launch emails, sign-up reminder marker. Add a Brevo events webhook for bounce, complaint and unsubscribe writing `email_suppressions`, skip suppressed addresses for optional mail, add `List-Unsubscribe` to optional mail only. Tests with a fake transport.

## N4 Push

Provider interface with a fake default (like billing). Real provider uses the `web-push` library and VAPID variables named in the env check (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, with the public key also exposed to the browser). Service worker and manifest in both apps, a 512 and a maskable icon, served at paths that pass the console proxy and the customer middleware (verify with a test of the matcher). Opt-in: a switch in Settings per app, plus one prompt after the first payment in the customer app; the browser permission is requested only after the click. Delivery rules: no private detail in the body, quiet hours 21:00 to 08:00 India time for customers except payment failed, collapse repeats by tag, revoke a subscription on 404 or 410.

## N5 Events

Wire each row of the matrix sections B, C, D and F to `notify()` and add the missing copy: money, website, requests and support, account. Keep existing email templates; add the new ones (renewal, lapse, unmatched payment, started, approval received, closure). Schedule the first charge reminder. Staff Today rows for failed payment, lapse and unapplied payment already exist where noted in the inventory.

## N6 Webhooks and ops

Replay window (5 minutes where the sender signs a timestamp) and event id dedupe for Razorpay, Cal.com and OyeChats; OyeChats Teams card only for a new lead; Cal.com bookings, moves and cancellations alert staff; Teams: one automatic retry, a dedupe key, a Today row when no address is saved, and correct the destination texts; error reports to the `system` destination. Ops: install and enable the sign-up reminder timer in `deploy/vps/install.sh`, add `erase` and `signup-reminder` to the failure alerts, add the missing token to `.env.production.example` (names only), and fix the Razorpay event list in the deployment doc. Do not edit any `.env` file.

## N7 Social receiver

Blocked. Needs social-auto's real event payloads and signing scheme; the plan in `WORK-PACKAGES.md` WP-15a is unverified. Read the social-auto repo read only, or get the spec from the owner, before building.

## Review

Each package ends with a report in `docs/implementation/reports/NOTIFY-NN.md` (what changed, tests, the full list of new customer and staff strings, open questions). The lead reads each diff before its PR opens.
