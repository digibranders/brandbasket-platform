# Production: the Hostinger VPS

The platform runs on one Hostinger KVM 4 (Ubuntu 24.04, 4 vCPU, 16 GB) at 187.126.121.25, since 2026-10-07. The
marketing website (its own repository) runs on the same box. All web names go through Cloudflare, which reaches the
server over IPv6 (`2a02:4780:63:2102::1`): the server's IPv4 block cannot be reached from Reliance Jio or from
Cloudflare's Indian data centres (see `INCIDENTS.md` in `vps-setup`).

```
 app.firstfold.io    nginx :443 ── firstfold-app :3001, firstfold-app2 :3002   apps/platform
 admin.firstfold.io  nginx :443 ── firstfold-admin :3003                       apps/admin
 www.firstfold.io    nginx :443 ── firstfold-website@3000, @3004, @3005        (firstfold-website repository)
                                        │
                     Postgres 16, localhost:5432 (webfold, webfold_payload)
```

The server's configuration (nginx, systemd units, deploy scripts, backups) is not in this repository. It lives in the
operator's `vps-setup` folder, mirrored on the server at `/root/vps-setup`, whose README is the runbook.

## How a change reaches production

Production runs `main` only. Work happens on `development` and reaches `main` through a pull request; merging it is
the deploy. GitHub Actions takes no part in it: its `CI` workflow is disabled while the organisation's billing blocks
Actions, and the server runs the checks instead (below).

### Checks on a pull request

Within about a minute of a push to any branch except `main`, the server checks the new commit in a locked-down sandbox
and posts one check per step to the pull request's Checks tab: `CI: install`, `CI: lint`, `CI: typecheck`,
`CI: test`, `CI: build`, each with its own log (about 3 min 45 s in all). A failed step turns red and the later ones
show as skipped. Wait for green before merging.

### Seeing the deploy

After the merge, the commit and pull request get `Deploy app.firstfold.io` and `Deploy admin.firstfold.io` check runs,
updated every 10 seconds with a step table and the end of the deploy's log, and each repository's Deployments panel
records every deploy. An app the commit did not touch shows "Unchanged by this commit".

Every minute, `firstfold-platform-autodeploy.timer` on the server fetches `main` with a read-only deploy key. When
`main` has moved, it works out which apps the change needs, from the files changed since the commit each app runs:

| Changed | Deploys |
|---|---|
| only `apps/platform/` | platform (app.) |
| only `apps/admin/` | admin (admin.) |
| only `docs/`, `.github/`, top-level `*.md` | nothing |
| anything else: `packages/`, `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `scripts/`, ... | both, since both apps use every package |

A path that is not listed counts as "both", so a new kind of file can cause an extra build but never a missed one.

The deploy itself (`firstfold-platform-release`):

1. Unpacks the commit into a new `/srv/firstfold/releases/<sha>`.
2. Runs `pnpm lint`, `pnpm typecheck` and `pnpm -r test` on the whole repository, then builds the chosen apps. Any
   failure stops here and production is untouched. The commit is not retried until `main` moves again.
3. Applies both databases' migrations: `firstfold-migrate` (the main database, as its owner) and
   `scripts/cms-migrate.sh` (Payload's).
4. Points the app's symlink (`current-platform` or `current-admin`) at the release and restarts its instances one at a
   time: app, then app2, then admin, each answering `/login` before the next. If one does not answer, that app is
   switched back to the release it ran before.

app. has two instances, so it stays up during a deploy. admin. has one and is down for a few seconds. A full deploy
of both apps takes about four minutes; the build runs at low priority with a 6 GB memory ceiling, so visitors are not
slowed down.

## Version skew

A page opened before a deploy still holds the old build's server action ids, and during the restart one instance
answers on the new build while the other is still on the old one, so a Save can fail with "Server Action ... was not
found on the server". Two things cover it, and neither needs a setting on the server:

- `apps/platform/next.config.ts` sets Next's `deploymentId` to the commit in the release directory
  (`/srv/firstfold/releases/<commit>`, see `lib/deployment-id.ts`). A page from an older release then reloads itself
  on its next navigation instead of talking to a build that does not match. `NEXT_DEPLOYMENT_ID`, when set at build
  time, takes its place.
- A page that still reaches the error screen with that failure reloads once on its own
  (`lib/stale-deploy.ts`, used by `app/app-host/error.tsx` and `app/global-error.tsx`).

If the error keeps coming on a freshly loaded page, an instance is probably still on an older release: compare
`readlink -f /srv/firstfold/current-platform` with what each instance runs.

## Rules this puts on changes

- **Migrations must work with the code before them.** They run before the restart, while the old code still serves,
  and switching an app back to an older release does not undo them. Add columns before using them; drop them only
  after the code that used them is gone.
- **A new migration needs a `when` above the latest journal entry.** The migrator treats a migration as pending only
  when its `when` in `packages/db/migrations/meta/_journal.json` is greater than the newest one already applied.
  drizzle-kit writes `when` from the machine's clock, and if that clock is behind an entry already in the journal, the
  new migration is silently skipped in production. After `drizzle-kit generate`, check that the new entry's `when` is
  above the previous one, and if it is not, edit it by hand to a larger value. A unit test in `packages/db`
  (`migration-journal.test.ts`) fails when the order is wrong.
- **A new environment variable goes on the server first.** Each app's env file is
  `/srv/firstfold/shared/<app>.env.local`, linked into every release after its build. If the new code needs a variable
  the file does not have, the instance fails its check and the deploy switches back.
- **`NEXT_PUBLIC_*` values are compiled in at build time** and come from `/etc/firstfold-platform-build.env` on the
  server, not from the env files. A new one must be added there before the merge.
- **A build never sees real secrets.** The build environment holds placeholders that only satisfy the env schemas, and
  the real env files are linked in after the build. No page may need the database to prerender.
- **The database integration tests do not run on the server.** CI's `database` job (every migration on an empty
  database, then `pnpm test:integration`) needs a scratch Postgres the sandbox does not have. Run
  `pnpm test:integration` locally for changes under `packages/db`, `packages/auth` or `packages/shared`.

## Operating it

From the operator's machine, in `vps-setup`:

| Task | Command |
|---|---|
| What each app runs, what `main` would deploy | `platform/deploy-platform.sh --status` |
| Deploy now instead of waiting for the minute | `platform/deploy-platform.sh` |
| Deploy from the operator's machine (server cannot reach GitHub) | `platform/deploy-platform.sh --upload [platform\|admin]` |
| List releases | `platform/deploy-platform.sh --list` |
| Roll an app back | `platform/deploy-platform.sh --rollback <platform\|admin> <release>` |
| Deploy `main` again after a rollback or a failed commit | `platform/deploy-platform.sh --resume` |

A rollback pauses the automatic deploy, so it does not put `main` straight back; `--resume` lifts the pause.

Logs:

```bash
journalctl -u firstfold-platform-autodeploy        # deploys
journalctl -u firstfold-app -u firstfold-app2 -f    # app.
journalctl -u firstfold-admin -f                    # admin.
```

## Environment files

`/srv/firstfold/shared/platform.env.local` and `/srv/firstfold/shared/admin.env.local`, owned by `deploy`, mode 600.
Do not run `pnpm env:init` on the server; it writes development values.

The platform's file holds the public origins (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `APP_ORIGIN`,
`ADMIN_ORIGIN`), the three application role connections (`DATABASE_URL`, `DATABASE_URL_STAFF`,
`DATABASE_URL_PUBLIC`), `DATABASE_URL_PAYLOAD`, `BETTER_AUTH_SECRET`, `PAYLOAD_SECRET`, `LEADS_API_TOKEN`,
`DIRECTORY_URL_KEY`, `FIRSTFOLD_MEDIA_ROOT`, the billing settings and the other tokens its env schema
(`apps/platform/lib/server/env.ts`) asks for. The admin's file is deliberately smaller: no customer-scoped or
lead-intake credential (`apps/admin/lib/server/env.ts`).

Things that bite:

- `BETTER_AUTH_SECRET` and `PAYLOAD_SECRET` must be byte-identical in both files.
- `FIRSTFOLD_MEDIA_ROOT` must be the same directory in both (`/srv/firstfold-media`): the platform writes uploads and
  the console reads them.
- `DIRECTORY_URL_KEY` must equal the website's, or business URLs stop matching.
- Private support screenshots (`docs/operations/support-attachments.md`): with local storage, `FIRSTFOLD_SUPPORT_ROOT`
  must be the same directory in both files, outside `FIRSTFOLD_MEDIA_ROOT`. With object storage, the four
  `SUPPORT_R2_*` settings are all-or-none, the same in both files, and `SUPPORT_R2_BUCKET` must be a private bucket
  that is not `R2_BUCKET`.
- Robot check (Cloudflare Turnstile), in **both** files and in the website's: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET`,
  the same pair everywhere. The widget's domains in the Cloudflare dashboard must include `firstfold.io`,
  `app.firstfold.io` and `admin.firstfold.io`. Neither app refuses to start without them: with either missing the check is
  off, forms work as before, and the log says so at start (`Turnstile is not set up`). So the release can go out before
  the keys, but until they are set the sign-in, sign-up, password and setup forms are not protected. Restart both apps
  after setting them. Staging or any other hostname needs `TURNSTILE_HOSTNAMES` (comma separated) too.
- Email through Brevo, in **both** files: `BREVO_API_KEY`, `ALERTS_FROM_EMAIL`, `ALERTS_FROM_NAME`,
  `SUPPORT_ALERT_EMAIL`. Both apps refuse to start on a real deployment without `BREVO_API_KEY`: the platform sends
  password-reset and confirmation emails, and the console sends setup, preview and launch emails to customers. **Before you set `BREVO_API_KEY`, authenticate the `firstfold.io` domain in Brevo (its SPF,
  DKIM and DMARC DNS records) and add `alerts@firstfold.io` (or the address in `ALERTS_FROM_EMAIL`) as a sender.** The
  sender is only a From address, so it needs no mailbox. Once the domain is authenticated Brevo normally accepts any
  address on it; if Brevo asks to confirm the address by email, forward `alerts@` to a mailbox you read for that one
  step. Replies go to the support mailbox (`SUPPORT_ALERT_EMAIL`), not to `alerts@`. Until the domain is authenticated
  Brevo rejects or filters every message. With the key set, support alerts, error alerts, new-lead notices,
  preview-response notices and every email to a customer go out through Brevo. The staff Outbox keeps a copy, but the
  copy of an email that carries a sign-in link (password reset, email confirmation, setup link) leaves the link out.
  Outbox rows are deleted after 90 days, and those sign-in emails after one day (`pnpm support:attachments:maintain`). A Brevo
  failure never fails the request that sent the email (the call times out after 10 seconds, and the email is recorded
  in the Outbox instead).
- The mailbox in `SUPPORT_ALERT_EMAIL` is a place customer text is stored: alert emails about support requests carry
  the request text, the requester's name, email and phone, so staff can triage from the inbox. The database Outbox
  copy of those alerts keeps only the reference, category, status and a link. Delete old alerts from the mailbox when
  a customer asks for erasure.
- `VIMEO_ACCESS_TOKEN` (business videos, below) must be the same in both files. The optional `R2_*` settings (pictures kept
  in a Cloudflare R2 bucket instead of on disk) are all-or-none and must also be the same in both; a half-set list stops the
  app at its first media request, naming what is missing.
- `BILLING_PROVIDER=fake` with `FIRSTFOLD_ALLOW_FAKE_BILLING=1` gives paid access without payment. It is there only
  while the site is in staging; replace it with the Razorpay settings before a real customer gets a setup link.
- The Razorpay settings go in **both** files: `BILLING_PROVIDER=razorpay`, `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
  (the console's Pricing page creates Razorpay plans with them). `RAZORPAY_WEBHOOK_SECRET` goes in the platform's file
  only, set at the same moment the webhook is saved in the Razorpay dashboard: without it every delivery is answered
  500, and Razorpay disables a webhook that keeps failing. None of them belong in the build file. The events to
  subscribe are listed in `apps/platform/.env.example`.

## Things that are easy to get wrong

- **nginx must pass the original `Host`.** The platform routes by host (`apps/platform/proxy.ts`) and answers 404 to
  anything it does not recognise, so a rewritten `Host` makes every page 404.
- **`output: "standalone"` does not work here.** Next 16's standalone server does not run `proxy.ts`, so host routing
  disappears and every page 404s while `/api/*` still answers. The apps run with `next start` from their release.
- **Payload's migrations are not optional.** Payload refuses to push schema in production; without
  `scripts/cms-migrate.sh`, `webfold_payload` falls behind and every blog and media request fails.

## Business videos: Vimeo

Premium members add up to three 16-second videos to their page (`docs/superpowers/specs/2026-10-07-business-videos-design.md`).
They are hosted on **Vimeo**, as unlisted videos in Firstfold's own account, and played in Vimeo's embedded player. The
member's browser sends the file straight to Vimeo; the server never carries it, so there is nothing to install on the box
(no ffmpeg) and no nginx change. The platform only talks to Vimeo's API to ask for an upload, read the video back once
Vimeo has prepared it (its length, poster and privacy hash), and delete it. A video is live as soon as Vimeo has prepared it;
staff can only take one down (staff console, Ads, Videos), which deletes it from Vimeo too.

**1. A "Firstfold" folder and an API access token.** Every video is made inside a folder named **Firstfold** (any capitals)
in the Vimeo account. Make the folder in Vimeo first (Library, New, Folder): without it, uploads answer "not available"
and log that the folder is missing, rather than filing videos loose.

Then the token (the Vimeo account's Starter plan is enough; check the storage tracker on its homepage shows 2 TB):

1. developer.vimeo.com, My Apps: create an app (name it "Firstfold"; "Will people besides you be able to access your app?"
   is **No**).
2. On the app's page, Generate an access token: **Authenticated (you)**, with the scopes `public`, `private`, `upload`,
   `edit` and `delete`. Copy it at once; it is shown once.
3. Put it in **both** apps' env files on the server, then restart both services (the staff console deletes the video from
   Vimeo when staff take one down):

```
VIMEO_ACCESS_TOKEN=...
```

Without the token, member video uploads answer "Video uploads aren't available right now" and everything else works; a
take-down still removes the video from the page, and logs that Vimeo could not be told.

**2. Nothing else.** The dashboard's content security policy already allows Vimeo's player (`frame-src`), its posters
(`img-src` i.vimeocdn.com) and the browser's upload to `*.upload.vimeo.com` (`connect-src`); the marketing website's policy
allows the player and posters too.

**Limits to know** (Vimeo Starter, checked 2026-10-08):

- The API quota Vimeo reported for the account was 2 TB, with no weekly cap. Vimeo's developer docs still list 5 GB a week
  and 250 GB a year for Starter, so watch the first busy week: when Vimeo refuses an upload for allowance, the member is
  told to try again in a few days.
- Unlisted is link-only: Starter cannot limit a video to firstfold.io (that is Standard and above).
- Each started upload makes an empty video on Vimeo. The platform deletes the ones that never finished (the next time that
  business starts an upload) and any that fail, but a business that starts one and never returns leaves one empty video
  behind; delete strays in Vimeo's library now and then.
- Migration `0139` removes any video rows made while videos were kept in Cloudflare R2 (never released), so nothing is left
  over from that version.

**Check it:** as a Premium member, add a short video on Business profile, Photos: it shows "Getting it ready" for under a
minute, then "Live on your page"; open the business page and press play.

## Support maintenance

One command does all the scheduled clean-up for the support feature. It must be scheduled: nothing runs it by itself,
and without it expired screenshots stay in private storage.

```bash
cd /srv/firstfold/current-platform && pnpm support:attachments:maintain
```

It needs the platform's env file (`DATABASE_URL_STAFF` and the support storage settings) and the same private storage
the apps use. Each run does at most 100 items of each kind and exits with an error if any deletion failed, so the next
run retries. What it removes:

- screenshots that were uploaded but never attached to a request, after 24 hours, and objects whose delete failed
  earlier;
- closed support requests (their text, notes, read state and screenshots) 24 months after closing, the retention
  schedule's period (`docs/operations/retention-schedule.md`). `SUPPORT_TICKET_RETENTION_MONTHS` in the platform's env
  file can set another whole number from 1 to 120; nothing turns it off;
- everything else on the retention schedule, through `retention:run` (`docs/operations/retention-run.md`);
- resolved automatic error issues 90 days after they were resolved, and error event receipts older than a day.

Schedule it with a daily systemd timer on the VPS. The timer and service units belong in the separate `vps-setup`
repository and are added by the owner; this repository does not hold them. A suitable service runs the command above as
the `deploy` user, and a timer with `OnCalendar=daily` and `Persistent=true` starts it. Daily is enough because staged
screenshots expire after 24 hours and everything else is slower. Each run does at most 100 items of each kind, so if a
large backlog builds up (a run reports 100 of something), run the command again by hand until it reports less. Check it
with `journalctl -u <service>`: a successful run prints one line starting `Support maintenance:`.

## First staff account on a new server

After the roles and both migrations exist (`pnpm db:roles` before `pnpm db:migrate`: migration
`0001_rls_and_grants.sql` grants privileges to the roles, so they must exist first):

```bash
cd /srv/firstfold/current-platform && pnpm staff:create --email you@firstfold.io --name "Your Name"
```
