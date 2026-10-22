# shellcheck shell=bash
# Loads Firstfold's GitHub reporting functions for the brandbasket user. Sourced by brandbasket-platform-autodeploy and
# brandbasket-ci. Installed as /usr/local/lib/brandbasket/github-lib.sh (root-owned).
#
# /usr/local/lib/firstfold/github-status.sh reads the GitHub App's id and key from /home/deploy/, as three `readonly` paths.
# Brandbasket runs as its own user and must not read deploy's home, so install.sh copies the App id and key into
# /home/brandbasket (mode 600). This function reads the same script, points those paths at /home/brandbasket, and sources the
# result. Firstfold's file is read, never edited; if it ever stops having exactly the paths below, this refuses to load it
# rather than guess, and the deploy stops with that message.
#
# The personal-token fallback in that script (/home/deploy/.github-deploy-status-token) becomes /home/brandbasket/..., a
# file that does not exist: Brandbasket never uses deploy's token. Without the App it reports nothing and deploys carry on.

BB_FF_GITHUB_STATUS=/usr/local/lib/firstfold/github-status.sh

bb_load_github_status() {
  local code
  [[ -r "$BB_FF_GITHUB_STATUS" ]] || { echo "error: cannot read $BB_FF_GITHUB_STATUS" >&2; return 1; }
  code="$(sed 's#/home/deploy/#/home/brandbasket/#g' "$BB_FF_GITHUB_STATUS")"
  if ! grep -q '^readonly GH_APP_ID_FILE=/home/brandbasket/\.github-app-id$' <<<"$code" \
    || ! grep -q '^readonly GH_APP_KEY_FILE=/home/brandbasket/\.github-app-key\.pem$' <<<"$code" \
    || grep -q '/home/deploy' <<<"$code"; then
    echo "error: $BB_FF_GITHUB_STATUS no longer has the paths github-lib.sh expects; update deploy/vps/github-lib.sh" >&2
    return 1
  fi
  # shellcheck source=/dev/null
  source <(printf '%s\n' "$code")
}
