#!/usr/bin/env bash
# Lists code nothing uses: files, exports and exported types. It reads the repository and changes nothing.
#   bash scripts/dead-code.sh            # writes docs/operations/dead-code/all.txt and production.txt
#   bash scripts/dead-code.sh --stdout   # prints both instead
# "all" counts a test as a use. "production" does not, so a file only its own test imports shows up there.
# A list is a place to look, not an order to delete: a route, a dynamic import or a string path hides a use from it.
set -euo pipefail
cd "$(dirname "$0")/.."

KNIP="pnpm dlx knip@5.88.1"
OUT="docs/operations/dead-code"

run() {
  # knip exits 1 when it finds something; that is the normal case here.
  $KNIP -c "$1" --reporter compact --no-progress 2>/dev/null || true
}

if [ "${1:-}" = "--stdout" ]; then
  echo "== all (tests count as a use) =="; run knip.json
  echo "== production (tests do not) =="; run knip.production.json
  exit 0
fi

mkdir -p "$OUT"
run knip.json > "$OUT/all.txt"
run knip.production.json > "$OUT/production.txt"
echo "Wrote $OUT/all.txt ($(grep -c . "$OUT/all.txt") lines) and $OUT/production.txt ($(grep -c . "$OUT/production.txt") lines)"
