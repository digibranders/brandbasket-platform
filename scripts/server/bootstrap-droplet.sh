#!/usr/bin/env bash
# What this does: prepares Fynix's OWN DigitalOcean droplet to run the dashboard and the staff console: packages, Node and pnpm, the
# deploy user, the /srv/fynix layout, systemd units and timers, the sudo rule, the root-owned helper scripts, and the nginx files
# (port 80 first, then https once the certificates exist). It does NOT touch the database (setup-database.sh does), the environment
# files (make-env-files.sh does), DNS, Cloudflare, or the firewall, and it never removes or edits anything that was already there:
# every file it installs is compared first ("unchanged" / "installed"), and nginx is only reloaded after `nginx -t` passes (a link it
# just added is taken out again if the test fails). Safe to run again after a partial run.
#
# Two ways to run it:
#   from your machine:   bootstrap-droplet.sh --host root@<droplet address> [options]       copies this kit to the droplet, runs it there
#   on the droplet:      bootstrap-droplet.sh --on-server [options]
# DRY-RUN BY DEFAULT: without --apply it prints exactly what it would do (and, on the droplet, reads the current state to say what is
# already done) and changes nothing; with --host and no --apply it does not even open a connection. Run inspect-droplet.sh first.
#
# Options:
#   --apply                 really do it
#   --app-host NAME         the dashboard's hostname      (default app.fynix.digital)
#   --admin-host NAME       the staff console's hostname  (default console.fynix.digital)
#   --deploy-user NAME      the unprivileged user that owns releases and runs the apps (default deploy)
#   --authorize-root-keys   give the deploy user the same ssh keys root already has (otherwise add one yourself, see the runbook)
#   --swap SIZE             create /swapfile of this size (e.g. 2G) if the machine has no swap; recommended on 2 GB droplets
#   --certbot-email ADDR    ALSO obtain the Let's Encrypt certificate for the dashboard (agrees to Let's Encrypt's terms with this
#                           address). Needs the dashboard's DNS record to already point here. Without it the script stops at port 80
#                           and prints the command.
#   --skip-node             do not install Node (you installed Node 24 yourself)
#   --skip-cloudflare       do not fetch Cloudflare's address ranges (the staff console's nginx file needs them)
#   --pnpm-version V        pnpm to activate (default read from package.json, 10.30.3)
# Test hooks: FYNIX_PREFIX (a directory standing in for / for /etc, /usr/local/sbin, /srv, /var/www), FYNIX_TEST=1 (skip the root check).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
APPLY=0; HOST=""; ON_SERVER=0
APP_HOST="app.fynix.digital"; ADMIN_HOST="console.fynix.digital"; DEPLOY_USER="deploy"
AUTH_ROOT_KEYS=0; SWAP=""; CERTBOT_EMAIL=""; SKIP_NODE=0; SKIP_CF=0; PNPM_VERSION=""
SSH_OPTS="${FYNIX_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=15}"
ARGS=("$@")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:?--host needs user@address}"; shift 2 ;;
    --on-server) ON_SERVER=1; shift ;;
    --apply) APPLY=1; shift ;;
    --dry-run) APPLY=0; shift ;;
    --app-host) APP_HOST="${2:?}"; shift 2 ;;
    --admin-host) ADMIN_HOST="${2:?}"; shift 2 ;;
    --deploy-user) DEPLOY_USER="${2:?}"; shift 2 ;;
    --authorize-root-keys) AUTH_ROOT_KEYS=1; shift ;;
    --swap) SWAP="${2:?--swap needs a size such as 2G}"; shift 2 ;;
    --certbot-email) CERTBOT_EMAIL="${2:?}"; shift 2 ;;
    --skip-node) SKIP_NODE=1; shift ;;
    --skip-cloudflare) SKIP_CF=1; shift ;;
    --pnpm-version) PNPM_VERSION="${2:?}"; shift 2 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done
for name in "$APP_HOST" "$ADMIN_HOST"; do
  if ! [[ "$name" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]]; then echo "Not a hostname: $name" >&2; exit 64; fi
done
if ! [[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]; then echo "Not a user name: $DEPLOY_USER" >&2; exit 64; fi

say() { printf '%s\n' "$*"; }

# --- from the operator's machine --------------------------------------------------------------------------------------------
if [[ $ON_SERVER -eq 0 ]]; then
  [[ -n "$HOST" ]] || { echo "Say where: --host root@<droplet address>  (or --on-server when already on the droplet)." >&2; exit 64; }
  # Forward every option except --host (the remote run is --on-server).
  fwd=(); skip=0
  for a in "${ARGS[@]}"; do
    if [[ $skip -eq 1 ]]; then skip=0; continue; fi
    if [[ "$a" == "--host" ]]; then skip=1; continue; fi
    fwd+=("$a")
  done
  if [[ $APPLY -eq 0 ]]; then
    say "[dry-run] would copy deploy/ and scripts/server/ to $HOST:/root/fynix-kit/ (rsync) and run there:"
    say "[dry-run]   bash /root/fynix-kit/scripts/server/bootstrap-droplet.sh --on-server ${fwd[*]:-}"
    say "To see the full step list without connecting: run this with --on-server on any machine (it only reads, in dry-run)."
    say "Nothing was done. Add --apply."
    exit 0
  fi
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$HOST" 'mkdir -p /root/fynix-kit/scripts/server /root/fynix-kit/deploy'
  # shellcheck disable=SC2086
  rsync -az --delete -e "ssh $SSH_OPTS" "$REPO/deploy/" "$HOST:/root/fynix-kit/deploy/"
  # shellcheck disable=SC2086
  rsync -az -e "ssh $SSH_OPTS" --exclude test --exclude '*.ts' "$REPO/scripts/server/" "$HOST:/root/fynix-kit/scripts/server/"
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$HOST" "bash /root/fynix-kit/scripts/server/bootstrap-droplet.sh --on-server ${fwd[*]:-}"
  exit $?
fi

# --- on the droplet ---------------------------------------------------------------------------------------------------------
PREFIX="${FYNIX_PREFIX:-}"
ETC="$PREFIX/etc"; SBIN="$PREFIX/usr/local/sbin"; FYNIX="$PREFIX/srv/fynix"; WWW="$PREFIX/var/www"
KIT_DEPLOY="$REPO/deploy"; KIT_SCRIPTS="$REPO/scripts/server"
have() { command -v "$1" >/dev/null 2>&1; }
planned=0; failed=0

if [[ $APPLY -eq 1 && "${FYNIX_TEST:-0}" != 1 && "$(id -u)" -ne 0 ]]; then echo "--apply must run as root on the droplet." >&2; exit 1; fi
say "Fynix droplet bootstrap ($([[ $APPLY -eq 1 ]] && echo APPLY || echo dry-run)): dashboard $APP_HOST, console $ADMIN_HOST, deploy user $DEPLOY_USER"
# The kit copied to the droplet holds no package.json, so a failed read must not stop the script (set -e): fall back to the default below.
if [[ -z "$PNPM_VERSION" ]]; then PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9.]*\)".*/\1/p' "$REPO/package.json" 2>/dev/null | head -n 1)" || PNPM_VERSION=""; fi
PNPM_VERSION="${PNPM_VERSION:-10.30.3}"

# Does one step: prints it, and (only with --apply) runs it.
step() { say "  -> $*"; }
run() { # description, command...
  local what="$1"; shift
  if [[ $APPLY -eq 1 ]]; then step "$what"; "$@"; else step "[would] $what"; planned=$((planned + 1)); fi
}
done_already() { say "  ok  $*"; }

# Installs a file (mode 644 unless given) only when it differs; reports which. An optional sed expression rewrites hostnames.
install_file() { # src dest [mode] [sed-expression]
  local src="$1" dest="$2" mode="${3:-644}" expr="${4:-}" tmp
  tmp="$(mktemp)"
  if [[ -n "$expr" ]]; then sed -e "$expr" "$src" >"$tmp"; else cp "$src" "$tmp"; fi
  if [[ -f "$dest" ]] && cmp -s "$tmp" "$dest"; then done_already "$dest unchanged"; rm -f "$tmp"; return 0; fi
  if [[ $APPLY -eq 1 ]]; then
    mkdir -p "$(dirname "$dest")"
    install -m "$mode" "$tmp" "$dest"; step "installed $dest"
  else step "[would] install $dest ($([[ -f "$dest" ]] && echo 'replacing a different file' || echo new))"; planned=$((planned + 1)); fi
  rm -f "$tmp"
}

# --- 1. packages -------------------------------------------------------------------------------------------------------------
say; say "1. Packages"
if have dpkg; then
  missing=()
  for pkg in nginx postgresql postgresql-contrib rsync curl ca-certificates gnupg openssl certbot logrotate; do
    dpkg -s "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
  done
  if [[ ${#missing[@]} -eq 0 ]]; then done_already "all packages present"; else
    run "apt-get install ${missing[*]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"
  fi
else say "  (no dpkg here: this is not a Debian/Ubuntu machine; the real run needs one)"; fi

# --- 2. node + pnpm ----------------------------------------------------------------------------------------------------------
say; say "2. Node 24 and pnpm $PNPM_VERSION"
node_major=0
if have node; then node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"; fi
if [[ $SKIP_NODE -eq 1 ]]; then done_already "skipped (--skip-node)"; elif [[ "$node_major" -ge 24 ]]; then done_already "node $(node -v) present"; else
  say "  node is ${node_major:-not installed}: installing 24.x from NodeSource's apt repository (their documented method)."
  run "fetch NodeSource's setup script and run it" bash -c 'curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh && bash /tmp/nodesource_setup.sh && rm -f /tmp/nodesource_setup.sh'
  run "apt-get install nodejs" env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
if have pnpm && [[ "$(pnpm -v 2>/dev/null || true)" == "$PNPM_VERSION" ]]; then done_already "pnpm $PNPM_VERSION present"; else
  run "corepack enable and activate pnpm@$PNPM_VERSION" bash -c "corepack enable && corepack prepare pnpm@$PNPM_VERSION --activate"
fi

# --- 3. deploy user and directories ------------------------------------------------------------------------------------------
say; say "3. The $DEPLOY_USER user and /srv/fynix"
if id "$DEPLOY_USER" >/dev/null 2>&1; then done_already "user $DEPLOY_USER exists"; else
  run "create user $DEPLOY_USER (no password, no sudo group)" adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
if [[ $AUTH_ROOT_KEYS -eq 1 ]]; then
  home="$PREFIX/home/$DEPLOY_USER"
  if [[ -f "$home/.ssh/authorized_keys" ]]; then done_already "$DEPLOY_USER already has authorized keys"; else
    run "copy root's ssh keys to $DEPLOY_USER" bash -c "mkdir -p '$home/.ssh' && cp '$PREFIX/root/.ssh/authorized_keys' '$home/.ssh/authorized_keys' && chown -R '$DEPLOY_USER:$DEPLOY_USER' '$home/.ssh' && chmod 700 '$home/.ssh' && chmod 600 '$home/.ssh/authorized_keys'"
  fi
else say "  (ssh keys for $DEPLOY_USER: not touched; add yours with: ssh-copy-id $DEPLOY_USER@<address>, or re-run with --authorize-root-keys)"; fi
for dir in releases shared media support-private; do
  if [[ -d "$FYNIX/$dir" ]]; then done_already "$FYNIX/$dir exists"; else run "create $FYNIX/$dir" bash -c "mkdir -p '$FYNIX/$dir' && chown '$DEPLOY_USER:$DEPLOY_USER' '$FYNIX/$dir'"; fi
done
if [[ -d "$FYNIX/backups" ]]; then done_already "$FYNIX/backups exists"; else run "create $FYNIX/backups (root only)" bash -c "mkdir -p '$FYNIX/backups' && chmod 700 '$FYNIX/backups'"; fi
if [[ -d "$ETC/fynix" ]]; then done_already "$ETC/fynix exists"; else run "create $ETC/fynix" mkdir -p "$ETC/fynix"; fi
if [[ -d "$WWW/certbot" ]]; then done_already "$WWW/certbot exists"; else run "create $WWW/certbot (for the certificate challenge)" mkdir -p "$WWW/certbot"; fi
if [[ -n "$SWAP" ]]; then
  if [[ -f "$PREFIX/proc/swaps" ]] && [[ "$(wc -l <"$PREFIX/proc/swaps")" -gt 1 ]]; then done_already "swap already exists"; elif [[ -e "$PREFIX/swapfile" ]]; then done_already "$PREFIX/swapfile already exists"; else
    run "create a $SWAP swap file" bash -c "fallocate -l '$SWAP' '$PREFIX/swapfile' && chmod 600 '$PREFIX/swapfile' && mkswap '$PREFIX/swapfile' && swapon '$PREFIX/swapfile' && echo '/swapfile none swap sw 0 0' >> '$ETC/fstab'"
  fi
fi

# --- 4. root-owned helper scripts, units, sudo rule -------------------------------------------------------------------------
say; say "4. Helper scripts, systemd units and the sudo rule"
# Root-owned copies: a script a root-run unit starts must never live in a directory the deploy user can write.
install_file "$KIT_SCRIPTS/fynix-migrate" "$SBIN/fynix-migrate" 755
install_file "$KIT_SCRIPTS/backup.sh" "$SBIN/fynix-backup" 755
install_file "$KIT_SCRIPTS/restore-test.sh" "$SBIN/fynix-restore-test" 755
install_file "$KIT_SCRIPTS/run-erase-job.sh" "$SBIN/fynix-erase-job" 755
install_file "$KIT_SCRIPTS/cloudflare-ips.sh" "$SBIN/fynix-cloudflare-ips" 755
for unit in "$KIT_DEPLOY"/systemd/*; do
  install_file "$unit" "$ETC/systemd/system/$(basename "$unit")" 644 "s/^User=deploy\$/User=$DEPLOY_USER/;s/^Group=deploy\$/Group=$DEPLOY_USER/"
done
if [[ $APPLY -eq 1 ]]; then if have systemctl; then systemctl daemon-reload; step "systemctl daemon-reload"; fi; else step "[would] systemctl daemon-reload"; fi
# The sudo rule is checked with visudo before it is put in place: a broken sudoers file locks everyone out of sudo.
sudoers_dest="$ETC/sudoers.d/fynix"
tmp_sudoers="$(mktemp)"; sed "s/^deploy /$DEPLOY_USER /" "$KIT_DEPLOY/sudoers.fynix.example" >"$tmp_sudoers"
if [[ -f "$sudoers_dest" ]] && cmp -s "$tmp_sudoers" "$sudoers_dest"; then done_already "$sudoers_dest unchanged"; else
  if have visudo && ! visudo -cf "$tmp_sudoers" >/dev/null 2>&1; then echo "The sudoers rule failed visudo's check; not installing it." >&2; failed=1
  elif [[ $APPLY -eq 1 ]]; then mkdir -p "$ETC/sudoers.d"; install -m 440 "$tmp_sudoers" "$sudoers_dest"; step "installed $sudoers_dest (checked with visudo)"
  else step "[would] install $sudoers_dest (mode 440, checked with visudo first)"; planned=$((planned + 1)); fi
fi
rm -f "$tmp_sudoers"
say "  (the timers are installed but NOT enabled yet: enable them at go-live, runbook section 11)"

# --- 5. nginx ----------------------------------------------------------------------------------------------------------------
say; say "5. nginx (nothing already served is touched; only two new server names are added)"
if ! have nginx && [[ $APPLY -eq 1 ]]; then echo "nginx is not installed (step 1 did not install it)." >&2; exit 1; fi
SITES="$ETC/nginx/sites-available"; ENABLED="$ETC/nginx/sites-enabled"
HOSTSED="s/app\\.fynix\\.digital/$APP_HOST/g;s/console\\.fynix\\.digital/$ADMIN_HOST/g"
install_file "$KIT_DEPLOY/nginx/fynix-proxy.conf.example" "$ETC/nginx/snippets/fynix-proxy.conf" 644
install_file "$KIT_DEPLOY/nginx/fynix-acme.conf.example" "$SITES/fynix-acme.conf" 644 "$HOSTSED"
added=()
enable_site() { # file name in sites-available
  local file="$1"
  if [[ -e "$ENABLED/$file" ]]; then done_already "$file already enabled"; return 0; fi
  if [[ $APPLY -eq 1 ]]; then mkdir -p "$ENABLED"; ln -s "$SITES/$file" "$ENABLED/$file"; added+=("$file"); step "enabled $file"; else step "[would] enable $file"; planned=$((planned + 1)); fi
}
enable_site fynix-acme.conf
if [[ $SKIP_CF -eq 0 ]]; then
  if [[ -f "$ETC/nginx/conf.d/fynix-cloudflare-geo.conf" && -f "$ETC/nginx/snippets/fynix-cloudflare-realip.conf" ]]; then done_already "Cloudflare range files exist (refresh them with fynix-cloudflare-ips --apply)"; else
    run "write Cloudflare's address ranges for the console's nginx file" bash "$KIT_SCRIPTS/cloudflare-ips.sh" --apply --nginx-dir "$ETC/nginx"
  fi
fi
cert_dir="$ETC/letsencrypt/live/$APP_HOST"
if [[ -f "$cert_dir/fullchain.pem" ]]; then done_already "certificate for $APP_HOST exists"; elif [[ -n "$CERTBOT_EMAIL" ]]; then
  step "(the certificate needs the port-80 file live: nginx is reloaded just below before certbot runs)"
else
  say "  - no certificate for $APP_HOST yet. After DNS points here, run:"
  say "      certbot certonly --webroot -w /var/www/certbot -d $APP_HOST --agree-tos -m <your email> --no-eff-email"
  say "    (or re-run this with --certbot-email <your email>)"
fi

# Tests the configuration and reloads. On a failed test the links THIS run added are unlinked again, so nginx is left as it was.
reload_nginx() {
  if [[ $APPLY -eq 0 ]]; then step "[would] nginx -t, then reload"; return 0; fi
  if nginx -t >/dev/null 2>&1; then systemctl reload nginx; step "nginx tested ok and reloaded"; return 0; fi
  nginx -t 2>&1 | sed 's/^/     /' >&2
  local f
  for f in ${added[@]+"${added[@]}"}; do
    unlink "${ENABLED:?}/${f:?}" && say "  unlinked $f again (it was added by this run and nginx rejected it)"
  done
  added=()
  echo "nginx -t FAILED; nothing was reloaded and the links this run added were removed. The files stay in $SITES for you to read." >&2
  return 1
}
# If the port-80 file alone breaks nginx there is no point going on to the https files.
if ! reload_nginx; then echo "Stopped at the port-80 step; fix the error above and run again." >&2; exit 1; fi
if [[ -n "$CERTBOT_EMAIL" && ! -f "$cert_dir/fullchain.pem" ]]; then
  run "obtain the Let's Encrypt certificate for $APP_HOST" certbot certonly --webroot -w "$WWW/certbot" -d "$APP_HOST" --agree-tos -m "$CERTBOT_EMAIL" --no-eff-email --non-interactive
fi
if [[ -f "$cert_dir/fullchain.pem" || -n "$CERTBOT_EMAIL" ]]; then
  install_file "$KIT_DEPLOY/nginx/fynix-app.conf.example" "$SITES/fynix-app.conf" 644 "$HOSTSED"
  enable_site fynix-app.conf
else say "  - fynix-app.conf is installed once the certificate exists (re-run this script then)."; fi
if [[ -f "$PREFIX/etc/ssl/fynix/staff.pem" && -f "$PREFIX/etc/ssl/fynix/staff.key" ]]; then
  install_file "$KIT_DEPLOY/nginx/fynix-admin.conf.example" "$SITES/fynix-admin.conf" 644 "$HOSTSED"
  enable_site fynix-admin.conf
else say "  - fynix-admin.conf is installed once the Cloudflare Origin certificate is at /etc/ssl/fynix/staff.pem and .key (runbook section 7); re-run then."; fi
reload_nginx || failed=1

# --- 6. what this does not do ------------------------------------------------------------------------------------------------
say; say "6. Left to you (on purpose)"
say "  - firewall: allow only ssh, 80 and 443 in. Check what is open first (inspect-droplet.sh, section 8); a DigitalOcean cloud firewall is the safer place."
say "  - database: scripts/server/setup-database.sh; environment files: scripts/server/make-env-files.sh; first release: deploy.sh (runbook sections 2-4)"

say
if [[ $failed -ne 0 ]]; then echo "Finished with problems (above)." >&2; exit 1; fi
if [[ $APPLY -eq 0 ]]; then say "Dry-run: $planned step(s) would change something. Nothing was done. Add --apply."; else say "Bootstrap done."; fi
