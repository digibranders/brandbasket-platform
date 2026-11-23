# NOTIFY-07b: social-auto catch up timer and console source

Finishes the two leftovers of NOTIFY-07 (its item 1 under open questions: the catch up was not wired).

## What changed

- **Catch up job.** `POST /api/internal/social-auto-catch-up` (`app/api/internal/social-auto-catch-up/route.ts`) runs `runSocialAutoCatchUp` (`platform/lib/server/social-auto-catch-up.ts`): reads the stored seq, fetches events after it in pages of at most 100 (up to 20 pages a run), sends each through `processSocialEvent`, the same dedupe and notify path the webhook uses (each event id handled once), then stores the highest seq read. The seq only moves forward, and a failed read leaves it where it was. With no `SOCIAL_AUTO_WEBHOOK_SECRET` or no `SOCIAL_AUTO_URL` and `SOCIAL_AUTO_KEY` it answers 200 `{"kind":"skipped"}` and does nothing.
- **Auth.** The same bearer token as the email queue (`EMAIL_QUEUE_TOKEN`), so no new secret. 503 when unset, 401 when wrong.
- **Timer.** `deploy/vps/systemd/brandbasket-social-auto-catch-up.{service,timer}`, every 15 minutes, run by the email queue's job script with `--url` pointing at the new route. `deploy/vps/install.sh` verifies, installs and enables them with the other timers, and adds the service to the failure alert list. `apps/customer/.env.production.example` gets only comment changes (no new names).
- **Migration 0230, `social_auto_cursor`.** A new table, because `webhook_events` has no seq and keeping the cursor there would let a webhook delivery that arrives out of order move it past a missed event. One row (`name = 'events'`, `seq`, `updated_at`). Row level security on, a policy for `bb_staff` only, grants `SELECT, INSERT, UPDATE` to `bb_staff` only; the customer role has nothing. Hand written with its drizzle snapshot (drizzle-kit needs an env file here).
- **Console.** `social_auto` is now a delivery source (it was a reserved source). It appears where Cal.com and OyeChats do: a figure on Deliveries (count, "all handled" or "n failed"), a source filter and its rows, a line on Today's systems block ("last 15:28" or "n failed", "none in 24 hours" when quiet), and it counts in the "Webhooks from other services" health row. No new components, no buttons.

## New strings

- Deliveries source filter and rows: `Social posting`
- Deliveries figure label: `Social posting`
- Today systems line label: `Social posting events`

## Checks run

- `apps/customer`: `social-auto-catch-up.test.ts` (6), `api/internal/social-auto-catch-up/route.test.ts` (2), `social-auto-webhook.test.ts` and `webhooks/social-auto/route.test.ts` (40 together): passed. `tsc --noEmit` and `eslint` clean.
- `apps/admin`: `deliveries-view`, `system-health`, `system-health-lines`, `server/system-health`, `server/deliveries` tests (30): passed. `tsc --noEmit` clean; eslint shows one existing warning in `client-listing-tags.tsx`.
- `packages/db`: `tsc --noEmit` clean; migrated the test database and ran `deliveries.integration.test.ts` only (12 passed, including the cursor, its customer-role refusal and the new source in the health).
- Not run: full suites, full build, `verify` of `install.sh` against a server.

## Left for the owner

- On the VPS, run the install step again so the new timer is installed and enabled. Run migration 0230 as part of the deploy (the deploy script migrates).
