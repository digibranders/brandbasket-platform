# NOTIFY-07: social-auto receiver

Branch `claude/notify-07-social-receiver-3bebbc`, stacked on N5 (`claude/notify-05-events-5ea6b9`, which stacks on N3). Retarget to `development` after the earlier PRs merge. The spec is `docs/notifications/04-social-auto-events.md` (on `claude/notifications-review-f79eb2`).

## What changed

- `POST /api/webhooks/social-auto` (`apps/customer/src/app/api/webhooks/social-auto/route.ts`): reads the raw body (64 KB cap, 413 over), checks `X-Social-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">` with `SOCIAL_AUTO_WEBHOOK_SECRET` (constant time, 5 minute tolerance either way, 401 on a bad or stale signature plus the existing `webhook_signature_invalid` security event, 503 with no secret). Any other outcome is 2xx. A lookup failure (database down) throws so social-auto retries.
- Logic in `platform/lib/server/social-auto-webhook.ts` (pure parts injected, so tested without a database): signature check, event parsing, mapping, `processSocialEvent`, `handleSocialAutoWebhook`, `catchUpSocialEvents`. Wiring in `social-auto-deps.ts`.
- Dedupe: each event id is checked in `webhook_events` (source `social_auto`, unique on source plus event id for handled and ignored rows) before acting and stored after. The event id is also the notify() dedupe key, so a repeat that races past the stored id still sends nothing twice. Unknown types and workspaces we cannot map are stored as `ignored`, never an error. Refused and failed deliveries are noted too (no event id).
- Business mapping: `data.externalId` is the business id, or the id, a colon and a key for a further brand; the part before the colon must be a uuid of an existing business.
- packages/db: new `queries/social-auto-events.ts` (`hasTakenSocialAutoEvent`, `recordSocialAutoEvent`, `findExistingBusinessId`), exported from the index. No migration. The column's TypeScript type does not list `social_auto` (the check constraint does), so one documented cast lives in that file instead of widening types the console uses.
- Registry and copy (`packages/shared/src/lib`): four new events, `connection_expiring` now carries `daysLeft`, bell, email and push wording for every social event. `EVENTS_WITHOUT_WORDING` is now empty.
- Catch up: `readEvents(settings, after, limit)` in `legacy-social/server/social-auto.ts` (`GET /api/v1/events?after=&limit<=100`, bad entries dropped) and `catchUpSocialEvents` (pages until `hasMore` is false, 20 pages at most, same path as a delivery, returns the highest seq).
- Env: `SOCIAL_AUTO_WEBHOOK_SECRET` added to `apps/customer/.env.production.example` (name only) and to the env check: a warning when `SOCIAL_AUTO_URL` is set without it, an error when it is under 16 characters (social-auto's own minimum). No `.env` file touched.

## Event mapping

| social-auto event | Notice | Channels |
|---|---|---|
| post.failed | social.post_failed | bell, email, push |
| connection.expiring | social.connection_expiring (daysLeft) | bell, email, push |
| poster.ready | social.poster_ready (topic needs_approval) | bell, email, push |
| poster.auto_approved | social.poster_auto_approved | bell |
| week.lapsed | social.week_lapsed | bell, email |
| post.held (new) | social.post_held | bell, email, push |
| post.missed (new) | social.post_missed | bell, email |
| poster.expiring (new) | social.poster_expiring | bell, email |
| poster.expired (new) | social.poster_expired | bell |
| post.published, week.drawing, week.drawn, job.finished | none, stored as ignored | |

The provider's error text and account names are never copied onto a notice (tested).

## Tests run (targeted, one worker)

- `packages/shared`: `notification-events.test.ts`, `production-env-check.test.ts`: 41 passed.
- `apps/customer`: `social-auto-webhook.test.ts` (32), `webhooks/social-auto/route.test.ts`, `read-events.test.ts`, `copy.test.ts`: all passed. Covers valid and invalid signature, stale `t` both ways, duplicate id, unreadable body, unmapped workspace, further-brand id, every event type, catch up paging and page cap.
- `pnpm typecheck` in `packages/db`, `packages/shared`, `apps/customer`: clean. ESLint on the changed customer files: clean (the repo lint script covers the two apps only).
- Not run: full suites, build, `pnpm test:integration`. The new db queries are three one-statement selects and an insert over the existing table and index, with no integration test. `pnpm install --offline` was needed to get node_modules in this worktree.

## Every new customer string (all draft, owner approval needed)

Matrix events (wording is new, the events are in the matrix):
- Post failed: "A post could not be published" / "Open Social to see what went wrong". Email button "Open Social". Push title is the first line.
- Connection expiring: "Your social account connection expires in 3 days" (also "1 day"; "Your social account connection has expired" at 0) / "Reconnect it to keep your posts going out". Button "Reconnect".
- Pictures ready: "Your pictures are ready for your approval" / "Check them so your posts can go out". Button "Check your pictures".
- Auto approved (bell only): "We approved your pictures for you" / "Your posts will go out as planned".
- Week lapsed: "This week's posts did not go out" / "The pictures were not approved in time". Button "Open Social".

New beyond the matrix (flagged for the owner's yes, including whether they exist at all):
- post.held: "A post is on hold" / "Reconnect your account to let it go out" (bell, email, push; button "Reconnect").
- post.missed: "A post missed its time" / "Open Social to see what to do next" (bell, email; button "Open Social").
- poster.expiring: "Your pictures will expire in 2 days" / "Approve them to keep them" (bell, email; button "Check your pictures"). The 2 days is fixed in the words; it assumes social-auto sends it two days before.
- poster.expired: "Your pictures have expired" (bell only).

Emails use the bell lines as two paragraphs with a full stop. Pushes carry the first line only. Every notice opens `/social`. Email subjects are the first line. Email and push for post.held, post.missed and the two poster events use topic `social`, so they follow the customer's social preference.

## Gaps and open questions

1. **No `seq` column.** `webhook_events` has no seq, so the spec's "highest stored seq" cannot be read back. The catch up function takes the cursor as an argument and returns `lastSeq`, but it is **not wired** to a timer: no existing timer job fits cleanly (the email queue route is for email and has nowhere to keep a cursor). A small migration (a `seq` column, or a one-row cursor table) would let `drain-email-queue` or a new `/api/internal/catch-up-social` call it. Until then a missed event stays missed (retries cover 6 tries over about 8 hours, and a caller can run `catchUpSocialEvents` with a cursor by hand). Needs the owner's call on adding the migration.
2. **Deliveries page.** Rows with source `social_auto` are stored, but the console's Deliveries list, filter and health blocks do not know the source (the source label will be blank in the list). The notes from N1 say to add it to `WEBHOOK_SOURCES` with its health when the receiver lands; that touches `packages/db` types and the admin app, so it is left for a follow-up.
3. **Staff Today row** for post failed and connection expiring (matrix row `social.attention.staff`) is not built: notify() does not carry the Today channel, and the spec scope is customer notices.
4. Unsure that `connection.expiring` carries `daysLeft` on every send; a missing or bad value falls back to 7.
5. Whether `week.lapsed` means "pictures not approved in time" is my reading of the event name, so the body line needs the owner's eye.

## Owner action

1. In social-auto's `PRODUCTS` setting for Brandbasket, set `webhookUrl` to `https://app.brandbasket.in/api/webhooks/social-auto` and a `webhookSecret` of 16 or more characters.
2. Put the same secret in the customer app's server environment as `SOCIAL_AUTO_WEBHOOK_SECRET` and restart. `pnpm env:check` warns until it is set.
3. Approve or change the wording above.
