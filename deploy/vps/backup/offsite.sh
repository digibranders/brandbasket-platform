#!/usr/bin/env bash
# Ships one Brandbasket backup directory to Cloudflare R2, encrypted on this server with age before it leaves. Installed as
# /etc/brandbasket/offsite.sh (root, 0700) and called by brandbasket-backup with the backup's path. Adapted from Firstfold's
# /etc/firstfold/offsite.sh and sharing its settings:
#   - the bucket, token and rclone setup: /etc/firstfold/r2.env through /usr/local/lib/firstfold/r2-lib.sh
#     (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET = firstfold-backups);
#   - the age PUBLIC key /etc/firstfold/backup-age.pub. The private key is kept off the box, so neither this server nor
#     anyone holding the R2 credentials can read a backup. The same key opens Brandbasket's and Firstfold's backups.
#
# Bucket rules this must keep working with (CLOUDFLARE.md in Firstfold's vps-setup): objects under daily/ expire after 35
# days and are locked for 30; under weekly/ they expire after 90. Retention is the bucket's job, not this script's. So every
# object is written under daily/ or weekly/, with a name no Firstfold object has:
#
#   daily/brandbasket-<UTC stamp>.tar.age           (+ .sha256)     Firstfold's are daily/firstfold-<stamp>.tar.age
#   weekly/brandbasket-<UTC stamp>.tar.age          (+ .sha256)     a copy of Sunday's
#
# The only R2 operations are copyto of those exact names and lsf of one of them. Nothing is synced, moved, deleted or
# listed under a wider prefix, and assert_ours refuses any other name before anything is written, so this script cannot
# overwrite or prune a Firstfold object (or the reverse: Firstfold's scripts never write a brandbasket- name).
set -euo pipefail
umask 077

readonly SRC="${1:?usage: offsite.sh <backup dir>}"
readonly PUB=/etc/firstfold/backup-age.pub

[[ -d "$SRC" ]] || { echo "no such backup: $SRC" >&2; exit 1; }
[[ -s "$PUB" ]] || { echo "missing $PUB" >&2; exit 1; }
# shellcheck source=/dev/null
. /usr/local/lib/firstfold/r2-lib.sh
r2_env

name="$(basename "$SRC")"
[[ "$name" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || { echo "not a backup stamp: $name" >&2; exit 1; }

assert_ours() { # <object name>
  [[ "$1" =~ ^(daily|weekly)/brandbasket-[0-9]{8}T[0-9]{6}Z\.tar\.age(\.sha256)?$ ]] || { echo "refusing to write $1: not a Brandbasket object name" >&2; exit 1; }
}

object="daily/brandbasket-$name.tar.age"
assert_ours "$object"
tmp="$(mktemp)"
trap 'rm -f "${tmp:?}" "${tmp:?}.sha256"' EXIT

tar -C "$(dirname "$SRC")" -cf - "$name" | age -R "$PUB" > "$tmp"
local_size="$(stat -c %s "$tmp")"
local_sum="$(sha256sum "$tmp" | cut -d' ' -f1)"

rclone copyto --retries 5 --low-level-retries 10 "$tmp" "r2:$R2_BUCKET/$object"
# Checksum as a file and copyto, like the backup itself: rclone rcat makes a follow-up call R2 answers with 501.
assert_ours "$object.sha256"
printf '%s  %s\n' "$local_sum" "$(basename "$object")" > "$tmp.sha256"
rclone copyto --retries 5 "$tmp.sha256" "r2:$R2_BUCKET/$object.sha256"

# Read the size back from R2 rather than trusting the upload's exit status alone.
remote_size="$(rclone lsf --format s "r2:$R2_BUCKET/$object")"
[[ "$remote_size" == "$local_size" ]] || { echo "R2 size $remote_size != local $local_size for $object" >&2; exit 1; }

# Sunday's backup is also kept as a weekly (server-side copy, no second upload).
if [[ "$(date -u +%u)" == 7 ]]; then
  weekly="weekly/brandbasket-$name.tar.age"
  assert_ours "$weekly"; assert_ours "$weekly.sha256"
  rclone copyto "r2:$R2_BUCKET/$object" "r2:$R2_BUCKET/$weekly"
  rclone copyto "r2:$R2_BUCKET/$object.sha256" "r2:$R2_BUCKET/$weekly.sha256"
fi
echo "off-site ok: r2:$R2_BUCKET/$object ($local_size bytes, encrypted)"
