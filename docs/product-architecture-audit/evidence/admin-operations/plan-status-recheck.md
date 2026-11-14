# Plan status recheck: `docs/redesign-29-oct-2026/admin-console-plan-status.md`

Re-verified against source at c702f6c7 (development). Labels: Verified in code | Reported in historical document | Inferred | Unknown. Paths relative to `brandbasket-platform/`. The status document is dated 29 October 2026 and names branch `plan-all`; the audited tree is a later `development`. The implementation plan itself (`admin-console-implementation-plan.md`) refers to `apps/platform`, which no longer exists (commit 90d76d5f removed it); the customer app is `apps/customer`.

## A. "Still not built" list

| # | Item in the status document | Verdict | Evidence |
|---|---|---|---|
| 1 | Replacing the kickoff timer for good (switch exists, default on) | Still open, owner decision | `KICKOFF_AUTO_START` default "on" when unset (`apps/customer/src/platform/lib/server/env.ts:128-134`); fallback 24h (`packages/db/src/queries/kickoff-build.ts:14`); timer enabled by install only when the release dir exists (`deploy/vps/install.sh:447`). Whether production has it set is Unknown |
| 2 | Automatic deployment verification | Still open | `site-check.ts` checks DNS, a private-address block list and an HTTPS fetch only (`apps/admin/lib/server/site-check.ts:1-30`); the eight manual launch checks still gate Mark live (`packages/db/src/queries/project-launch-checks.ts:6-15`) |
| 3 | Monthly Social and SEO commitments not data-backed | Still open | catalogue states none: `social-media` line says "up to 4 platforms" but lists 3 platforms (`packages/shared/src/lib/billing/add-ons.ts:58-66`); the customer's "12 of 14 posts out" is derived from planned posts (`apps/customer/src/features/social/rules.ts:139`); no code enforces a count. Local SEO + AEO is no longer sold and its branches are unreachable (`service-setup.ts:29-31`) |
| 4a | Payment lapse policy | Still open | `billingNeedsAttention` is "Display only; it never moves a stage" (`apps/admin/lib/billing-attention.ts:5-14`); hosting pause timer installed but not enabled (`deploy/vps/install.sh:450`); no lapse list in Today or rail |
| 4b | What counts as an extra revision round | Partly: a counter, notice and manual grant exist; the rule is not defined | `isPastIncludedRounds` notice (`website/page.tsx:105,138-142`), `grantRoundAction` any staff (`website/actions.ts:73-79`), default rounds editable by admin (`settings/actions.ts:82`) |
| 4c | Who may edit customer notes and deadlines | Still open: any staff | `planLaunchAction` and `grantRoundAction` use `requireStaffAccess` only (`website/actions.ts:73-91`) |
| 5 | Finance and system page restyle | Unknown | visual only; not assessed in this read-only audit |
| 6 | List pages that read customer data without writing an access log | Fixed (list pages now log) | Today `today.view` (`page.tsx:25`), clients (`clients/page.tsx:66`), leads (`leads/page.tsx:19`), calls (`calls/page.tsx:56`), projects (`projects/page.tsx:61`), support (`support/page.tsx:35`), outbox (`outbox/page.tsx:8`), affiliates (`affiliates/page.tsx:51`), coupons (`coupons/page.tsx:37`), ad credit (`ad-credit/page.tsx:21`); commit `ed40ec29` "Log staff access to customer list pages". Still unlogged: `/support/errors*`, `/ad-results`, `/pricing`, `/settings`, `/leads/new`. Also 16 written actions are missing from `STAFF_ACCESS_ACTIONS` so the Compliance filter cannot select them |
| 7 | Access log for finance | Still open | `console-rail.ts:93-95` (`needs: "oversight"` on Staff and Compliance); `access.ts:64` |
| 8 | Ad credit has no role gate | Still open, and now also dormant | `ad-credit/page.tsx:20` uses `requireStaffAccess`; `console-rail.ts:85` has no `needs`; `PACKAGE_OFFERS = []` (`packages/shared/src/lib/billing/packages.ts:32`) |
| 9 | Browser E2E automation and a console feature flag | Still open | no `e2e` script in `apps/admin/package.json`; the customer app has Playwright (`apps/customer/package.json:13`, `apps/customer/e2e/*`); no console flag found |
| 10 | Production data rehearsal | Unknown | no production access; not in scope |
| 11 | Customer review history per preview version | Still open | preview versions carry `version`, `previewUrl`, `sentAt`, `sentByStaffId` only (`packages/db/src/queries/project-preview-versions.ts:53-61`); feedback is listed per round (`website/page.tsx:81-82`), with no version link |

## B. "Things a reviewer should know"

| Statement | Verdict | Evidence |
|---|---|---|
| `setup_call_outcomes` notes never written by the UI | Still true | `recordKickoffOutcome(..., note: null)` (`calls/kickoff-actions.ts:57`, `kickoff-complete.ts:41-49`) |
| Free address needs `CLIENT_SITE_BASE_DOMAIN` for the admin app | Still true | `website/page.tsx:99,217,231` |
| Eight-column board scrolls sideways, not a phone layout | Still true | `projects/page.tsx:104` |
| Shared dev and test DB broken at migration 0194 | Unknown | not inspected |

## C. "Built" claims spot-checked

| Claim | Verdict | Evidence |
|---|---|---|
| Status decides next steps, not `onboardingSubmittedAt` | Fixed | `client-next-step.ts:14-18` |
| Launch reads owner and domain before writing | Fixed | `markLiveAction` maps `no-owner` and `no-domain` before commit (`actions.ts:244-264`) |
| Eight manual launch checks gate Mark live | Built | `project-launch-checks.ts:6-15`; `ProjectLaunchChecksMissingError` `actions.ts:255` |
| Resend preview and launch emails with email failure as an outcome | Built | `actions.ts:230-241,281-295` |
| Eight board columns and Needs action, Late, On hold, All | Built | `project-board.ts:31-40,102-127` |
| Today groups Overdue, Due today, Waiting; failed lists show a notice | Built | `today-queue.ts:159-195`; `page.tsx:46-53` |
| Kickoff wrap-up with three no-show buttons | Built | `calls/kickoff-wrap-up.tsx:20-24` |
| Clients table shows build stage and Build filter | Built | `clients/page.tsx:132-143,187` |
| Delivery tab renamed Website with Customer sees lines | Renamed; the "Customer sees" lines are only for website stages | `client-tabs.ts:15-21`; `delivery-tab.tsx` |
| Services panel: build controls only for website customers | Built | `website/page.tsx:208-209` |

## D. New or changed since the status document
* The client page now has five tabs (Overview, Website, Plan and billing, Messages, People); the plan describes the earlier shape. Verified in code (`client-tabs.ts:15-21`).
* The console menu is eight grouped items (`console-rail.ts`, commit `019eaf7d`). The plan and status document do not describe it.
* Directory, Ads, Deals and Geography are switched off through `DirectoryOnly` (`directory-only.tsx`).
* A staff invite and password-reset flow exists (`app/staff-invite`, `app/forgot-password`) though `apps/admin/CLAUDE.md` still says accounts come only from `staff:create`.
* `docs/STAFF-ACCESS.md:36` lists Affiliates among the switched-off sections; they are live and finance-gated.
* Cloudflare Access: `apps/admin/CLAUDE.md` says "behind Cloudflare Access"; `docs/deployment/cloudflare-access.md:3` says "Status: not done". Unknown which is true now.
