# Merge and release

Owner of this document: the merger agent (or you). Everything lands in `development` first. `main` is production and only moves through a pull request from `development`.

## 1. Branches

- Each work package works on `wp/NN-short-name` cut from the current `origin/development`.
- Open a pull request from the package branch into `development`. CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests and build, and a second job runs the migrations and integration tests on a fresh Postgres.
- Merge a pull request only after: CI is green, the report exists, the reviewer has read the diff, and nothing outside the package's owned paths changed without a note.
- Use squash or merge commits consistently with the repo's history. No force pushes.

## 2. Order inside a wave

1. Packages that add migrations, one at a time (see section 3).
2. Packages that change shared files (`packages/shared`, `packages/db`, `shell/rules.ts`, `guard-rules.ts`).
3. Packages that only touch their own feature folders.
After each merge, every remaining branch in the wave rebases onto `development` before its own merge (`git fetch && git rebase origin/development`), reruns its checks, and pushes with `--force-with-lease` to its own branch only.

## 3. Migrations (the main parallel risk)

Drizzle migration numbers and its journal conflict when two branches generate migrations from the same base.
- A package that needs a migration says so in its spec. Only one such package may be rebased and merged at a time.
- Do not hand-edit migrations that are already on `development`. Never renumber a merged migration.
- Before merging a package with a migration: rebase onto `development`, delete your branch's generated migration, regenerate with `pnpm --filter @brandbasket/db db:generate` so it numbers after the latest, run `pnpm db:migrate:test`, run `pnpm test:integration`, then merge.
- Migrations must be reversible in practice: add columns as nullable or with defaults, never drop or rename a column in the same release that stops using it.
- Payload (CMS) migrations are separate (`pnpm cms:migrate`); do not mix.

## 3b. Environment variables

New settings (for example `SOCIAL_AUTO_WEBHOOK_SECRET`, `REQUIRE_CF_ACCESS`, Cloudflare Access audience and issuer) must be added to the env example files and to `pnpm env:check` so a missing value fails before deploy. Never put real values in the repo.

## 4. Integration checkpoint after each wave

On `development` after the wave merges:

```
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

All must pass before the next wave starts. If something fails, fix on `development` through a small branch, not by reverting unrelated work.

## 5. Final verification before release

1. The merger or reviewer runs the stack locally with fake billing (see `AGENT-RULES.md` section 4) and walks the journey in `docs/product-architecture-audit/19-end-to-end-user-journey.md`, phases 1 to 13, in a browser at 1440, 768 and 375 pixels, with a customer and the staff console side by side. Record results in `docs/implementation/reports/RELEASE-CHECK.md`.
2. Playwright suite from WP-21 passes.
3. A list of every new email and customer or staff message is attached for the owner to approve. Unapproved copy blocks the release, or is replaced by the wording given in the specs.
4. Open items in `14` that still block (lapse policy numbers, referral codes) are either decided or the feature is left behind its flag.

## 6. Release to main

1. Open one pull request `development` into `main` titled with the release date and a one-paragraph summary. Attach the report list and the check record.
2. Wait for CI on the pull request. Do not merge with red checks.
3. **Owner approval is required for the merge and for the deploy.** An agent never merges to `main` or deploys.
4. Merging to `main` starts `.github/workflows/deploy.yml`: it builds on a GitHub runner after CI passes and ships to the Firstfold VPS, which installs, migrates, switches `customer` and `admin` with health checks (`deploy/vps/`, runbook `docs/deployment/brandbasket-vps.md`).
5. **Production timers.** The installer installs these timers but does not enable them: erase, site hosting, first-payment check, monthly reports (and any new job added by WP-10). After the deploy, the owner (not an agent) enables them on the VPS and confirms each shows a recent run. Agents never log in to the server.
6. After the deploy: check the health endpoints, sign in to the console, send one real test sign-up code to the owner's own address, and watch errors for an hour (`/api/error-reports`, the console's App errors page).
7. Afterwards fast-forward `development` to `main` if the repo's convention requires it.

## 7. Rollback

- Code: revert the merge commit on `main` through a new pull request; the deploy workflow redeploys. Migrations are additive, so the previous code runs on the new schema.
- Timers or settings: disable the timer or unset the setting; do not roll back data.
- If a social-auto change was shipped, follow that repo's own rules to revert it and never change its VPS from here.

## 8. After release

Write `docs/implementation/reports/RELEASE.md`: what shipped, what was left behind a flag, remaining open decisions, known gaps, and the follow-up list. Open issues for anything not done.
