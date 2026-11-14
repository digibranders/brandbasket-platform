# Work packages

Each package is one agent, one branch `wp/NN-name`, one report. Paths come from the audit and may have moved: verify with a search before editing. Evidence and reasoning: `docs/product-architecture-audit/` (finding numbers refer to `00`, steps like 7.1 to `19`, P-items to `12`, D-items to `14`). "Migration" means a schema change: follow `MERGE-AND-RELEASE.md`.

## Wave order

| Wave | Packages (run in parallel inside a wave) | Gate to start the next wave |
|---|---|---|
| 0 | WP-00 shared UI patterns | merged, green |
| 1 | WP-01, WP-02, WP-03, WP-04, WP-05, WP-06 (money, access, data safety) | all merged, `pnpm test:integration` green |
| 2 | WP-10, WP-11, WP-12, WP-13, WP-17, WP-19 (customer journey) | all merged, green |
| 3 | WP-14, WP-18, WP-20, WP-15a (console and social events) | all merged, green |
| 4 | WP-16, WP-15b (billing exceptions, social lifecycle) | merged, green |
| 5 | WP-15c, WP-21, WP-22 (rename, tests, cleanup) | merged, final green, release |

Hot files that several packages touch: `apps/customer/src/features/shell/rules.ts`, `apps/customer/src/lib/guard-rules.ts`, billing code under `features/billing` and `features/checkout`, `apps/admin/lib/console-rail.ts`, `apps/admin/lib/server/today.ts`. Keep edits to them small and rebase often.

---

## WP-00 Shared UI patterns (wave 0)

- **Goal:** build the reusable pieces the redesign needs once, so later packages only compose them. Journey: all. Plan: `20-ui-ux-redesign-plan.md` section 4.
- **Owned paths:** new folder `packages/shared/src/ui/patterns/` and its tests.
- **Build:** `NextActionCard` (title, one-line reason, one primary action, optional secondary, optional status chip), `StatusTimeline` (ordered steps with done, current, upcoming, plain words), `NeedsYourOkList` (rows with kind, title, age, one action), `ApprovalCard` (approve, ask for a change, undo state), `ConfirmDialog` (title, consequence line, confirm label, danger variant), `PromptPopup` (console popup with up to three actions, dismiss that re-prompts, used for "Did the kickoff call happen?"), `EmptyState` and `ErrorState` with a recovery action (extend existing `panel/empty-state.tsx`), `StatusBadge`.
- **Rules:** use existing tokens and the existing `panel/button.tsx`; light theme; accessible (roles, labels, focus handling, keyboard); no new fonts or colours.
- **Acceptance:** each component has unit tests (render, props, keyboard) and is exported from the shared package. A short usage note in the report. Nothing in the apps changes yet.

## WP-01 First payment recovery (wave 1, P0-3, step 5.5)

- **Goal:** a first payment that Razorpay took but the webhook missed is recorded within minutes for every first checkout, not only the first-month offer ones.
- **Files:** the first-payment check (`first-payment-check.ts`), route `apps/customer/src/app/api/internal/check-first-payments/route.ts`, checkout loader `features/checkout/loader.ts`, `listUnpaidOfferCheckouts` query in `packages/db`, `deploy/vps/install.sh`, `deploy/vps/systemd/brandbasket-first-payment-check.timer`.
- **Behavior:** job considers every `incomplete` first subscription older than the settle time (10 minutes), asks the provider, records through the existing idempotent webhook path. Record the payment method on recovery (today stored as null). Page-load recovery stays. Safe to run repeatedly.
- **Acceptance:** unit and integration tests: lost webhook for an ordinary checkout is recovered once; running twice records one payment and one invoice; a flagged amount mismatch is not activated; a concurrent delivery test (webhook and job at once) records one payment.
- **Ops note for the report:** `install.sh` must enable the timer, not only install it. The owner runs the install on the VPS.

## WP-02 Invitee lands in the inviter's workspace (wave 1, P0-6, step 11.6)

- **Goal:** a person who signs up through an invite link joins the inviter's business and lands on its dashboard.
- **Evidence:** a new account gets a personal business at sign-up (`features/entry/server/listing-account.ts`), then joins the inviter's business as editor or viewer, and `packages/shared/src/lib/access.ts` (`decideCustomerAccess`) opens the oldest membership.
- **Behavior:** when sign-up carries a valid invite for the same email, do not create a personal business. After accepting, open the invited business. For an existing user with several memberships, add a stored "active business" choice (cookie or user setting) that is set when an invite is accepted. The invite page checks the token (valid, expired, used, wrong address) before showing the Join button and explains the problem in plain words.
- **Acceptance:** tests for sign-up via invite (no personal business, lands on the inviter's Home with the invited role), invite for an existing account, expired and used invites show their message before Join, viewer and editor permissions still hold. Integration test for the membership choice.
- **Copy for approval:** the explanation lines for expired, used and wrong-address invites.

## WP-03 Staff account protection (wave 1, P0-8, D30)

- **Goal:** one staff account holds everything, so protect it.
- **Behavior:** (a) optional Cloudflare Access verification in the console: when `REQUIRE_CF_ACCESS=1`, verify the `Cf-Access-Jwt-Assertion` header (signature against the team's public keys, audience and issuer from env) on every request and refuse otherwise; documented in `docs/STAFF-ACCESS.md`. (b) `ConfirmDialog` (from WP-00, or a local one until merged) on destructive actions: cancel build, add free round, change domain, mark refunded, close or restore account. (c) Keep existing role code; the single account is an admin. (d) Stretch only if cheap: a second factor through Better Auth's two-factor support; otherwise list it in the report as the next step.
- **Files:** `apps/admin` middleware or `proxy`, `apps/admin/app/(protected)/clients/[businessId]/website/actions.ts`, refund actions, closure actions.
- **Acceptance:** tests for the Access check (valid, expired, wrong audience, missing header with the flag on and off) and for each confirmation (action does not run without confirm).

## WP-04 Refund flow (wave 1, P0-5, step 13.4)

- **Goal:** a refund really refunds, issues a credit note and tells the customer.
- **Files:** `staff-payments.ts` (`markRefunded`), `refund-actions.ts`, `packages/billing` provider interface, tax invoicing in `packages/shared/src/server`, email templates in `packages/email`.
- **Behavior:** staff action "Refund" calls the provider refund API for Razorpay and a no-op success for the fake provider, then marks the payment refunded, issues a credit note linked to the invoice, sends the customer a refund email, and writes the access log. If the provider call fails, nothing is marked and the error is shown. Keep a clearly labelled secondary action "Record a refund made outside BrandBasket" that marks only. Idempotent: a double press refunds once.
- **Migration:** likely (credit note table or fields). Ask in the report if the schema already has one.
- **Acceptance:** unit and integration tests with the fake provider and a stub for Razorpay (no network), partial and full refund, double press, provider failure, credit note numbering and GST reversal. **Copy for approval:** refund email.

## WP-05 Erasure ordering (wave 1, P0-9, step 13.3)

- **Goal:** account erasure must not delete website content before the locked re-check.
- **Files:** `account-erasure-run.ts` (CMS deletion at about line 72 happens before the locked re-check at about line 80), erase route `api/internal/erase-closed-accounts/route.ts`.
- **Behavior:** re-check the closure under lock first, delete only if still closed and past `erase_after`, then delete CMS content and data. A restore during the window must lose nothing.
- **Acceptance:** integration test for restore racing erase, dry run, limit, and the route's auth (503 unset, 401 wrong token). Add the missing route test.

## WP-06 Database role check and tenant isolation (wave 1, P0-10)

- **Goal:** prove the customer app connects as the restricted role and that tenant scoping holds.
- **Files:** `packages/db/src/scope.ts`, app start-up (`instrumentation.ts` or an env check), the staff-database query files listed in `docs/product-architecture-audit/evidence/domain-architect/security-and-release-safety.md`.
- **Behavior:** at start-up in production, query `current_user` and refuse to start if the customer connection is not the app role; log and fail loudly. Sample the remaining staff-database query files for missing business scoping and list findings.
- **Acceptance:** unit test for the check, integration tests for cross-tenant reads (business A cannot read business B through the customer connection) on the main tables, and a short findings list in the report. Fix only clear bugs; list the rest.

---

## WP-10 Sign-up, questions, unpaid state (wave 2, steps 2.1, 3.2, 5.7)

- **Goal:** fix first-visit friction.
- **Behavior:** (a) the sign-up side panel and heading follow the services chosen (website steps only when Website is chosen); (b) an unpaid customer can open Help, Settings and Sign out instead of being locked to `/start`; (c) an abandoned sign-up gets one reminder email after 1 day and a Today row in the console (decided, D21); (d) the sign-up code step survives a refresh (store the step server side or in a signed cookie).
- **Files:** `features/entry/*`, `app/(app)/layout.tsx` guard rules, `lib/guard-rules.ts`, an internal job route and email template for the reminder, `deploy/vps/systemd` timer unit, `apps/admin/lib/server/today.ts` row.
- **Migration:** maybe a `signup_reminder_sent_at` column.
- **Acceptance:** tests for each of the four items, reminder sent once, not sent to paid accounts. **Copy for approval:** reminder email, panel wording per service.

## WP-11 Paid Ads display page (wave 2, step 9.1)

- **Goal:** a customer who has not bought Paid Ads sees Paid Ads information on `/ads`, not the Social plan.
- **Behavior:** `NotBought` for `/ads` shows the Paid Ads catalogue line and price with "Add to plan" for Paid Ads (`?add=ads` supported in the add param reader). No entitlement change: ads still shares the social key for now (owner deferred). Do not hide Paid Ads from sale.
- **Files:** `features/setup/rules.ts` (`ADD_ON_OF`), `features/billing/rules.ts` (`readAddParam`), `app/(app)/ads/page.tsx`.
- **Acceptance:** tests for the pitch and the add param. **Copy for approval:** anything beyond the existing catalogue line.

## WP-12 Home next action per service and "we have started" (wave 2, steps 6.1 to 6.5, P1 patterns)

- **Goal:** Home shows one next action per bought service and tells the customer when staff start work.
- **Behavior:** use `NextActionCard`. Website: book kickoff. Social: "Set up Social" (connect accounts, write posts) with no call and no kickoff card. Ads: no Social kickoff card. A shared helper `notifyCustomerStarted(businessId, service)` creates a customer notification, an email and a Home line "We have started on <service>". The staff button that calls it is built in WP-18.
- **Files:** `features/home/*`, `features/shell/rules.ts`, notification topics in `packages/db`, `packages/email` template.
- **Migration:** maybe a new notification topic value.
- **Acceptance:** tests per service combination (website only, social only, ads only, all three, unpaid, lapsed), helper creates one notification once. **Copy for approval:** the "we have started" wording per service.

## WP-13 Website track fixes (wave 2, steps 7.2 to 7.8)

- **Goal:** make the Website journey self-explanatory and complete on both sides.
- **Behavior:** (a) preview-ready email links to `/website` (where Approve and Ask for changes live) and explains the action; a reply still works but is turned into a request (`packages/email/src/templates/preview-ready.ts`, `apps/admin/lib/server/project-preview.ts`); (b) customer status lines use the kickoff wording in `AGENT-RULES.md` section 2; (c) Blog and Domain tabs are visible from day one with an explanation before launch (`features/website/components/website-screen.tsx`); (d) revision rows get their own due date and approved previews get a Today row (`apps/admin/lib/server/today.ts`, `projects.ts`); (e) a domain move creates a Today row.
- **Acceptance:** tests for each of the five items on both apps. **Copy for approval:** email text and tab explanations.

## WP-17 Requests, bell and links (wave 2, steps 11.2, 11.7, P1-5, P1-13)

- **Goal:** one place to answer and one way back.
- **Behavior:** (a) a signed-out visitor who opens any app link returns to it after sign-in (generalize the invite-only `next` to a safe same-origin allow list); (b) a customer acknowledgement email when a request is sent; (c) one canonical request URL (the page), the sheet only as a preview; (d) "Needs your OK" list (use WP-00 component) collecting preview approvals, quotes and change checks, and the bell opens it.
- **Files:** `lib/guard-rules.ts`, `features/requests/*`, `features/shell/*` (bell), `apps/admin/lib/server/request-notify.ts` links.
- **Acceptance:** tests for the redirect allow list (reject open redirects), acknowledgement sent once, link targets, list contents. **Copy for approval:** acknowledgement email.

## WP-19 Forms never lose work (wave 2, P1-4)

- **Goal:** a failed or dropped request must not wipe what the person typed.
- **Behavior:** one shared action hook that catches dropped requests and shows a recoverable error while keeping the form state; adopt it in the 21 `useActionState` forms and `useActionForm` (`features/settings/components/use-action-form.ts`); add `loading.tsx` for the main routes; unsaved-edit warning on internal navigation for the larger forms.
- **Acceptance:** unit tests for the hook; a test per adopted form family that a rejected action keeps input.

---

## WP-14 Kickoff "Call completed" popup and notification (wave 3, D31, P1-15)

- **Goal:** replace "held" with a tracked, understandable step.
- **Behavior (console):** when a booked kickoff time passes, show `PromptPopup`: "Did the kickoff call with <business> happen?" with three actions: Call completed (notes optional), They did not join, Reschedule. A notification repeats until answered; the same prompt appears on Today. The action lives only here: the client Website tab and Messages tab show read-only status. If nobody answers within 24 hours the build starts automatically, labelled "Started without call confirmation" and listed on Today. Rename all staff wording from "held".
- **Behavior (customer):** the three customer messages in `AGENT-RULES.md`.
- **Files:** `apps/admin/app/(protected)/calls/*` (`kickoff-wrap-up.tsx`, `kickoff-actions.ts`), `clients/[businessId]/call-actions.ts`, `clients/[businessId]/kickoff-actions.ts`, `kickoff-sync.ts` and `packages/db/src/queries/kickoff-build.ts` (24 hour fallback), customer Home kickoff states, console notification mechanism (use existing notifications; if none exists for staff, add the smallest one).
- **Migration:** maybe a field to mark "started without call confirmation".
- **Acceptance:** tests for each action, the repeat rule, the fallback label, the customer messages in each state, and that no other screen can mark the call.

## WP-18 Console shell, Today and client workspace (wave 3, single staff account)

- **Goal:** a console built for one person doing everything.
- **Behavior:** (a) Today is one list ordered by what is late first, each row with one action; remove owner, "Unowned" and role-based variants; add rows for approved previews, domain moves, past due and lapsed billing, privacy requests, reports to review and "Started without call confirmation"; (b) a "Mark started" action on a service task that calls `notifyCustomerStarted` from WP-12; (c) the client page becomes one workspace with tabs per service bought, mirroring the customer's status; remove the website pipeline for customers with no website; (d) rail simplification: remove the Ads item (dormant credit report), retire the dormant directory routes and legacy redirects listed in `03-admin-route-and-screen-inventory.csv` as Retire; (e) read-only Social status per client (connected channels, last post, last failure) fetched from social-auto.
- **Files:** `apps/admin/lib/console-rail.ts`, `lib/server/today.ts`, `rail-counts.ts`, client pages under `clients/[businessId]`, routes marked Retire in `03`.
- **Acceptance:** tests for every Today row kind and ordering, the rail, the workspace for each service combination, and that retired routes return 404 or redirect as specified.

## WP-20 Compliance on Today (wave 3, step 12.7)

- **Goal:** privacy requests and breaches cannot be missed.
- **Behavior:** privacy requests and breach deadlines (6 hours and 72 hours display) appear on Today with due dates; add the 16 missing audit actions to the access log filter (`apps/admin/lib/server/staff-access-log.ts`); closing a privacy request notifies the customer.
- **Acceptance:** tests for Today rows, the filter list, the closing notification. **Copy for approval:** the customer notification.

## WP-15a Receive social-auto events (wave 3, finding S1, steps 8.4, 8.7)

- **Goal:** tell customers when Social needs them.
- **Behavior:** add `apps/customer/src/app/api/webhooks/social-auto/route.ts`: verify header `X-Social-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the webhook secret>`, reject if `t` is older than 5 minutes, store events with their `seq`, process idempotently by event id. Events: `post.published`, `post.failed`, `connection.expiring`, `job.finished`, `poster.ready`, `poster.auto_approved`, `week.drawing`, `week.drawn`, `week.lapsed`. On start-up and after a gap, catch up with `GET /api/v1/events?after=<seq>&limit=100`. Create customer notifications (bell and email) for `post.failed`, `connection.expiring` ("reconnect Instagram"), `poster.ready`, `poster.auto_approved`, `week.lapsed`. Settings: `SOCIAL_AUTO_WEBHOOK_SECRET`, document in the env example.
- **Files:** new route, `packages/db` events table, notification topics, `packages/email` templates, `legacy-social/server/social-auto.ts` (add `readEvents`).
- **Migration:** yes (events table).
- **Acceptance:** tests with the fake social-auto helper: valid and invalid signature, stale timestamp, duplicate event, catch-up, each notification. **Copy for approval:** all new emails.

---

## WP-16 Billing exceptions (wave 4, steps 12.1 to 12.5, P1-3)

- **Goal:** a failed renewal can be fixed by the customer without writing to staff.
- **Behavior:** (a) the failed-payment email "Pay now" link goes to the pay step, not `/billing`; (b) self-serve payment method change through the provider (Razorpay hosted flow), replacing the "request a secure link" loop; (c) Today rows for `past_due` and `lapsed` (if not already added by WP-18); (d) apply a lapse policy once the owner supplies numbers (D10): default proposal 7 days grace, hosting paused at 14 days, data kept 30 days; keep it behind constants and a clear summary on the console Money page; (e) a reminder email before the first full-price charge after a ₹1 first month (date and amount).
- **Files:** `packages/shared/src/server/payment-emails.ts`, `features/billing/*`, `packages/billing`, webhook handler, Today.
- **Migration:** maybe a reminder-sent marker.
- **Acceptance:** integration tests for failed renewal, recovery, lapse transition, reactivation; email links; reminder sent once. **Copy for approval:** the reminder and policy wording.

## WP-15b Social lifecycle link (wave 4, finding S2, step 8.10)

- **Goal:** social-auto stops posting when a subscription lapses or Social ends, and resumes on reactivation.
- **Behavior:** this needs a change in the social-auto repo first: a product API call to pause and resume a workspace (for example `PATCH /api/v1/workspaces {externalId, paused}`), following that repo's `CLAUDE.md` (branch from its `development`, PR into `development`, never deploy, never send posts). Then call it from Brandbasket billing transitions (lapse, service ended at period end, reactivation, closure). If the social-auto change is not available today, deliver the Brandbasket side behind a feature flag and say so in the report.
- **Acceptance:** tests with a stub of the new endpoint, idempotent calls, failure does not block billing and is retried or surfaced on Today.

---

## WP-15c Rename and retire the manual Social path (wave 5, D16)

- **Goal:** the automated path is the product and is named so.
- **Behavior:** rename `legacy-social` to `social-auto` (folders, imports, tests, `next.config.ts` references); remove the manual staff deliverables flow ("Send for approval", staff Social tab) after confirming no live data depends on it; make the two social-auto settings required for the Social page with a clear "not available" state instead of a different product; bring the automated screens onto the design system.
- **Run last in its wave** because renames conflict with everything.
- **Acceptance:** all tests green after the rename, no references to the old name, the Social page renders each state (not set up, connected, writing, in review, scheduled, failed).

## WP-21 Test coverage (wave 5, P1-11)

- **Goal:** prove the journey.
- **Behavior:** add tests for the 16 untested admin action files (list in `evidence/journey-qa/test-coverage-map.md`), concurrent webhook delivery, an admin Playwright project (`apps/admin`, base URL the console), Playwright scenarios for the journeys in `19` using the plan in `13-e2e-scenarios-and-launch-gates.md`, and add Playwright to CI (`.github/workflows/ci.yml`). Fixtures for social-only, website only, ads only, all three, invitee, lapsed.
- **Acceptance:** suite runs locally and in CI at 1440 and 390 pixels; failures list with causes.

## WP-22 Single billing code tree (wave 5, P1-9, optional)

- **Goal:** remove the duplicate billing code (`apps/customer/src/platform/lib/server/*` versus `features/checkout/server/*`).
- **Run only if wave 1 and 4 tests are green.** Characterization tests first, then make the webhook and checkout use one tree, delete the other, no behavior change.
- **Acceptance:** all billing, checkout and webhook integration tests unchanged and green. If risk is high, stop and report instead.
