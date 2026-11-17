# NOTIFY-03: email reliability (package N3)

Branch `claude/notify-03-email-cf3795`, stacked on N1 (`claude/notify-01-foundation-324d17`, PR 214). Spec: `docs/notifications/03-build-plan.md` section "N3 Email reliability", gaps G3 and G14. No migration was added: migration 0229 already had the queue columns, `email_suppressions` and the `brevo` webhook source.

## What changed

### The sending API (stable for N5)

`EmailTransport.send(message)` still never throws for a delivery failure, so a Brevo outage cannot turn into a webhook 500 (receipts are sent inside the Razorpay handler). It now answers an outcome:

| Outcome | Meaning |
|---|---|
| `sent` | Brevo took it. Row `sent`. |
| `queued` | Brevo failed in a way that may pass (timeout, network, 5xx, 429) and the body is whole. Row `pending`, attempt 1 made, next attempt in 15 minutes. |
| `failed` | Brevo refused it (other 4xx), or the stored body is a redacted copy (sign-in codes, support alerts) that cannot be sent later. Row `failed` with the reason. |
| `local_only` | Development inbox, nothing sent. |
| `suppressed` | Optional mail to an address that opted out or bounced (or the list could not be read: optional mail fails closed). Nothing sent, nothing stored. |

`emailOutcome(answer)` turns a transport that answers nothing into `sent`, so older fakes still work. `notify()` treats `failed` as a failure and `queued` as delivered; `sendEmail` in `NotifyDeps` may return an outcome.

### The drainer

`drainEmailQueue(db, brevo, now)` in `packages/email/src/drain.ts`. It claims due `pending` rows (`FOR UPDATE SKIP LOCKED`, and pushes `next_attempt_at` 10 minutes ahead as a lease, so two runs or a dead run never double send). Each row gets its remaining attempts (`max_attempts`, 3 by default, the first made inline): a retryable failure goes back with backoff (15 minutes after attempt 1, then 1 hour), the last failure or a refusal ends it `failed`, and optional mail to an address suppressed since it was queued is closed as `bounced` with "Not sent: the address is suppressed".

Route `POST /api/internal/drain-email-queue` (bearer `EMAIL_QUEUE_TOKEN`, 503 when the token or Brevo is not set up, 401 for a wrong token, 200 with the report). Timer `brandbasket-email-queue` every 15 minutes: service and timer under `deploy/vps/systemd/`, `scripts/server/run-email-queue-job.sh`, and one added name in each of the five lists in `deploy/vps/install.sh` (verify, programs, units, failure alerts, enable). `scripts/server/make-env-files.sh` generates the three new values. N6 edits the same file: the changes are one name appended per line, so a merge conflict is a one-word fix.

### Callers

| Caller | Before | Now |
|---|---|---|
| Team invite | A refused email looked like success (transport never threw). | `failed` takes the invite back and tells the owner nothing was saved; `queued` keeps it. |
| Staff preview and launch emails (`project-preview.ts`, `project-launch.ts`) | "emailed" whatever happened. | `emailed`, `email-queued` (new notices "queued, tried again within the hour") or `email-failed`; `suppressed` reads as "no email, tell them another way". Resend buttons say the same. |
| Sign-up reminder | Marked reminded even on a failed send. | Marked on `sent` or `queued`, never on `failed`: the next run tries the lead again. |
| Password reset (log only) | A failed delivery only reached the log. | A second `failed` row (redacted, like the first) is written so it shows on Today and Deliveries. It cannot be re-sent (the person asks for a new link). |
| Monthly report (`sendReport`) | Always "sent". | `failed` is `failed` (staff can resend: the outbox check ignores failed rows), `suppressed` is "owner turned off". |
| `hasEmailContaining` | Counted failed rows, so a failed receipt was never re-sent. | Ignores `failed` rows; `pending` still counts, so a queued receipt is not duplicated. |

Not changed on purpose: `domain-ready`, `domain-switch`, `affiliate-admin`, `request-notify` and `staff-opened-request` still report "emailed" whatever the transport answered (same as before). They are outside this brief; N5 or a small follow-up can map their outcomes the same way with `ownerNotificationOf`.

### Today and Deliveries

The Deliveries health for email now counts `failed` and `bounced`, so the existing Today row ("N emails and webhooks failed", linking to Deliveries) and the rail count cover a message that ran out of attempts and a bounce. The Deliveries "failed only" filter includes `bounced`. N1 already labelled `pending` ("Waiting to send") and `bounced`.

### Brevo events webhook, suppression, unsubscribe

- `POST /api/webhooks/brevo`. Brevo does not sign bodies, so the check is a shared secret: `Authorization: Bearer <BREVO_WEBHOOK_SECRET>` (Brevo's webhook custom header or bearer option), or `?secret=` on the URL for a form that takes only a URL. Compared by digest. 503 when unset or under 32 characters, 401 wrong, 400 for a body that is not an event, 500 on a database error so Brevo retries.
- `hard_bounce`, `invalid_email`, `blocked` write a `bounce` suppression and set the message `bounced` (by Brevo's message id, with or without angle brackets); `spam` writes `complaint`; `unsubscribed` writes `unsubscribe`. Other events (delivered, opened, soft bounce) are noted `ignored`. The first reason for an address is kept. A repeated Brevo event id is answered and not handled twice. Every delivery is noted in `webhook_events` (source `brevo`, now in `WEBHOOK_SOURCES`), never the body.
- Optional mail is decided by template (`packages/email/src/optional-mail.ts`): `monthly-report`, `preview-ready`, `request-acknowledgement`, `change-request-*`. Everything else (codes, receipts, payment, security, invites, support alerts) is mandatory and always goes. A retried row is judged by its template, so it is judged the same way as the first send.
- Optional mail carries `List-Unsubscribe: <signed link>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The link is `/api/unsubscribe?e=<address>&t=<HMAC>` signed with `EMAIL_UNSUBSCRIBE_SECRET`. POST (the mail client's one-click) writes the suppression; GET redirects to `/unsubscribe`, a page with one button, so a link scanner cannot unsubscribe anyone. Without the secret (or under 32 characters) the header is left off and no link verifies.

### Env names (names only, no `.env` edited)

| Name | Where | Purpose |
|---|---|---|
| `EMAIL_QUEUE_TOKEN` | customer | Bearer token of the drainer route |
| `BREVO_WEBHOOK_SECRET` | customer | What Brevo sends on its events webhook |
| `EMAIL_UNSUBSCRIBE_SECRET` | customer and console (identical) | Signs unsubscribe links |

Added to `.env.production.example` and `.env.example` files and generated by `make-env-files.sh`. To go live: enter the secret in Brevo (Transactional, Webhooks, events hard bounce, blocked, invalid, spam, unsubscribed, bearer token) pointing at `https://app.brandbasket.in/api/webhooks/brevo`; set the three values on the server; `systemctl daemon-reload` and run `install.sh` again to install the timer.

## Tests and checks

Own databases `brandbasket_platform_n3` and `brandbasket_platform_n3_test`, environment built in the shell only.

| Check | Result |
|---|---|
| `pnpm lint` | RESULT_LINT |
| `pnpm typecheck` | RESULT_TYPECHECK |
| `pnpm test` | RESULT_TEST |
| `pnpm build` | RESULT_BUILD |
| `pnpm test:integration` | RESULT_INTEGRATION |

New tests: transport outcomes, queueing, redacted rows never queued, suppression skip, List-Unsubscribe headers, signing, backoff (`brevo.test.ts`, `email-queue.test.ts`); the drainer against Postgres with a fake Brevo: not due, sent, backoff to failed after 3 attempts, refusal fails at once, two drainers claim once, suppression after queueing, redacted row, `hasEmailContaining` ignores failed, bounce by message id, first suppression reason, Deliveries health counts failed and bounced, intake connection can queue (`email-queue.integration.test.ts`); Brevo webhook handler and auth (`brevo-webhook.test.ts`); unsubscribe links (`unsubscribe.test.ts`); callers (team invite failed and queued, preview and launch queued, failed, suppressed, reminder failed and queued); `notify()` with failed and queued outcomes. Existing tests changed: two `brevo.test.ts` cases and one support alert integration case that expected a `failed` row after a 503 (it is now `pending`, except for a redacted alert, which stays `failed`), plus mocks of `@brandbasket/email` in three tests that now keep the real exports.

## New strings

Staff (console, need no approval beyond the usual review):

| Where | Text |
|---|---|
| Preview sent, queued | "The preview is saved and the customer can see it on their dashboard. The email did not go yet: it is queued and will be tried again within the hour. Check Deliveries if it does not arrive." |
| Resend, queued (preview and launch) | "The email did not go yet: it is queued and will be tried again within the hour. Check Deliveries if it does not arrive." |
| Launch, queued | "The website is marked live. The email to the customer did not go yet: it is queued and will be tried again within the hour. Check Deliveries if it does not arrive." |
| Deliveries error text | "Not sent: the address is suppressed" |

Customer, unsubscribe page (draft, owner to approve; `apps/customer/src/app/unsubscribe/copy.ts`):

| Where | Text |
|---|---|
| Title | "Stop these emails?" |
| Line | "We will stop sending reports and reminders to <address>. We will still email you about payments, your account and security." |
| Button | "Stop these emails" |
| Done title and line | "You will not get these emails" and "We will still email you about payments, your account and security." |
| Bad link | "This link does not work" and "It may be incomplete. Use the link in the latest email we sent you." |

## Open questions

1. Approve or change the unsubscribe wording above.
2. "Respects customer preferences": the unsubscribe writes a suppression only. It does not switch off the person's per-topic email preferences, and it covers every optional topic at once. Should it also switch the matching preferences off, or is address level enough?
3. The optional list: reports, preview ready, request acknowledgement and request updates. Should "your plan renews soon" style reminders (N5) count as optional? Payment failed stays mandatory.
4. Optional mail has no visible unsubscribe link in its body, only the header (Gmail and Apple Mail show a button). Add a footer line to the templates?
5. Suppression is by address and is not erased with the account (N1 question 6). A person who unsubscribes and later buys still gets mandatory mail only.
6. The webhook secret in the URL (`?secret=`) can appear in access logs. The header form is preferred; remove the URL form if Brevo's custom header is available on the account.
7. A queued message is "delivered" to `notify()` callers and "queued" to staff, but the customer's own page has no state for it. Acceptable for receipts (they also show in the dashboard)?
8. `domain-ready`, `domain-switch`, `affiliate-admin` and the request emails still say "emailed" whatever happened (see Callers).
