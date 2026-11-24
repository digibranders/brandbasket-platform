# social-auto events (read from digibranders/social-auto, read only, 2026-11-17)

Sources: `docs/product-api.md` (section Webhooks and Catching up), `publisher/lib/webhooks.ts`, `publisher/lib/events.ts`, `publisher/api/_v1/events.ts` on `main`. The scheme in `WORK-PACKAGES.md` WP-15a is confirmed.

## Delivery

- `POST` JSON to the product's `webhookUrl` (registered in social-auto's `PRODUCTS` setting with a `webhookSecret` of 16 or more characters). Brandbasket must give social-auto its receiver address, `https://app.brandbasket.in/api/webhooks/social-auto`, and a secret; the same secret goes into Brandbasket's server env as `SOCIAL_AUTO_WEBHOOK_SECRET`. Owner action, nothing is edited in this repo.
- Headers: `X-Social-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, `X-Social-Event: <type>`. Reject a `t` more than 5 minutes from now. Compare in constant time over the raw body.
- Body: `{ id, type, seq?, createdAt, data }`. `id` is a UUID; handle each `id` once (events can arrive by webhook and by catch up, or twice).
- Retries by social-auto: after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours (6 tries), started by its cron. Answer any 2xx once the event is stored. Redirects are not followed, timeout 10 seconds.
- Catch up: `GET /api/v1/events?after=<seq>&limit=<1..100>` with the product key (same bearer key Brandbasket already uses) returns `{ events: [{ seq, id, type, createdAt, data }], hasMore }`, oldest first, kept 14 days. Remember the last `seq` handled. Use on start up and after any gap.
- `data.externalId` is Brandbasket's own id for the customer's workspace (map it to the business the same way the existing Social client does).

## Events and data

| Type | Data | Notice (matrix section E) |
|---|---|---|
| `post.published` | externalId, postId, channel, account, permalink | none (activity line optional) |
| `post.failed` | externalId, postId, channel, account, error | customer bell, email, push; staff Today row |
| `connection.expiring` | externalId, platform, account, daysLeft (7, 3, 1 or 0), expiresAt | customer bell, email, push; staff Today row |
| `poster.ready` | externalId, posterId, batchId, postId, network | customer bell, email, push (needs approval) |
| `poster.auto_approved` | externalId, posterId, batchId, postId, network, date?, time? | customer bell |
| `week.lapsed` | externalId, batchId, week (the Monday), lapsedAt | customer bell, email |
| `week.drawing`, `week.drawn` | externalId, batchId, week, jobId | none for now (bell line "Your pictures are ready" optional) |
| `job.finished` | externalId, jobId, kind (write or draw), state (done or failed), batchId? | none for now; a failed job could notify |
| `poster.expiring` | externalId, kind (poster or batch), batchId, postId?, network?, posterId?, expiresAt | new, customer bell and email 2 days before (needs the owner's yes) |
| `poster.expired` | same with expiredAt | new, customer bell (needs the owner's yes) |
| `post.held` | externalId, postId, channel, platform, date, code `ACCOUNT_DISCONNECTED` | new, customer bell, email, push: reconnect to let the post go out |
| `post.missed` | externalId, postId, channel, account, date | new, customer bell and email |

The last six (week.*, poster.expiring and expired, post.held, post.missed) are found by social-auto's cron, so they arrive within minutes, not instantly. Events about a customer's workspace that Brandbasket cannot map are stored and ignored, never an error.

## Receiver rules for package N7

1. Route `apps/customer/src/app/api/webhooks/social-auto/route.ts`, raw body, size cap, constant time signature check, 5 minute window, `noteWebhook` for every delivery, `noteSecurityEvent` on a bad signature (same as the other three routes).
2. Store each event by `id` (unique) with its `seq` before acting; a repeat answers 200 and does nothing.
3. Catch up on start up and after a gap with `readEvents(after)` in `legacy-social/server/social-auto.ts`, using the highest stored `seq`.
4. Every notice goes through `notify()` (package N1) with the event `id` as the dedupe key.
5. Tests with a fake social-auto: valid and invalid signature, stale `t`, duplicate id, catch up, each notice.
