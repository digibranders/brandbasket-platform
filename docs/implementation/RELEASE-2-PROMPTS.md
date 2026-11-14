# Release 2 prompts for Antigravity

Commit and push `docs/` first so worktrees see these files. Run PROMPT 1 (starter, design wave A). After the mocks are approved by the owner, run PROMPT 2 (orchestrator for the build waves). PROMPT 3 is the per-agent template.

## PROMPT 1: starter (wave A: foundation and design mocks)

```
You are the orchestrator for Release 2 of the BrandBasket platform: a premium redesign of the customer app and staff console. Release 1 is already in main. Speed matters, quality matters more.

Pull origin/development (it includes Steve's latest Social changes). Read, in order, and follow exactly:
1. docs/implementation/RELEASE-2-PLAN.md  (this plan wins over the spec where they differ)
2. docs/design/redesign/05-PREMIUM-DESIGN-LANGUAGE.md  (binding design language and tokens)
3. docs/implementation/RELEASE-2-SPEC.md  (screen specs)
4. docs/implementation/AGENT-RULES.md and docs/implementation/MERGE-AND-RELEASE.md
Background when needed: docs/product-architecture-audit/19-end-to-end-user-journey.md and 14-open-questions-and-product-decisions.md.
Visual references (inspiration only, never copy spacing, wording or flatness): docs/design/redesign/mock-home.html and the Batch 1 images the owner shares.

Run WAVE A now, in parallel, one agent each, each in its own worktree and branch from origin/development:
- R2-00: brand tokens, Red Hat fonts, elevation, radius, spacing, type and motion tokens, DESIGN docs, contrast test. Worktree ../bb-r2-00, branch r2/00-brand-tokens.
- R2-01: shared pattern components in packages/shared/src/ui/patterns with tests and /design-system entries. Start from the interfaces in the plan; if R2-00 tokens are not merged yet, code against the token names in the language file. Worktree ../bb-r2-01, branch r2/01-patterns.
- D-A1, D-A2, D-A3, D-A4 (design agents, READ ONLY on code, write only under docs/design/redesign/): each builds static, responsive HTML mocks to the premium language for its area, with in-page toggles for states (new, live, empty, error), at 1440 and 390 wide, using only the brand tokens and inline SVG icon placeholders. D-A1: Home and Needs your OK. D-A2: Website and Social (re-read the current Social code first, Steve changed it). D-A3: Plan and billing, checkout, sign up and intake, Requests, Reports, Settings family. D-A4: console Today, kickoff popup, client workspace, Payments, Compliance. Each also writes docs/design/redesign/notes-<area>.md (decisions, states covered, open questions).

Rules for everyone: tokens only, existing components first, no new libraries, no behaviour change, no em or en dashes in any text, no stock art, no gradients, warm shadows only, one focal element per screen, gold accent used 3 times or fewer per viewport. Put every new piece of customer or staff wording in the report for owner approval.

Build agents (R2-00, R2-01) run: pnpm lint, typecheck, test, build, write docs/implementation/reports/R2-NN.md, push the branch, open a pull request into development. Do not merge to main, never deploy, never edit .env files, never print secrets, no real email or payments.

Merge R2-00 first when green and reviewed, then R2-01 (rebase on development). Design mocks are committed to a branch r2/design-mocks and opened as one PR.
When wave A is done, STOP and report to me with the list of mocks and PRs. Do not start wave B until I approve the mocks.
```

## PROMPT 2: orchestrator for waves B to E (run after the owner approves the mocks)

```
You are the orchestrator for Release 2 build waves B to E of the BrandBasket platform. Wave A (tokens, shared patterns, approved mocks) is merged in development.

Pull origin/development. Re-read docs/implementation/RELEASE-2-PLAN.md, docs/design/redesign/05-PREMIUM-DESIGN-LANGUAGE.md, docs/implementation/AGENT-RULES.md, docs/implementation/MERGE-AND-RELEASE.md, and the approved mocks in docs/design/redesign/ with their notes files.

Run waves in order. Inside a wave run all packages in parallel, one agent each, each in ../bb-r2-NN on branch r2/NN-name from origin/development, with its own database and ports (AGENT-RULES.md section 4):
- Wave B: R2-02 Home and Needs your OK; R2-03 Website; R2-04 Social (POLISH ONLY: keep Steve's layouts and flows exactly, re-read current Social code first, merge latest origin/steve and origin/development before starting and before merging, do not rename legacy-social, no restructuring); R2-05 Plan and billing, checkout, sign up and intake.
- Wave C: R2-06 Requests, Reports, Business, Enquiries, Help; R2-07 Settings family and account pages; R2-08 console shell, Today, client workspace, kickoff popup restyle.
- Wave D: R2-09 console Money, Compliance, System; R2-10 loading, empty, error, permission states and forms that keep input.
- Wave E: R2-11 Playwright journeys at 1440, 768 and 390, axe sweep, keyboard pass, screenshots.

Each agent builds exactly its approved mock using the shared patterns and tokens, adds states (loading, empty, error, permission, success), writes tests for new logic and components, keeps existing tests passing untouched, runs pnpm lint, typecheck, test, build (and test:integration if data code is touched), writes docs/implementation/reports/R2-NN.md with screenshots at 1440 and 390, and opens a PR into development.

You merge a PR only when CI is green, its report exists and a reviewer agent has read the diff against the mock and the language file. After each wave merges, run on development: pnpm lint, typecheck, test, test:integration, build. All green before the next wave. When wave E passes, open ONE pull request development into main with a summary, the report list and the new wording for owner approval. Then stop and tell me.

Hard rules: never push or merge to main, never deploy, no force push except --force-with-lease on your own package branch, never edit .env files, never print secrets, no real email or payments, no behaviour change in billing, access or data, no em or en dashes in any text, tokens only, no new libraries.
```

## PROMPT 3: per-agent template (build package)

```
You are the agent for package <R2-NN> of the BrandBasket Release 2 redesign. Work only in ../bb-r2-<NN> on branch r2/<NN>-<name>, cut from origin/development.
Read: docs/implementation/AGENT-RULES.md, then <R2-NN> in docs/implementation/RELEASE-2-PLAN.md, docs/design/redesign/05-PREMIUM-DESIGN-LANGUAGE.md, your approved mock <file> and its notes. Re-read the current code of your screens first.
Build exactly the approved mock with the shared patterns and tokens. Add all states. Tests first for logic. No behaviour change. Run pnpm lint, typecheck, test, build (and test:integration if you touch data code). Write docs/implementation/reports/R2-<NN>.md with what changed, files, tests, commands and results, screenshots at 1440 and 390, open questions and new wording for approval. Push and open a PR into development. Do not merge. If unsure about pricing, access, deletion or wording, stop and write the question in the report.
```
