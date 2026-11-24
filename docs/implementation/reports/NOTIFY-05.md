# NOTIFY-05: events (package N5)

Branch `claude/notify-05-events-5ea6b9`, stacked on `claude/notify-03-email-cf3795` (N3). Spec: `docs/notifications/03-build-plan.md` section "N5 Events" and `02-target-matrix.md` sections B, C, D and F.

## What changed

- Wording for 19 events in the three copy modules (below), registry data types updated (`EventDataMap`), one shared `EVENT_LINES` table so a sentence is worded once.
- `packages/shared/src/server/notify-event.ts`: `notifyEvent(db, input)`, the one call every trigger makes. It builds the default notifier per call, never throws, and falls back to the other app's origin when only one is set (a staff notice with no `ADMIN_ORIGIN` is skipped and logged, never linked to the wrong app).
- Triggers wired (each calls `notifyEvent` once, with a dedupe key from the entity):

| Event | Trigger | Dedupe key |
|---|---|---|
| payment received | `sendPaymentReceipt` (shared, all 8 callers) | payment id |
| unmatched payment (owner) and payment needs a look (staff push) | same function, unapplied branch | payment id |
| payment failed | `sendPaymentFailed` (webhook) | provider payment id |
| refund | `sendPaymentRefunded` | credit note number, else payment id and amount |
| renewal coming up | `sendFirstChargeReminder` | business id and charge date |
| plan lapsed | new sweep `billing-notices.ts` | subscription id and paid-through date |
| build started | `startBuilding` (manual staff move only) | business id |
| preview ready | `sendProjectPreview` (not the resend) | project id and send time |
| changes received | `sendPreviewFeedbackAction` | feedback ticket id |
| approval received | `approvePreviewAction` | project id |
| website live | `launchProject` (not the resend) | project id |
| domain ready, domain moved | `markDomainReady`, `switchDomain` | business, state and hostname |
| request received | `sendRequestAcknowledgement` | ticket id |
| request reply, quote, ready, done | `notifyRequester` | ticket id and kind (replies: a fresh id each) |
| new request or customer reply (staff push) | `sendTicketAlert`, `sendReplyAlert` | ticket id (replies: a fresh id each) |
| monthly report ready | `sendReport` | report id |
| account closed | `closeAccountFor`, after the transaction | business id |
| system error (staff push) | admin `createDatabaseErrorReporter` | one per hour |

- New triggers: the billing sweep (`packages/shared/src/server/billing-notices.ts`, queries in `packages/db/src/queries/billing-notices.ts`) runs from the existing 15 minute `POST /api/internal/drain-email-queue` route, before the queue drains, so a Brevo outage does not stop it. No new timer, token or unit.
  - Reminder: first term ending in the next 3 days, subscription not ending, still the business's newest subscription. Uses the existing `first-charge-reminder` template (the email goes through its own once-per-business check) and `notify()` for the bell.
  - Lapse: an `active` or `past_due` subscription with no access whose paid-through date fell in the last 14 days and that is still the business's newest. Cancelled subscriptions are not announced.
- Mandatory is honoured: `sendPaymentFailed` no longer reads the billing email preference (the owner's answer of 2026-11-16).

## Email through `notify()` versus the old path (one rule)

Where an email template already exists and its sender is kept, the registry no longer lists `email` for that event: `notify()` adds bell and push and sends no second email. Where there is no template today, the email goes through `notify()`.

| Through notify() (new email) | Old sender kept (registry has no email channel) |
|---|---|
| plan lapsed, unmatched payment, build started, approval received, account closed | receipt, payment failed, refund, renewal reminder, preview ready, changes received, website live, domain ready and moved, request acknowledgement, request update, staff request alert, monthly report |

Nothing in `packages/email` was deleted. The old preference checks on the old senders still apply to their emails.

## Not wired, with reasons

- Staff Today and Teams rows (payment failed staff, changes or approved staff, kickoff booked staff) have no bell, email or push channel, so there is nothing for `notify()` to add.
- Signed up, not paid: has no registry key and a lead has no business to notify. The existing reminder job and its email are unchanged.
- Staff "push when late" for requests: no lateness job was built (open question 4).
- Social events: N7.

## Strings for the owner (all draft, no dashes)

Customer bell, with the push title where there is one:

| Event | Bell | Body | Push title | Opens |
|---|---|---|---|---|
| payment received | We received your payment | | | /billing |
| payment failed | Your payment did not go through | Pay again to keep your plan running | Your payment did not go through | /billing/payment |
| renewal coming up | Your next payment is due on <date> | | | /billing |
| plan lapsed | Your plan has lapsed | Pay to start it again | | /billing/payment |
| refund | Your payment was refunded | | | /billing |
| unmatched payment | We received a payment we could not apply to your plan yet | Our team is looking at it. You do not need to pay again | | /billing |
| build started | We have started building your website | | | /website |
| preview ready | Your website preview is ready to check | | Your website preview is ready to check | /website |
| changes received | We received your changes | | | /website |
| approval received | We received your approval. We are getting your website ready to go live | | | /website |
| website live | Your website is live | | Your website is live | /website |
| domain ready | Your domain is ready to connect | | | /domain |
| domain moved | Your website is now on your own domain | | | /website |
| request received | We received your request | | | the request |
| request reply | We replied to your request | | same | the request |
| request quote | Your request has a quote | | same | the request |
| request ready | Your request is ready to check | | same | the request |
| request done | Your request is done | | same | the request |
| monthly report | Your monthly report is ready | | Your monthly report is ready | /reports/<month> |
| account closed | Your account is closed | You can restore it until it is erased. Sign in to see how | | / |

Emails sent through `notify()`:

| Event | Subject | Paragraphs | Button |
|---|---|---|---|
| plan lapsed | Your plan has lapsed | "Your plan has lapsed." "Pay to start it again." | Pay now |
| unmatched payment | We received a payment we could not apply to your plan yet | "We received a payment we could not apply to your plan yet." "Our team is looking at it. You do not need to pay again." | Open billing |
| build started | We have started building your website | "We have started building your website." | See progress |
| approval received | We received your approval | "We received your approval. We are getting your website ready to go live." | Open your website |
| account closed | Your account is closed | "Your account is closed." "You can restore it until it is erased. Sign in to see how." | none |

Staff pushes (no business name, no detail): "A new request or reply is waiting" (opens the ticket), "A payment needs a look" (opens Payments), "A system error needs a look" (opens Today).

## Tests

Tests were written for each event: registry and wording (`notification-events.test.ts`, 8 new), `notifyEvent`, payment emails (receipt, unapplied, failed mandatory, refund key, reminder key), the billing sweep (reminder window, skipped ending or replaced subscriptions, lapse window, no access, reactivation), error push, and each trigger calling `notifyEvent` once (requests, website actions, account closure, console preview, launch, domain, moves, request notify, the route).

Checks run, one worker, targeted only:
- `vitest run` on: `notification-events`, `notify`, `notify-event`, `payment-emails`, `billing-notices`, `error-report` (shared); `requests/server`, `payment-failure`, `website/actions`, `account-exit`, `drain-email-queue/route` (customer); `website-moves`, `project-preview`, `project-launch`, `domain-ready`, `domain-switch`, `request-notify` (admin). All pass.
- `tsc --noEmit` in `packages/db`, `packages/shared`, `apps/customer`, `apps/admin`: no errors in changed files. The only errors left are `RouteContext` not found in route files I did not touch (generated by `next typegen`, which was not run) and, in `packages/shared`, a missing type declaration for `web-push`. This worktree has no install; `node_modules` is linked from the main checkout, which lacks `web-push`, so a local stub stands in. Neither is from this change.
- `eslint` on the changed files of both apps: clean. The two packages are outside the repo's lint scope.
- Not run: the full suite, the build, `pnpm test:integration`. The integration test `payment-emails.integration.test.ts` was edited (failed email is now mandatory, and `providerPaymentId` is required) but not run; the two new queries in `billing-notices.ts` have no integration test; `sendReport` has no unit test for its notify call. Run `pnpm test:integration` for `packages/shared` and `packages/db` in the main checkout before merging.

## Open questions

1. Wording: every string above is draft and needs the owner's yes. The matrix only had wording for the kickoff events.
2. Repeats swallowed by the key: a request that goes ready, back to the customer and ready again notifies once; a second preview round is a new send so it does notify. Say if a repeat ready should notify.
3. Yearly renewals get no reminder: the existing template text says "introductory offer", and its once-per-business email check would block year two. First charge only, as asked.
4. Staff push "when late" for requests needs a definition of late and a job; not built.
5. Lapse window is 14 days: a timer outage longer than that skips a lapse.
6. Customers without `ADMIN_ORIGIN` in the customer app skip the staff request push (logged). Production env should have it; no env file was touched.
7. Signed up, not paid has no bell. A lead has no business row, so it needs a registry audience decision.
