# NOTIFY-01: notifications foundation (package N1)

Branch `notify/01-foundation` work was done on `claude/notify-01-foundation-324d17`. Spec: `docs/notifications/03-build-plan.md`, section "N1 Foundation". Packages N2 to N7 stack on this branch.

## What changed

### Migration 0229 (`packages/db/migrations/0229_notifications_foundation.sql`)

One migration, with RLS and grants in the same file.

| Table or column | What it is |
|---|---|
| `notifications` (new) | One stored notice per person (customer) or one for the console (staff, no recipient). Event key, title, body, link, `listed`, dedupe key, `created_at`, `read_at`. Unique on `(audience, user_id, dedupe_key)` with `NULLS NOT DISTINCT`, so a staff row (null recipient) cannot be written twice. Link check keeps links inside the app. |
| `notification_preferences` | Gains `bell` (default true) and `push` (default false). Topics gain `calls` and `social`; the check constraint is updated. Existing `product_news` rows get `bell = false`. |
| `push_subscriptions` (new) | One row per browser: audience, user, unique endpoint, `p256dh`, `auth`, user agent, `created_at`, `last_success_at`, `revoked_at`. Written by package N4. |
| `kickoff_prompt_state` (new) | Per kickoff booking (`setup_call_bookings` row, which is where the kickoff call lives): first notified, last popup shown, answered, and the 2 hour reminder push time. Cascades with the booking. |
| `email_messages` | Statuses `pending` and `bounced`; `next_attempt_at`, `max_attempts` (default 3); `attempts` may now be 0 for a message not yet tried; a `pending` row must have a next attempt time. |
| `email_suppressions` (new) | Address (lower case), reason `bounce`, `complaint` or `unsubscribe`. |
| `webhook_events` | `event_id` plus a partial unique index on `(source, event_id)` for handled or ignored rows (a failed delivery may be recorded again). The source check also accepts `brevo` and `social_auto`, so N3 and N7 need no second migration; the TypeScript list stays at three until their receivers land (`RESERVED_WEBHOOK_SOURCES`). |

Grants and RLS: customers read their own `listed` or ledger rows for the business they are scoped to (any member role) and may update only `read_at`; staff have full access; `bb_public` has nothing. `push_subscriptions`: customers manage their own customer rows; staff all. `kickoff_prompt_state` and `email_suppressions`: staff only.

The journal tag is `0229_...` although the journal index is 226 (earlier migrations were numbered by hand the same way). Snapshot is `meta/0229_snapshot.json`.

Erasure (`account-erasure.ts`): the person's notices, staff notices naming the erased business, and their push subscriptions are deleted; prompt state goes with its booking. `email_suppressions` is kept on purpose (see open questions). Export (`account-export.ts`): preferences now include bell and push; new `notices` and `pushDevices` sections (no endpoint or keys). Nightly purge: `purgeOldNotifications` (90 days) in `maintain-support-attachments.ts`; `docs/operations/retention-schedule.md` updated.

### Registry and notify()

- `packages/shared/src/lib/notification-events.ts`: typed registry of every event in the matrix (35 keys): audience, topic, mandatory flag, channels, "Always sent" line. Copy lives in one module per channel: `notification-copy-bell.ts`, `notification-copy-email.ts`, `notification-copy-push.ts`.
- `packages/shared/src/server/notify.ts`: `createNotifier(deps)` returns `notify({ event, audience, dedupeKey, data })`; `createDefaultNotifier(db, { onError })` wires the staff connection, the app email transport (outbox locally), the fake push sender, and the origins from `APP_ORIGIN` and `ADMIN_ORIGIN`. It writes the ledger and bell row first (the dedupe record, whatever channels the event uses), then email, then push. Mandatory events and staff events skip the preference check; optional events fail closed on a lookup error (nothing sent, nothing recorded, so a retry can still deliver). Never throws; failures go to `onError` and show in the result. The dedupe key is combined with the event key, so two events may share one id.
- `packages/shared/src/server/push-sender.ts`: the `PushSender` interface and a fake sender. Real push is N4.
- `packages/email/src/templates/notification.ts`: one generic layout for emails sent by `notify()`.
- No existing sender is wired to `notify()` (that is N5).

### Bell and settings

- Customer bell (`features/shell`): stored notices join the live sources (quotes, waiting, replies, activity). Stored notices and activity form one timeline, newest first. Mark read per row (`markNotificationReadAction`). Refreshes on window focus and every 60 seconds while the page is visible by calling `router.refresh()`, which re-runs the existing shell loader (helper `refresh-while-visible.ts`, no websocket).
- Console bell: new `StaffBell` in the rail header (desktop) and the phone bar, reading staff rows (`listStaffNotifications`), with mark read per row and the same refresh (`StaffBellRefresh`, mounted once in the shell). A read failure is logged and the bell shows empty.
- Settings, Notifications: Bell, Email and Push columns; the five "Always sent" lines are rows with no switch.
- `product_news` and `new_enquiry` are left in place (removing a topic needs a data change and a constraint change, so it is not trivially safe). `new_enquiry` still has no sender.

## Tests and checks

Run on this branch against its own databases (`brandbasket_platform_n1`, `brandbasket_platform_n1_test`).

| Check | Result |
|---|---|
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | pass: cms 5, db 232, auth 31, billing 426, email 228, shared 2013, admin 2037, customer 4482 |
| `pnpm build` | pass. The first attempt stopped on a notice from `next build` that the installed Next.js version has a known security advisory (it asks to retry the same command); the retry passed. Upgrading Next.js is outside this package; worth a look by the owner. |
| `pnpm test:integration` | pass: auth 26, db 2047 passed with 2 `migrator.integration.test.ts` hook timeouts under load (the file passes alone, 4 of 4, in 12 seconds), shared, email and customer all pass |

Two customer unit tests (`checklist/actions.test.ts`, `entry/server/security-events.test.ts`) fail only when `CLIENT_SITE_BASE_DOMAIN` and `ADMIN_ORIGIN` are exported, as AGENT-RULES section 4 says to for `dev`; they pass with those two unset, and `pnpm test` was run that way. The build needs `apps/admin/.env.local`, supplied by a git-ignored link to the main checkout's file.

New tests: registry and copy (17), `notify()` unit (23), `notify()` against the database with the outbox and fake push (5), RLS, dedupe, purge, export, push, email queue columns, webhook event ids (`notifications-foundation.integration.test.ts`, 26), erasure and the "every table pointing at a business" guard extended, the generic email (5), refresh helper (5), customer bell and settings rules, table and action tests, console bell rules and rail test.

Existing guard tests changed: `account-erasure.integration.test.ts` (new tables in the seed and the erased list) and `customer-v4.integration.test.ts` (`notifications` joins the tables a viewer may write to, like the preference tables, because a viewer marks their own notices read). The customer e2e heading "Email notifications" is now "Notifications".

## Strings

### Customer, new or changed

| Where | Text |
|---|---|
| Settings card | Title "Notifications", description "Choose how we tell you." (was "Email notifications", "Choose which emails we send you.") |
| Settings columns | Bell, Email, Push |
| Settings rows (new topics) | "A call with us is coming up", "Your social media needs attention" |
| Settings, always sent | "Always sent", with the lines: "A payment is received, fails or is refunded", "Your plan lapses", "Your kickoff call is booked or finished", "Your website is started, approved or live", "Your account is closed" |
| Kickoff booked | "Your kickoff call is booked for <time>" (approved) |
| Kickoff soon | "Your kickoff call starts at <time>", email button "Join here" |
| Call completed | "Thanks for the call. We are getting your website started" (approved) |
| They did not join | "We missed each other on <time>. Pick a new time"; email subject "We missed each other on <time>", button "Pick a new time" |
| Reschedule | "We need a new time for your kickoff call. Pick one here"; email subject "We need a new time for your kickoff call", button "Pick one here" |
| Fallback started | "We started your website" (draft, owner still to approve) |
| Bell error on read | "We could not mark that notification as read. It will show as new until you open it again." and "We could not find that notification." |

### Staff

| Where | Text |
|---|---|
| Console bell | "Notifications", "Nothing new.", "Notifications, N new" (button name) |
| Kickoff ended | Bell and email "Did the kickoff call with <business> happen?", button "Open Calls"; push "Did the kickoff call happen?" (no business name on a lock screen) |
| Fallback | "Started without call confirmation", line below: business name |
| Deliveries page | Email status labels "Waiting to send" and "Bounced" |

## Decisions taken, and open questions

1. **Payment failed is mandatory** (owner answer 4 of 2026-11-16) although matrix section B still says email and push optional. The registry follows the answer. The settings label "An invoice is ready or a payment fails" for the `billing` topic now misdescribes it (the topic still switches the renewal reminder and invoice notices). Owner: reword the label?
2. **Events with no wording.** Only the kickoff call has draft or approved wording. Every other event is registered with its topic, channels and audience but no copy, so `notify()` writes only the ledger row for it and reports `no_wording` per channel. Package N5 adds the words. Events affected: all billing, website, request, social and account events, and the staff email and push for new requests, payments needing a look and security alerts.
3. **Push default is off** for every topic (it is never automatic; the browser prompt and the opt-in belong to N4). Owner: confirm.
4. **Bell default** follows the email default (on, except product news).
5. **Email failure after the ledger row.** If the email send throws after the row is written, a repeat call is deduped and will not retry the email. Package N3 makes the email a queued row with its own retries, which removes this case. Until then `notify()` reports the failure through `onError`.
6. **`email_suppressions` and erasure.** The table is not erased with the account, so an unsubscribe or bounce is still honoured if the address signs up again. Owner or counsel: acceptable?
7. **Rescheduled kickoff.** A rescheduled call keeps its `setup_call_bookings` row, so N2 must clear its `kickoff_prompt_state` row when the start time moves.
8. **Console bell placement** (rail header and phone bar) has no mock; the console mock has no bell. Owner: confirm or move.
9. `new_enquiry` and `product_news` topics remain (see above).
10. Settings shows a Push switch although push cannot be received until N4. A switch saved now takes effect when N4 lands.

## How to run

Own databases `brandbasket_platform_n1` and `brandbasket_platform_n1_test`, environment built in the shell only (no `.env` file edited; `apps/customer/.env.local` in this worktree is a git-ignored link to the main checkout's file).
