# Brandbasket platform on the Firstfold VPS

`app.brandbasket.in` (customer dashboard, `apps/platform`) and `console.brandbasket.in` (staff console, `apps/admin`) run on the
Hostinger VPS that already runs Firstfold (`ssh firstfold-vps`, 201.18.196.170, IPv6 `2a02:4780:63:bbcc::1`), the way Firstfold runs
there: the VPS pulls `main` and every branch from GitHub, runs CI in a sandbox, deploys `main` with health-checked switches, and
reports both to GitHub's Checks tab. This is staging first: Razorpay test keys, noindex. Plan and decisions:
`BrandBasket/docs/plans/17-platform-vps-deploy.md`. The model it copies is Firstfold's `vps-setup/README.md`; read that for anything
this page does not say.

This replaces `brandbasket-droplet.md` (a push-from-the-Mac droplet that was never built). The droplet page stays for the sections
this one points to: Brevo (8), Razorpay (9), environment variables (15) and the free-website-address notes.

```
 visitor ── Cloudflare (proxied) ──IPv6──▶ nginx :443 ─┬─ app.brandbasket.in      brandbasket-app    :3201  apps/platform
                                                        └─ console.brandbasket.in  brandbasket-admin  :3203  apps/admin
                                                                  │   (the same nginx serves www/app/admin/sales.firstfold.io)
                                              Postgres 16, localhost:5432 (brandbasket_platform, brandbasket_platform_payload)
```

All files for this live in `deploy/vps/` of this repository. Nothing in it holds a secret. Firstfold's files are read, never changed:
nothing of Firstfold's is edited, restarted or reloaded, apart from `nginx reload` after `nginx -t` passes. Every Brandbasket name
starts `brandbasket` (units, scripts, paths, locks) or `bb` (the database roles and the CI user).

## What runs where

| What | Where |
|---|---|
| Apps | `brandbasket-app` (3201) and `brandbasket-admin` (3203), user `deploy`, `next start` from `/srv/brandbasket/current-platform/apps/platform` and `current-admin/apps/admin`. Caps: 800M/1000M and 500M/650M (high/max) |
| Releases | `/srv/brandbasket/releases/<sha>` with `current-platform`, `current-admin` and `deploying` symlinks; mirror `/srv/brandbasket/repo.git` |
| Env files | `/srv/brandbasket/shared/{platform,admin}.env.local` (deploy, 600), linked into a release after its build. Build env: `/etc/brandbasket-platform-build.env` (public values and placeholders) |
| Uploads | `/srv/brandbasket/media`, `/srv/brandbasket/support-private` (outside the releases) |
| Database | roles `bb_owner` (migrations only), `bb_app`, `bb_staff`, `bb_public`, `bb_cms`; databases `brandbasket_platform`, `brandbasket_platform_payload`. Secrets file `/root/brandbasket-secrets.env` |
| Deploys | `brandbasket-platform-autodeploy.timer` at :20 of every minute; scripts `/usr/local/bin/brandbasket-platform-{autodeploy,release}`; `/usr/local/sbin/brandbasket-migrate` |
| CI | `brandbasket-ci.timer` at :50; user `bbci`; `/srv/brandbasket-ci`, `/var/lib/brandbasket-ci`; `/usr/local/bin/brandbasket-ci`, `/usr/local/sbin/brandbasket-ci-sandbox` |
| Shared library | `/usr/local/lib/brandbasket/{heavy-lock.sh,ci-steps.sh,ci-checks.py,ci-hosts,ci-resolv.conf}` |
| nginx | `/etc/nginx/sites-available/brandbasket` (+ `snippets/brandbasket-proxy.conf`); certificate lineage `brandbasket` |
| Backups | `brandbasket-backup.timer` 02:15 UTC, `brandbasket-restore-test.timer` Sunday 05:00 UTC; `/var/backups/brandbasket`; off-site `/etc/brandbasket/offsite.sh` |
| Upkeep | `brandbasket-maintenance.timer` 03:30 UTC; `brandbasket-erase.timer` 03:50 UTC, installed and **not enabled** |
| Sudo | `/etc/sudoers.d/brandbasket-deploy`: migrate, restart/stop/status of the two units, the CI sandbox |

Timer offsets across the box, so nothing starts together: Firstfold website :00, Brandbasket autodeploy :20, Firstfold platform :30,
Firstfold CI :45, Brandbasket CI :50; nightly Brandbasket backup 02:15 UTC, Firstfold's at 21:00, 21:30 and 22:00.

## One heavy job at a time

Four CPUs, and a build takes most of them. Every Brandbasket build, deploy or CI run holds four flock files, non-blocking, for its
whole run, and skips its minute (one log line, exit 0) when any is busy. `deploy/vps/heavy-lock.sh` is the one place that knows
them. All are opened by `deploy`, exclusive:

| File | Held by | How Firstfold's own scripts treat it (read on the server, 2026-10-22) |
|---|---|---|
| `/srv/brandbasket/.release.lock` | Brandbasket autodeploy, release and CI | Brandbasket's own |
| `/srv/firstfold/.release.lock` | Firstfold platform autodeploy and release | `exec 9>file; flock -n 9 \|\| exit 0`, kept for the whole deploy. Busy means "trying again next run", no failure, no alert. The release script (a hand-started deploy from the Mac) waits up to 30 minutes on it |
| `/srv/firstfold-website/.release.lock` | Firstfold website autodeploy and release | the same |
| `/srv/firstfold-ci/.ci.lock` | Firstfold CI | `flock -n 9 \|\| exit 0` at the start, kept for the whole run. Firstfold CI ignores the release locks and asks systemd whether an autodeploy service is active, so this file is the only way to keep it out of a Brandbasket build |

So holding Firstfold's three files makes its timers skip quietly. Nothing fails and nothing alerts. The one thing that can wait is a
deploy started by hand from the Mac: it waits for the lock up to 30 minutes, longer than any Brandbasket job here (45 minute unit
limit, typically 4). The reverse also holds: while any Firstfold deploy or CI run is going, Brandbasket's timers skip. A Firstfold
deploy is therefore delayed by a Brandbasket build by up to one build, and the other way round. Self-check, with a second process
playing Firstfold: `bash deploy/vps/test/heavy-lock-test.sh`.

## Install order

Everything goes through `deploy/vps/install.sh <step> [--apply]`. Without `--apply` a step prints its plan (it may read the server)
and changes nothing; every step can be run again. It refuses to write any file whose path does not name Brandbasket (and any that
names Firstfold), checks `nginx -t` before every reload and takes back what it added if the test fails, checks sudoers with
`visudo -cf`, and checks the units with `systemd-analyze verify` before installing them. The only edits to files Firstfold also
uses are marker-delimited blocks in `~deploy/.ssh/config` and ufw's `before.rules`/`before6.rules`.

Copy the files over (from this repository, on the Mac; `development` is the branch that holds them):

```bash
ssh firstfold-vps 'rm -rf /root/brandbasket-src && install -d -m 700 /root/brandbasket-src'
git archive development deploy scripts/server | ssh firstfold-vps 'tar -x -C /root/brandbasket-src'
```

Then, on the server, `cd /root/brandbasket-src && bash deploy/vps/install.sh <step>`. Do each step without `--apply` first.

| # | Who | Step |
|---|---|---|
| 1 | Owner | Take a Hostinger snapshot (none exists yet) |
| 2 | install.sh | `database --apply`: the five roles, the two databases, passwords into `/root/brandbasket-secrets.env` |
| 3 | install.sh | `dirs-env --apply`: `/srv/brandbasket/...`, `/etc/brandbasket`, the build env file, and the two env files with generated secrets |
| 4 | Owner | In **both** `/srv/brandbasket/shared/platform.env.local` and `admin.env.local` fill `BREVO_API_KEY`, `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (the three `FILL_ME` lines; Razorpay test keys, `rzp_test_...`). Brevo: droplet page section 8 (domain, one merged SPF record, DKIM, DMARC). `autodeploy --apply` refuses to start while any of them is blank |
| 5 | install.sh | `github --apply`: read-only deploy key `~deploy/.ssh/github-brandbasket-platform`, ssh alias `github-brandbasket-platform`, the mirror. It prints the public key |
| 6 | Owner | GitHub: add that key to `digibranders/brandbasket-platform` as a **read-only** deploy key (Settings, Deploy keys). Add the repository to the installation of the GitHub App `firstfold-vps-deploy` (App ID 5234124: Settings, Developer settings, GitHub Apps, Install App, Configure). Run `github --apply` again; it reports `the GitHub App ... can report` when both are right |
| 7 | install.sh | `nginx-http --apply`: port 80 for the two names |
| 8 | Owner | Cloudflare, zone `brandbasket.in`: add **proxied AAAA** records `app` and `console` to `2a02:4780:63:bbcc::1`, **no A record** (the IPv4 block is not proven reachable from Jio and Cloudflare India, see Firstfold's `INCIDENTS.md`). SSL/TLS mode **Full (strict)**. Recommended, as in Firstfold's zone: a cache rule that bypasses the cache for both hosts, Tiered Cache off |
| 9 | install.sh | `tls --apply --email <address>`: certbot, lineage `brandbasket`, a staging dry run first. Renewal is Firstfold's `certbot.timer` and its deploy hook, which reloads nginx |
| 10 | install.sh | `nginx-https --apply`: the full site |
| 11 | install.sh | `services --apply`: the two units (enabled, not started until a release exists), failure alerts, `brandbasket-migrate`, the sudoers file |
| 12 | install.sh | `autodeploy --apply`: scripts, lock library, timer. The first minute after it deploys `main` to both apps: install, lint, typecheck, test, build, env check, migrations on the empty databases, switch with a `/login` health check each |
| 13 | install.sh | `ci --apply`: user `bbci`, sandbox, ufw rule, timer |
| 14 | install.sh | `backups --apply`: installs the scripts and units. Then run `brandbasket-backup --apply` once by hand and `brandbasket-restore-test --apply`, then `backups --apply` again: the backup, restore-test and maintenance timers are enabled only when those have succeeded and a release exists. `brandbasket-erase.timer` is never enabled by this |
| 15 | Owner | First staff user (interactive, password typed twice): `ssh -t firstfold-vps "runuser -u deploy -- bash -c 'cd /srv/brandbasket/current-admin && pnpm staff:create --email <you> --name \"Your Name\" --role admin'"` |
| 16 | Owner | Razorpay test webhook: URL `https://app.brandbasket.in/api/webhooks/razorpay`, the secret is `RAZORPAY_WEBHOOK_SECRET` in `platform.env.local` (enter it in Razorpay at the same moment), the ten events listed in droplet page section 9 |
| 17 | Owner | Smoke tests below |

Housekeeping once it works: delete `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` and the `droplet` environment in this repository's GitHub
settings (nothing uses them now), and decide about Cloudflare Access for the console (nginx already refuses requests that did not
come through Cloudflare).

## Everyday operations

| Task | Command |
|---|---|
| Deploy | Merge `development` into `main` by pull request. The VPS deploys it within a minute or two (a build is about 4 minutes) |
| Deploy state | `ssh firstfold-vps runuser -u deploy -- brandbasket-platform-autodeploy --status` |
| Deploy now / retry a failed commit | `brandbasket-platform-autodeploy --resume` (as deploy) |
| Pause / resume | `brandbasket-platform-autodeploy --pause`, `--resume` |
| Releases and which app runs which | `brandbasket-platform-release --list` (as deploy) |
| Roll back one app | `brandbasket-platform-release --activate <platform\|admin> <release>` (as deploy). Health-checked, and it pauses the autodeploy so `main` does not replace it; `--resume` ends the pause |
| CI state | `runuser -u deploy -- brandbasket-ci --status` |
| Logs | `journalctl -u brandbasket-platform-autodeploy`, `-u brandbasket-ci`, `-u brandbasket-app -u brandbasket-admin`, `-u brandbasket-backup`, `-u brandbasket-maintenance` |
| Run a backup now | `brandbasket-backup --apply` |
| Prove the newest backup restores | `brandbasket-restore-test --apply`, or the off-site copy: `ssh root@firstfold-vps brandbasket-restore-test --apply --r2 < ~/droplet-backups/firstfold-backup-age.key` |
| Erase deleted accounts, preview | `runuser -u deploy -- /usr/local/sbin/brandbasket-erase-job --env-file /srv/brandbasket/shared/platform.env.local --dry-run` |
| Change an env value | Edit the file in `/srv/brandbasket/shared/`, then `systemctl restart brandbasket-app` (and `brandbasket-admin` for shared values) one at a time. Keep `BETTER_AUTH_SECRET`, `PAYLOAD_SECRET`, the origins and `BRANDBASKET_MEDIA_ROOT` identical in both files; `pnpm env:check` runs at every deploy |
| Check a commit again in CI | Delete its line from `/srv/brandbasket-ci/state/platform.checked` |

Migrations are never undone by a rollback: each must keep working with the code before it. The services migration (0184) is
forward-only, see the droplet page section 13.

## Seeing a deploy on GitHub

Same as Firstfold's (its README, "Seeing a deploy on GitHub"). The autodeploy calls Firstfold's installed
`/usr/local/lib/firstfold/github-status.sh` unchanged: its functions take the repository (`digibranders/brandbasket-platform`) as an
argument and the check names are passed in, so nothing in it needed copying. It uses the App id and key in `~deploy/`
(`.github-app-id`, `.github-app-key.pem`).

- **Checks tab of the commit and its pull request**: `Deploy app.brandbasket.in` and `Deploy console.brandbasket.in`, updated every
  10 seconds while the deploy runs, with a table of steps (install, lint, typecheck, test, build, env, migrations, switch), the end of
  the log with secrets masked, and the failing step named. An app the commit did not touch gets a grey "Unchanged by this commit"; a
  docs-only commit (`docs/`, `deploy/`, `.github/`, top-level `*.md`) gets "Nothing to deploy".
- **Deployments panel** of the repository: one environment per host.
- If the App is not installed for the repository, the reporting falls back to Firstfold's personal token, which does not cover this
  repository, and deploys run unreported. They are never blocked by GitHub.
- GitHub sends no email for these checks. Failed units email the team through Firstfold's `firstfold-notify-failure` (see Monitoring).

## CI for pushes and pull requests

`ci.yml` stays in the repository (it is what runs when GitHub Actions is available) but cannot run while Actions is blocked, so the
VPS checks every push itself.

- **Where to look**: the pull request's Checks tab. Five checks per commit: `CI: install`, `CI: lint`, `CI: typecheck`, `CI: test`,
  `CI: build`. They are the deploy's own commands, and a commit that passes them passes the deploy's checks.
- **What is checked**: the head of every branch except `main` (main is checked by its deploy), within about a minute of a push. One
  commit at a time, never while any heavy job runs. Firstfold's `ci-checks.py` is copied to `deploy/vps/ci/ci-checks.py` with one
  line changed (the journal unit named in the check footer); its repository comes in as an argument.
- **Not run**: the database integration tests (`pnpm test:integration` needs Postgres). Run them locally for changes under
  `packages/db`, `packages/auth`, `packages/billing`, `packages/shared`, email, or RLS.
- **Sandbox** (pushed code is unreviewed): user `bbci`, no sudo, no capabilities, no new privileges, private `/tmp`, read-only system,
  writes only its work directory and `/var/lib/brandbasket-ci`; `/home`, `/root`, `/srv/brandbasket*` (except its own work
  directory), `/etc/brandbasket`, `/srv/firstfold*`, `/etc/firstfold`, `/var/lib/firstfold*`, certificates and backups are invisible;
  its own `/etc/hosts` and `/etc/resolv.conf`; link-local addresses blocked; Nice 10, CPUWeight 20, MemoryMax 5G, 30 minute limit,
  the same as Firstfold's `ffci`. `/etc/brandbasket-platform-build.env` stays readable (public values and placeholders; the checks
  source it). On loopback a ufw rule for `bbci`, added next to Firstfold's `ffci` rule in `before.rules` and `before6.rules`
  between its own marker comments, allows only ephemeral ports (10240 and up, for Turbopack's workers) and resets every service
  port, including through the public address. `install-ci-firewall.sh` parses the new rule file with `iptables-restore --test`
  before replacing the old one, and never touches a line outside its markers.
- A run counts as passed only if it printed `== result: passed`.

## Network and edge

| Hostname | Cloudflare | Origin |
|---|---|---|
| `app.brandbasket.in` | Proxied | AAAA `2a02:4780:63:bbcc::1`, IPv6 only |
| `console.brandbasket.in` | Proxied; nginx answers 403 unless the request came through Cloudflare (or from 127.0.0.1) | AAAA, IPv6 only |

- Every listener has an IPv6 twin (`listen [::]:443 ssl http2`), and Firstfold's real-IP snippet trusts Cloudflare's IPv6 ranges, so
  the proxied traffic, which arrives over IPv6 only, is served and logged with the visitor's address.
- The site file uses Firstfold's `conf.d/10-cloudflare.conf` (`$from_cloudflare`, `$realip_remote_addr`),
  `snippets/cloudflare-realip.conf` and its rate-limit zones `general`, `signin` and `perip`, and repeats none of them. Not repeated
  either: `server_tokens`, `ssl_protocols`, gzip, log format (all in `nginx.conf`). HSTS comes from the apps (an https build);
  `X-Robots-Tag` from `apps/platform/proxy.ts`, added in nginx only for the console.
- Proxy rules: `Host` passed through, `X-Forwarded-For` overwritten with the peer address (never appended), `X-Forwarded-Proto` set.
- ufw already admits 80 and 443 only from Cloudflare's ranges; 3201 and 3203 stay closed (Next listens on all interfaces on
  purpose, see the unit comment).
- TLS: Let's Encrypt, ECDSA, lineage `brandbasket` for the two names, HTTP-01 from `/var/www/acme` through Cloudflare, renewed by
  Firstfold's `certbot.timer`. Every server block, port 80 and 443, serves the challenge path.

## Backups

- Nightly at 02:15 UTC: `pg_dump -Fc` of both databases (each listed with `pg_restore -l`), a hardlinked copy of `media` and
  `support-private`, and `server-config.tar.gz` (Brandbasket's nginx files, units, sudoers, scripts, certificate, deploy key, env
  files and secrets file; not Firstfold's) to `/var/backups/brandbasket` (14 daily, 8 weekly, root only), then an age-encrypted copy
  to R2. Role passwords are not dumped with `pg_dumpall` (that would copy Firstfold's roles); the secrets file in the config archive
  recreates the `bb_*` roles through `install.sh database`.
- **Bucket `firstfold-backups`, same token and age key as Firstfold.** Objects: `daily/brandbasket-<UTC stamp>.tar.age` and
  `.sha256`, and on Sundays `weekly/brandbasket-<UTC stamp>.tar.age` and `.sha256`. Firstfold's are `daily/firstfold-<stamp>...`.
  The bucket's rules (daily 35 days, weekly 90, 30 day lock on `daily/`) apply by prefix, so they apply to these too. The script
  only ever writes those exact names (a pattern check before every write), never lists a wider prefix, never syncs, moves or
  deletes, so it cannot overwrite or prune a Firstfold object. Firstfold's `firstfold-restore-test --r2` picks the last name in
  sorted order under `daily/`, and `brandbasket-` sorts before `firstfold-`, so it keeps choosing its own backups.
- The age private key stays on the operator's Mac only. The public key is read from `/etc/firstfold/backup-age.pub`, the R2 settings
  from `/etc/firstfold/r2.env` through `/usr/local/lib/firstfold/r2-lib.sh` (IPv6 first, as there).
- Real restore, in order: `install.sh database --apply` (the roles must exist, the dump keeps object owners; take the secrets file
  from `server-config.tar.gz` first), stop the two apps, `pg_restore` into a scratch database, check it, swap names while nothing is
  connected, restore media with `rsync -a`, start the apps, run the smoke tests.

## Monitoring

`systemctl --failed` must be empty. Failure alerts: `brandbasket-app`, `brandbasket-admin`, the autodeploy, the backup, the restore
test and the maintenance job carry `OnFailure=firstfold-notify-failure@%n.service`, Firstfold's generic mail handler (any unit name,
the last 30 journal lines with secrets masked, one mail per unit per 30 minutes). It sends through the Brevo settings in
Firstfold's `platform.env.local`, so Brandbasket's own `BREVO_API_KEY` is not needed for alerts, and the subject reads `[Firstfold
server] <unit> failed`. The CI unit has no alert, as Firstfold's has none. An external check on `https://app.brandbasket.in/login`
is still the owner's to add.

## Smoke tests

From the Mac, after step 16:

```bash
curl -sI https://app.brandbasket.in/login | head -1                                         # HTTP/2 200
curl -sI http://app.brandbasket.in/login | head -3                                          # 301 to https
curl -sI https://console.brandbasket.in/login | head -1                                     # 200 (or Access, once set up)
curl -sk --resolve console.brandbasket.in:443:201.18.196.170 https://console.brandbasket.in/login -o /dev/null -w '%{http_code}\n'   # blocked: ufw drops it (000)
curl -m 5 -sI http://201.18.196.170:3201/login; echo "exit $?"                              # times out (28)
curl -m 5 -sI http://201.18.196.170:3203/login; echo "exit $?"                              # times out (28)
```

On the server, `curl -sk --resolve console.brandbasket.in:443:127.0.0.1 https://console.brandbasket.in/login -o /dev/null -w '%{http_code}\n'`
is 200 (loopback is allowed). From any address that is not Cloudflare's, ufw drops the connection first and nginx's own 403 is the
second line.

Then in a browser: sign up with a fresh email (the code arrives from `no-reply@brandbasket.in`), sign in, pay once in test mode
(Razorpay's webhook page shows 200, the account shows the plan), open a support request with a screenshot, sign in to the console.
On the server: `systemctl --failed` is empty, both `--status` commands look normal, and Firstfold's own `--status`, journals and CI
show normal runs throughout.

## Not verified

Checked on 2026-10-22 without writing to the server: every shell file passes `bash -n` and shellcheck. In an Ubuntu 24.04 container
(nginx 1.24.0, systemd 255): `nginx -t` passes for the full site on top of a copy of Firstfold's live `/etc/nginx`, and a deliberately
broken site is taken back (restored, or removed when new) with `nginx -t` passing again; `install.sh` plans and applies for
`dirs-env`, `github`, `nginx-http`, `nginx-https`, `services` and `autodeploy` with `systemctl` stubbed; `systemd-analyze verify`
passes for every unit (it found `StartLimit*` in the wrong section of the old droplet units; fixed); `visudo -c` passes and `sudo`
refuses anything outside the rule; the lock library passes its self-check with real `flock`; the autodeploy runs against a local
git remote (first deploy, docs-only and `deploy/`-only commits, one-app commits, a busy lock of each Firstfold file, a failing
release recorded and not retried, `--resume`) and the release script against stubs of `pnpm`, `curl` and `sudo` (first deploy, env
check failure before migrations, switch-back, first deploy that never answers, `--activate`); the CI script against a local remote
with a stubbed sandbox; the ufw script against copies of Firstfold's `before.rules` and `before6.rules` (block added once, Firstfold's
block and every other line unchanged, new rules parsed by `iptables-restore --test`).

Not run anywhere, to be proven on the server at the step that needs it: the real `pnpm install`, lint, build and migrations on the
empty database; the apps starting under their unit limits; `systemd-run` with the sandbox properties and `bbci` actually being
unable to see the hidden paths or reach service ports (probe it as Firstfold did: a run of the sandbox that tries `/srv/brandbasket`,
`/srv/firstfold`, `localhost:5432` and `localhost:3201`); `ufw reload` with the new block; the GitHub App reporting for the new
repository; the first Let's Encrypt issuance for `brandbasket.in` through Cloudflare (Firstfold's renewal through its proxy was
tested in its own zone; if the HTTP-01 challenge fails, set the zone's SSL/TLS mode to Flexible for the minutes it takes, then back to
Full (strict)); a real R2 upload and a restore from it; memory and timing of a build next to Firstfold's apps.

## Owner decisions

- Cloudflare Access in front of the console: not needed for staging (nginx refuses non-Cloudflare requests); the console's own sign-in
  has no second factor (`docs/STAFF-ACCESS.md`), so set it up before real staff use it.
- Starting `brandbasket-erase.timer`: it deletes customer data 30 days after a closure. Not enabled by anything here.
- Whether Brandbasket alerts should get their own subject line and recipients: today they reuse Firstfold's handler and team address.
