#!/usr/bin/env bash
# The CI checks for one commit, run inside the sandbox brandbasket-ci-sandbox starts (user bbci, no secrets, no local
# network). Installed as /usr/local/lib/brandbasket/ci-steps.sh (root-owned).
#
#   ci-steps.sh      from the root of the unpacked commit
#
# Prints "== step: <name>" as each step starts; brandbasket-ci turns each step into its own check run on GitHub. The same
# commands as the deploy (brandbasket-platform-release), so a commit that passes here passes the deploy's checks too.
# Not run here: the database integration tests (`pnpm test:integration`, which need Postgres); run them locally for changes
# under packages/db, packages/auth, packages/billing or packages/shared.
set -euo pipefail

# Placeholders that satisfy the env schemas, as the deploy build uses. Nothing here is a secret.
set -a
# shellcheck source=/dev/null
source /etc/brandbasket-platform-build.env
set +a

echo "== step: install"; pnpm install --frozen-lockfile
echo "== step: lint"; pnpm lint
echo "== step: typecheck"; pnpm typecheck
echo "== step: test"; pnpm -r test
echo "== step: build"; pnpm build
# Read by brandbasket-ci: a run is a pass only with this line. A run stopped from outside (timeout, systemctl stop) can end
# with status 0, because systemd counts its own SIGTERM as a clean exit.
echo "== result: passed"
