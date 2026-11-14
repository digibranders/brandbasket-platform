# Implementation handoff pack for Antigravity

Purpose: let several Antigravity (Gemini) agents implement the whole audit and redesign in parallel today, merge everything into `development`, and release to `main`. The reasoning behind every item is in `docs/product-architecture-audit/` (start with `19-end-to-end-user-journey.md`, `14-open-questions-and-product-decisions.md`, `12-prioritized-remediation-roadmap.md`, `20-ui-ux-redesign-plan.md`). This folder holds the instructions.

Files in this pack:
- `AGENT-RULES.md`: rules every agent must read first.
- `WORK-PACKAGES.md`: the work packages (WP), their spec, owned files, acceptance and order.
- `MERGE-AND-RELEASE.md`: how to merge, test and release.

## How to run it

1. **One agent, one work package, one branch, one worktree.** For package `WP-NN` create `git worktree add ../bb-wpNN -b wp/NN-short-name origin/development`. Never let two agents share a checkout.
2. **Waves.** Run all packages in a wave in parallel. Start the next wave only after the previous wave is merged into `development` and `development` is green (lint, typecheck, test, build). Wave 0 first, then 1 to 5 in order (see `WORK-PACKAGES.md`).
3. **Give each agent only its package.** Paste the agent rules, the package section, and the paths to the audit docs it must read. Do not paste the whole audit.
4. **Local database per agent.** Each worktree needs its own Postgres database and its own ports so agents do not collide. Create `brandbasket_platform_wpNN` and `brandbasket_platform_wpNN_test`, run `pnpm db:roles` once (roles are shared and idempotent), then export a complete environment in the agent's shell only (see `AGENT-RULES.md` section 4). Ports: customer `3300 + 2*NN`, admin `3301 + 2*NN` (for example WP-12 uses 3324 and 3325). Ports 3000 to 3099 and 3197 to 3199 belong to other work.
5. **Reports.** When a package is done, the agent writes `docs/implementation/reports/WP-NN.md`: what changed, files, tests added, commands run with results, open questions, copy needing owner approval. A package is not done without it.
6. **Review gate.** After each wave, one reviewer (a separate agent, or the owner, or Claude after the usage reset on Sunday) reads each report and diff before merge. Do not merge on the author's word alone.
7. **Roles to start.** Suggested Antigravity setup: one "merger" agent that owns `development` and runs `MERGE-AND-RELEASE.md`; one agent per package; one "reviewer" agent per wave. If Antigravity limits parallel agents, run the packages of a wave in the order listed.

## Ground rules in one line each

- Work on a branch from `development`. Never push to `main`. Never force push. Never deploy.
- No application change without tests, and no package finishes red.
- Light theme only, existing design tokens and components only, no em or en dashes in anything a person reads.
- New customer or staff copy goes into the package report for owner approval; use the wording given in the spec where it exists.
- Schema changes follow the migration rule in `MERGE-AND-RELEASE.md`.
- Never print or commit secrets. Never edit any `.env*` file.
- Never send real email or real payments from a dev environment: leave `BREVO_API_KEY` and Razorpay keys blank and use the fake billing provider.

## Owner actions that no agent can do

1. Run the production timer and Cloudflare Access checks and commands on the VPS (agents never log in to servers).
2. Approve new copy listed in the reports.
3. Decide the open items in `14` (lapse policy numbers, referral codes, monitoring rule, Social engine details).
4. Approve the final `development` to `main` pull request and the deploy.
5. Update the written pricing rules in the workspace `CLAUDE.md` so they match the live offers (the file is outside this repo).
