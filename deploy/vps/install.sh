#!/usr/bin/env bash
# Puts brandbasket-platform on the Firstfold VPS, one step at a time. Run as root on the VPS from a copy of this repository's
# deploy/ and scripts/server/ folders (docs/deployment/brandbasket-vps.md, "Install order"):
#
#   install.sh <step> [--apply] [--email ADDRESS]
#
# Without --apply a step prints its plan and changes nothing (it may read the server and check files). Every step is safe to
# run again. The steps, in order:
#
#   database    roles bb_owner, bb_app, bb_staff, bb_public, bb_cms and the databases brandbasket_platform and
#               brandbasket_platform_payload (scripts/server/setup-database.sh)
#   dirs-env    /srv/brandbasket/{releases,shared,media,support-private}, /etc/brandbasket, the build env file, and the two
#               env files (scripts/server/make-env-files.sh) with Brevo and Razorpay left as FILL_ME for the owner
#   github      read-only deploy key and ssh alias for digibranders/brandbasket-platform, the mirror, a reachability check
#   nginx-http  port 80 only, for the certificate challenge
#   tls         certbot certificate "brandbasket" for app. and console.brandbasket.in (needs --email)
#   nginx-https the full site for both names
#   services    the two app units, failure alerts, brandbasket-migrate and the sudoers rule
#   autodeploy  the release and autodeploy scripts, the shared lock library and the minute timer (first deploy of main)
#   ci          user bbci, the sandbox, its ufw loopback rule, and the CI timer (ci/install-ci.sh)
#   backups     backup, restore test, maintenance and erase units; the timers are enabled once a backup has succeeded
#
# What it will not do: touch a file whose path does not name Brandbasket (install-lib.sh guard); change, restart or reload
# anything of Firstfold's, except `nginx reload` after `nginx -t` passes and the marker-delimited blocks in
# ~deploy/.ssh/config and ufw's before.rules; contain a secret (secrets are generated on the server or typed by the owner).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=install-lib.sh
source "$HERE/install-lib.sh"

readonly LIB=/usr/local/lib/brandbasket
readonly SRV=/srv/brandbasket
readonly UNIT_DIR=/etc/systemd/system
readonly NGINX_AVAILABLE=/etc/nginx/sites-available/brandbasket
readonly NGINX_ENABLED=/etc/nginx/sites-enabled/brandbasket
readonly NGINX_SNIPPET=/etc/nginx/snippets/brandbasket-proxy.conf
readonly SSH_DIR=/home/deploy/.ssh
readonly DEPLOY_KEY="$SSH_DIR/github-brandbasket-platform"
readonly MIRROR="$SRV/repo.git"
readonly SECRETS=/root/brandbasket-secrets.env
readonly FILL_ME_NAMES='BREVO_API_KEY|RAZORPAY_KEY_ID|RAZORPAY_KEY_SECRET'

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }

# Runs a command as the deploy user with deploy's home (runuser alone keeps root's HOME).
as_deploy() { runuser -u deploy -- env HOME=/home/deploy "$@"; }

# unit_names_ok <unit>...: every systemctl call below names Brandbasket units only.
unit_names_ok() { local u; for u in "$@"; do [[ "$u" == brandbasket-* ]] || die "refusing to manage unit $u"; done; }

# verify_units <source file>...: systemd-analyze verify on copies in a scratch directory (read-only for the server). Missing
# program paths are not errors yet: the apps' ExecStart lives in a release the first deploy creates.
verify_units() {
  local tmp out f
  tmp="$(mktemp -d)"
  for f in "$@"; do cp "$f" "$tmp/$(basename "$f")"; done
  out="$(cd "$tmp" && systemd-analyze verify ./* 2>&1 || true)"
  rm -rf "${tmp:?}"
  out="$(grep -v -E 'current-(platform|admin)|is not executable|No such file or directory' <<<"$out" || true)"
  [[ -z "$out" ]] || { printf '%s\n' "$out" >&2; die "systemd-analyze verify found problems in the units above; nothing was installed"; }
  say "  systemd-analyze verify: ok ($(printf '%s ' "${@##*/}"))"
}

# put_checked <mode> <source> <destination> <check command...>: installs, runs the check, and puts the old file back (or
# removes the new one) when the check fails.
put_checked() {
  local mode=$1 src=$2 dst=$3; shift 3
  local backup=""
  if (( APPLY )) && [[ -e "$dst" ]] && ! cmp -s "$src" "$dst"; then backup="$(mktemp)"; cp -p "$dst" "$backup"; fi
  put "$mode" "$src" "$dst"
  (( APPLY )) || return 0
  if ! "$@"; then
    if [[ -n "$backup" ]]; then cp -p "$backup" "$dst"; else remove_added "$dst"; fi
    [[ -z "$backup" ]] || rm -f "${backup:?}"
    die "the check failed for $dst; it was put back as it was"
  fi
  [[ -z "$backup" ]] || rm -f "${backup:?}"
}

enable_units() { # <unit>...: enable; start where the unit can run now
  unit_names_ok "$@"
  local u wd
  for u in "$@"; do
    act "systemctl enable $u" systemctl enable "$u"
    if [[ "$u" == *.timer ]]; then
      act "systemctl start $u" systemctl start "$u"
    elif (( APPLY )); then
      wd="$(systemctl show -p WorkingDirectory --value "$u")"
      if [[ -n "$wd" && ! -d "$wd" ]]; then say "  $u: $wd does not exist yet (no release deployed): enabled, not started"; else systemctl restart "$u"; fi
    fi
  done
}

# --- database -----------------------------------------------------------------------------------------------------------
step_database() {
  need_root
  local script="$REPO/scripts/server/setup-database.sh"
  need_file "$script"
  say "== database: roles bb_owner bb_app bb_staff bb_public bb_cms; databases brandbasket_platform, brandbasket_platform_payload"
  say "   setup-database.sh creates only what is missing and never alters another role or database; passwords go to $SECRETS"
  # env -i: none of its BRANDBASKET_* test hooks can be set by accident.
  if (( APPLY )); then env -i PATH="$PATH" HOME="$HOME" bash "$script" --apply; else env -i PATH="$PATH" HOME="$HOME" bash "$script"; fi
}

# --- dirs-env -----------------------------------------------------------------------------------------------------------
step_dirs_env() {
  need_root
  id deploy >/dev/null 2>&1 || die "user deploy does not exist"
  say "== directories"
  dir 0755 deploy:deploy "$SRV"
  dir 0755 deploy:deploy "$SRV/releases"
  dir 0750 deploy:deploy "$SRV/shared"
  dir 0750 deploy:deploy "$SRV/media"
  dir 0750 deploy:deploy "$SRV/support-private"
  dir 0700 root:root /etc/brandbasket
  say "== build env file (public values and placeholders only)"
  put 0644 "$HERE/brandbasket-platform-build.env" /etc/brandbasket-platform-build.env
  say "== env files (generated secrets; Brevo and Razorpay left blank for the owner)"
  if [[ -e "$SRV/shared/platform.env.local" && -e "$SRV/shared/admin.env.local" ]]; then
    say "  both env files exist; not touched"
  elif [[ ! -f "$SECRETS" ]]; then
    (( APPLY )) && die "$SECRETS is missing: run install.sh database --apply first"
    say "  would run make-env-files.sh --apply once $SECRETS exists (database step)"
  elif (( APPLY )); then
    env -i PATH="$PATH" HOME="$HOME" bash "$REPO/scripts/server/make-env-files.sh" --apply
  else
    env -i PATH="$PATH" HOME="$HOME" bash "$REPO/scripts/server/make-env-files.sh" | sed 's/^/  /'
  fi
  say "Owner: fill $FILL_ME_NAMES in BOTH $SRV/shared/platform.env.local and admin.env.local (the first deploy stops at its env step until you do)."
}

# --- github -------------------------------------------------------------------------------------------------------------
step_github() {
  need_root
  id deploy >/dev/null 2>&1 || die "user deploy does not exist"
  guard "$DEPLOY_KEY"
  need_file "$SSH_DIR/known_hosts" "Firstfold's deploy setup created it"
  grep -q '^github.com ' "$SSH_DIR/known_hosts" || die "$SSH_DIR/known_hosts has no github.com key; add the keys from 'gh api meta --jq .ssh_keys' by hand first"
  need_file "$SRV" "run install.sh dirs-env first"
  say "== read-only deploy key for digibranders/brandbasket-platform"
  if [[ -f "$DEPLOY_KEY" ]]; then
    say "  $DEPLOY_KEY exists"
  else
    act "ssh-keygen ed25519 key as deploy (no passphrase)" \
      as_deploy ssh-keygen -q -t ed25519 -N '' -C 'brandbasket-platform VPS autodeploy (read-only)' -f "$DEPLOY_KEY"
  fi
  say "== ssh alias in $SSH_DIR/config (a marked block; nothing else in the file is read or written)"
  block "$SSH_DIR/config" "brandbasket-platform (deploy/vps/install.sh github)" "Host github-brandbasket-platform
  HostName github.com
  User git
  IdentityFile ~/.ssh/github-brandbasket-platform
  IdentitiesOnly yes
  StrictHostKeyChecking yes
  BatchMode yes"
  say "== mirror"
  if [[ -d "$MIRROR" ]]; then
    say "  $MIRROR exists"
  else
    act "git init --bare $MIRROR with origin git@github-brandbasket-platform:digibranders/brandbasket-platform.git" \
      as_deploy bash -c "git init --quiet --bare '$MIRROR' && git -C '$MIRROR' remote add origin git@github-brandbasket-platform:digibranders/brandbasket-platform.git"
  fi
  (( APPLY )) || { say "nothing changed. Run again with --apply."; return 0; }
  say "== checks"
  if as_deploy timeout 30 git -C "$MIRROR" ls-remote --heads origin >/dev/null 2>&1; then
    say "  GitHub accepts the deploy key"
  else
    say "  GitHub does not accept the key yet. Owner: add this public key as a READ-ONLY deploy key at"
    say "  https://github.com/digibranders/brandbasket-platform/settings/keys and run this step again:"
    cat "$DEPLOY_KEY.pub"
  fi
  need_file /home/deploy/.github-app-id "the GitHub App id Firstfold already installed"
  need_file /usr/local/lib/firstfold/github-status.sh "Firstfold's GitHub reporting library"
  local auth
  # shellcheck disable=SC2016 # the single quotes are for the inner bash
  auth="$(as_deploy bash -c 'source /usr/local/lib/firstfold/github-status.sh; gh_init digibranders/brandbasket-platform; echo "${GH_AUTH:-none}"' 2>/dev/null || echo none)"
  if [[ "$auth" == app ]]; then
    say "  the GitHub App firstfold-vps-deploy can report for digibranders/brandbasket-platform"
  else
    say "  GitHub reporting would be: $auth. Owner: add digibranders/brandbasket-platform to the installation of the"
    say "  GitHub App firstfold-vps-deploy (Settings, Developer settings, GitHub Apps, Install App, Configure)."
  fi
}

# --- nginx ----------------------------------------------------------------------------------------------------------------
# install_nginx <site source> [snippet source]: installs, tests with nginx -t, and takes back what it added when the test
# fails. Reloads only after the test passes.
install_nginx() {
  local site=$1 snippet=${2:-} tmp="" had_link=0 f
  need_root
  guard "$NGINX_AVAILABLE"
  nginx -t >/dev/null 2>&1 || die "nginx -t fails before any change of ours; fix that first"
  say "  nginx -t passes now"
  if (( APPLY )); then
    tmp="$(mktemp -d)"
    for f in "$NGINX_AVAILABLE" "$NGINX_SNIPPET"; do [[ -e "$f" ]] && cp -p "$f" "$tmp/${f##*/}"; done
    [[ -L "$NGINX_ENABLED" ]] && had_link=1
  fi
  [[ -z "$snippet" ]] || put 0644 "$snippet" "$NGINX_SNIPPET"
  put 0644 "$site" "$NGINX_AVAILABLE"
  guard "$NGINX_ENABLED"
  act "link $NGINX_ENABLED" ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  if (( APPLY )); then
    if ! nginx -t; then
      echo "nginx -t failed with the new files; putting everything back" >&2
      for f in "$NGINX_AVAILABLE" "$NGINX_SNIPPET"; do
        if [[ -e "$tmp/${f##*/}" ]]; then cp -p "$tmp/${f##*/}" "$f"; else remove_added "$f"; fi
      done
      (( had_link )) || remove_added "$NGINX_ENABLED"
      rm -rf "${tmp:?}"
      nginx -t || echo "WARNING: nginx -t still fails after taking our files back; look at it before anything reloads" >&2
      die "the nginx change was taken back"
    fi
    rm -rf "${tmp:?}"
    systemctl reload nginx
    say "  nginx -t passed; nginx reloaded"
  else
    say "  would run nginx -t, reload nginx if it passes, and take the files back if it fails"
  fi
}

step_nginx_http() {
  say "== nginx: port 80 for app.brandbasket.in and console.brandbasket.in (certificate challenge, then redirect)"
  need_file /var/www/acme "Firstfold's ACME webroot"
  install_nginx "$HERE/nginx/sites-brandbasket-http"
  say "Owner next: Cloudflare, add proxied AAAA records app and console to 2a02:4780:63:bbcc::1 (no A record), SSL/TLS Full (strict). Then install.sh tls."
}

step_tls() {
  need_root
  if [[ -z "$EMAIL" ]]; then
    (( APPLY )) && die "tls needs --email <contact address for Let's Encrypt>"
    EMAIL="<contact address>"
  fi
  need_file "$NGINX_ENABLED" "run install.sh nginx-http first"
  need_file /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh "Firstfold's renewal hook, which reloads nginx after every renewal (including ours)"
  say "== certificate \"brandbasket\" (ECDSA) for app.brandbasket.in and console.brandbasket.in, HTTP-01 through /var/www/acme"
  local names
  names="$(getent ahosts app.brandbasket.in console.brandbasket.in | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  say "  the names resolve to: ${names:-nothing yet} (Cloudflare addresses when proxied)"
  local base=(certbot certonly --non-interactive --agree-tos --email "$EMAIL" --webroot -w /var/www/acme --cert-name brandbasket --key-type ecdsa -d app.brandbasket.in -d console.brandbasket.in)
  if [[ -d /etc/letsencrypt/live/brandbasket ]]; then say "  certificate lineage brandbasket exists; certbot keeps it unless it is near expiry"; fi
  act "${base[*]} --dry-run   (Let's Encrypt staging, saves nothing)" "${base[@]}" --dry-run
  act "${base[*]}" "${base[@]}"
  say "  nginx is not reloaded here: the certificate is used from install.sh nginx-https"
}

step_nginx_https() {
  need_root
  say "== nginx: the full site (443 for both names, IPv4 and IPv6)"
  need_file /etc/letsencrypt/live/brandbasket/fullchain.pem "run install.sh tls first"
  need_file /etc/nginx/snippets/cloudflare-realip.conf "Firstfold's Cloudflare real-IP snippet"
  grep -q 'from_cloudflare' /etc/nginx/conf.d/10-cloudflare.conf || die "conf.d/10-cloudflare.conf does not define \$from_cloudflare"
  local dump
  dump="$(nginx -T 2>/dev/null)"
  for zone in general signin perip; do
    grep -qE "zone=$zone:[0-9]" <<<"$dump" || die "nginx.conf defines no rate-limit zone '$zone'"
  done
  say "  Firstfold's real-IP snippet, \$from_cloudflare and the rate-limit zones are in place"
  install_nginx "$HERE/nginx/sites-brandbasket" "$HERE/nginx/snippets-brandbasket-proxy.conf"
}

# --- services -------------------------------------------------------------------------------------------------------------
step_services() {
  need_root
  id deploy >/dev/null 2>&1 || die "user deploy does not exist"
  say "== checking the units before installing anything"
  verify_units "$HERE/systemd/brandbasket-app.service" "$HERE/systemd/brandbasket-admin.service"
  say "== units"
  put 0644 "$HERE/systemd/brandbasket-app.service" "$UNIT_DIR/brandbasket-app.service"
  put 0644 "$HERE/systemd/brandbasket-admin.service" "$UNIT_DIR/brandbasket-admin.service"
  install_failure_alerts brandbasket-app brandbasket-admin
  say "== migration wrapper (reads the database owner's password from a root-only file; takes no arguments)"
  put 0755 "$REPO/scripts/server/brandbasket-migrate" /usr/local/sbin/brandbasket-migrate
  say "== sudo: deploy may run the wrapper, restart/stop/status the two units, and the CI sandbox, nothing else"
  visudo -cf "$HERE/sudoers-brandbasket-deploy" >/dev/null || die "the sudoers file does not parse"
  say "  visudo -cf: ok"
  put_checked 0440 "$HERE/sudoers-brandbasket-deploy" /etc/sudoers.d/brandbasket-deploy visudo -c
  act "systemctl daemon-reload" systemctl daemon-reload
  enable_units brandbasket-app brandbasket-admin
  say "  ports 3201 and 3203 stay closed: ufw admits only 22, and 80/443 from Cloudflare"
}

# install_failure_alerts <service name>...: OnFailure drop-ins that use Firstfold's generic alert unit.
install_failure_alerts() {
  local s
  if [[ ! -e "$UNIT_DIR/firstfold-notify-failure@.service" ]]; then
    say "  Firstfold's failure alert unit is not installed; skipping the failure alerts for: $*"
    return 0
  fi
  for s in "$@"; do
    dir 0755 root:root "$UNIT_DIR/$s.service.d"
    put 0644 "$HERE/systemd/10-notify-failure.conf" "$UNIT_DIR/$s.service.d/10-notify-failure.conf"
  done
}

# --- autodeploy -----------------------------------------------------------------------------------------------------------
step_autodeploy() {
  need_root
  say "== checking what the autodeploy needs"
  need_file "$SRV/shared/platform.env.local" "run install.sh dirs-env first"
  need_file "$SRV/shared/admin.env.local" "run install.sh dirs-env first"
  need_file /etc/brandbasket-platform-build.env "run install.sh dirs-env first"
  need_file /usr/local/sbin/brandbasket-migrate "run install.sh services first"
  need_file /etc/sudoers.d/brandbasket-deploy "run install.sh services first"
  need_file "$DEPLOY_KEY" "run install.sh github first"
  need_file /usr/local/lib/firstfold/github-status.sh "Firstfold's GitHub reporting library"
  if grep -qE "^($FILL_ME_NAMES)=\s*$" "$SRV/shared/platform.env.local" "$SRV/shared/admin.env.local"; then
    say "  still blank in the env files: $(grep -hoE "^($FILL_ME_NAMES)=\s*$" "$SRV/shared/platform.env.local" "$SRV/shared/admin.env.local" | sort -u | tr -d '=' | tr '\n' ' ')"
    (( APPLY )) && die "fill those in first: the first deploy would stop at its env step and the timer would keep an alert coming"
  fi
  (( MISSING )) || say "  all present"
  say "== checking the units before installing anything"
  verify_units "$HERE/systemd/brandbasket-platform-autodeploy.service" "$HERE/systemd/brandbasket-platform-autodeploy.timer"
  say "== scripts"
  dir 0755 root:root "$LIB"
  put 0644 "$HERE/heavy-lock.sh" "$LIB/heavy-lock.sh"
  put 0755 "$HERE/brandbasket-platform-release" /usr/local/bin/brandbasket-platform-release
  put 0755 "$HERE/brandbasket-platform-autodeploy" /usr/local/bin/brandbasket-platform-autodeploy
  say "== units and timer (:20 of every minute)"
  put 0644 "$HERE/systemd/brandbasket-platform-autodeploy.service" "$UNIT_DIR/brandbasket-platform-autodeploy.service"
  put 0644 "$HERE/systemd/brandbasket-platform-autodeploy.timer" "$UNIT_DIR/brandbasket-platform-autodeploy.timer"
  install_failure_alerts brandbasket-platform-autodeploy
  act "systemctl daemon-reload" systemctl daemon-reload
  enable_units brandbasket-platform-autodeploy.timer
  say "Watch the first deploy: journalctl -u brandbasket-platform-autodeploy -f   and   runuser -u deploy -- brandbasket-platform-autodeploy --status"
}

# --- ci -------------------------------------------------------------------------------------------------------------------
step_ci() {
  need_root
  say "== CI sandbox (ci/install-ci.sh)"
  if (( APPLY )); then bash "$HERE/ci/install-ci.sh" --apply; else bash "$HERE/ci/install-ci.sh"; fi
}

# --- backups --------------------------------------------------------------------------------------------------------------
step_backups() {
  local f tool
  need_root
  say "== checking what the backups need (Firstfold's shared R2 settings and public age key are read, never written)"
  need_file /usr/local/lib/firstfold/r2-lib.sh "Firstfold's R2 helper"
  need_file /etc/firstfold/r2.env "the R2 bucket and token"
  need_file /etc/firstfold/backup-age.pub "the age public key"
  for tool in age rclone rsync; do need_cmd "$tool"; done
  (( MISSING )) || say "  present"
  say "== checking the units before installing anything"
  verify_units "$HERE/systemd/brandbasket-backup.service" "$HERE/systemd/brandbasket-backup.timer" \
    "$HERE/systemd/brandbasket-restore-test.service" "$HERE/systemd/brandbasket-restore-test.timer" \
    "$HERE/systemd/brandbasket-maintenance.service" "$HERE/systemd/brandbasket-maintenance.timer" \
    "$HERE/systemd/brandbasket-erase.service" "$HERE/systemd/brandbasket-erase.timer"
  say "== programs"
  dir 0700 root:root /etc/brandbasket
  dir 0700 root:root /var/backups/brandbasket
  dir 0755 root:root /var/lib/brandbasket
  put 0755 "$HERE/backup/brandbasket-backup" /usr/local/sbin/brandbasket-backup
  put 0755 "$HERE/backup/brandbasket-restore-test" /usr/local/sbin/brandbasket-restore-test
  put 0700 "$HERE/backup/offsite.sh" /etc/brandbasket/offsite.sh
  put 0755 "$REPO/scripts/server/run-erase-job.sh" /usr/local/sbin/brandbasket-erase-job
  say "== units"
  for f in brandbasket-backup brandbasket-restore-test brandbasket-maintenance brandbasket-erase; do
    put 0644 "$HERE/systemd/$f.service" "$UNIT_DIR/$f.service"
    put 0644 "$HERE/systemd/$f.timer" "$UNIT_DIR/$f.timer"
  done
  install_failure_alerts brandbasket-backup brandbasket-restore-test brandbasket-maintenance
  act "systemctl daemon-reload" systemctl daemon-reload
  say "== timers"
  if [[ -f /var/lib/brandbasket/last-backup-ok && -f /var/lib/brandbasket/last-offsite-ok ]]; then
    enable_units brandbasket-backup.timer
    if [[ -f /var/lib/brandbasket/last-restore-test-ok ]]; then enable_units brandbasket-restore-test.timer
    else say "  restore test timer: not enabled until 'brandbasket-restore-test --apply' has passed once"; fi
  else
    say "  backup timers: not enabled until one manual 'brandbasket-backup --apply' has reached R2 (then run this step again)"
  fi
  if [[ -d "$SRV/current-platform" ]]; then enable_units brandbasket-maintenance.timer
  else say "  maintenance timer: not enabled until the first deploy has created $SRV/current-platform"; fi
  say "  brandbasket-erase.timer: installed, NOT enabled. It deletes customer data; the owner decides: systemctl enable --now brandbasket-erase.timer"
}

# --- main -----------------------------------------------------------------------------------------------------------------
parse_args "$@"
[[ -n "$STEP" && "$STEP" != help ]] || { usage; exit 0; }
case "$STEP" in
  database | dirs-env | github | nginx-http | tls | nginx-https | services | autodeploy | ci | backups) ;;
  *) die "unknown step: $STEP (try --help)" ;;
esac
say "install.sh $STEP ($( (( APPLY )) && echo apply || echo "plan only: add --apply to do it" ))"
"step_${STEP//-/_}"
(( APPLY )) || say "Nothing was changed."
