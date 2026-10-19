#!/usr/bin/env bash
# What this does: one backup run for the Brandbasket droplet. Installed as /usr/local/sbin/brandbasket-backup (root-owned) and started every
# night by brandbasket-backup.timer. It writes, under /srv/brandbasket/backups:
#   db/<database>-<UTC stamp>.dump   pg_dump custom format of brandbasket_platform and brandbasket_platform_payload (checked with pg_restore --list)
#   files/media, files/support-private   a mirror of the uploaded media and the private support screenshots
#   secrets/secrets-<stamp>.tar     the environment files and /root/brandbasket-secrets.env (mode 600, stays on this machine)
#   SHA256SUMS-<stamp>, LATEST      a checksum list and the name of the newest good run
# then, when /etc/brandbasket/backup.conf names a destination, copies db/ and files/ off this machine, and deletes this script's OWN
# dumps and secrets archives older than KEEP_DAYS (default 14). Nothing else is ever deleted.
#
# Assumes: PostgreSQL on this machine with the postgres OS user (peer authentication); /srv/brandbasket as in docs/deployment/brandbasket-droplet.md.
# Dry-run by default (it prints what it would do and touches nothing); --apply does it. Safe to re-run: every run has its own stamp.
# Config (/etc/brandbasket/backup.conf, plain shell VARIABLE=value lines, optional):
#   KEEP_DAYS=14
#   OFFSITE_RSYNC=backup@backup-host:/backups/brandbasket        copy with rsync over ssh (the root user's key must be allowed there)
#   OFFSITE_RCLONE=spaces:brandbasket-backups                    or copy with rclone (a DigitalOcean Spaces / S3 remote you configured)
# Test hooks: BRANDBASKET_ROOT, BRANDBASKET_BACKUP_CONF, BRANDBASKET_SECRETS_FILE, BRANDBASKET_PG_RUNAS ("" = run pg_dump as the current user, honouring PGHOST etc.).
set -euo pipefail

APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 64 ;;
  esac
done

ROOT="${BRANDBASKET_ROOT:-/srv/brandbasket}"
CONF="${BRANDBASKET_BACKUP_CONF:-/etc/brandbasket/backup.conf}"
SECRETS_FILE="${BRANDBASKET_SECRETS_FILE:-/root/brandbasket-secrets.env}"
PG_RUNAS="${BRANDBASKET_PG_RUNAS-runuser -u postgres --}"
DATABASES="brandbasket_platform brandbasket_platform_payload"
KEEP_DAYS=14
OFFSITE_RSYNC=""
OFFSITE_RCLONE=""
# shellcheck disable=SC1090
if [[ -r "$CONF" ]]; then . "$CONF"; fi
if ! [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || [[ "$KEEP_DAYS" -lt 3 ]]; then echo "KEEP_DAYS must be a number of at least 3." >&2; exit 64; fi

BACKUPS="$ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
say() { printf '%s\n' "$*"; }
# Runs a PostgreSQL client command as the postgres OS user (or as the current user when BRANDBASKET_PG_RUNAS is empty).
pg() {
  if [[ -n "$PG_RUNAS" ]]; then
    # shellcheck disable=SC2086 # PG_RUNAS is a command prefix with arguments on purpose
    $PG_RUNAS "$@"
  else
    "$@"
  fi
}

say "Backup $STAMP into $BACKUPS ($([[ $APPLY -eq 1 ]] && echo apply || echo dry-run))"
for db in $DATABASES; do say "  dump        $db -> db/$db-$STAMP.dump"; done
say "  mirror      $ROOT/media and $ROOT/support-private -> files/"
say "  secrets     $ROOT/shared/*.env.local and $SECRETS_FILE -> secrets/secrets-$STAMP.tar (mode 600, local only)"
if [[ -n "$OFFSITE_RSYNC" ]]; then say "  off-site    rsync db/ files/ -> $OFFSITE_RSYNC"; fi
if [[ -n "$OFFSITE_RCLONE" ]]; then say "  off-site    rclone copy db/ files/ -> $OFFSITE_RCLONE"; fi
if [[ -z "$OFFSITE_RSYNC" && -z "$OFFSITE_RCLONE" ]]; then say "  off-site    NOT CONFIGURED: these backups survive a bad deploy but not the loss of this machine (see $CONF)."; fi
say "  prune       this script's own db dumps and secrets archives older than $KEEP_DAYS days"
if [[ $APPLY -eq 0 ]]; then say "Nothing was done. Add --apply."; exit 0; fi

mkdir -p "$BACKUPS" 2>/dev/null || true
LOCK="$BACKUPS/.lock"
mkdir -p "$BACKUPS/db" "$BACKUPS/files/media" "$BACKUPS/files/support-private" "$BACKUPS/secrets"
chmod 700 "$BACKUPS" "$BACKUPS/db" "$BACKUPS/secrets"
if ! mkdir "$LOCK" 2>/dev/null; then
  # A lock older than a day is a crashed run, not a running one.
  if [[ -n "$(find "$LOCK" -maxdepth 0 -mmin +1440 2>/dev/null)" ]]; then rmdir "$LOCK"; mkdir "$LOCK"; else echo "Another backup is running ($LOCK)." >&2; exit 1; fi
fi
trap 'rmdir "$LOCK" 2>/dev/null || true; rm -f "$BACKUPS"/db/*.partial' EXIT

umask 077
for db in $DATABASES; do
  out="$BACKUPS/db/$db-$STAMP.dump"
  # Dump to a partial file and rename: a dump that fails half way never looks like a backup.
  pg pg_dump --format=custom --dbname="$db" >"$out.partial"
  pg_restore --list "$out.partial" >/dev/null
  [[ -s "$out.partial" ]] || { echo "dump of $db is empty" >&2; exit 1; }
  mv "$out.partial" "$out"
  say "  dumped $db ($(wc -c <"$out" | tr -d ' ') bytes)"
done

# Mirror, not archive: an account erased on purpose must not live on in an ever-growing archive of uploads.
for dir in media support-private; do
  if [[ -d "$ROOT/$dir" ]]; then rsync -a --delete "$ROOT/$dir"/ "$BACKUPS/files/$dir"/; else say "  skipped $ROOT/$dir (not there yet)"; fi
done

secrets=()
for f in "$ROOT"/shared/*.env.local "$SECRETS_FILE" /etc/brandbasket/backup.conf; do [[ -f "$f" ]] && secrets+=("$f"); done
if [[ ${#secrets[@]} -gt 0 ]]; then tar -cf "$BACKUPS/secrets/secrets-$STAMP.tar" "${secrets[@]}" 2>/dev/null; chmod 600 "$BACKUPS/secrets/secrets-$STAMP.tar"; fi

( cd "$BACKUPS" && { sha256sum db/*-"$STAMP".dump 2>/dev/null || shasum -a 256 db/*-"$STAMP".dump; } >"SHA256SUMS-$STAMP" )
echo "$STAMP" >"$BACKUPS/LATEST"

if [[ -n "$OFFSITE_RSYNC" ]]; then
  rsync -a --delete-after "$BACKUPS/db" "$BACKUPS/files" "$BACKUPS/LATEST" "$OFFSITE_RSYNC"/
  say "  copied off-site (rsync)"
fi
if [[ -n "$OFFSITE_RCLONE" ]]; then
  rclone copy "$BACKUPS/db" "$OFFSITE_RCLONE/db" && rclone sync "$BACKUPS/files" "$OFFSITE_RCLONE/files" && rclone copyto "$BACKUPS/LATEST" "$OFFSITE_RCLONE/LATEST"
  say "  copied off-site (rclone)"
fi

# Only files this script made, only older than KEEP_DAYS, and the newest dump of each database always stays.
find "$BACKUPS/db" -maxdepth 1 -type f -name '*.dump' -mtime +"$KEEP_DAYS" -print | while read -r old; do
  base="${old##*/}"; name="${base%-*}"
  newer="$(find "$BACKUPS/db" -maxdepth 1 -type f -name "$name-*.dump" -mtime -"$KEEP_DAYS" | head -n 1)"
  if [[ -n "$newer" ]]; then rm -f "$old"; say "  pruned $base"; fi
done
find "$BACKUPS/secrets" -maxdepth 1 -type f -name 'secrets-*.tar' -mtime +"$KEEP_DAYS" -exec rm -f {} \; 2>/dev/null || true
find "$BACKUPS" -maxdepth 1 -type f -name 'SHA256SUMS-*' -mtime +"$KEEP_DAYS" -exec rm -f {} \; 2>/dev/null || true
say "Backup $STAMP done."
