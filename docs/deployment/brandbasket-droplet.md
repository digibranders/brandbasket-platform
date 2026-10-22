# Production: Brandbasket's own DigitalOcean droplet

> **Superseded (2026-10-22).** Production is the Firstfold VPS, deployed by the VPS itself: see
> [brandbasket-vps.md](brandbasket-vps.md). The droplet and the push-from-the-Mac scripts (`scripts/server/deploy.sh`,
> `bootstrap-droplet.sh`, `backup.sh`, `restore-test.sh`) and `deploy/systemd`, `deploy/nginx` are kept for reference only and are not
> used. Still current here: Brevo (section 8), Razorpay (section 9), the environment variables (section 15) and the free-website
> address notes in section 7. `setup-database.sh`, `make-env-files.sh`, `brandbasket-migrate` and `run-erase-job.sh` are used by the VPS
> install.

This is the runbook for putting the Brandbasket dashboard and staff console on Brandbasket's own droplet, and for running them there.
Nothing in this repository logs in to a server by itself: every script takes the server's address as an argument, prints what
it would do unless you add `--apply`, and is safe to run again.

| What | Where |
| ---- | ----- |
| Customer dashboard (`apps/platform`) | https://app.brandbasket.in |
| Staff console (`apps/admin`) | https://console.brandbasket.in |
| Marketing site | https://brandbasket.in, stays on Vercel |
| Existing API (Pavel) | api.fynix.digital, 168.144.47.32 (the droplet; example address used below) |

Replace `<droplet>` in the commands with the droplet's address (for example `168.144.47.32`) and `<you>` with your own email.
Hostnames other than the two above are passed with `--app-host` / `--admin-host` (bootstrap, deploy) or `BRANDBASKET_APP_HOST` /
`BRANDBASKET_ADMIN_HOST` (make-env-files).

## Architecture

```
 browser ──https──► Cloudflare ──(DNS only for app., proxied + Access for staff.)──► droplet <droplet>
                                                                                      │
   app.brandbasket.in     ── nginx :443 (Let's Encrypt) ───────────────┐               │
   console.brandbasket.in   ── nginx :443 (Origin CA, only Cloudflare) ──┤               │
   api.fynix.digital     ── nginx :443 (what is there today) ─────────┼─ Pavel API    │
                                                                      ▼
        brandbasket-app   :3201  apps/platform  (next start)    systemd, user deploy, MemoryMax 1000M
        brandbasket-admin :3203  apps/admin     (next start)    systemd, user deploy, MemoryMax 650M
                                   │
                  PostgreSQL on this machine (localhost:5432)
                    brandbasket_platform          owner bb_owner (migrations only)   app / staff / public roles
                    brandbasket_platform_payload  owner bb_cms (blog + content)
                  /srv/brandbasket/media, /srv/brandbasket/support-private   uploads
                  /srv/brandbasket/backups                              nightly dumps

 timers: brandbasket-backup 02:15 · brandbasket-maintenance 03:30 · brandbasket-erase 03:50 · brandbasket-restore-test Sun 05:00
 outside services: Brevo (email), Razorpay (payments, webhook to app.brandbasket.in), Cloudflare (DNS, Access)
```

Release layout on the droplet:

```
/srv/brandbasket/releases/<UTC stamp>-<commit>/   one directory per deploy (the newest 5 are kept)
/srv/brandbasket/current-platform  -> releases/…  what brandbasket-app runs
/srv/brandbasket/current-admin     -> releases/…  what brandbasket-admin runs
/srv/brandbasket/shared/platform.env.local, admin.env.local   the only copies of the secrets (mode 600, linked into every release)
/srv/brandbasket/media, support-private, backups
```

## Sizing

| Droplet | Verdict |
| ------- | ------- |
| 2 vCPU / 4 GB / 50 GB or more | Recommended. Both apps (about 0.5 to 1 GB resident), Postgres, nginx and the Pavel API sit comfortably. |
| 1 vCPU / 2 GB | Runs, with a 2 GB swap file (`--swap 2G`) and no headroom for the Pavel API if it is also heavy. Fine to start; move up when `free -h` shows swap in steady use. |
| Anything smaller | Not enough. |

**Never build on the droplet.** `next build` needs several GB; `deploy.sh` builds on your machine and uploads the result. The
server only runs `pnpm install` (a minute or two, lower memory).

## 0. Inspect first (read-only)

The droplet's operating system, size, nginx and Postgres state are not known to this repository, so look before anything is
installed. This changes nothing:

```bash
ssh root@<droplet> 'bash -s' < scripts/server/inspect-droplet.sh | tee droplet-inspection.txt
```

Read the output for:

| Look at | Decide |
| ------- | ------ |
| Section 1 | Ubuntu 22.04 or 24.04 (or Debian 12) is what the scripts assume. Anything else: stop and ask. |
| Section 2 | RAM and swap against the sizing table; free disk of at least 15 GB; whether `/srv/brandbasket` already exists. |
| Section 3 | Ports 3201 and 3203 must be free (Fynix uses 3001 and 3003). If anything already uses either, change the ports in the two unit files and the two nginx files before going on. 5432 should be Postgres on localhost only. |
| Section 4 | nginx installed and `nginx -t` passing; `conf.d/*.conf` included from `nginx.conf` (the Cloudflare file needs it); what names it serves today. |
| Section 5 | Postgres present or not; which databases and roles exist. The setup only ever adds `brandbasket_*` names, it never alters anything else. |
| Section 7 | Whether the Pavel API runs on this machine under systemd, pm2 or Docker: it keeps running, nothing here touches it. |
| Section 8 | Whether a firewall is active. See section 1 below before enabling one. |

If the API shares the box and Postgres, the only shared resources are nginx, memory and Postgres connections.

## 1. Base setup

From your machine. The first command only prints the plan and does not connect:

```bash
scripts/server/bootstrap-droplet.sh --host root@<droplet> --swap 2G          # dry-run: prints, connects to nothing
scripts/server/bootstrap-droplet.sh --host root@<droplet> --swap 2G --apply  # copies the kit to /root/brandbasket-kit and runs it there
```

Drop `--swap 2G` on a 4 GB droplet. To see the full step list with what is already done on a given machine, run
`bash /root/brandbasket-kit/scripts/server/bootstrap-droplet.sh --on-server` on it (read-only without `--apply`).

What it does, each step only when it is missing: installs `nginx postgresql rsync curl certbot` and friends with apt;
installs Node 24 (NodeSource's apt repository) and activates the pnpm version in `package.json` through corepack; creates the
unprivileged `deploy` user; makes `/srv/brandbasket/{releases,shared,media,support-private,backups}`; installs the root-owned helpers
`brandbasket-migrate`, `brandbasket-backup`, `brandbasket-restore-test`, `brandbasket-erase-job`, `brandbasket-cloudflare-ips` into `/usr/local/sbin`; installs the
systemd units and timers (not enabled yet); installs `/etc/sudoers.d/brandbasket` after checking it with `visudo`; writes the nginx
snippet and the port-80 server block for the two names, fetches Cloudflare's address ranges, and reloads nginx only after
`nginx -t` passes (a link it added is removed again if the test fails).

Then, by hand:

1. **Give yourself ssh access as `deploy`.** `ssh-copy-id deploy@<droplet>` from your machine, or re-run the bootstrap once with
   `--authorize-root-keys` to copy root's keys. Test: `ssh deploy@<droplet> 'sudo -n systemctl status brandbasket-app | head -3'` (it
   will say the unit is not running yet; what matters is that sudo asks for no password).
2. **Close ports 3201 and 3203 to the outside. Required.** `next start` listens on every interface (starting it with `-H
   127.0.0.1` makes the dashboard answer 404 on every page, checked), so without a firewall anyone could reach the console on
   `http://<droplet>:3203` with a forged `Host` header and bypass Cloudflare Access. Preferred: a DigitalOcean Cloud Firewall
   on the droplet allowing inbound 22 (your own address if you can), 80 and 443, plus whatever else the Pavel API needs
   (section 3 of the inspection shows what listens). If `ufw` is already active on the box, its default deny already covers
   3201 and 3203; do not enable `ufw` on a box where you have not listed everything that must stay reachable.
3. Check the clock and updates: `timedatectl` should say synchronized; `apt install unattended-upgrades` if the inspection said
   it is missing.
4. Cap the journal: `/etc/systemd/journald.conf` `SystemMaxUse=500M`, then `systemctl restart systemd-journald`.

## 2. PostgreSQL: new roles, new passwords, two databases

On the droplet, as root (the kit is in `/root/brandbasket-kit`):

```bash
cd /root/brandbasket-kit/scripts/server
./setup-database.sh              # dry-run: lists what exists and what it would create
./setup-database.sh --apply
```

It creates, only when missing: `bb_owner` (migrations only; has `CREATEROLE` and `ADMIN OPTION` on the three application roles
because the migrations alter and grant them), `bb_app`, `bb_staff`, `bb_public` (the names are fixed by the
code and its migrations), `bb_cms` (which owns the Payload database and nothing else), and the
databases `brandbasket_platform` and `brandbasket_platform_payload`. Every password is new, generated with `openssl rand`, and written to
`/root/brandbasket-secrets.env` (mode 600). Re-running changes nothing except re-setting each login role's password to the one in
that file. It never alters databases or roles it did not create.

Check Postgres only listens locally: `ss -ltn | grep 5432` should show `127.0.0.1:5432` (and `[::1]`), not `0.0.0.0`. On
Ubuntu the default is localhost. Do not open 5432 in the firewall.

Back up `/root/brandbasket-secrets.env` to your password manager (it is also in the nightly secrets archive, on the same machine).

## 3. Environment files

```bash
cd /root/brandbasket-kit/scripts/server
./make-env-files.sh --apply      # app and console hostnames from BRANDBASKET_APP_HOST / BRANDBASKET_ADMIN_HOST if different
```

It writes `/srv/brandbasket/shared/platform.env.local` and `admin.env.local` (mode 600, owned by `deploy`) with the database URLs built
from the secrets file, freshly generated `BETTER_AUTH_SECRET`, `PAYLOAD_SECRET`, `ACCOUNT_CODE_SECRET`,
`RAZORPAY_WEBHOOK_SECRET` and `ACCOUNT_ERASE_TOKEN`, and the same shared values in both files. It never overwrites an existing
file. Fill the blanks it marks `FILL_ME` in **both** files (`BREVO_API_KEY`; `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`), then
check from the repository (after the first upload, or from your machine against copies):

```bash
pnpm env:check --platform /srv/brandbasket/shared/platform.env.local --admin /srv/brandbasket/shared/admin.env.local
```

`env:check` prints problems by setting name, never by value, and exits 1 on any error: a missing required setting, a secret
under 32 characters, an origin that is not `https://host`, the `EMAIL_CODE_BYPASS` switch, `BRANDBASKET_ALLOW_FAKE_BILLING`, a
`BILLING_PROVIDER` other than `razorpay`, the two files disagreeing on `BETTER_AUTH_SECRET`, `PAYLOAD_SECRET`, the origins, the
Payload database or the media root. It only warns about `rzp_test_` keys. `deploy.sh` runs it before it changes anything. The
full variable list is in section 15.

## 4. First release, migrations and the first staff user

On your machine, in the repository, on the commit you mean to ship:

```bash
cp deploy/build.env.example deploy/build.env      # the public values only; git-ignored
scripts/server/deploy.sh --host deploy@<droplet>             # dry-run: prints the plan, touches nothing
scripts/server/deploy.sh --host deploy@<droplet> --apply     # build here, upload, install, check, migrate, switch
```

On the very first deploy there is no previous release; the order inside `deploy.sh` is: build (clean export of `HEAD`, with the
public values from `deploy/build.env`) → rsync to `releases/<stamp>-<commit>.partial`, renamed when complete, env files linked
→ `pnpm install --frozen-lockfile` on the server → `pnpm env:check` → **database migrations** (`brandbasket-migrate`, as `bb_owner`,
through sudo; then `scripts/cms-migrate.sh` for the Payload database as `bb_cms`) → switch `current-platform` and restart
`brandbasket-app`, wait for `/login`, then the same for the console. Migrations always run **before** the switch, so each must work
with the previous release still serving.

The migrations are `pnpm db:migrate` (the main database) and `pnpm cms:migrate` (Payload's own, applied by
`scripts/cms-migrate.sh`, which also fails if any Payload migration is left unapplied). Both can be run by hand on the droplet
for diagnosis:

```bash
sudo /usr/local/sbin/brandbasket-migrate                                   # as deploy; needs /srv/brandbasket/deploying to point at a release
cd /srv/brandbasket/current-platform && bash scripts/cms-migrate.sh
```

**First staff user.** There is no staff sign-up on the web. On the droplet, with a terminal (the password is typed twice, no echo):

```bash
ssh -t deploy@<droplet> 'cd /srv/brandbasket/current-admin && pnpm staff:create --email <you> --name "Your Name" --role admin'
```

Passwords need 14 or more characters and are checked against known breaches (a 5-character hash prefix goes to Have I Been
Pwned). Roles, the access log and what is missing (no second factor in the app itself) are in `docs/STAFF-ACCESS.md`; the second
factor comes from Cloudflare Access, section 7.

## 5. systemd

Installed by the bootstrap (`deploy/systemd/*`), enabled for the apps by the first successful deploy:

```bash
sudo systemctl enable brandbasket-app brandbasket-admin    # once, so they start at boot
systemctl status brandbasket-app brandbasket-admin
journalctl -u brandbasket-app -n 100 --no-pager
```

| Unit | Runs | Limits |
| ---- | ---- | ------ |
| `brandbasket-app.service` | `next start -p 3201` in `current-platform/apps/platform` as `deploy` | `MemoryHigh=800M`, `MemoryMax=1000M`, V8 heap 640 MB, `Restart=on-failure`, gives up after 3 starts in 60 s |
| `brandbasket-admin.service` | `next start -p 3203` in `current-admin/apps/admin` | `MemoryHigh=500M`, `MemoryMax=650M`, heap 384 MB, same restart policy |

Both read their settings from `apps/*/.env.local` (the links into `/srv/brandbasket/shared`), as `next start` always does. Hardened with
`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, `ProtectHome`. If you must change a limit, edit the file in `deploy/systemd/`
and re-run the bootstrap (it replaces only a file that differs), then `sudo systemctl daemon-reload && sudo systemctl restart ...`.

The `deploy` user may use sudo for exactly: `/usr/local/sbin/brandbasket-migrate`, `systemctl restart|status brandbasket-app`, and the same for
`brandbasket-admin` (`deploy/sudoers.brandbasket.example`).

## 6. nginx and TLS

The bootstrap installs (from `deploy/nginx/`): `snippets/brandbasket-proxy.conf`, `sites-available/brandbasket-acme.conf` (port 80 for both
names: the certificate challenge, then a redirect to https), and later `brandbasket-app.conf` and `brandbasket-admin.conf`. What the files
guarantee, and why each line is there, is written in their comments. In short:

- `Host` is passed through unchanged: the apps pick the dashboard or the console by it.
- `X-Forwarded-For` is **overwritten** with `$remote_addr`, never appended to: the apps rate-limit and log by the first entry, so
  a forwarded browser value would let anyone choose their recorded address. On the console host `$remote_addr` is the real
  visitor because the real-IP module restores it from `CF-Connecting-IP` for connections from Cloudflare's own ranges.
- `client_max_body_size` 25m for the dashboard (support screenshots, product photos), 10m for the console. The business video
  upload route of the directory product is not enabled for Brandbasket, so no larger limit is needed.
- The console's server block answers 444 to any connection that did not come from Cloudflare, and the dashboard's does not use
  Cloudflare at all (grey cloud).

Steps:

1. **Dashboard certificate (Let's Encrypt).** Point `app.brandbasket.in` at the droplet first (section 7), then:

   ```bash
   scripts/server/bootstrap-droplet.sh --host root@<droplet> --certbot-email <you> --apply
   ```

   (or run `certbot certonly --webroot -w /var/www/certbot -d app.brandbasket.in --agree-tos -m <you> --no-eff-email` yourself and
   re-run the bootstrap). That installs `brandbasket-app.conf`. Renewal is automatic: `systemctl list-timers | grep certbot` must show a
   timer; `certbot renew --dry-run` must pass.
2. **Console certificate (Cloudflare Origin CA).** Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate for
   `console.brandbasket.in`. Save the certificate as `/etc/ssl/brandbasket/staff.pem` and the private key as `/etc/ssl/brandbasket/staff.key`
   (`mkdir -p /etc/ssl/brandbasket; chmod 600 staff.key`). Then re-run the bootstrap; it installs `brandbasket-admin.conf`.
3. `sudo nginx -t` is the real syntax test. It cannot be run off the server: the files in this repository were checked for shell
   syntax and for what the bootstrap does with them, never by nginx itself. If `nginx -t` fails, the bootstrap removes the links it
   added and leaves nginx as it was.

A first check from outside, before DNS is switched for real users, can use `curl --resolve app.brandbasket.in:443:<droplet> https://app.brandbasket.in/login`.

## 7. Cloudflare: DNS and Access

Records in the `brandbasket.in` zone (all other records, including MX for Microsoft 365, stay as they are):

| Name | Type | Value | Proxy |
| ---- | ---- | ----- | ----- |
| `app` | A | the droplet's IPv4 (add AAAA only if the droplet has IPv6 and nginx listens on it, as the files do) | **DNS only** (grey cloud) |
| `staff` | A | the droplet's IPv4 | **Proxied** (orange cloud) |
| `api` | unchanged | | unchanged |

Why `app` is grey: simplest correct client addresses (the sign-in and sign-up rate limits are per address), and Let's Encrypt's
challenge needs to reach the droplet. You can proxy it later; if you do, include `snippets/brandbasket-cloudflare-realip.conf` in
`brandbasket-app.conf` as the console's file does, and use Full (strict) with an Origin CA certificate there too.

Only first-level names are used (`app.`, `staff.`): Cloudflare's free Universal certificate covers `*.brandbasket.in` and not a
second level such as `admin.app.brandbasket.in`.

### Free website addresses (optional)

A customer with no domain of their own can choose a free address in the Your domain step: `<name>.<base domain>`, kept until
they enter their own domain, which replaces it. It is offered only when `CLIENT_SITE_BASE_DOMAIN` is set in `platform.env.local`
(no restart of anything else; restart `brandbasket-app`). Setting it only decides the names. Before turning it on:

- **The base is `brandbasket.in` itself.** Names are first-level (`harbour.brandbasket.in`), which Cloudflare's free Universal
  certificate already covers when the wildcard record is proxied, so no extra certificate is needed. A second-level base such as
  `sites.brandbasket.in` would not be covered by that certificate. Because the names share the company's own domain, the names
  other records use (`app`, `staff`, `console`, `api`, `www`, Microsoft 365's `autodiscover` and the rest) are in the reserved
  list, and a record you add later should be added to it too.
- **Wildcard DNS.** A `*` record on the base. Explicit records (`app`, `staff`, `api`, `www`, mail) keep winning over a wildcard,
  and MX records are not touched.
- **Whatever serves customers' websites must answer to those names.** The app only stores the address; it does not serve the
  site. Check that before offering it to customers.
- **Names we never give out** are in `RESERVED_SUBDOMAIN_NAMES` (packages/shared/src/lib/onboarding/domain-form.ts), and so is
  any hostname the app's own origins name. Add to that list rather than relying on customers to avoid a word.

Zone settings: SSL/TLS mode **Full (strict)**; Always Use HTTPS on; leave the rest.

**Cloudflare Access for `console.brandbasket.in`** (Zero Trust → Access → Applications → Add → Self-hosted, free for up to 50
users). Application domain `console.brandbasket.in`; policy *Allow* for the exact staff email addresses (identity provider: One-time
PIN by email is enough); session duration 8 to 12 hours; a second policy is not needed. This is the console's second factor: the
app has none of its own (state this plainly to anyone relying on it). Keep the nginx rule that refuses anything not from
Cloudflare, or the Access login can be skipped by calling the droplet directly. Refresh the Cloudflare range files now and then:
`sudo brandbasket-cloudflare-ips --apply && sudo nginx -t && sudo systemctl reload nginx` (monthly is plenty).

## 8. Brevo (email)

1. Brevo → Senders, Domains & Dedicated IPs → Domains → add `brandbasket.in` (a Brevo verification TXT already exists in DNS).
2. Add the records Brevo shows. The names and values come from Brevo's page and are the authority; typically two DKIM CNAMEs
   (`brevo1._domainkey` and `brevo2._domainkey`) which must be **DNS only** in Cloudflare.
3. **SPF: one record only.** The zone's SPF today covers Outlook only. Replace that single TXT on the root name with the merged one
   (two SPF records is a permanent error and breaks all mail from the domain):

   ```
   v=spf1 include:spf.protection.outlook.com include:spf.brevo.com ~all
   ```

   Confirm the `include:` value against what Brevo's domain page shows before saving (it is the one place the exact string can
   change). Do not touch the MX records.
4. **DMARC**, start without enforcement: TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:dmarc@brandbasket.in`. Read the reports for two to
   four weeks, then move to `p=quarantine`.
5. Authenticate the domain in Brevo (the Authenticate button turns green), create an API key (v3) with only the transactional
   permission, and put it in `BREVO_API_KEY` in **both** env files. The sender is `BRANDBASKET_MAIL_FROM=no-reply@brandbasket.in`; replies go
   to `hello@brandbasket.in` (a real mailbox in Microsoft 365).
6. Check: `dig +short TXT brandbasket.in` shows exactly one `v=spf1`; send a test through the sign-up flow (section 14) and open the
   message source: `spf=pass`, `dkim=pass`, `dmarc=pass`.

## 9. Razorpay

1. Start in test mode: `rzp_test_` key id and secret in **both** env files (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
2. Webhook (Razorpay → Settings → Webhooks → Add): URL `https://app.brandbasket.in/api/webhooks/razorpay`. The secret is the value
   of `RAZORPAY_WEBHOOK_SECRET` already in `platform.env.local`; **set it in the Razorpay dashboard at the same moment**, because a
   mismatch makes every delivery fail and Razorpay disables a webhook that keeps failing. Events to tick (all ten):
   `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`,
   `subscription.paused`, `subscription.resumed`, `subscription.cancelled`, `subscription.completed`, `order.paid`.
3. Test: pay once in test mode (section 14); Razorpay's webhook page should show 200 for each delivery.
4. **Going live:** generate live keys, replace the pair in both env files, change the webhook (live mode has its own webhook and
   secret; update `RAZORPAY_WEBHOOK_SECRET` and the dashboard together), restart both apps, and in the staff console open
   Pricing to create the live Razorpay plan (a plan created under test keys does not exist in live mode). In the Razorpay
   dashboard set payment capture to **automatic** for live mode: an authorised-but-uncaptured payment is refunded after a few days
   and the customer would see a charge that never completes. `env:check` warns while any `rzp_test_` key is present.

## 10. Backups and the restore test

`brandbasket-backup` (nightly 02:15 via `brandbasket-backup.timer`) writes under `/srv/brandbasket/backups`: a `pg_dump` custom-format dump of each
database (checked with `pg_restore --list`, written to a `.partial` file and renamed only when whole), a mirror of the uploaded
media and the private support files, an archive of the env files and `/root/brandbasket-secrets.env` (mode 600, never copied off the
machine), a checksum list, and `LATEST`. It prunes only its own dumps and archives older than 14 days (the newest dump of each
database is always kept).

**Off the machine.** Backups on the same disk survive a bad deploy, not the loss of the droplet. Create `/etc/brandbasket/backup.conf`
(mode 600) with one of:

```
OFFSITE_RSYNC=backup@backup-host:/backups/brandbasket      # rsync over ssh; root's key must be allowed there
OFFSITE_RCLONE=spaces:brandbasket-backups                  # an rclone remote (DigitalOcean Spaces or any S3); configure it with rclone first
KEEP_DAYS=14
```

Which of these to use is a decision for the owner (open question below). Turn on DigitalOcean's droplet backups as well if you
want a whole-machine safety net; they are separate from this.

Run it by hand and read the result:

```bash
sudo brandbasket-backup               # dry-run: lists what it would do
sudo brandbasket-backup --apply
ls -la /srv/brandbasket/backups/db
```

**Restore test (`brandbasket-restore-test`, weekly on Sunday 05:00).** Restores the newest dump of each database into throwaway
databases (`brandbasket_restore_test_platform`, `brandbasket_restore_test_payload`), checks that tables came back and the key tables are
readable, prints counts, and drops them. Run by hand after the first backup:

```bash
sudo brandbasket-restore-test --apply       # PASS lines, then "Restore test passed"
```

A failed weekly run shows in `systemctl status brandbasket-restore-test`; treat it as a failed backup.

**Real restore** (a new machine or a damaged database), in order: run the bootstrap and `setup-database.sh` (the roles must exist
because the dump keeps object owners), stop the apps (`sudo systemctl stop brandbasket-app brandbasket-admin`), then
`sudo -u postgres createdb brandbasket_platform_restored`, `sudo -u postgres pg_restore --exit-on-error -d brandbasket_platform_restored <dump>`,
check it, and only then swap names (`ALTER DATABASE … RENAME TO …`) while nothing is connected. Restore media with
`rsync -a /srv/brandbasket/backups/files/media/ /srv/brandbasket/media/`. Then start the apps and run section 14's smoke tests.

## 11. Scheduled jobs (timers)

| Timer | When | Runs | Why |
| ----- | ---- | ---- | --- |
| `brandbasket-backup` | 02:15 | `/usr/local/sbin/brandbasket-backup --apply` (root) | section 10 |
| `brandbasket-maintenance` | 03:30 | `pnpm support:attachments:maintain` in `current-platform` (as `deploy`) | removes expired support screenshots and closed support requests, runs the retention schedule (`docs/operations/retention-run.md`), emails the staff access review and privacy-request reminders. A good run prints a line starting `Support maintenance:` |
| `brandbasket-erase` | 03:50 | `POST /api/internal/erase-closed-accounts` with `Authorization: Bearer ACCOUNT_ERASE_TOKEN` on `127.0.0.1:3201` | the 30-day erase of accounts whose owners asked to delete them (`docs/account-erasure.md`). The token reaches curl on its standard input, never the process list |
| `brandbasket-restore-test` | Sun 05:00 | `/usr/local/sbin/brandbasket-restore-test --apply` (root) | section 10 |

Timers are installed but not enabled by the bootstrap. After the first successful deploy and the first manual backup:

```bash
sudo systemctl enable --now brandbasket-backup.timer brandbasket-maintenance.timer brandbasket-erase.timer brandbasket-restore-test.timer
systemctl list-timers 'brandbasket-*'
sudo -u deploy /usr/local/sbin/brandbasket-erase-job --env-file /srv/brandbasket/shared/platform.env.local --dry-run   # reports, erases nothing
```

## 12. Monitoring

- **Is it up:** an external check on `https://app.brandbasket.in/login` every minute (UptimeRobot, Better Stack, or DigitalOcean
  Uptime), alerting to a real inbox and phone. The console sits behind Access and cannot be probed from outside; its health is
  checked at every deploy and by `journalctl`.
- **On the box:** `systemctl --failed` must be empty; `journalctl -u brandbasket-app -u brandbasket-admin -u brandbasket-maintenance -u brandbasket-erase
  -u brandbasket-backup --since yesterday -p warning`; `df -h /` (alert above 80%), `free -h`, `ss -ltn`.
- **App-level:** the apps email the staff alert address (`SUPPORT_ALERT_EMAIL`, `PRIVACY_ALERT_EMAIL`, `SECURITY_ALERT_EMAIL`, all
  defaulting to `hello@brandbasket.in`) for support requests, privacy requests due, blocked sign-in bursts and unusual staff access. Set
  `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` if you use Sentry for errors.
- **Certificates:** `certbot certificates` (dashboard) and the Cloudflare Origin certificate (valid up to 15 years; note its expiry).
- **Money:** Razorpay's webhook page should show only 200s; a run of failures means `RAZORPAY_WEBHOOK_SECRET` drifted.

## 13. Deploy and roll back

```bash
scripts/server/deploy.sh --host deploy@<droplet>                  # plan only
scripts/server/deploy.sh --host deploy@<droplet> --apply          # ship HEAD
scripts/server/deploy.sh --host deploy@<droplet> --list           # which release each app runs
scripts/server/deploy.sh --host deploy@<droplet> --rollback <release> --apply            # both apps
scripts/server/deploy.sh --host deploy@<droplet> --rollback <release> --app admin --apply
```

What protects you: the environment check and the migrations run before anything is switched; a failure in either leaves both apps
on their previous release. The apps are switched one at a time, and each must answer `/login` (with its own `Host` header) within
90 seconds; if either does not, every app already switched goes back to the release it ran before, and the failed release is kept
on the server for a look. The newest 5 releases are kept (and any release a link points at). `--rollback` repeats the same
health-checked switch for a release you name.

**Database migrations are never rolled back.** Write each so the previous release still works against the new schema (add
columns and tables first; remove or rename only in a later release). Undoing a migration means restoring a backup (section 10)
and is a last resort. A release that must not be served for a data reason: roll back first, then think.

**The services release is forward-only.** Migration 0184 deletes the priced plan rows and refuses to run on a database that already
has subscriptions or payments. Once it has run, the previous release cannot price anything, so rolling back the apps alone is
unsafe. Check production with a read-only count of subscriptions and payments before merging to `main`, and if a release has to
be undone, restore a backup (section 10).

Commit what you want to ship before running it: the build is a clean export of `HEAD`, so uncommitted changes are not deployed
(the script says so).

## 14. Go-live checklist and smoke tests

Before real customers:

- [ ] Section 0 read; 3201 and 3203 closed to the outside; 5432 not reachable from outside.
- [ ] `./setup-database.sh --apply`, `./make-env-files.sh --apply` done; `pnpm env:check` reports no errors; no `rzp_test_` key if this is the live switch.
- [ ] DNS: `app` grey, `staff` orange; SSL/TLS Full (strict); Access application and policy created and tested with a non-staff email (refused).
- [ ] Brevo: domain authenticated, one SPF record, DKIM, DMARC at `p=none`.
- [ ] Razorpay: webhook created with the ten events and the same secret; test payment succeeded; live capture set to automatic.
- [ ] First staff user created; signs in through Access then the console.
- [ ] Timers enabled; one manual backup and restore test passed.
- [ ] Off-site backup configured, or the owner has accepted in writing that it is not.

Smoke tests (from your machine, not the droplet):

```bash
curl -sI https://app.brandbasket.in/login | head -1                      # HTTP/2 200
curl -sI http://app.brandbasket.in/login | head -3                       # 301 to https
curl -sI https://console.brandbasket.in/login | head -3                    # 302 or 403 to Cloudflare Access, never the login page
curl -m 5 -sI http://<droplet>:3201/login ; echo "exit $?"              # must time out (exit 28), not answer
curl -m 5 -sI http://<droplet>:3203/login ; echo "exit $?"              # must time out
curl -sk --resolve console.brandbasket.in:443:<droplet> https://console.brandbasket.in/login -o /dev/null -w '%{http_code}\n'   # 000 or 444: direct calls are refused
dig +short TXT brandbasket.in | grep -c 'v=spf1'                         # exactly 1
```

Then in a browser: create an account with a fresh email (the code arrives, from `no-reply@brandbasket.in`, passing SPF/DKIM/DMARC),
sign in, open Upgrade and pay in test mode (webhook shows 200; the account shows the plan), open a support request with a
screenshot, sign in to the console through Access, and read the access log (admin role). On the droplet: `systemctl --failed` is
empty, `sudo -u deploy /usr/local/sbin/brandbasket-erase-job --env-file /srv/brandbasket/shared/platform.env.local --dry-run` answers a report,
`sudo brandbasket-backup --apply` and `sudo brandbasket-restore-test --apply` pass.

## 15. Environment variables

Two files on the droplet: `/srv/brandbasket/shared/platform.env.local` (dashboard) and `admin.env.local` (console), linked into every
release as `apps/platform/.env.local` and `apps/admin/.env.local`. They are never in git and never in a build. Annotated
templates with every optional setting: `apps/platform/.env.production.example` and `apps/admin/.env.production.example`.

**Required to start** (the app refuses to start without them: `packages/shared/src/lib/production-requirements.ts`, the
`BRANDBASKET_RUNTIME` lists, checked by `instrumentation.ts` in each app):

| Variable | Dashboard | Console | Value |
| -------- | :-------: | :-----: | ----- |
| `APP_ORIGIN` | yes | yes | `https://app.brandbasket.in` |
| `ADMIN_ORIGIN` | yes | yes | `https://console.brandbasket.in` |
| `DATABASE_URL` | yes | | role `bb_app` on `brandbasket_platform` (row-level security applies) |
| `DATABASE_URL_STAFF` | yes | yes | role `bb_staff` on `brandbasket_platform` |
| `DATABASE_URL_PUBLIC` | yes | | role `bb_public` (insert-only: sign-up codes, email outbox) |
| `DATABASE_URL_PAYLOAD` | yes | yes | role `bb_cms` on `brandbasket_platform_payload` (same in both) |
| `BETTER_AUTH_SECRET` | yes | yes | 32+ characters, **identical in both** (sessions) |
| `PAYLOAD_SECRET` | yes | yes | 32+ characters, **identical in both** |
| `ACCOUNT_CODE_SECRET` | yes | | 32+ characters (signs sign-up codes) |
| `BREVO_API_KEY` | yes | yes | Brevo v3 API key (same in both) |

**Needed for a working product, checked by `env:check`:**
`NEXT_PUBLIC_APP_URL` (dashboard, equal to `APP_ORIGIN`, compiled at build, in `deploy/build.env`); `BILLING_PROVIDER=razorpay`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (both); `RAZORPAY_WEBHOOK_SECRET` (dashboard); `ACCOUNT_ERASE_TOKEN` (dashboard, used by
the erase timer); `BRANDBASKET_MAIL_FROM` (both, `no-reply@brandbasket.in`); `BRANDBASKET_MEDIA_ROOT=/srv/brandbasket/media` and
`BRANDBASKET_SUPPORT_ROOT=/srv/brandbasket/support-private` (both, identical, outside the releases so they survive a deploy).

**Optional:** `SUPPORT_ALERT_EMAIL`, `PRIVACY_ALERT_EMAIL`, `SECURITY_ALERT_EMAIL`, `BRANDBASKET_TEAM_EMAIL` (default `hello@brandbasket.in`),
`INVOICE_PREFIX`, `CLIENT_SITE_BASE_DOMAIN`, `R2_*` and `SUPPORT_R2_*` (object storage instead of local disks), `TURNSTILE_SITE_KEY`,
`TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES` (robot check on sign-in forms: recommended), `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
`NEXT_PUBLIC_BRANDBASKET_RELEASE`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CALENDLY_URL`, `SUPPORT_TICKET_RETENTION_MONTHS`.

**Never set in production** (the app and `env:check` refuse): `EMAIL_CODE_BYPASS`, `BRANDBASKET_ALLOW_FAKE_BILLING`.

**How this table was verified (on a development machine, not on the droplet).** `pnpm env:check` was run on files generated by
`make-env-files.sh` (it listed exactly the six blanks that need Brevo and Razorpay values). The production builds of both apps
were then started with `next start` from an empty environment plus only the variables above, and answered `/login` with 200 for
the right `Host`; starting each with exactly one required variable removed gave a refusal every time (500 when the
instrumentation check fails; 404 without `APP_ORIGIN`, because no host is then recognised). `packages/shared/src/lib/production-env-check.test.ts`
holds the unit tests of the check. What cannot be verified off the droplet is listed at the end of this file.

## Not verified off the droplet

`nginx -t` on the real files; `systemd` accepting the units (`systemd-analyze verify` on the droplet); apt installs, NodeSource,
`certbot`, the `visudo` result, `runuser`/`sudo` behaviour as the real `deploy` user; Postgres 16 specifics (the role and
migration proof ran on a scratch PostgreSQL 18 with a non-superuser owner); real Cloudflare Access, Origin CA and Brevo/Razorpay
behaviour; memory limits under load; whether the Pavel API shares nginx, Postgres or ports. Run section 0 first and
section 14 last.

## Open questions

1. Droplet size and operating system (section 0 will show it).
2. Does the Pavel API run on this same droplet and share nginx and Postgres? (Nothing here touches it, but ports and memory are shared.)
3. Where should backups go off the machine: a DigitalOcean Space (rclone), another server (rsync), or DigitalOcean's own droplet backups only?
4. Will `app.brandbasket.in` ever be proxied through Cloudflare (then it needs the real-IP file and an Origin certificate too)?
