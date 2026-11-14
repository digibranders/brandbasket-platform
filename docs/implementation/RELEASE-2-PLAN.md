# Release 2 plan (full): premium redesign of the customer app and staff console

Read with: `RELEASE-2-SPEC.md` (screen specs, brand decision), `docs/design/redesign/05-PREMIUM-DESIGN-LANGUAGE.md` (tokens and component finish, binding), `docs/product-architecture-audit/19-end-to-end-user-journey.md` (journey), `AGENT-RULES.md`, `MERGE-AND-RELEASE.md`. Where this plan and `RELEASE-2-SPEC.md` differ, this plan wins. Release 1 is in `main` (PR #183 merged 2026-11-14). `development` already contains Steve's Social changes (merged 2026-11-14), so Social screens must be re-read before editing.

## 1. Goal and non-goals

Goal: every screen in the journey looks and feels premium, is consistent, and is clear on one main action, in both apps, on the website brand.
Non-goals: no change to prices, offers, billing logic, access rules, data model or the social-auto integration. No Paid Ads workflow. No new features. Behaviour stays; structure, wording and look change.

## 2. Decisions fixed for this release

- Customer app moves to the website brand (near-black primary, rattan gold accent, Red Hat fonts, warm paper). Owner approval of this is a gate for R2-00 (recorded as D32 in `14`).
- Premium design language file is binding. The ChatGPT images are inspiration only.
- Console already uses the warm palette; it adopts the shared component finish.
- One staff account. No role-based UI variants.
- Light theme only.

## 3. Design gate before code (reviewed mocks)

Each area needs an approved HTML mock before its build package starts. Approved so far: none (Home mock v3 is under review). Mock owners: the design agents in wave A. A mock is one static HTML file in `docs/design/redesign/` built to the premium language, with states (new, live, empty, error) toggled in page, at 1440 and 390 wide. The owner approves each in chat. Agents must not start a build package whose mock is unapproved.

## 4. Waves

| Wave | Packages | Parallel | Gate |
|---|---|---|---|
| A: foundation | R2-00 brand tokens, fonts, DESIGN docs; R2-01 shared patterns; D-A1..D-A4 design agents produce mocks | R2-00 and R2-01 sequential; mocks parallel with them | tokens merged, `/design-system` shows patterns, Home mock approved |
| B: customer core | R2-02 Home and Needs your OK; R2-03 Website; R2-04 Social; R2-05 Billing, checkout, sign up | parallel | each against its approved mock, green |
| C: customer rest and console | R2-06 Requests, Reports, Business, Enquiries, Help; R2-07 Settings family and account pages; R2-08 Console shell, Today, workspace | parallel | green |
| D: console rest and states | R2-09 Money, Compliance, System; R2-10 loading, empty, error, forms keep input | parallel | green |
| E: verify | R2-11 Playwright journeys, axe sweep, keyboard pass; release candidate | single | all journeys pass, then release PR |

Design agents (wave A, read only code, write mocks only): D-A1 Home and Needs your OK; D-A2 Website and Social; D-A3 Billing, checkout, sign up, Requests, Reports, Settings; D-A4 Console (Today, kickoff popup, workspace, Payments, Compliance). Each delivers `mock-<area>.html` files plus `docs/design/redesign/notes-<area>.md` (decisions, states covered, open questions).

## 5. Work packages (build)

Common to all: worktree `../bb-r2-NN`, branch `r2/NN-name` from current `origin/development`, own database and ports (`AGENT-RULES.md` section 4), tests first for logic, existing components first, tokens only, no new libraries, report `docs/implementation/reports/R2-NN.md`, PR into `development`, never merge to `main`.

| WP | Scope and files | Acceptance |
|---|---|---|
| R2-00 | Swap tokens in `apps/customer/src/styles/tokens.css` and Tailwind aliases to the website brand; load Red Hat via `next/font`; add elevation, radius, spacing, type and motion tokens from the language file; update `apps/customer/DESIGN.md` and plan 60 doc; update `tokens.contrast.test.ts` | App renders in the new brand with no layout change; contrast test passes; no raw colours added; `pnpm lint typecheck test build` green |
| R2-01 | `packages/shared/src/ui/patterns/`: NextActionCard (focal), ServiceCard, StatusTimeline, Stepper, NeedsYourOkList, ApprovalCard, ConfirmDialog, PromptPopup, EmptyState, ErrorState, Skeleton, StatusChip, StatTile, SettingsTabs, PageHeader, PreviewFrame, ThumbStrip | Each has unit tests (render, props, keyboard, reduced motion) and an entry in `/design-system` for both apps; follows the language file exactly |
| R2-02 | Home per approved mock; Needs your OK section and bell dropdown | All journey states (new, live, lapsed, unpaid, viewer, per service combination); matches mock; existing tests pass |
| R2-03 | `/website` and sub-pages per mock: kickoff states with D31 wording, preview, live, tabs from day one | Wording exact; approvals unchanged in behaviour |
| R2-04 | Social per mock; rename `legacy-social` to `social-auto` only after confirming with Steve; connect, write, approve, calendar, failure banner | No behaviour change; Steve's latest changes preserved; states for not connected, writing, review, scheduled, failed |
| R2-05 | Plan and billing, checkout, sign up, intake, payment states | Offers and prices unchanged; failed and lapsed states; unpaid access fixes from Release 1 intact |
| R2-06 | Requests, request page and quote, Reports, Business, Enquiries, Help | Patterns reused; empty states |
| R2-07 | Settings family (tabs), sign in, forgot and reset, invite states, setup link, restore | Invite states shown before Join (Release 1 behaviour kept) |
| R2-08 | Console shell and rail (Today, Clients, Inbox, Calls, Money, Compliance, System), Today list, client workspace tabs, restyled kickoff popup | One list late first; workspace mirrors customer status; retired routes handled as in `03` |
| R2-09 | Console Money (payments, refund dialog), Compliance, System | Refund and destructive dialogs use ConfirmDialog; behaviour unchanged |
| R2-10 | Route `loading.tsx`, skeletons, error and permission states, forms keep input across both apps | Rejected action keeps input; every list has an empty state |
| R2-11 | Playwright journeys (customer and console) at 1440, 768, 390; axe sweep; keyboard pass; screenshot set | Journey scenarios in `13` pass; zero serious axe issues on real screens |

## 6. Quality bar (all packages)

Matches the approved mock and `05-PREMIUM-DESIGN-LANGUAGE.md` section 10. One focal element per screen, gold used 3 times or fewer, type from the scale, 4px spacing base, warm shadows, all states, 390 wide works, keyboard and reduced motion respected, AA contrast. No em or en dashes in any text. New copy listed in the report for owner approval; use journey wording where it exists.

## 7. Cost and limits

Antigravity has the capacity; Claude usage is scarce. Claude's role in Release 2: approve nothing automatically, review diffs for R2-00, R2-01 and any billing-touching package after the weekly reset, and do the final browser walkthrough. Everything else runs in Antigravity.

## 8. Risks

- Re-theme touches everything: R2-00 lands alone first and is checked visually.
- Merge conflicts in shared files and in Social (Steve): rebase often; agree Social ownership.
- Visual drift between agents: the language file and shared patterns are the single source; mocks are reviewed before build.
- Generated images contain wrong wording: never copy their text.
- Behaviour regressions: existing tests must pass untouched; integration tests run for any package touching data code.

## 9. Owner actions

1. Approve the brand change (D32), then each mock as it arrives.
2. Tell Steve which Social areas are frozen during R2-04.
3. Approve new copy from the reports.
4. Approve the release PR and deploy. Enable any new timers on the server yourself.
