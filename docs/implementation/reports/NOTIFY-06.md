# NOTIFY-06: Webhooks and ops

Branch `claude/notify-06-webhooks-ops-2906bc`, stacked on N1 (`claude/notify-01-foundation-324d17`). Covers gaps G5, G6, G12, G16 and part of G17 in `docs/notifications/01-gaps.md`. No migration.

## What changed

### 1. Inbound webhooks: repeat check and replay window

All three routes now answer a repeat delivery with 200 and do nothing. The check is `isRepeatWebhook` in `apps/customer/src/platform/lib/server/webhook-log.ts`, which uses N1's `webhook_events.event_id` index. It runs only after the signature is valid, so an unsigned request still gets 401 and still counts toward the bad-signature alert. If the check itself cannot be made it fails open (the handlers are safe to run twice, and a lost payment event is worse than a double run). Two deliveries racing each other can both pass; the second note is refused by the unique index and logged.

| Sender | Event id used | Replay window |
|---|---|---|
| Razorpay | `x-razorpay-event-id` header (falls back to the body hash if absent) | None. Razorpay signs no timestamp, and it retries a failed delivery for up to 24 hours, so a window would drop real retries. |
| Cal.com | None provided. Body hash (`body:<sha256>`). | 5 minutes, on the top-level `createdAt` inside the signed body. A body with no readable `createdAt` is not judged. A stale delivery is answered 200 and noted as ignored ("Delivery older than 5 minutes"). |
| OyeChats | None provided (`event`, `bot_id`, `timestamp`, `data` only). Body hash. | None. Its code comments say it retries for hours and its `timestamp` is not documented as the send time, so a window could lose real leads. The body hash dedupe covers a replay. |

Every note on the Deliveries page now carries the event id (the body hash when the sender gave none).

### 2. OyeChats card only for a new lead

`recordChatbotLeadReportingNew` (packages/db, `xmax = 0` on the upsert) says whether the row was created. The Teams enquiries card fires only then. A redelivery or a second delivery for the same chat session with more details still fills in the lead and its enquiry but posts nothing. The card also carries a dedupe key (`chatbot-lead:<lead id>`). `recordChatbotLead` is unchanged for its other callers.

### 3. Cal.com changes alert staff

`alertCalcomChange` (`calcom-alerts.ts`) posts a Customers card and a staff bell notice through `notify()`:

- booked on Cal.com's own page (a booking with no dashboard purpose): alert. Dashboard bookings are not alerted, staff already know.
- cancelled or moved and the app found and changed the booking: alert.
- ignored deliveries (no matching booking, dashboard cancels the app already applied): no alert.

New registry event `call.changed.staff` (staff, channels teams and bell) with bell copy. N2 owns kickoff copy and was not touched. Both alerts use the delivery's event id as dedupe key.

### 4. Teams

`packages/shared/src/server/teams-alerts.ts`:

- one automatic retry (after 2 seconds) only when Teams is unreachable. An answer from Teams, even a refusal, is final.
- optional `dedupeKey` per alert, kept for a day in the existing rate-limit table (no migration). Fixed window, so a repeat across midnight UTC may post again. Fails open. Used by the Cal.com and OyeChats cards. `alertTeams` in the customer app passes it through.
- visible warning for a missing address: Today, Systems has a new line "Teams addresses" (`apps/admin/lib/server/system-health.ts`). It is green "5 of 5 saved", or amber "none for <channel names>" when any destination has no readable address.
- `TEAMS_DESTINATION_INFO` texts now match what posts (see strings below).

Not added, because they are not small (several call sites in two apps plus a throttle): support request and customer reply cards to `support`, and browser and server error reports to `system`. The card builders (`supportTicketTeamsCard`, `supportReplyTeamsCard`, `systemErrorTeamsCard`) already exist in `apps/customer/src/platform/lib/server/teams-cards.ts` and are unused. This leaves G17 open. Follow-up for a later package: the customer and admin `error-reports` routes and `createServerErrorReporter` (`packages/shared/src/server/error-report.ts`), throttled per error class and route, plus the ticket and reply actions in `features/requests`.

### 5. Ops (`deploy/vps/`)

- `install.sh backups` now installs the signup-reminder job script (`/usr/local/sbin/brandbasket-signup-reminder-job`), its service and timer, and verifies the units. It enables the timer only when a release exists and `SIGNUP_REMINDER_TOKEN` is set in `customer.env.production`; otherwise it says why and each hourly run would fail and email the team. `make-env-files.sh` already generates the token.
- failure alerts (`OnFailure` drop-in) now cover `brandbasket-erase` and `brandbasket-signup-reminder`.
- `retry-conversions` gets no timer: the nightly `brandbasket-site-rollup` already calls it after its roll-up with the same `SITE_ANALYTICS_TOKEN`. Noted in the installer output and the VPS doc.
- `apps/customer/.env.production.example`: `SIGNUP_REMINDER_TOKEN=` (name only) and its line in the token list. It was the only missing token name.
- `docs/deployment/brandbasket-droplet.md` and `brandbasket-vps.md`: Razorpay list is now twelve events (adds `payment.failed` and `invoice.paid`), timer notes updated.
- not enabled, owner decisions (unchanged): `erase` (deletes customer data), `site-hosting` (pauses lapsed websites, needs `VERCEL_API_TOKEN`), `site-health`, `google-provision`, `google-sync`, `monthly-reports`.

## New strings (wording to the owner; no dashes)

Console (staff only):
- Bell title: "A call was booked on Cal.com", "A call was moved on Cal.com", "A call was cancelled on Cal.com". Body: the new time in India time, for booked and moved. Link: `/calls`.
- Teams card title: the same three lines. Fact "Time". Button "Open calls".
- Systems line "Teams addresses": "5 of 5 saved" or "none for Website enquiries, Payments".
- Teams destination texts in Settings:
  - Website enquiries: "Every new enquiry from the website's forms, and a new lead caught by a client's chatbot."
  - Payments: "Every payment received (first payment, renewal, reactivation, add-on, one-off charge or one recorded by hand), with the customer's details, and a plan that has ended."
  - Customers and privacy: "Setup details sent, calls booked or changed (with the meeting link), calls booked, moved or cancelled on Cal.com, closed accounts, a website taken offline for an unpaid plan and privacy requests."
  - Support, bugs and feedback: "Changes a customer asks for on their website preview. Other requests and replies are not posted here yet."
  - System errors: "Billing errors, such as a payment event that failed to process, at most one per error every 5 minutes. Error reports from the dashboard and the console are not posted here yet."

No customer strings.

## Owner actions

1. In the live Razorpay dashboard (Settings, Webhooks) tick `payment.failed` and `invoice.paid` on the existing webhook. Until then failed payment emails and add-on upfront payments may not arrive in production (G5). Test mode has its own webhook.
2. Set `SIGNUP_REMINDER_TOKEN` (32 or more characters) in `/srv/brandbasket/shared/customer.env.production`, then run `install.sh backups --apply` again to enable the timer.
3. Decide on `erase`, `site-hosting`, `site-health`, `google-*` and `monthly-reports` timers (commands are in the installer output).
4. Approve the wording above.

## Tests and checks

New unit tests: webhook-log helpers via the three route tests (repeat answered 200 and not noted, event id recorded, signature checked before the repeat check), Cal.com handler (repeat, stale both ways, window edge, no createdAt, alert for outside booking, cancel and move, none for ignored), OyeChats handler (no card on redelivery, dedupe key, repeat after signature), `calcom-alerts`, Teams retry and dedupe (retry once, no retry on an answer, dedupe, fail open, key not used when no address), Systems line, registry and copy for the new event. Integration: `recordChatbotLeadReportingNew` created flag.

Results: see the run recorded at the end of this file.

## Notes

- `pnpm db:roles` and the integration run used my own databases `brandbasket_platform_n6`, `_n6_test`, `_n6_payload`, with URLs built in the shell from the shared role passwords; no `.env` file was edited. A temporary symlink to the main checkout's `apps/customer/.env.local` was needed because the db scripts refuse to start without that file; it was removed afterwards and is not committed.
- Not verified against real services: nothing was sent to Cal.com, OyeChats, Razorpay or Teams. Cal.com's `createdAt` meaning (time of sending) is from its public docs and memory, not from a live delivery.
