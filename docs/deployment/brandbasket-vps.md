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
nothing of Firstfold's is edited, restarted or reloaded, apart from `nginx reload` after `nginx -t` passes (and, only when one is
missing, the empty lock file `install.sh user` creates, see "One heavy job at a time"). Every Brandbasket name starts `brandbasket`
(units, scripts, paths, locks) or `bb` (the database roles and the CI user).

**Brandbasket has its own Unix user, `brandbasket`, and never runs as Firstfold's `deploy`.** Both apps, the autodeploy, the
release, the CI orchestration, the upkeep jobs and the erase job run as `brandbasket`; it owns `/srv/brandbasket*`, has its own
`~/.ssh` (the read-only deploy key, `known_hosts`, the `github-brandbasket-platform` alias) and its own copy of the GitHub App id
and key. The reason: a compromised Brandbasket app, or a bad npm package in its build, then cannot read Firstfold's env files, GitHub
keys or App key, nor write into Firstfold's releases, because it is a different user and, for the units, because Firstfold's folders
are made invisible to them (`InaccessiblePaths`, below). The user has no login shell (`nologin`) and no ssh access (sshd allows
`root` and `deploy` only); operators act as it with `runuser -u brandbasket -- env HOME=/home/brandbasket <command>`, written
`as-bb <command>` in this page.

## What runs where

| What | Where |
|---|---|
| User | `brandbasket` (system user, `/home/brandbasket`, shell `nologin`, mode 700). `bbci` runs only the CI sandbox |
| Apps | `brandbasket-app` (3201) and `brandbasket-admin` (3203), user `brandbasket`, `next start` from `/srv/brandbasket/current-platform/apps/platform` and `current-admin/apps/admin`. Caps: 800M/1000M and 500M/650M (high/max). Sandboxed like Firstfold's apps (see "Unit hardening") |
| Releases | `/srv/brandbasket/releases/<sha>` with `current-platform`, `current-admin` and `deploying` symlinks; mirror `/srv/brandbasket/repo.git` |
| Env files | `/srv/brandbasket/shared/{platform,admin}.env.local` (brandbasket, 600; `/srv/brandbasket` is 750, so Firstfold's `deploy` cannot enter it), linked into a release after its build. Build env: `/etc/brandbasket-platform-build.env` (public values and placeholders) |
| Uploads | `/srv/brandbasket/media`, `/srv/brandbasket/support-private` (outside the releases) |
| Database | roles `bb_owner` (migrations only), `bb_app`, `bb_staff`, `bb_public`, `bb_cms`; databases `brandbasket_platform` (connection limit 40) and `brandbasket_platform_payload` (20), so neither can take the connections Firstfold's databases need (`max_connections` is 120). Secrets file `/root/brandbasket-secrets.env` |
| Deploys | `brandbasket-platform-autodeploy.timer` at :20 of every minute; scripts `/usr/local/bin/brandbasket-platform-{autodeploy,release}`; `/usr/local/sbin/brandbasket-migrate` |
| CI | `brandbasket-ci.timer` at :50 (runs as `brandbasket`); sandbox user `bbci`; `/srv/brandbasket-ci`; the sandbox's work directory and `bbci`'s home live on an 8 GB ext4 image, `/srv/brandbasket-ci/sandbox.img`, mounted at `/srv/brandbasket-ci/sandbox` by the unit `srv-brandbasket\x2dci-sandbox.mount`; `/usr/local/bin/brandbasket-ci`, `/usr/local/sbin/brandbasket-ci-sandbox` |
| Shared library | `/usr/local/lib/brandbasket/{heavy-lock.sh,github-lib.sh,ci-steps.sh,ci-checks.py,ci-hosts,ci-resolv.conf}` |
| nginx | `/etc/nginx/sites-available/brandbasket` (+ `snippets/brandbasket-proxy.conf`); certificate lineage `brandbasket` |
| Backups | `brandbasket-backup.timer` 02:15 UTC, `brandbasket-restore-test.timer` Sunday 05:00 UTC; `/var/backups/brandbasket`; off-site `/etc/brandbasket/offsite.sh` |
| Upkeep | `brandbasket-maintenance.timer` 03:30 UTC; `brandbasket-erase.timer` 03:50 UTC, installed and **not enabled**. Both run as `brandbasket`, sandboxed |
| Alerts | `/usr/local/sbin/brandbasket-notify-failure` and `brandbasket-notify-failure@.service` (Brandbasket's own, see "Monitoring") |
| Sudo | `/etc/sudoers.d/brandbasket`, user `brandbasket` only: `brandbasket-migrate` (no arguments), restart and stop of the two app units, `brandbasket-ci-sandbox`. Nothing else, and `deploy` has no Brandbasket rule |

Timer offsets across the box, so nothing starts together: Firstfold website :00, Brandbasket autodeploy :20, Firstfold platform :30,
Firstfold CI :45, Brandbasket CI :50; nightly Brandbasket backup 02:15 UTC, Firstfold's at 21:00, 21:30 and 22:00.

## One heavy job at a time

Four CPUs, and a build takes most of them. Every Brandbasket build, deploy or CI run holds four flock files for its whole run, and
skips its minute (one log line, exit 0) when any is busy. `deploy/vps/heavy-lock.sh` is the one place that knows them.

| File | Held by | How Firstfold's own scripts treat it (read on the server, 2026-10-22) |
|---|---|---|
| `/srv/brandbasket/.release.lock` | Brandbasket autodeploy, release and CI | Brandbasket's own (owner `brandbasket`, opened in append mode) |
| `/srv/firstfold/.release.lock` | Firstfold platform autodeploy and release | `exec 9>file; flock -n 9 \|\| exit 0`, kept for the whole deploy. Busy means "trying again next run", no failure, no alert. The release script (a hand-started deploy from the Mac) waits up to 30 minutes on it |
| `/srv/firstfold-website/.release.lock` | Firstfold website autodeploy and release | the same |
| `/srv/firstfold-ci/.ci.lock` | Firstfold CI | `flock -n 9 \|\| exit 0` at the start, kept for the whole run. Firstfold CI ignores the release locks and asks systemd whether an autodeploy service is active, so this file is the only way to keep it out of a Brandbasket build |

**Live permissions found on 2026-10-22 (read only):** `/srv` is `root:root 755`; `/srv/firstfold`, `/srv/firstfold-website` and
`/srv/firstfold-ci` are `deploy:deploy 755`; the three lock files exist, are empty, and are `deploy:deploy 0644`. So any user can
traverse the directories and open the files read-only. Brandbasket takes the three Firstfold locks through a **read-only** descriptor
(`flock` needs no write access), so it holds Firstfold's locks without being able to change or truncate a Firstfold file. Firstfold,
opening them for writing as `deploy`, is unaffected.

- `install.sh user` (and again `autodeploy` and `ci`) checks this on the server every time: each lock file's directory and every
  parent must be traversable by others, and the file readable by others, or the step **stops with a STOP message and changes
  nothing**: this kit never alters Firstfold's permissions. If a lock file is missing in a Firstfold directory that exists, the
  step's plan says so and `--apply` creates it empty, `deploy:deploy`, mode `0644` (Firstfold opens it for writing as `deploy`, so it
  must never be root-owned). A Firstfold directory that does not exist (Firstfold not installed) is skipped.
- A lock file that cannot be opened is an **error, not "busy"**: the autodeploy and CI exit 1 (the unit fails and the alert goes
  out), and the commit is not marked as checked.
- The locks are held by a small **holder process**, not by the script that asked for them. A script holding the descriptors itself
  would hand them to every child (pnpm, node, git, curl), and an orphan left behind by a killed build would keep Firstfold locked
  out. The holder is the only process with the files open; it lets go when the script releases them, and within two seconds of the
  script dying for any reason, `kill -9` included. No pnpm, git or GitHub call ever has a lock descriptor.
- **Taking all four is all or none, and never blocks while holding one.** A timer run takes them without waiting. A hand-run
  `brandbasket-platform-release` that finds one busy polls (take everything; if any is busy give everything back and look again after
  5 seconds) for up to 30 minutes. A free lock is therefore never kept away from a Firstfold timer by a Brandbasket job that is only
  waiting.
- **Hand-started runs are bounded.** The timers' units carry their own `TimeoutStartSec` (45 minutes for the autodeploy, 50 for CI).
  A run started by hand (`brandbasket-platform-release --activate`, `--build-only`, a manual release, a manual autodeploy or CI run)
  starts itself again under `systemd-run --user -p RuntimeMaxSec=45min` when the user has a systemd user session, otherwise under
  `timeout --kill-after=2m 45m` (the case on this box: `brandbasket` has no login session). At the limit every process of the run
  is stopped, so nothing is left holding a build or a lock.

Holding Firstfold's three files makes its timers skip quietly. Nothing fails and nothing alerts. The one thing that can wait is a
deploy started by hand from the Mac: it waits for the lock up to 30 minutes, longer than any Brandbasket job here (45 minute unit
limit, typically 4). The reverse also holds: while any Firstfold deploy or CI run is going, Brandbasket's timers skip. A Firstfold
deploy is therefore delayed by a Brandbasket build by up to one build, and the other way round. Self-check, with a second process
playing Firstfold (and, as root, the take made as another user): `bash deploy/vps/test/heavy-lock-test.sh`.

## Unit hardening

Both app units, `brandbasket-maintenance` and `brandbasket-erase` copy Firstfold's app hardening: `NoNewPrivileges`, `PrivateTmp`,
`PrivateDevices`, `ProtectSystem=strict`, `ProtectHome`, `ProtectKernel*`, `ProtectControlGroups`, `ProtectClock`,
`ProtectHostname`, `RestrictNamespaces`, `RestrictRealtime`, `RestrictSUIDSGID`, `LockPersonality`, `RestrictAddressFamilies`,
`SystemCallFilter=@system-service`, `CapabilityBoundingSet=` (none), `UMask=0077`, `LimitNOFILE=65535`. They write only what
Brandbasket writes: the apps `/srv/brandbasket/releases` (Next's `.next/cache`), `media` and `support-private`; maintenance `media`
and `support-private` (with `/var/cache/brandbasket-maintenance` as its home for pnpm); erase nothing. `systemd-analyze security`
rates each at 1.7 OK. On top of that, **Firstfold's paths do not exist for these units**: `InaccessiblePaths=` (each with the `-`
prefix, so a missing path is ignored) for `/srv/firstfold`, `/srv/firstfold-website`, `/srv/firstfold-media`, `/srv/firstfold-ci`,
`/etc/firstfold`, `/var/backups`, `/var/lib/firstfold` and `/var/lib/firstfold-ci`.

The autodeploy and CI units cannot use `NoNewPrivileges` or a read-only system (they build, run `sudo` and hold Firstfold's lock
files), so they get the narrowest `InaccessiblePaths` that still leaves the three lock files reachable: Firstfold's `shared`,
`releases` and `repo.git` folders (platform and website), `/srv/firstfold-media`, the CI `archives`, `mirrors`, `state` and `work`
folders, `/etc/firstfold`, `/home/deploy`, `/var/backups`, `/var/lib/firstfold` and `/var/lib/firstfold-ci`.

What is still shared, and cannot be fixed from here: root; the one Postgres server (separate roles and databases, connection caps);
nginx and its reload; Firstfold's installed helper scripts and the GitHub App credentials (Brandbasket has its own copy of the
App id and key); the Firstfold folders that are world-readable on disk (`releases`, `repo.git` and `shared` are mode 755 with 600
env files inside; the units above and the CI sandbox cannot see them, but a process outside those units running as `brandbasket`
could read Firstfold's release source).

## Install order

Everything goes through `deploy/vps/install.sh <step> [--apply]`. Without `--apply` a step prints its plan (it may read the server)
and changes nothing; every step can be run again. It refuses to write any file whose path does not name Brandbasket (and any that
names Firstfold), checks `nginx -t` before every reload and takes back what it added if the test fails, checks sudoers with
`visudo -cf`, and checks the units with `systemd-analyze verify` before installing them. The only edits to files Firstfold also
uses are the marker-delimited block in ufw's `before.rules`/`before6.rules`, and the one empty lock file `user` creates when a Firstfold lock
file is missing. The path guard resolves every destination with `realpath -m` and accepts only an explicit list of Brandbasket
prefixes (so `..` and a symlink out of `/srv/brandbasket` are refused). `~deploy` is read for the GitHub App id and key (copied into
`~brandbasket`) and the `github.com` host keys, nothing else.

Run the steps as root. Copy the files over (from this repository, on the Mac; `development` is the branch that holds them):

```bash
ssh firstfold-vps 'rm -rf /root/brandbasket-src && install -d -m 700 /root/brandbasket-src'
git archive development deploy scripts/server | ssh firstfold-vps 'tar -x -C /root/brandbasket-src'
```

Then, on the server, `cd /root/brandbasket-src && bash deploy/vps/install.sh <step>`. Do each step without `--apply` first.

| # | Who | Step |
|---|---|---|
| 1 | Owner | Take a Hostinger snapshot (none exists yet) |
| 2 | install.sh | `user --apply`: the system user `brandbasket` (home 700, `nologin`), its `~/.ssh`, and the check of Firstfold's three lock files described above. Read the plan first: it says whether a lock file would be created, and stops if a Firstfold directory or file is not readable by others |
| 3 | install.sh | `database --apply`: the five roles, the two databases with connection limits 40 and 20 (set on every run, reported at the end), passwords into `/root/brandbasket-secrets.env` |
| 4 | install.sh | `dirs-env --apply`: `/srv/brandbasket/...` owned by `brandbasket`, `/etc/brandbasket`, the build env file, and the two env files with generated secrets |
| 5 | Owner | In **both** `/srv/brandbasket/shared/platform.env.local` and `admin.env.local` fill `BREVO_API_KEY`, `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (the three `FILL_ME` lines; Razorpay test keys, `rzp_test_...`). Brevo: droplet page section 8 (domain, one merged SPF record, DKIM, DMARC). `autodeploy --apply` refuses to start while any of them is blank |
| 6 | install.sh | `github --apply`: the read-only deploy key `~brandbasket/.ssh/github-brandbasket-platform`, `known_hosts` (the `github.com` lines copied from Firstfold's), the ssh alias `github-brandbasket-platform` in `~brandbasket/.ssh/config` (Firstfold's `~deploy/.ssh/config` is not touched), the mirror, and a copy of the GitHub App id and key from `~deploy` into `~brandbasket` (mode 600, copied by root). It prints the public key |
| 7 | Owner | GitHub: add that key to `digibranders/brandbasket-platform` as a **read-only** deploy key (Settings, Deploy keys). Add the repository to the installation of the GitHub App `firstfold-vps-deploy` (App ID 5234124: Settings, Developer settings, GitHub Apps, Install App, Configure). Run `github --apply` again; it reports `the GitHub App ... can report` when both are right |
| 8 | install.sh | `nginx-http --apply`: port 80 for the two names |
| 9 | Owner | Cloudflare, zone `brandbasket.in`: add **proxied AAAA** records `app` and `console` to `2a02:4780:63:bbcc::1`, **no A record** (the IPv4 block is not proven reachable from Jio and Cloudflare India, see Firstfold's `INCIDENTS.md`). SSL/TLS mode **Full (strict)**. Recommended, as in Firstfold's zone: a cache rule that bypasses the cache for both hosts, Tiered Cache off |
| 10 | install.sh | `tls --apply --email <address>`: certbot, lineage `brandbasket`, a staging dry run first. The lineage is renewed by the shared `certbot.timer` (Firstfold's, which renews every lineage under `/etc/letsencrypt/renewal/`) and its deploy hook, which reloads nginx; there is no Brandbasket renewal timer |
| 11 | install.sh | `nginx-https --apply`: the full site |
| 12 | install.sh | `services --apply`: the two units (enabled, not started until a release exists), Brandbasket's failure-alert handler and the `OnFailure` drop-ins, `brandbasket-migrate`, the sudoers file |
| 13 | install.sh | `autodeploy --apply`: first it runs `git ls-remote` as `brandbasket` and **refuses to install anything or enable the timer unless GitHub accepts the deploy key**; then scripts, lock library, timer. The first minute after it deploys `main` to both apps: install, lint, typecheck, test, build, env check, migrations on the empty databases, switch with a `/login` health check each |
| 14 | install.sh | `ci --apply`: user `bbci` (home on the sandbox disk), the 8 GB sandbox image and its mount unit, the sandbox, the ufw rule, the timer |
| 15 | install.sh | `backups --apply`: installs the scripts and units. Then run `brandbasket-backup --apply` once by hand and `brandbasket-restore-test --apply`, then `backups --apply` again: the backup, restore-test and maintenance timers are enabled only when those have succeeded and a release exists. `brandbasket-erase.timer` is never enabled by this |
| 16 | Owner | First staff user (interactive, password typed twice): `ssh -t firstfold-vps "runuser -u brandbasket -- env HOME=/home/brandbasket bash -c 'cd /srv/brandbasket/current-admin && pnpm staff:create --email <you> --name \"Your Name\" --role admin'"` |
| 17 | Owner | Razorpay test webhook: URL `https://app.brandbasket.in/api/webhooks/razorpay`, the secret is `RAZORPAY_WEBHOOK_SECRET` in `platform.env.local` (enter it in Razorpay at the same moment), the ten events listed in droplet page section 9 |
| 18 | Owner | Smoke tests below |

Housekeeping once it works: delete `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` and the `droplet` environment in this repository's GitHub
settings (nothing uses them now), and decide about Cloudflare Access for the console (nginx already refuses requests that did not
come through Cloudflare).

## Everyday operations

| Task | Command |
|---|---|
| Deploy | Merge `development` into `main` by pull request. The VPS deploys it within a minute or two (a build is about 4 minutes) |
| Deploy state | `ssh firstfold-vps runuser -u brandbasket -- env HOME=/home/brandbasket brandbasket-platform-autodeploy --status` |
| Deploy now / retry a failed commit | `as-bb brandbasket-platform-autodeploy --resume` |
| Pause / resume | `as-bb brandbasket-platform-autodeploy --pause`, `--resume` |
| Releases and which app runs which | `as-bb brandbasket-platform-release --list` |
| Roll back one app | `as-bb brandbasket-platform-release --activate <platform\|admin> <release>`. Health-checked, and it pauses the autodeploy so `main` does not replace it; `--resume` ends the pause. Runs under a 45 minute limit |
| CI state | `as-bb brandbasket-ci --status` |
| Logs | `journalctl -u brandbasket-platform-autodeploy`, `-u brandbasket-ci`, `-u brandbasket-app -u brandbasket-admin`, `-u brandbasket-backup`, `-u brandbasket-maintenance` |
| Run a backup now | `brandbasket-backup --apply` |
| Prove the newest backup restores | `brandbasket-restore-test --apply`, or the off-site copy: `ssh root@firstfold-vps brandbasket-restore-test --apply --r2 < ~/droplet-backups/firstfold-backup-age.key` |
| Erase deleted accounts, preview | `as-bb /usr/local/sbin/brandbasket-erase-job --env-file /srv/brandbasket/shared/platform.env.local --dry-run` |
| Change an env value | Edit the file in `/srv/brandbasket/shared/`, then `systemctl restart brandbasket-app` (and `brandbasket-admin` for shared values) one at a time. Keep `BETTER_AUTH_SECRET`, `PAYLOAD_SECRET`, the origins and `BRANDBASKET_MEDIA_ROOT` identical in both files; `pnpm env:check` runs at every deploy |
| Check a commit again in CI | Delete its line from `/srv/brandbasket-ci/state/platform.checked` (as `brandbasket`) |
| Look at the sandbox disk | `df -h /srv/brandbasket-ci/sandbox` (8 GB; when under 3 GB is free the next run clears pnpm's store and cache) |

Migrations are never undone by a rollback: each must keep working with the code before it. The services migration (0184) is
forward-only, see the droplet page section 13.

## Seeing a deploy on GitHub

Same as Firstfold's (its README, "Seeing a deploy on GitHub"). The autodeploy and CI call Firstfold's installed
`/usr/local/lib/firstfold/github-status.sh` without editing it: its functions take the repository (`digibranders/brandbasket-platform`)
as an argument and the check names are passed in, so nothing in it needed copying. That script hard-codes the App id and key in
`/home/deploy/` as `readonly` paths, which `brandbasket` cannot read. `deploy/vps/github-lib.sh` (`bb_load_github_status`) therefore
reads the same script, points those paths at `/home/brandbasket/` (where `install.sh github` copied `.github-app-id` and
`.github-app-key.pem`, mode 600), and sources the result. It refuses to load the script if it no longer has exactly those paths, so
a change on Firstfold's side stops the deploy with a clear message instead of reading the wrong files. Deploy's own personal-token
fallback file is never used.

- **Checks tab of the commit and its pull request**: `Deploy app.brandbasket.in` and `Deploy console.brandbasket.in`, updated every
  10 seconds while the deploy runs, with a table of steps (install, lint, typecheck, test, build, env, migrations, switch), the end of
  the log with secrets masked, and the failing step named. An app the commit did not touch gets a grey "Unchanged by this commit"; a
  docs-only commit (`docs/`, `deploy/`, `.github/`, top-level `*.md`) gets "Nothing to deploy".
- **Deployments panel** of the repository: one environment per host.
- If the App is not installed for the repository, the reporting falls back to Firstfold's personal token, which does not cover this
  repository, and deploys run unreported. They are never blocked by GitHub.
- GitHub sends no email for these checks. Failed units email the team through Brandbasket's own handler (see Monitoring).

## CI for pushes and pull requests

`ci.yml` stays in the repository (it is what runs when GitHub Actions is available) but cannot run while Actions is blocked, so the
VPS checks every push itself.

- **Where to look**: the pull request's Checks tab. Five checks per commit: `CI: install`, `CI: lint`, `CI: typecheck`, `CI: test`,
  `CI: build`. They are the deploy's own commands, and a commit that passes them passes the deploy's checks.
- **What is checked**: the head of every branch except `main` (main is checked by its deploy), within about a minute of a push. **One
  commit per run** (the timer starts the next run a minute later), never while any heavy job runs: a run takes the four locks once,
  checks that one commit, and gives the locks back only after the sandbox's transient unit has stopped. `brandbasket-ci.service` has
  `TimeoutStartSec=50min`, longer than the sandbox's 30 minute limit, so the sandbox can never outlive the locks; the sandbox script
  also stops its unit when it is told to stop. Firstfold's `ci-checks.py` is copied to `deploy/vps/ci/ci-checks.py` with one
  line changed (the journal unit named in the check footer); its repository comes in as an argument.
- **Not run**: the database integration tests (`pnpm test:integration` needs Postgres). Run them locally for changes under
  `packages/db`, `packages/auth`, `packages/billing`, `packages/shared`, email, or RLS.
- **Sandbox** (pushed code is unreviewed): user `bbci`, no sudo, no capabilities, no new privileges, private `/tmp`, read-only system,
  `ProtectProc=invisible` and `ProcSubset=pid` (it cannot see other users' processes or their command lines), writes only its work
  directory and its own home, **both on the 8 GB ext4 image** `/srv/brandbasket-ci/sandbox.img` (a sparse file, formatted by
  `install-ci.sh`, loop-mounted at `/srv/brandbasket-ci/sandbox` by the unit `srv-brandbasket\x2dci-sandbox.mount`; the sandbox
  refuses to run if it is not mounted, so it can never fall back to the root disk); `/home`, `/root`, `/srv/brandbasket*` (except its
  own work directory), `/etc/brandbasket`, `/srv/firstfold*`, `/etc/firstfold`, `/var/lib/firstfold*`, certificates and backups are
  invisible; its own `/etc/hosts` and `/etc/resolv.conf`; link-local addresses blocked; Nice 10, CPUWeight 20, MemoryMax 5G, 30 minute
  limit, the same as Firstfold's `ffci`. pnpm's store and cache share the image with the work directory (so packages hardlink);
  when less than 3 GB is free at the start of a run they are cleared. `brandbasket-ci.service` itself has Nice 10, CPUWeight 20,
  IOWeight 20, MemoryMax 1G. `/etc/brandbasket-platform-build.env` stays readable (public values and placeholders; the checks
  source it). On loopback a ufw rule for `bbci`, added next to Firstfold's `ffci` rule in `before.rules` and `before6.rules`
  between its own marker comments, allows only ephemeral ports (10240 and up, for Turbopack's workers) and resets every service
  port, including through the public address. `install-ci-firewall.sh` parses the new rule file with `iptables-restore --test`
  before replacing the old one, and never touches a line outside its markers.
- **Removing the CI: take the ufw block out BEFORE deleting the user `bbci`.** The block's rules name the user (`--uid-owner bbci`);
  with the user gone, `ufw reload` and the next boot fail to load them and leave the firewall broken. In order: `systemctl disable
  --now brandbasket-ci.timer`; delete the lines from `# BEGIN brandbasket-ci sandbox` to `# END brandbasket-ci sandbox` in
  `/etc/ufw/before.rules` and `/etc/ufw/before6.rules` (not Firstfold's `firstfold-ci sandbox` block next to it); `iptables-restore
  --test --noflush < /etc/ufw/before.rules` (and `ip6tables-restore` for `before6.rules`) must pass; `ufw reload`; only then
  `systemctl disable --now 'srv-brandbasket\x2dci-sandbox.mount'`, `userdel bbci`, and remove `/srv/brandbasket-ci/sandbox.img`.
- A run counts as passed only if it printed `== result: passed`.

## Network and edge

| Hostname | Cloudflare | Origin |
|---|---|---|
| `app.brandbasket.in` | Proxied | AAAA `2a02:4780:63:bbcc::1`, IPv6 only |
| `console.brandbasket.in` | Proxied; nginx answers 403 unless the request came through Cloudflare (or from 127.0.0.1) | AAAA, IPv6 only |

- Every listener has an IPv6 twin (`listen [::]:443 ssl http2`), and Firstfold's real-IP snippet trusts Cloudflare's IPv6 ranges, so
  the proxied traffic, which arrives over IPv6 only, is served and logged with the visitor's address.
- **Coupling to Firstfold's nginx, in full:** the site file uses Firstfold's `conf.d/10-cloudflare.conf` (`geo $realip_remote_addr
  $from_cloudflare`, regenerated monthly by Firstfold's timer) and `snippets/cloudflare-realip.conf` (both are included or read, never
  copied), `limit_req_status` / `limit_conn_status` 429 from `nginx.conf`, the ACME webroot `/var/www/acme`, Firstfold's catch-all
  default servers, and (at `tls` time) its certbot renewal hook `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`. If Firstfold
  renames or removes any of these, `nginx -t` fails and `install.sh` takes the change back (a later Firstfold change that breaks it
  is found by the next `nginx -t`, so run Firstfold's nginx changes through `nginx -t` as usual). The rate-limit zones are **not**
  shared: the site file defines its own `brandbasket_general`, `brandbasket_signin` and `brandbasket_perip` (and a loopback-exempt key
  `$brandbasket_limit_key`), so Firstfold's traffic can never use up Brandbasket's allowance, nor the reverse. Not repeated either:
  `server_tokens`, `ssl_protocols`, gzip, log format (all in `nginx.conf`). HSTS comes from the apps (an https build); `X-Robots-Tag`
  from `apps/platform/proxy.ts`, added in nginx only for the console.
- Proxy rules: `Host` passed through, `X-Forwarded-For` overwritten with the peer address (never appended), `X-Forwarded-Proto` set.
- ufw already admits 80 and 443 only from Cloudflare's ranges; 3201 and 3203 stay closed (Next listens on all interfaces on
  purpose, see the unit comment).
- TLS: Let's Encrypt, ECDSA, lineage `brandbasket` for the two names, HTTP-01 from `/var/www/acme` through Cloudflare. **The lineage
  is renewed by the shared `certbot.timer`** (Firstfold's: it runs `certbot renew` for every lineage in `/etc/letsencrypt/renewal/`,
  ours included) and Firstfold's deploy hook reloads nginx after each renewal. Brandbasket installs no renewal timer of its own;
  check it with `certbot certificates` and `certbot renew --dry-run`. Every server block, port 80 and 443, serves the challenge path.

## Backups

- Nightly at 02:15 UTC: `pg_dump -Fc` of both databases (each listed with `pg_restore -l`), a hardlinked copy of `media` and
  `support-private`, and `server-config.tar.gz` (Brandbasket's nginx files, units, sudoers, scripts, certificate, deploy key, env
  files and secrets file, `~brandbasket/.ssh`; not Firstfold's, and not the copy of the GitHub App key) to `/var/backups/brandbasket`
  (14 daily, 8 weekly, root only), then an age-encrypted copy to R2. The backup and restore-test units run with Nice 10, CPUWeight 20,
  IOWeight 20 and MemoryMax 1G. Role passwords are not dumped with `pg_dumpall` (that would copy Firstfold's roles); the secrets file in the config archive
  recreates the `bb_*` roles through `install.sh database`.
- **Bucket `firstfold-backups`, same token and age key as Firstfold.** Objects: `daily/brandbasket-<UTC stamp>.tar.age` and
  `.sha256`, and on Sundays `weekly/brandbasket-<UTC stamp>.tar.age` and `.sha256`. Firstfold's are `daily/firstfold-<stamp>...`.
  The bucket's rules (daily 35 days, weekly 90, 30 day lock on `daily/`) apply by prefix, so they apply to these too. The script
  only ever writes those exact names (a pattern check before every write), never lists a wider prefix, never syncs, moves or
  deletes, so it cannot overwrite or prune a Firstfold object. Firstfold's `firstfold-restore-test --r2` picks the last name in
  sorted order under `daily/`, and `brandbasket-` sorts before `firstfold-`, so it keeps choosing its own backups.
- The age private key stays on the operator's Mac only. The public key is read from `/etc/firstfold/backup-age.pub`, the R2 settings
  from `/etc/firstfold/r2.env` through `/usr/local/lib/firstfold/r2-lib.sh` (IPv6 first, as there).
- **The restore test of the off-site copy (`--r2`) restores as the database's own owner, not as the postgres superuser:** the
  decrypted dump is data that has been through a bucket, so it is loaded (and queried) as `bb_owner` for the platform database and
  `bb_cms` for the payload one, over TCP, with the password taken from `/root/brandbasket-secrets.env` into the one client process's
  environment. Only the empty scratch databases are created by the superuser. A dump that carries a statement needing more than an
  owner may do (an untrusted `CREATE EXTENSION`, `COPY ... PROGRAM`) fails the test instead of running as postgres. The local test
  (no `--r2`) still restores as postgres.
- Real restore, in order: `install.sh database --apply` (the roles must exist, the dump keeps object owners; take the secrets file
  from `server-config.tar.gz` first), stop the two apps, `pg_restore` into a scratch database, check it, swap names while nothing is
  connected, restore media with `rsync -a`, start the apps, run the smoke tests.

## Monitoring

`systemctl --failed` must be empty. Failure alerts use **Brandbasket's own handler**, not Firstfold's `firstfold-notify-failure`:
`brandbasket-app`, `brandbasket-admin`, the autodeploy, the backup, the restore test and the maintenance job carry
`OnFailure=brandbasket-notify-failure@%n.service` (`/usr/local/sbin/brandbasket-notify-failure`, a copy of Firstfold's with every name
changed). It reads `BREVO_API_KEY`, `BRANDBASKET_MAIL_FROM` (or `ALERTS_FROM_EMAIL`) and `BRANDBASKET_TEAM_EMAIL` (default
`hello@brandbasket.in`; several addresses separated by commas) from `/srv/brandbasket/shared/platform.env.local`, keeps its
rate-limit state (one mail per unit per 30 minutes) in `/var/lib/brandbasket/notify-failure`, and the subject reads `[Brandbasket
server] <unit> failed`. While `BREVO_API_KEY` is blank it only logs a line and exits 0.

**No customer data leaves the server in an alert.** The mail carries the unit name, its result and exit status, and the time. Only
for the units that never handle customer data (autodeploy, backup, restore test, maintenance) does it add the last 30 journal lines,
with secrets, URLs with passwords and email addresses masked. For `brandbasket-app` and `brandbasket-admin` there are no journal
lines at all; look at the journal on the server. The CI unit has no alert, as Firstfold's has none. An external check on
`https://app.brandbasket.in/login` is still the owner's to add.

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

Checked on 2026-10-22 without writing to the server (the server was only read: file modes, units, nginx and Postgres settings).
Every shell file passes `bash -n` and shellcheck. In an Ubuntu 24.04 container (privileged, so the loop mount is real; systemd 255,
nginx 1.24.0, Postgres 16, bash 5.2) with a replica of Firstfold's side (user `deploy` uid 1000, `/srv/firstfold*` with
`deploy:deploy 0644` lock files, the live `/etc/nginx`): `install.sh` plans and applies for `user`, `database`, `dirs-env`, `github`,
`nginx-http`, `nginx-https`, `services`, `autodeploy`, `ci` and `backups`, each twice (idempotent), with `systemctl` stubbed except
for the sandbox mount: the user and `~/.ssh`; the Firstfold lock checks (a missing lock file created `deploy:deploy 0644`, a
directory or file others cannot read stops the plan); the App id and key copied mode 600; Firstfold's `github-status.sh` loaded
through `github-lib.sh` (the real file from `vps-setup`); the autodeploy refusing to install or enable the timer while
`git ls-remote` fails, and installing when it passes; the sudoers file (`sudo -l -U brandbasket`: restart and stop of the two units, the
migration wrapper with no arguments, the sandbox; refused: `status`, other units, an argument to migrate; `deploy` has no rule); the
8 GB image formatted, mounted and idempotent on a second run; the ufw block added once; `nginx -t` with the site's own zones, and a
broken site taken back; `systemd-analyze verify` on every unit and the mount unit, and `systemd-analyze security --offline` at 1.7 OK
for the four sandboxed units; the path guard. The autodeploy, release and CI scripts against a local git remote and stubs of
`pnpm`, `sudo`, `systemctl` and `curl`, running as `brandbasket` against `deploy`-owned lock files: first deploy, docs-only commit,
`--activate` and a hand run going through `timeout --kill-after=2m 45m`, a lock held open for writing by `deploy` (exit 0, "is held"),
a lock file that cannot be opened (exit 1, not busy), CI one commit per run over three branch heads, no lock descriptor in any child.
`heavy-lock-test.sh` (as a normal user with 0444 lock files, and as root with the take made as `nobody`), `install-lib-test.sh`,
`setup-database.sh` against a real Postgres (limits 40 and 20 set, changed by hand and put back), `brandbasket-restore-test` local and
`--r2` (restoring as `bb_owner` and `bb_cms`, and failing for a dump that needs a superuser), `brandbasket-migrate` (runs as the owner
of `/srv/brandbasket`, the address in the environment only, refuses root), `brandbasket-notify-failure` with stubbed `curl` and
`journalctl`, and `brandbasket-ci-sandbox` with a stubbed `systemd-run` (arguments, exit status, refusing an unmounted disk, stopping
the unit on TERM, clearing the store when space is low).

Not run anywhere, to be proven on the server at the step that needs it: the real `pnpm install`, lint, build and migrations on the
empty database; the apps and the maintenance job actually starting under their new sandbox (`ProtectSystem=strict` with only the
`ReadWritePaths` above; if one fails with status 226/NAMESPACE or a read-only error, the path it needs is the first thing to check, and
the maintenance job's pnpm cache under `/var/cache/brandbasket-maintenance` is the least certain); `systemd-run` with the sandbox
properties on this systemd (`ProtectProc`, `ProcSubset` are new here) and `bbci` actually being unable to see the hidden paths or
reach service ports (probe it as Firstfold did: a run of the sandbox that tries `/srv/brandbasket`, `/srv/firstfold`, `localhost:5432`
and `localhost:3201`); that the autodeploy and CI units start with their `InaccessiblePaths` and still reach the lock files; `ufw
reload` with the new block; the GitHub App reporting for the new repository; the first Let's Encrypt issuance for `brandbasket.in`
through Cloudflare (Firstfold's renewal through its proxy was tested in its own zone; if the HTTP-01 challenge fails, set the zone's
SSL/TLS mode to Flexible for the minutes it takes, then back to Full (strict)); a real R2 upload and a restore from it; memory and
timing of a build next to Firstfold's apps.

## Owner decisions

- Cloudflare Access in front of the console: not needed for staging (nginx refuses non-Cloudflare requests); the console's own sign-in
  has no second factor (`docs/STAFF-ACCESS.md`), so set it up before real staff use it.
- Starting `brandbasket-erase.timer`: it deletes customer data 30 days after a closure. Not enabled by anything here.
- Alert recipients: Brandbasket's handler mails `BRANDBASKET_TEAM_EMAIL` from `platform.env.local`, default `hello@brandbasket.in`.
  Set it there if the team address differs, and fill `BREVO_API_KEY` (alerts only log until then).
- The Hostinger snapshot before the first change, and adding the repository to the GitHub App installation, as in the install table.
