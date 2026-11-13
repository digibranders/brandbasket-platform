# Admin console revamp: audited implementation plan

Date: 29 October 2026. Status: **plan only. No code, migration or branch has been changed.** Waiting for approval to start P0.

Spec audited: `BrandBasket_Admin_Console_Revamp_Plan.md` (this folder). Audited tree: `origin/development` at `dee3dae` (read through a `git archive` snapshot, so nothing in any working tree was touched).

---

## 1. Verdict in six lines

1. The P0 defect is real and slightly bigger than the spec says. There are three linked faults (P0-A, P0-B, P0-C below), not one.
2. Every file the spec cites exists on `origin/development`. The spec was written against the right tree.
3. Your local `development` checkout is **13 commits behind `origin/development`** and does not contain the kickoff-first code at all. Do not start from it.
4. The spec is right on the facts, but the tree has stale text that contradicts it (section 5). The biggest: a code comment and an admin sentence say revision feedback means "book a call", but the customer action really opens a ticket.
5. Five capabilities the spec assumes are missing (section 6). I have not invented them.
6. The whole plan can be run as Haiku subagents in 8 waves, with the state machine, migrations and RLS reviewed by the main session before merge (section 9).

---

## 2. Base branch and workspace hazards

| Fact | Evidence | Consequence |
|---|---|---|
| Local `development` is `e844a57`; `origin/development` is `dee3dae`, 13 commits ahead. | `git rev-list --count development..origin/development` = 13 | Local has no `kickoff-build.ts`, `kickoff-complete.ts`, `kickoff-sync.ts` or the Calls wrap-up. The P0 bug cannot even be reproduced there. |
| `origin/main` is `adaf35b`, 21 commits ahead of `origin/development`, all merge commits. | `git log origin/main --not origin/development` | Same content as development. Production already runs the kickoff-first code. |
| The `brandbasket-platform` checkout has uncommitted account-recovery work (`forgot-password`, `reset-password`, `account-recovery*.ts`, edits to `login/page.tsx`, `auth.ts`, `console.css`). | `git status` | Another session's work. Agents must never run in this checkout. |
| `wt/platform-portal-p1` and ~30 other worktrees exist. | `git worktree list` | Agents get fresh worktrees cut from `origin/development`, one branch each. |

**Rule for every agent:** `git worktree add ../wt/<name> -b <branch> origin/development`, work only there, never touch `brandbasket-platform/`.

---

## 3. P0 verification (done, from source)

### 3.1 Chain of cause

1. `markProjectReadyAfterKickoff` (`packages/db/src/queries/kickoff-build.ts`) moves `onboarding` to `submitted`, sets `slaDueAt`, and leaves `onboarding_submitted_at` null on purpose. Both callers use it: `completeKickoff` (`apps/admin/lib/server/kickoff-complete.ts`) and the timer job `startBuildsAfterKickoff` (`apps/platform/lib/server/kickoff-sync.ts`, route `api/internal/start-builds-after-kickoff`).
2. `clientNextStep` (`apps/admin/lib/client-next-step.ts:11`) returns `null` when `onboardingSubmittedAt === null`, before it looks at the status.
3. `overviewNextStep` and the Project page both depend on `clientNextStep`. So for every kickoff-first project:
   - the **Send a preview** section never renders (`project/page.tsx`, `nextStep === "preview"`),
   - the **Go live** section never renders (`nextStep === "live"`),
   - the Overview "next step" line is empty,
   - the Build section prints "Still filling in their setup. Nothing has been sent to us yet." (`project/page.tsx:84`) even at `submitted`, `building`, `revisions`, `preview`, `approved`.
4. The existing unit test **encodes the bug**: `client-next-step.test.ts` line 25 asserts `clientNextStep(project({ onboardingSubmittedAt: null }))` is `null` with status `submitted`.

### 3.2 What is NOT broken (so P0 is UI-only for transitions)

| Transition | Gate in the database | Reads `onboardingSubmittedAt`? |
|---|---|---|
| Send preview, `recordProjectPreviewSent` | `status in (submitted, building, revisions)` | No |
| Customer approve, `approveProjectPreview` | `status = preview` | No |
| Customer changes, `requestProjectRevisions` | `status = preview` | No |
| Mark live, `markProjectLive` | `status = approved` | No |
| Start building, `setProjectBuilding` | `status = submitted` | No |
| Pause, `setProjectOnHold` | `status in (submitted, building, revisions, preview)` | No |

So `sendPreviewAction` and `markLiveAction` already work if called. They are only unreachable from the page.

### 3.3 Two further faults that sit behind the same cause

**P0-B (customer side, found while tracing).** `apps/platform/lib/project-stages.ts` returns `onboardingSubmittedAt === null ? 0 : 1` for `on_hold` and `cancelled`. A kickoff-first build paused at `submitted` or `building` therefore shows the customer stage 0, "Set up your website", on Home (`app-host/(protected)/page.tsx:41`) and To do (`todo/page.tsx:36`). A pause can only start from `submitted/building/revisions/preview`, so an `on_hold` project is never before stage 1.

**P0-C (knock-on once P0-A ships).** `launchProject` (`apps/admin/lib/server/project-launch.ts`) calls `markProjectLive` first and only afterwards looks up the domain and the owner. If there is no domain it throws `ProjectLaunchDomainMissingError` after the project is already `live`: no email, no website address saved, staff sees a "no-domain" notice. The only code that creates a `domains` row is the customer's legacy onboarding domain step (`onboarding-data.ts`, `domain-connect.ts`); no admin action creates one. A kickoff-first customer who never opened that step has no domain row. Today this is hidden only because the Go live button is unreachable for them. **Unblocking P0-A without P0-C turns a hidden gap into a live-without-email production state.** I cannot see production data, so how many such customers exist is unverified.

Same pattern, lower risk: `sendProjectPreview` writes the preview, then throws `ProjectPreviewRecipientMissingError` if there is no owner.

### 3.4 Other readers of `onboardingSubmittedAt` (all classified)

| File | Use | Verdict |
|---|---|---|
| `apps/admin/lib/client-next-step.ts` | gate | **Fix (P0-A)** |
| `apps/admin/app/(protected)/clients/[businessId]/project/page.tsx` lines 84, 90 | label and "Sent to us" fact | **Fix (P0-A)** |
| `apps/admin/components/console/website-section.tsx:42` | "Setup sent" fact via `dateFact` | Safe: hidden when null |
| `apps/platform/lib/project-stages.ts:36` | on_hold stage | **Fix (P0-B)** |
| `apps/platform/lib/first-look.ts:54` | `setupSent`, ends the first look | Safe: `callHeld` also ends it |
| `apps/platform/components/v2/app-shell.tsx:31` | local var `setupSent` | Verify in P0-B task, read-only |
| `apps/platform/lib/website/timeline.ts:94,118` | falls back to call day and `project_events` | Safe: already kickoff-aware |
| `packages/db/src/queries/clients.ts`, `projects.ts` | column projection | Keep: it is still legacy evidence |
| `0192_project_events.sql` | backfill | Historic, leave |

---

## 4. P0 design (smallest complete change)

Rule: **status decides what staff can do. `onboardingSubmittedAt` is only history.**

### P0-A: admin gate and Build panel
Files:
- `apps/admin/lib/client-next-step.ts`: drop `|| project.onboardingSubmittedAt === null` from `clientNextStep`. `onboarding` is already excluded because it is not in `PROJECT_STATUSES_PREVIEWABLE` and is not `approved`.
- `apps/admin/lib/build-summary.ts` (new, pure): `buildPanelState(project)` returns `none | waiting | active`, so the page logic is unit-testable. `waiting` is `status === "onboarding"`. `active` is everything else.
- `apps/admin/app/(protected)/clients/[businessId]/project/page.tsx`: use `buildPanelState`. Show the facts block for `active`. Show "Sent to us" only when the date is non-null. Replace the stale `revisions` sentence (see C2) with a neutral one.
- `apps/admin/lib/client-next-step.test.ts`: replace the line-25 assertion.

Copy to approve (not homepage copy, but new words go to you first): for `onboarding` the panel text. Proposed: "Not started. Waiting for the kickoff call." For a legacy customer still filling the checklist this is slightly less specific than today's line. I cannot tell the two apart from the project row alone.

### P0-B: customer stage for paused builds
Files: `apps/platform/lib/project-stages.ts`, `project-stages.test.ts`. `on_hold` returns `previewSentAt !== null ? 2 : 1` (needs `previewSentAt` added to `ProjectStageInput`; both callers already load the project) and `cancelled` keeps its current rule. Callers: `app-host/(protected)/page.tsx`, `app-host/(protected)/todo/page.tsx` and their tests.
This touches the customer portal, so it needs your yes even though it is small.

### P0-C: launch must not half-commit
Files: `apps/admin/lib/server/project-launch.ts`, `project-launch.test.ts`. The `no-domain` and `no-owner` notices already exist (`packages/shared/src/lib/project-launch-notices.ts`, used by `markLiveAction`).
Change: read owner and domain **before** `markProjectLive`; refuse with the existing notices and commit nothing. Keep the transaction in `markProjectLive` untouched. Same pre-read for `sendProjectPreview` (owner).
Result: the Go live button becomes visible but refuses cleanly for a customer with no domain row. Getting such a customer live needs a way to create the address; that is decision D13 and capability gap G1. It is deliberately **not** invented in P0.

### P0 acceptance
- Unit: kickoff-first (`onboardingSubmittedAt = null`) at `submitted`, `building`, `revisions` gives `preview`; at `approved` gives `live`; `preview`, `onboarding`, `on_hold`, `live`, `cancelled` give `null`; legacy (date set) gives identical results to today.
- Unit: `overviewNextStep` returns "Send the preview" for kickoff-first.
- Unit: launch with no domain or no owner throws before any status write (assert the mocked `markProjectLive` was not called).
- Unit: `projectStageIndex({status: "on_hold", ...})` is 1 or 2 for kickoff-first, never 0.
- Manual on a local seeded customer (admin on 3199, per the Dev Server Policy: reuse a running server if it is this project's): kickoff held, project at `submitted`, Send a preview visible, send, customer Home shows preview, approve, Go live visible.
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (no `packages/db` change, so integration tests are not required for P0).
- Not changed in P0: any status transition, `kickoff-build.ts`, the timer, billing, auth, RLS, migrations. No data backfill.

**P0 needs no migration.**

---

## 5. Where the spec and the tree disagree

| # | Spec says | Tree says | Action |
|---|---|---|---|
| C1 | Feedback "is stored as a support ticket" (section 1.4) | True. `sendPreviewFeedbackAction` (`apps/platform/app/app-host/(protected)/website/actions.ts`) opens a `website_change` ticket then moves to `revisions`. | Spec correct. |
| C2 | (Implicitly) code explains this | `requestProjectRevisions` docstring in `packages/db/src/queries/projects.ts` says "no written detail ... the customer is pointed at booking a call". Admin Project page prints "They asked for changes and were pointed at booking a call". Both are **stale and wrong**. | Fix copy in P0-A; fix docstring in P1. |
| C3 | Route comment says the job runs hourly | `docs/kickoff-builds.md` says a systemd timer every 15 minutes. Comment in `route.ts` is stale. Whether the timer is enabled in production is unverified. | Fix comment in P3; verify on the server before P3. |
| C4 | Calls copy claims "opens the customer's To do page" | It lives in `apps/admin/app/(protected)/clients/[businessId]/kickoff-actions.ts` (`markCallHeldAction`), not in Calls. That action marks held but does not call the shared `completeKickoff`; the timer starts the build within 15 minutes. Two paths exist for one event. | Consolidate in P3. |
| C5 | Today "explicitly falls back to empty arrays" | Confirmed: `guarded()` in `apps/admin/lib/server/today.ts` swallows errors and returns `[]` for six sources. | P4. |
| C6 | `resumeBuilding` restores prior stage | `resumeProject` maps a pause from `submitted` back to `building` on purpose (documented). A held "Ready to start" project resumes as "Building". | Decision D14. |

---

## 6. Missing capabilities (not invented)

| # | Spec assumes | Reality | Needed before |
|---|---|---|---|
| G1 | Staff can supply a domain or address | No admin action creates a `domains` row. | P2 (decision D13) |
| G2 | Feedback ticket linked to project and preview version | `support_tickets` has no project column; the link is only the subject text (`feedbackSubject`). `previewUrl` is one overwritten column, so no version history. | P5 (migration) |
| G3 | Per-command roles (builder, coordinator, finance cannot launch) | `STAFF_CAPABILITIES` has only `money`, `oversight`, `integrations`. Preview, launch, start-build and kickoff completion call plain `requireStaffAccess()`, so any role, including `finance`, can do them. | P1 (decision D8) |
| G4 | Deployment and DNS verification | `markProjectLive` documents it cannot. A `website_hosting` table and the hourly `sync-site-hosting` route exist and may be a base for an automated check, **unverified**. | P2 (decision D7) |
| G5 | Notification outcome and retry | Emails go through the `email_messages` outbox; `sendProjectPreview` returns only `emailed` or `no-email`. I have not read `emails.ts` or `deliveries.ts` schemas. | Wave 0 recon task, then P2 |
| G6 | Kickoff outcome beyond held or not | `setup_call_bookings` has `heldAt`, `heldByStaffId`, `summary`; "Did not happen" deletes the unheld booking. No outcome enum. | P3 (decision D1) |
| G7 | Meeting join link | Only `inviteeUri`. Spec is right: do not show a join link. | n/a |
| G8 | Feature flag for staged rollout | I found no flag mechanism in the files read. Env-based flag via `apps/admin/lib/server/env.ts` is the proposal; unverified. | P1 |

Also unverified and listed for Wave 0: the preview-URL validation in `previewUrlSchema` and SSRF safety of `captureScreenshot` (`apps/admin/lib/server/preview-screenshot.ts`). I did not read either.

---

## 7. Decisions needed

Spec D1 to D12 stand as written. Added by this audit:

| # | Decision | Needed before | My recommendation |
|---|---|---|---|
| D13 | How does a kickoff-first customer get a domain row? (a) staff "set their address" action in the console, (b) send them to the existing customer domain step, (c) allow launch on a temporary address with no row | P2 | (a) |
| D14 | Should resume restore `submitted` exactly? | P1 | Yes, with the board showing "Ready to start" |
| D15 | Do you accept P0-B (customer stage fix) inside P0? | now | Yes |
| D16 | Haiku for all mechanical lanes, with the main session reviewing state machine, migrations and RLS | now | Yes (section 9) |

Decisions that gate phases: D1, D2 before P3. D3, D4, D13 before P2. D5, D6, D10 before P5. D8 before P1 role work. D9, D11 before P6.

---

## 8. Phase plan (actual files, migrations, risks, tests)

Migration numbers continue from `0206_launch_planned_on.sql`. All are additive and nullable, hand-checked for `bb_app` and `bb_staff` grants and RLS like `0192_project_events.sql`. Drizzle is forward-only here, so "reversible" means a written down-script in the PR, not an automatic one. One agent owns the migration lane so numbering and the `meta/` journal never conflict.

### P1: shared lifecycle contract (no visible change)
- New: `packages/shared/src/lib/project-workflow/` (`stages.ts`, `next-action.ts`, `customer-copy.ts`, `index.ts`, tests). Pure functions from `status` plus facts (`assignedStaffId`, `previewSentAt`, kickoff held, services).
- Edit: `packages/shared/src/lib/project-status.ts` (labels), `apps/admin/lib/project-board.ts` (`COLUMN_OF`), `packages/db/src/queries/project-moves.ts` (keep as the single precondition list), docstring fix in `queries/projects.ts` (C2), `packages/shared/src/lib/access.ts` if D8 adds a `delivery` capability.
- Migration: none.
- Risk: forking state logic. Mitigation: admin and platform import the same module; a test asserts every `ProjectStatus` has a staff label and a customer line.
- Tests: exhaustive status table, no `any`, double-submit cases against `PROJECT_MOVE_FROM`.

### P2: Delivery workspace and website actions
- Edit: `clients/[businessId]/project/page.tsx` (rebuilt around a stage header and one action panel), `parts.tsx` (`SendPreviewForm`, `GoLivePanel` reused), `project-controls.tsx`, `website-section.tsx`, `kickoff-call-section.tsx`, `clients/[businessId]/actions.ts` (`sendPreviewAction`, `markLiveAction`), `lib/server/project-preview.ts`, `lib/server/project-launch.ts`, `lib/client-tabs.ts` (label "Delivery", keep slug `project` for deep links).
- New: `apps/admin/components/console/delivery/*` (stage header, action panel, impact preview, launch checklist, notification outcome), `lib/server/project-launch-checks.ts`.
- Migrations: `0207_project_preview_versions` (backfill version 1 from `previewUrl` and `previewSentAt` where valid), `0208_project_launch_checks`, and a notification linkage migration only if the Wave 0 recon of `emails.ts` shows the outbox cannot be correlated already.
- Risks: SSRF in screenshot capture, double launch, committing before notifying. Mitigation: URL policy plus allowlist check, conditional `UPDATE` stays the gate, notification retry never reruns the stage write.
- Tests: preview URL invalid, screenshot failure, no-email, double click, tampered `businessId`, finance role (per D8), integration test for the new tables and RLS.

### P3: Calls outcome and handoff
- Edit: `calls/page.tsx`, `calls/kickoff-wrap-up.tsx`, `calls/kickoff-actions.ts`, `clients/[businessId]/kickoff-actions.ts` (merge into `completeKickoff`), `lib/server/kickoff-complete.ts`, `packages/db/src/queries/setup-calls.ts`, `queries/kickoff-build.ts` (`listKickoffsToStart`), `apps/platform/lib/server/kickoff-sync.ts`, the stale comment in `start-builds-after-kickoff/route.ts`, `lib/calls-view.ts`.
- Migration: `0209_setup_call_outcome` (nullable enum plus actor and time on `setup_call_bookings`). Existing `heldAt` rows keep meaning "completed".
- Risk: highest in the plan. The timer must not regress or double-start. If D1 chooses "staff confirm only", the timer's `ended_at <= now - 2h` clause changes and any call that ended before deploy must still be started once. Mitigation: ship reconciliation first, flag the new rule, run both for one cycle.
- Tests: spec scenarios 4 and 5 (no-show; staff complete while timer runs), integration test on `listKickoffsToStart`, Cal.com webhook cancel and reschedule untouched (`calcom-webhook.ts` tests stay green).

### P4: Projects board, Today, Clients
- Edit: `projects/page.tsx`, `lib/project-board.ts`, `lib/server/today.ts` (`guarded` returns an error marker instead of `[]`), `app/(protected)/page.tsx`, `lib/pipeline.ts`, `components/today/*`, clients list and rows (`lib/client-rows.ts`), client Overview `clients/[businessId]/page.tsx`.
- Migration: none.
- Risk: a failed read shown as "all clear". Mitigation: the error marker is typed and rendered.
- Tests: extend `project-board.test.ts`, `pipeline.test.ts`, `client-rows.test.ts`, `waiting-clients.test.ts`; a test that a failed source never yields an empty-state message.

### P5: Preview conversations
- Edit: `apps/platform/app/app-host/(protected)/website/actions.ts` (pass project id), `apps/platform/lib/website/feedback.ts`, `packages/db/src/queries/support.ts`, `clients/[businessId]/requests/page.tsx`, `support/[ticketId]/page.tsx`, `support/page.tsx`.
- Migration: `0210_support_ticket_project_link` (nullable composite FK `(project_id, business_id)` to `projects`, same cross-tenant guard as `onboarding_progress`).
- Risk: customer RLS on the new column, attachment isolation.
- Tests: feedback does not touch the month's change-request count (scenario 10); integration test for the FK and RLS.

### P6: Services and ongoing clients
- Edit: `clients/[businessId]/services/page.tsx`, `components/console/work-section.tsx`, deliverable and report queries. No new tables.
- Risk: showing invented numbers. Mitigation: only existing `deliverables` statuses and `monthly_reports`.
- Tests: Social-only customer shows no Website project controls (scenario 3).

### P7: Finance and system consistency (presentation only)
- Edit: payments, invoices, pricing, coupons, affiliates, ad-credit, deliveries, errors, staff, settings, access-log pages. Money formulas and `needs: "money"` guards untouched.
- Tests: role tests for support, finance, admin; export and attachment access logging (`logStaffAccessOrThrow`) still asserted.

### P8: QA and rollout
- Full `pnpm lint`, `typecheck`, `test`, `test:integration`, `build`; E2E walk of scenario 1; 390 and 1280 px; feature flag cohort; restore a database snapshot to dry-run migrations 0207 to 0210.

---

## 9. Subagent execution plan (Haiku-first, fastest safe order)

### Rules every brief carries
1. Fresh worktree from `origin/development`; branch named in the table; never `brandbasket-platform/`.
2. The brief lists exact files and the exact change. Haiku makes no design choices; ambiguity comes back as a question.
3. No em or en dashes in any text; `any` is banned; functions get explicit return types.
4. Return: files changed, test names added, command output summary. Do not commit or push; the main session reviews the diff, then commits.
5. Two writers never share a file. Migration lane has one owner.

### Waves

| Wave | Tasks (run in parallel inside a wave) | Model | Gate to next wave |
|---|---|---|---|
| **W0 recon** (read-only, parallel) | R1 baseline: lint, typecheck, test, build counts on a clean worktree. R2 read `emails.ts`, `deliveries.ts`, `support.ts` schemas and `previewUrlSchema`, `preview-screenshot.ts`; report outbox correlation and SSRF facts. R3 server check list: is the kickoff timer enabled (needs your access, so it is a question for you, not an agent). | Haiku | Baseline recorded |
| **W1 = P0** | A: P0-A (4 files). B: P0-B (platform stage plus 3 tests). C: P0-C (launch and preview pre-read plus tests). Disjoint files. | Haiku, then main-session review | Your approval after screenshots |
| **W2 = P1** | S1 shared `project-workflow` module and tests. S2 labels and board mapping. S3 docstring and copy fixes. S4 (only if D8) `access.ts` capability and tests. | Haiku; S1 reviewed by main | Approval |
| **W3 = P2** | M1 migrations 0207 and 0208 (migration lane, **main session or Sonnet**). Then in parallel: U1 stage header plus action panel, U2 launch checklist component, U3 notification outcome component, U4 server actions and `project-preview.ts` or `project-launch.ts`, then U5 page assembly (depends on U1 to U4). | Haiku except M1 | Approval and staging walk |
| **W4 = P3** | M2 migration 0209 (main). K1 `completeKickoff` consolidation. K2 Calls page UI. K3 timer and `listKickoffsToStart` change (main reviews). | Haiku; K3 reviewed | Approval after dry run |
| **W5 = P4** | B1 board, B2 Today, B3 Clients directory, B4 Overview. Four disjoint file sets. | Haiku | Approval |
| **W6 = P5 and P6 in parallel** | M3 migration 0210 (main). F1 platform feedback link, F2 requests UI, V1 services page. | Haiku | Approval |
| **W7 = P7** | One agent per page group (money pages, system pages, compliance pages), each a pure presentation change. | Haiku | Approval |
| **W8 = P8** | E2E, accessibility, snapshot dry run. | Sonnet or main | Release |

Critical path: W0 to W1 to W2 to W3 to W4. W5, W6 and W7 only need W2 (the shared contract), so after W2 they can run beside W3 and W4 if you want speed, at the cost of more merges. Recommended: P0 first, then W2, then W3 and W5 together.

### Honest limits of Haiku here
Haiku suits the UI components, tests, copy and mapping tables. I do not recommend it as the only author of: migrations and RLS grants, the kickoff timer change, `markProjectLive` and `resumeProject` edits, or anything touching billing. Those stay with the main session (or Sonnet) with the diff read line by line before merge. Your memory note says subagents normally use Sonnet; this plan follows your instruction to use Haiku for the mechanical lanes.

---

## 10. Test map against spec section 10

| Scenario (spec) | Covered in |
|---|---|
| 1 website-only walk with `onboardingSubmittedAt = null` | P0 unit and manual, P8 E2E |
| 2 bundle, 3 social-only | P4, P6 |
| 4 and 5 no-show, concurrent complete | P3 |
| 6 submitted but not started | P1 copy, P4 board |
| 7 builder change | P2 |
| 8 and 9 bad URL, email failure | P2 |
| 10 feedback not consuming monthly edits | P5 |
| 11 and 12 approve, premature live | P2 (existing DB gate plus checklist) |
| 13 pause and resume | P1 (D14) |
| 14 concurrent actions | P2, existing conditional `UPDATE`; add test |
| 18 and 19 roles, tampered `projectId` | P1, P2 |
| 20 access log | P2, P7 |
| 21 alert query fails | P4 |
| 23 no email | P0-C, P2 |
| 24 outbox retries | P2 |

---

## 11. Not done in this audit

- No test, lint, typecheck or build was run; no baseline exists yet (W0 R1).
- No signed-in admin walkthrough, no production database read, no check that the 15-minute timer is enabled.
- Not read: `emails.ts`, `deliveries.ts`, `support.ts` schemas, `previewUrlSchema`, `preview-screenshot.ts`, clients list page, services page internals.
- How many kickoff-first customers have no `domains` row is unknown.
