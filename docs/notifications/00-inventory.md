# Notifications inventory (Phase 1, read only)

Snapshot of `development` at commit 0edb91ad, 2026-11-16. Built from code reads and greps, no code run. Items marked "not verified" were not opened in full. Paths are relative to the repo root.

## 1. Email

### 1.1 Mechanics

| Aspect | Today |
|---|---|
| Storage | `email_messages` (`packages/db/src/schema/emails.ts`) is a log written after a send. It is not a queue. Statuses: `sent`, `local_only`, `failed`. No `pending`. |
| Sending | Inline in the request, or fire and forget. About eight transport factories all reach `createAppEmailTransport` (`packages/email/src/brevo.ts`). |
| Retries | Inside one request only: 2 attempts, 500 ms apart, 10 s timeout, no retry on 4xx except 429. No worker drains the table. |
| Manual resend | Console Deliveries page, last 24 h, 25 rows, redacted rows refused. |
| Brevo failure | The transport logs, writes a `failed` row and returns normally, so callers do not see an error. |
| Without `BREVO_API_KEY` | Real deployment throws `EmailConfigurationError`. Local writes `local_only` rows. |
| Bounces, complaints, unsubscribe | None. No Brevo webhook route, no `List-Unsubscribe` header. |
| From and reply-to | From `BRANDBASKET_MAIL_FROM`, then `ALERTS_FROM_EMAIL`, then `no-reply@brandbasket.in`. Reply-to `SUPPORT_ALERT_EMAIL`, then `support@brandbasket.in`. |
| Retention | Link and code emails store a link-less copy. Sign-in link templates are purged after 1 day, others after 90 days. |
| Failure visibility | `countFailedDeliveries24h` feeds the console rail badge and the Today row "N emails and webhooks failed". |

### 1.2 Customer facing templates (`packages/email/src/templates`)

| Template | Recipient | Trigger and sender | Link | Preference |
|---|---|---|---|---|
| signup-code | person signing up | OTP request, `features/entry/server/account-email-code.ts` | none | no |
| password-reset | customer or staff | forgot password | `/reset-password/<token>` | no |
| setup-link | lead | staff sends setup link | `/setup/<token>` | no |
| business-invite | invitee | owner invites | `/invite/<token>` | no |
| payment-received | owner | any captured payment recorded | `/billing/receipts?ids=` | no (tax document) |
| payment-failed | owner | first failed payment recorded | `/billing/payment` | `billing` |
| first-charge-reminder | owner | no caller exists | `/billing/payment` | `billing` |
| payment-refunded | owner | staff refund | `/billing` | no |
| monthly-report | owner | staff sends an approved report | `/reports/<month>` | `monthly_report` |
| change-request-reply, quote, started, ready, done, closed | requester | staff actions, `request-notify.ts` | `/requests/<id>` | `request_reply` |
| request-acknowledgement | requester | ticket created | `/requests/<id>` | `request_reply` |
| support-request-opened | owner | staff opens a request for the client | `/support/<id>` | `request_reply` |
| preview-ready | owner | staff sends a preview | `/website` | `needs_approval` |
| preview-changes-received | person who sent changes | customer asks for changes | none | no |
| website-live | owner | staff launches | site URL | no |
| domain-ready, domain-moved | owner | staff actions | `/domain`, new host | no |
| signup-reminder | abandoned lead | timer route, 1 day | `/checkout` | no |
| privacy-request-code | requester | public privacy form | none | no |
| affiliate-link, staff-invite | affiliate, staff | admin | setup links | no |
| booking-code, listing-enquiry | none | dormant, no caller | | |

All customer templates are free of em and en dashes (byte grep). `apps/customer/src/copy.test.ts` enforces it for customer sources.

### 1.3 Team and ops emails (recipient is an ops mailbox)

lead-received, onboarding-sent, preview-approved, preview-revisions-requested, domain-connected, domain-requested, support-ticket-alert, support-reply-alert, privacy-request-alert and nightly digest, security-event-alert, staff-access-review, site-down-alert, system-error-alert (no call site found). Recipients fall back through `SUPPORT_ALERT_EMAIL`, `BRANDBASKET_TEAM_EMAIL`, `SECURITY_ALERT_EMAIL`, `PRIVACY_ALERT_EMAIL`.

### 1.4 Idempotency

Receipt: `hasEmailContaining` since the payment. Refund: credit note number. Report: PDF link marker. Request acknowledgement: only when the ticket was created. Security alerts: one an hour per kind. Most staff driven emails have no dedupe and rely on a manual resend button. `hasEmailContaining` counts `failed` rows too, so a failed receipt is never re-sent automatically.

### 1.5 Preferences

Table `notification_preferences` (user, business, topic, `email` boolean). Topics and defaults: `new_enquiry` on, `needs_approval` on, `request_reply` on, `billing` on, `monthly_report` on, `product_news` off. Only email is a channel. The bell ignores preferences. No topic is locked on. `emailPreferenceAllows` fails open on a lookup error. Checks run for the owner or requester only; no flow emails other members. Settings UI: `apps/customer/src/features/settings/components/notification-table.tsx`.

Enforced by a sender: `needs_approval` (preview-ready only), `request_reply`, `billing` (failed payment and first charge reminder, not the receipt), `monthly_report`. Never read: `new_enquiry`, `product_news`.

### 1.6 Deep links

Evidence file `docs/product-architecture-audit/evidence/customer-ux/email-deep-links.md` says a signed-out click loses its target and lands on `/login`. `guard-rules.ts` has an `ALLOWED_RETURN_PREFIXES` list, so whether `/login` honours it is not verified. The evidence file also says request emails use `/requests?open=<id>`; code now builds `/requests/<id>`.

## 2. In-app notifications

### 2.1 Customer bell

There is no notifications table of rows. `packages/db/src/schema/notifications.ts` holds only `notification_preferences` and `notification_reads` (one `seen_at` per user and business). The bell is computed on every page load (`apps/customer/src/features/shell/loader.ts`, `rules.ts`) from four sources:

| Kind | Source | Copy | Link | Unread rule |
|---|---|---|---|---|
| need | change requests in quoted or preview | "Quote waiting: ..." / "Ready to check: ..." | `/requests/<id>` | unread while the state holds |
| waiting | tickets waiting on you | "Waiting for you: ..." | `/requests/<id>` | unread while the state holds |
| reply | staff public reply newer than last read | "New reply: ..." | `/requests/<id>` | until the ticket is read |
| activity | newest 10 `activity_events` | free text, 3 to 140 chars | service page or `/` | `occurredAt` newer than `seen_at` |

Properties: no polling or live refresh (stale until navigation), no retention job, activity lines are per business not per person and ignore preferences, opening the bell marks only activity as seen. Nothing in the bell for payments, failed payments, invoices, monthly reports, enquiries or social events.

Activity producers: staff "Add update", published deliverable, website moves (start, hold, resume), "Kickoff call completed" (staff), "Started without call confirmation" (24 hour job, customer visible).

### 2.2 Console

Today (`apps/admin/app/(protected)/page.tsx`, `lib/server/today.ts`, `lib/today-queue.ts`) is server rendered with no polling. Four stat tiles, kickoff prompt cards, "NeedsSomeone" queue, calls today, systems health. Row kinds: payment attention, add-on to start, preview overdue, preview due, new enquiry (1 h), no reply yet (4 h), signed up not paid (2 days), new error, failed deliveries, kickoff, payment past due or lapsed, website approved, domain move, started without call confirmation, Google (tag not seen, no data, sign-in lost). Rail counts exist for today, leads, requests, projects, calls, payments, deliveries. `settings-notices.ts` is only flash messages for Settings, not notifications.

### 2.3 Kickoff prompt

| Item | State |
|---|---|
| Origin | `addb327e` (WP-14, 2026-11-14) created popup, Today card, rule, pending query, `started_without_call_confirmation` column. |
| #196 (`deea2487`) | Added the meeting link and timing window. Did not touch the popup. |
| #200 (`28b972c7`), landed as #201 (`ac218bff`) | Removed `KickoffPromptPopup` from `apps/admin/app/(protected)/layout.tsx` (import, `listPendingKickoffPrompts` call, mount). Moved Join meeting and timing into `KickoffCallSection` on the client website tab (read only). |
| Today | `components/today/kickoff-prompt.tsx` card with Call completed (notes), They did not join, Reschedule. Also a queue row for the same call, so the call appears twice. |
| Calls page | "Just finished" with Call completed, They did not join, We did not attend, Reschedule. |
| Dead code | `kickoff-prompt-popup.tsx`, `kickoff-prompt-rule.ts` (15 minute repeat, client memory only), `listPendingKickoffPrompts`. |
| 24 hour fallback | Exists. `KICKOFF_FALLBACK_START_HOURS = 24`, job `start-builds-after-kickoff` every 15 minutes (timer lives outside this repo), `KICKOFF_AUTO_START` default on. Sets the flag and the activity line "Started without call confirmation". |
| On call end | Nothing is created: no in-app notification, email, push or Teams alert. Today shows the card only on the next page load. |
| Reschedule, They did not join | Reopen booking for the customer, send no message. |

Customer kickoff copy lives in `features/calls/components/kickoff-panel.tsx`, `features/home/rules.ts:402-405`, `home-screen.tsx`, `features/website/rules/progress.ts`, `project-customer-line.ts`.

## 3. Push

Nothing exists. No service worker, manifest, VAPID, `web-push`, subscription table or opt-in UI in either app. Icons: 192 and 180 px only, no 512 or maskable. Constraints: separate origins with host-only cookies, so each app needs its own worker, subscription table and registration. Console is behind Cloudflare Access when `REQUIRE_CF_ACCESS=1` (may not be live); `/sw.js` and a manifest need an exemption or a check. CSP has no `worker-src`, so same origin workers fall back to `script-src 'self'` and are allowed. Customer middleware does not exclude `/sw.js`.

## 4. Webhooks

### 4.1 Inbound

| | Razorpay | Cal.com | OyeChats |
|---|---|---|---|
| Route | `app/api/webhooks/razorpay` | `.../calcom` | `.../oyechats` |
| Signature | HMAC-SHA256 hex, constant time | same | same, per bot secret |
| Replay window | none | none | none |
| Body cap | none | 256 KB | 64 KB |
| Bad signature | 400 | 401 | 401 |
| Handler error | 500 (provider retries) | 500 | 500 |
| Event id dedupe | none, per record unique indexes | URI lookups | unique (chatbot, session) |
| Logging | `webhook_events` (source, event, result, reason, body hash, size, 90 days) | same | same |

`noteSecurityEvent("webhook_signature_invalid")` counts bad signatures; 3 an hour emails the security address, at most once an hour.

Events and effects:

| Source | Event | Effect | Notification |
|---|---|---|---|
| Razorpay | subscription.charged, invoice.paid, order.paid | payment recorded, plan or add-on activated | Teams payments card, receipt email, ads conversion |
| Razorpay | payment.failed | `recordFailedPayment` | customer email once, no Teams by design |
| Razorpay | 8 status events | status re-fetched and stored | Teams card only on cancelled with no successor |
| Razorpay | other | ignored | none |
| Cal.com | BOOKING_CREATED, CANCELLED, RESCHEDULED | booked call recorded, moved, removed | none |
| OyeChats | lead_captured | lead upsert, enquiry | Teams enquiries card (fires again on redelivery) |
| OyeChats | tier_transition | qualification applied | none |

Catch-up: Razorpay has the 10 minute `check-first-payments` job for unpaid checkouts. Cal.com and OyeChats have none (a code comment mentions a nightly OyeChats backfill, only a manual script exists). No webhook replay in the console. The deployment doc lists 10 Razorpay events but omits `payment.failed` and `invoice.paid`, which the code handles.

### 4.2 social-auto

No receiver exists. Brandbasket calls `/api/v1/*` on `SOCIAL_AUTO_URL` with a bearer key (`SOCIAL_AUTO_KEY`) and reads state on page load. Events named in `docs/product-architecture-audit/18-social-automation-and-revised-scope.md`: `post.published`, `post.failed`, `connection.expiring`, `poster.ready`, `poster.auto_approved`, `week.lapsed`, kept 14 days and retried 6 times. Signing scheme appears only in a plan (`docs/implementation/WORK-PACKAGES.md:144`): `X-Social-Signature: t=<unix>,v1=<HMAC-SHA256 of "<t>.<raw body>">`, 5 minute window, ordered by `seq`, catch up with `GET /api/v1/events?after=<seq>`. Secret name `SOCIAL_AUTO_WEBHOOK_SECRET`. Payload shapes are not in this repo and are unverified against social-auto.

### 4.3 Outbound Teams

Destinations `enquiries`, `payments`, `customers`, `support`, `system`. URLs are sealed in `site_settings`, set in console Settings, validated (https, Microsoft hosts). Best effort, 8 s timeout, result in `alert_deliveries` (90 days), manual resend from Deliveries, no automatic retry, no dedupe except an in-memory 5 minute debounce on billing error cards.

| Destination | Events |
|---|---|
| payments | payment recorded, plan cancelled |
| customers | setup sent, kickoff booked or changed (in-app bookings only), account closed, website paused, privacy request |
| enquiries | new website lead, OyeChats lead |
| support | website feedback ticket only |
| system | billing error log lines |

Doc drift: the `system` text promises error reports, `payments` promises retry and halted, `support` promises new requests and replies. None of those post.

### 4.4 Errors and timers

Browser error reports go to the database only. Customer server errors go to Sentry only. Admin server errors go to the database only. No Teams or email push for either.

| Timer | State |
|---|---|
| first-payment-check (10 min), kickoff-builds (15 min), site-rollup, maintenance, backup, restore-test, autodeploy | enabled by `install.sh` |
| site-hosting, erase, site-health, monthly-reports, google-sync, google-provision | installed, not enabled |
| signup-reminder | unit files exist, `install.sh` never installs it, token not in `.env.production.example` |
| retry-conversions | route exists, no timer |

A failed unit emails the team through Brevo (one per unit per 30 minutes). Erase and signup-reminder are not covered.
