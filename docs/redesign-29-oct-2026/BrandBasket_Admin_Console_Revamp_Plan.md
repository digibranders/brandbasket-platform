# BrandBasket Staff Console: Product and Engineering Revamp Plan

**Version:** 1.0, 29 October 2026  
**Target:** `brandbasket-platform/apps/admin` (`console.brandbasket.in`) and necessary shared contracts with `apps/platform`, `packages/db`, `packages/shared`, `packages/email`  
**Evidence:** Source inspection of the user-provided `brandbasket-platform-main (1).zip` on 29 October 2026, plus the current customer Home screenshot. This is a **source-code review, not a live admin walkthrough or production database audit**. Screens and server paths below are verified against this ZIP unless marked **PROPOSED**.  
**Intent:** Replace a collection of staff forms with a reliable, understandable **client-delivery operating system**, while retaining real existing capabilities, accounting integrity, user security, and customer-facing state consistency.

---

## 0. Executive decision

The primary problem is *not* that the admin console lacks a Kanban board or a prettier sidebar. It already has a `Projects` board, `Calls`, a client `Project` tab, actions for beginning/pausing/resuming builds, preview sending, approval, revision handling, and launching. **The problem is workflow orchestration.** Multiple interfaces and background jobs can change the same project's state, some transitions are not meaningful to staff, and staff do not see one explicit next action with dependencies, ownership, confirmation, customer impact, and exception recovery.

**Redesign principle:** Staff should answer, in five seconds: (1) what needs doing; (2) who owns it; (3) what is blocking it; (4) what happens if I press the primary button; (5) what will the client see. Every customer-visible promise must come from authoritative persisted data, not a UI-only flag.

**Nonnegotiable distinction:** A business having paid, a kickoff having ended, a website build being *ready*, staff actually *working*, a preview being *sent*, a preview being *approved*, a site being *deployed*, and a site being *verified live* are different events. Do not collapse them into one mutable label.

**Design direction:** Keep the existing console’s established design system and shell unless specific usability testing requires changes. `apps/admin/DESIGN.md` and `apps/admin/CLAUDE.md` already prescribe a compact, accessible staff UI using shared tokens, Red Hat fonts, a dark rail, hairline sections, status pills, and role-based navigation. The screenshot of the *customer* portal is not a template for turning the denser admin workspace into customer-facing cards.

## 1. Verified implementation facts and critical gaps

### 1.1 Existing staff console

- App is `apps/admin`, built on Next.js; access via `requireStaffAccess()` and the staff session. Roles are `support`, `finance`, `admin`. Shared capability checks currently cover `money`, `oversight`, `integrations` in `packages/shared/src/lib/access.ts`. The staff database connection is privileged and **does not rely on tenant RLS**: every write must be explicitly business/project-scoped. See `apps/admin/CLAUDE.md`.
- Existing rail: Today, Enquiries, Clients, Projects, Requests, Calls, Payments, Invoices, Prices, Coupons, Affiliates, Ad credit, Deliveries, Errors, Staff, Settings, Compliance (`apps/admin/lib/console-rail.ts`). Several pages also exist outside the visible main rail, including privacy requests, breaches, leaving/churn, and dormant directory modules. Do not delete those routes merely because they are not in the rail.
- Existing per-client tabs: Overview, Project, Billing, Services, Website, Requests, People, Activity (`apps/admin/lib/client-tabs.ts`). A client header already displays service tags and project status (`apps/admin/app/(protected)/clients/[businessId]/layout.tsx`).
- `Today` pulls flagged payments, new inquiries, support tickets, add-on purchases, and project deadlines, and renders a queue plus calls and system health (`apps/admin/lib/server/today.ts`, `apps/admin/app/(protected)/page.tsx`). Some source reads explicitly fall back to empty arrays on error: ensure an outage is **not visually mistaken for zero work**.
- `Projects` has board and list modes plus builder filtering (`apps/admin/app/(protected)/projects/page.tsx`, `apps/admin/lib/project-board.ts`). Its board groups `submitted` and `building` into one “Building” column; `approved` is grouped under “Preview sent”. This hides materially different staff actions.
- Existing website actions: `startBuilding`, `putOnHold`, `resumeBuilding` (`apps/admin/lib/server/website-moves.ts`, `apps/admin/app/(protected)/clients/[businessId]/website-actions.ts`). The project tab separately renders `SendPreviewForm`, `GoLivePanel`, `ProjectControls`, `WebsiteSection`, and `KickoffCallSection` (`apps/admin/app/(protected)/clients/[businessId]/project/page.tsx`). **These controls are fragmented and partly redundant.**

### 1.2 Actual database project states

The source enum is `packages/db/src/schema/projects.ts`:

`onboarding`, `submitted`, `building`, `preview`, `revisions`, `approved`, `live`, `on_hold`, `cancelled`.

The project row also stores `onboardingSubmittedAt`, `slaDueAt`, `launchPlannedOn`, `previewUrl`, `previewSentAt`, `onHoldReason`, `revisionRoundsIncluded`, `revisionRoundsGranted`, `launchedAt`, and `assignedStaffId`.

A single *open* project is allowed per business. `project_events` records stage history; these are more reliable than a manually drawn timeline. Check project kind (`initial_build`, `redesign`) before applying initial-build promises to redesigns.

**Do not introduce a second competing `website_status` source of truth.** Prefer a derived staff/customer stage model plus optional subordinate milestones or tasks where genuinely necessary.

### 1.3 Kickoff and automatic transition behavior

- `setup_call_bookings` stores `bookedAt`, `startsAt`, `endsAt`, `heldAt`, `summary`, and staff attribution. No persisted trustworthy video-join URL is established by this schema. The stored `inviteeUri` is a booking page/invitee link, **not automatically a meeting join URL**.
- Admin `completeKickoff` marks the call held, optionally saves a summary, then runs `markProjectReadyAfterKickoff` and sets a preview due time (`apps/admin/lib/server/kickoff-complete.ts`). `Calls` provides a “Just finished” wrap-up with **Save and start the build** or **Did not happen** (`apps/admin/app/(protected)/calls/kickoff-wrap-up.tsx`).
- Separately, the platform has `startBuildsAfterKickoff` plus an internal scheduled endpoint (`apps/platform/lib/server/kickoff-sync.ts`, `apps/platform/app/api/internal/start-builds-after-kickoff/route.ts`). Per code comments, a kickoff can move a website project from `onboarding` to `submitted` after a settle period even if a human has not confirmed the call happened. The runner requires configured credentials and scheduling; this review does **not** prove the production job actually runs.
- The move from `submitted` to `building` is a **different** manual staff action (`setProjectBuilding` in `packages/db/src/queries/project-website.ts`). Yet both states appear together on the Projects board and can map to “we’re building” in the customer UI.

**Product-risk decision required:** Decide whether time elapsed after a scheduled call is sufficient evidence of a *completed* call. A booking can be a no-show. Recommended future rule: an ended call becomes **Needs outcome**, not **Held**. Staff confirm **Completed**, **Customer no-show**, **BrandBasket no-show**, **Rescheduled**, or **Unknown/follow up**. If keeping automatic advancement as a temporary compatibility mechanism, surface “Started automatically, kickoff not staff-confirmed” and provide a safe reconciliation path. Never silently drop an existing scheduled job without designing the migration.

### 1.4A Verified functional blocker: kickoff-first projects are misclassified by legacy admin UI

**Confirmed from code, not an assumption:** `markProjectReadyAfterKickoff` in `packages/db/src/queries/kickoff-build.ts` sets project status to `submitted` and an SLA due date **but intentionally leaves `onboardingSubmittedAt` null** because kickoff-first customers no longer submit the old setup checklist. However, `apps/admin/lib/client-next-step.ts` returns `null` whenever `project.onboardingSubmittedAt === null`, *before* considering submitted/building/approved statuses. As a result, the admin Project page **does not render the “Send a preview” or “Go live” next-action panels** for those normal kickoff-first projects. Separately, `apps/admin/app/(protected)/clients/[businessId]/project/page.tsx` uses the same null field to display **“Still filling in their setup. Nothing has been sent to us yet.”** even when the kickoff-first project is legitimately `submitted` or `building`.

This is not simply cosmetic inconsistency; it can block normal staff progression through preview/launch via the visible Project page. The database transition `recordProjectPreviewSent` itself accepts submitted/building/revisions, so the **UI gating** is the immediate defect.

**P0 fix:** Replace legacy `onboardingSubmittedAt` UI readiness checks with the authoritative `project.status` and, where needed, kickoff outcome / project event evidence. Keep `onboardingSubmittedAt` as historical evidence of legacy setup submission, not a universal prerequisite. Test both kickoff-first and legacy checklist flows. Fix this **before** any broad visual redesign or production rollout.

### 1.4 Preview, feedback and launch behavior

- Sending a preview writes `status=preview`, `previewUrl` and `previewSentAt`, attempts a best-effort preview screenshot, records an activity line, and sends an email when a usable customer email exists (`apps/admin/lib/server/project-preview.ts`, `packages/db/src/queries/projects.ts`). The database stage can commit **before** email delivery; an email failure/no-email does not mean the preview is unsent, and the UI needs a visible delivery/notification outcome.
- Customer preview approval is performed in the **platform** (`apps/platform/app/app-host/(protected)/website/actions.ts`, `apps/platform/lib/server/project-response.ts`): it moves `preview` → `approved`; feedback moves `preview` → `revisions` and increments the revision-round counter. Feedback is stored as a **support ticket**, distinct from monthly maintenance change requests. Staff notifications are best effort.
- Staff resends a revised preview using the same preview-sending functionality from `revisions` → `preview`. Do not model that as an entirely new project unless approved by the product owner.
- `markProjectLive` moves `approved` → `live`, sets `launchedAt`, and marks the primary domain active in the database. Its documentation explicitly states **it does not independently verify actual deployment or DNS reachability** (`packages/db/src/queries/projects.ts`). The admin `GoLivePanel` instructs staff to check deployment and DNS manually (`apps/admin/app/(protected)/clients/[businessId]/parts.tsx`). This is a major validation gap to handle in the redesigned workflow.
- `launchPlannedOn` is a staff-entered *plan*, not proof of deployment or a guaranteed customer promise. Expose confirmed vs tentative dates clearly.
- `revisionRoundsGranted` is incremented when the customer asks for changes. Existing `revisionRoundsUsed` presentation needs a carefully verified semantic mapping; do not silently reinterpret billable or included revisions.

### 1.5 Other existing capabilities to reuse

- Support tickets include statuses `new`, `triaged`, `in_progress`, `waiting_on_you`, `resolved`, `closed`, with public/internal messages, assignees and attachments (`packages/db/src/schema/support.ts`). Staff request detail already supports conversation and notes (`apps/admin/app/(protected)/support/[ticketId]/page.tsx`).
- Service management already supports deliverables and monthly report links (`apps/admin/components/console/work-section.tsx`), purchase/add-on management and OyeChats configuration (`apps/admin/app/(protected)/clients/[businessId]/services/page.tsx`). Deliverables have `planned`, `awaiting_approval`, `approved`, `published` statuses.
- Payments, invoices, coupon/affiliate/pricing, ad-credit, delivery tracking, settings, staff and compliance already have separate pages. They are not new greenfield requirements.
- Client onboarding/intake answers are available in the admin overview (`findClientIntake` and `summaryRows` in the current client overview). The legacy “Setup answers” section still appears even for the newer kickoff-first experience, creating unnecessary internal ambiguity.
- Staff activity logging (`recordStaffAction`) and client-facing activity events (`addActivityEvent`) are different systems. Staff audit entries must not accidentally become public. Some event writes currently log-and-continue after failure; design critical events with stronger delivery/reconciliation behavior.

### 1.6 Screenshot-specific findings

The current customer Home screenshot says **“We are building your website”**, promises a first preview and shows “Kickoff completed”; the rail separately exposes Website and Blog. The image by itself does not show which staff pressed a stage button, whether an actual builder was assigned, whether the preview deadline was computed or edited, or whether the client notification was received. Those are **not facts we can infer from the screenshot**. The upgraded console should make the answers visible.

---

## 2. Final information architecture: staff work, not a duplicate of the customer portal

**Keep the existing outer admin shell and visual tokens.** Simplify labeling, prioritization and client subnavigation; do not erase legitimate billing/compliance capabilities to achieve a shorter sidebar.

### 2.1 Proposed main navigation

| Area | Destination | Primary staff purpose | Recommendation |
|---|---|---|---|
| Home | **Today** `/` | What requires human action now | Rebuild queue logic and layout |
| Delivery | **Projects** `/projects` | All website projects, blockers, deadlines, assignment | Major rebuild |
| Delivery | **Calls** `/calls` | Confirm outcomes, notes, upcoming meetings | Major rebuild |
| Customer management | **Clients** `/clients` | Find a client and open its operating workspace | Redesign filters, row signals |
| Customer management | **Enquiries** `/leads` | Sales funnel before purchase | Retain, improve handoff |
| Customer management | **Requests** `/support` | Conversations, prelaunch revisions and operational support | Major integration refinement |
| Financial | Payments, Invoices, Prices, Coupons, Affiliates, Ad credit | Actual financial operations | Keep role guards; targeted UX refresh |
| Operations | Deliveries, Errors, Settings, Staff, Compliance | Reliability, staff and audit | Keep; integrate workflow alarms |

**Optional future**: one **Service work** overview for Social/Ads and SEO/AEO when real assigned work and queue data justify it. Do not create a blank page merely to fill the sidebar. Start with service-specific tabs in the client workspace and filters on Today.

### 2.2 Proposed per-client navigation

| Tab | Purpose | Current replacement |
|---|---|---|
| **Summary** (existing `/clients/:id`) | Client identity, purchased services, current customer-visible state, next internal step, urgent alerts | Consolidate old Overview; remove legacy setup checklist as default |
| **Delivery** (reuse `/clients/:id/project`) | **Primary guided website workflow** and side-by-side staff/customer state | Replace long stack of independent forms |
| **Services** | Social & Ads / SEO & AEO operations, OyeChats, monthly deliverables | Restructure existing Services sections by purchased service |
| **Requests** | Conversation inbox scoped to client; preview feedback linked to project | Reuse support; no duplicate thread model |
| **Website** | Live technical configuration, domain, hosting, CMS/website features | Move operational controls here or into Delivery where stage dependent |
| **Billing** | Subscription, renewals, invoices and payment exceptions | Keep finance guarded |
| **People** | Owners, memberships, contacts, account closure | Keep secure and auditable |
| **Activity** | Combined audit/cross-service history with public/internal badges | Distinguish event origins and visibility |

**Order** should put **Delivery** second while a build is active. For live-only customers, lead with service status rather than an obsolete build-progress control. Maintain URL aliases/redirects when renaming labels, rather than changing deep links unnecessarily.

---

## 3. The authoritative website workflow (the core of the redesign)

### 3.1 Separate three kinds of state

1. **Project stage (authoritative, existing `projects.status`)**: overall lifecycle, access gating, and customer rendering.
2. **Operational milestone/task (PROPOSED, secondary)**: actual work such as “builder assigned”, “first draft ready”, “QA passed”, “DNS checked”. Does not independently drive project state until a validated transition.
3. **Customer communication event**: when/what the client was actually told, including email or in-app outcome. Distinct from project status and internal notes.

Use a **single shared stage mapping** between admin and customer apps in `packages/shared`, with explicitly differentiated labels for staff and customers. The DB enum stays the source of truth. A “Current stage” badge must never be inferred from presence of a preview URL or a date alone.

### 3.2 Exact flow and transitions

| Staff display | Existing DB state | How it is entered today | Proposed primary admin action | Customer sees |
|---|---|---|---|---|
| **Waiting for kickoff** | `onboarding` | New website project created | Confirm/resolve booking outcome | Meeting details or booking CTA |
| **Ready to start** | `submitted` | Legacy setup submission OR post-kickoff automatic/manual transition | **Assign builder** if absent, then **Start work** | “Kickoff complete. Preparing your website” (recommended; map in platform) |
| **Building** | `building` | `setProjectBuilding` only from `submitted` | **Review work / Send first preview**; also Pause | “We’re building your website” |
| **Awaiting client review** | `preview` | `recordProjectPreviewSent` | **Follow up** or wait; no “go live” | Preview link + Approve / Request changes |
| **Changes requested** | `revisions` | Customer feedback response + support ticket | **Review feedback / Rework / Send revised preview** | “We’re making your requested changes” |
| **Approved, ready for launch** | `approved` | Customer approves preview | **Prepare launch / Verify / Mark live** | “Approved; preparing to launch” |
| **Live** | `live` | Staff `markProjectLive` after real deployment (claimed) | Support/maintenance; new project only for a genuine redesign | Website live + ongoing management |
| **On hold** | `on_hold` | Staff pause from certain statuses | **Resolve reason / Resume** | Specific customer-safe hold reason and next step |
| **Cancelled** | `cancelled` | Staff cancel project | No stage transitions; handle account/billing separately | Accurate service-specific closed/paused information |

**Do not allow direct stage selection through an unrestricted dropdown** and do not use drag/drop to mutate the project status without invoking the transition service. The board is a view into validated actions, not a bypass for state-machine invariants.

### 3.3 Stage-by-stage staff experience

#### Stage A: Waiting for kickoff

**Header:** “Kickoff not completed”. Show booked date, timezone, booking record, result of calendar sync, customer email availability, selected services, short adaptive intake and owner contact. **Primary:** “Record kickoff outcome” once scheduled call has ended, or “Contact customer / Book a kickoff” if missing.

**Outcome control:** Completed; Customer did not attend; BrandBasket did not attend; Rescheduled; Outcome unknown. Completed opens notes and a handoff summary; a negative outcome offers rebooking and a notification path. Avoid automatically declaring “held” just because end-time passed. Preserve the old auto-settlement logic until its safe replacement is deployed.

**Completion form (recommended):** business goals (prefilled from intake), content and design direction, primary contact action, essential website pages (tentative), dependencies, project owner/builder, client-facing recap, private internal notes, agreement/expectation flags, estimated first-preview due. Notes do not need to force the customer to upload assets. An unfinished optional form must not block staff from marking a call genuinely completed.

**On completion:** persist the outcome idempotently; update kickoff heldAt/summary as appropriate; move `onboarding → submitted` only if website purchased and project eligible; calculate due from existing terms/config; create a clear activity event; enqueue customer recap notification; present next step **Assign builder / Start work**. Multiple services should produce distinct service handoffs, not falsely initialize a website project for social-only customers.

**Exception:** Existing automated kickoff sync may already have set `submitted` before staff records outcome. Reconciliation must not regress or duplicate the transition. Staff must be warned about this condition.

#### Stage B: Ready to start

**Header:** “Ready for production”. No claim that a designer has actually started. Prominent deadline and “X hours until first preview due” if SLA is confirmed. **Required facts:** client/business brief, builder assignment, actual scope, references, existing site/domain state, blocking customer information, kickoff outcome. **Primary:** “Assign and start building”; if already assigned, “Start building”.

“Assign” and “Start” must remain different persisted events even when the UI offers a combined convenience action. Use transactional or idempotent orchestration so concurrent staff cannot start twice. If the project has no brief, show a meaningful warning or optional builder summary, not a giant mandatory customer form. Client should see “Preparing your website” if `submitted` rather than “Building”, if product approves that mapping.

#### Stage C: Building

**Header:** “Building” with assigned builder, start timestamp (new subordinate event if not already available), deadline, time remaining, progress **only as completed verifiable milestones**. **Primary:** “Prepare preview” / “Send preview” when a usable URL is ready. **Secondary:** update internal note; record completed work; change builder; adjust due (permissioned and customer impact shown); pause with explicit customer-safe reason.

**Useful staff checklist (internal, not customer homework):** project brief reviewed; design/content prepared; responsive pages checked; important CTAs tested; forms/WhatsApp/call verified where applicable; images/assets/licensing checked; accessibility smoke check; preview URL opens; basic security/privacy review. These are internal tasks, not DB project statuses. Each check must be real and timestamped if it gates preview.

**Preview action:** Input URL, preview version identifier (if added), and short customer-facing summary. Validate URL policy (HTTPS, allowed hosts where appropriate, SSRF-safe screenshot capture) and manually verify its content. Then run the existing preview transition, capture screenshot best-effort, create client-visible event, enqueue preview notification, and report **Preview saved / Notification sent, pending, failed, or not possible** separately.

#### Stage D: Awaiting client review

**Header:** “Waiting for client review” with preview URL, send date, last client activity, response window if contractually defined, notification status and count of follow-up attempts. **Primary:** “Send reminder” when justified. **Do not auto-approve.** Staff can resend the same link only through a non-stage-changing reminder path; replace/change the preview only through explicit versioning or reissue rules. If no email, show contact alternatives; do not pretend a notification was delivered.

**When client approves:** status becomes `approved` from the platform action. Show who/when only if source supports it; if audit attribution is needed, add an immutable event, do not invent it. Staff moves into launch preparation automatically without manually setting project status.

**When client requests changes:** status becomes `revisions`, and a related support ticket contains written feedback. The project workspace should link directly to this ticket, surface attachments, and allow an internal checklist of requested changes. This feedback **must not consume normal monthly maintenance edit allowance**. Clarify round-count semantics and contractual caps with product owner.

#### Stage E: Revisions

**Header:** “Changes requested”, with current round, included rounds, linked customer feedback, builder, new due expectation (only if approved policy), updated preview version, and customer-facing text. **Primary:** “Send revised preview” after applying and checking changes. Preserve full review history; older previews should remain traceable if version history is implemented. Do not mark changes done merely because a support ticket was closed.

If number of rounds exceeds included allowance, staff should see a policy review path rather than automatic charge. Customer should never be billed or blocked by an unverified numeric counter.

#### Stage F: Approved and launch preparation

**Header:** “Approved. Prepare launch.” Show approved preview version, domain, owner, proposed launch day and actual deployment state. **Primary:** “Run launch checks” / “Confirm website is live” only after verification.

**Minimum launch checklist:** approved version identified; production deployment exists; target hostname configured; DNS is correct or a valid temporary domain is intentionally selected; HTTPS certificate works; homepage and key pages load; mobile viewport passes smoke test; contact form/inquiry path works where included; chatbot only if purchased/configured; redirects/robots/canonical/noindex reviewed as applicable; customer content approved; owner informed of launch plan. Track result, actor and timestamp. Clearly distinguish manually checked versus automatic checks.

**Risk:** Existing `markProjectLive` changes DB status and domain without independent deployment/DNS verification. Do not treat its successful return as technical proof. The new UI must require explicit evidence; automated URL checks may be added as a second layer but cannot prove every business requirement. If the actual site fails, do not mark `live`.

**Launch action:** guarded staff confirmation; persist verified launch evidence; call the existing stage transition; update canonical site URL; write customer-facing activity; enqueue launch email/portal notification. Delivery problems must appear as retryable notification failures without reversing a truly live deployment. If database transition succeeds but post-transition work fails, use an outbox/reconciliation flow, not unsafe repetition of the stage transition.

#### Stage G: Live / ongoing management

**Header:** “Live” with verified site URL and date. No old kickoff checklist. Show recent change requests, latest verified site checks (only if implemented), customer inquiries where tracked, subscribed add-ons, monthly deliverables and recurring activities. **Primary** depends on work: “Open active request” / “View website” / “Add service update”.

**Do not simulate maintenance** by writing ceremonial activity entries. Separate internal maintenance logs, reliable technical monitoring and customer-facing completed work. Only display “site healthy” when an actual checked result exists with timestamp.

#### Stage H: On hold, cancelled, or billing exception

- **On hold:** preserve previous stage (currently inferred from `project_events`), reason, person who paused it and expected resolution. Require a client-safe explanation and route the internal work owner. On resume, restore the prior stage accurately. Review any deadline shifts as a separate policy decision.
- **Cancelled build:** separate from subscription cancellation and billing. Existing cancellation explicitly leaves plan/billing intact. Staff must understand and communicate the difference before pressing it.
- **Past due / lapsed:** a payment state should not silently overwrite a project stage. Show a prominent parallel financial restriction and explain if delivery should continue or pause under contract terms. Finance-only actions remain protected.

---

## 4. Final staff screens and what each contains

### 4.1 Today (staff home)

**Remove/reduce:** broad figures that cannot be acted on; duplicate lists of the same client; a “no work” state when a backend query failed; unrelated system statistics above overdue customer work.

**Add:** one prioritized **Action queue** grouped by “Overdue”, “Due today”, “Waiting for staff”, “Customer replied”, and “Operational problems”; a **My work** filter and ownership; a compact **Today’s calls** list with outcome controls; urgent payment/delivery alerts for authorized roles; unresolved failed notifications; quick links directly to the specific client stage/action.

Each row: business + purchased service + exact issue + due/age + owner + current stage + primary action + reason for priority. If multiple issues apply to the same client, aggregate by customer but retain drill-down; don't swallow urgent payment failures behind routine project work.

Suggested hierarchy: alert strip for true incidents; my actionable queue; unassigned queue; calls; late projects; recent service replies; small operational metrics. A role sees only work they are allowed to perform.

### 4.2 Projects board and list

**Remove:** treating `submitted` and `building` as indistinguishable; mixing approved sites with previews waiting on customers; cards with only name and one date; assumptions that drag/drop can update statuses.

**Add columns:** Waiting for kickoff | Ready to start | Building | Awaiting review | Changes requested | Approved/launch | On hold. Keep “Live recently” as a filter/list, not necessarily a permanent column. Mark underlying status on cards. Show builder, SLA due, days/hours overdue, preview version, next owner/action, hold reasons, and notification failures.

Default view: **Needs action**, not just every project. Filters: service, stage, assigned builder, owner, due, overdue, paused, client, upcoming launch. Board cards open a **project detail**. On narrow screens use list view, not six unusably thin columns.

Buttons operate through the central project command layer. The board is primarily for locating work, not editing unrelated fields.

### 4.3 Client Summary

**Replace:** general “Next step” link that just points into a long form list; legacy “Setup answers X of Y” as a permanent priority; scattered owner/financial/service facts repeated across tabs.

**Top:** client name, contact, verified subscription/payment state, purchased services, assigned account owner, project owner, **customer Home currently says** (short literal summary), next staff action and responsible person. Then adaptive intake snapshot and kickoff summary; recent public vs internal events; alerts and open requests. The summary must reflect all purchased services; do not call every client a website client.

Place finance details behind the Billing tab or role-guarded compact data. Use actual service/plan data; never invent staff assignments.

### 4.4 Client Delivery: primary operating workspace

**Replace** `Project` tab's many separate stacked sections with a guided layout:

**Top stage strip:** stage, actor/owner, due, progress history, customer-facing headline and next admin action.  
**Main left:** current action panel, relevant checks, editable internal records, preview/launch evidence.  
**Right:** client context (intake, kickoff notes, key contacts), blockers, notification outcomes and action history.  
**Lower/secondary tabs:** Timeline; Brief & assets; Preview & revisions; Domain & launch; Activity/audit.

All fields should be editable only where relevant. Example: “Send preview” is not shown while in `onboarding`; “Mark live” not shown while waiting for review. In `building`, the default CTA should never be “Open Website” if no actual customer site URL is available. Every action shows its customer impact before confirmation.

**Important:** The customer portal's `submitted`/`building` mapping may need to change to honor the distinct staff states. Implement both sides in the same release to avoid contradictory labels.

### 4.5 Calls

**Remove:** a purely chronological list with a wrap-up form isolated from the project; old copy claiming a post-kickoff form opens the customer's To do page; implicit completion on elapsed time without review.

**Add:** Upcoming, Starting soon, Outcome needed, Completed, Did not happen, Rescheduled. Client, selected services, meeting date/time/timezone, booking source and link status, assigned staff, call outcome, notes, handoff status and project follow-up. A call detail can route into the same client Delivery workspace. Use one shared kickoff completion command from both Calls and Client Delivery; do not fork the logic.

Provide safe no-show/reschedule handling, including a reconciliation strategy for already auto-advanced projects.

### 4.6 Client Services (Social / SEO / OyeChats)

**Remove:** one long mixed view where purchased-service deliverables, add-on billing, monthly reports, and chatbot configuration compete for the same space.

**Add:** purchased service cards with current monthly service cycle and actual commitments. Under each service, show assigned operator (if available), current deliverables, approvals pending, work completed and report history. Use existing `deliverables` statuses, not fake percentage trackers. For Social: planned post → sent for approval → approved → published, with content preview and revision. For SEO: existing page/listing deliverable records and monthly reports; do not invent automated rankings. For OyeChats: configuration, active status, verified lead/conversation figures, webhook failures and issues, subject to existing actual capabilities.

Service setup should be internal, not a customer homework checklist. All actions visibly indicate whether the customer is notified or must approve.

### 4.7 Requests (global and client-scoped)

**Keep:** existing support tickets, public/internal messages, attachment model, staff assignment and status machine.

**Add:** a split inbox for desktop (queue + thread), search and filters (needs reply, waiting on customer, priority, assigned to me, service, preview feedback). Link preview feedback to the appropriate project and preview version. Add contextual navigation back to Delivery. Show reply clock only when measured. Keep internal notes unmistakable (not customer-visible). Separate “Reply and set waiting-on-client” and “Resolve” semantics. Avoid creating a second `messages` table.

**Important:** A staff-created customer information request should use a defined customer-visible message/action mechanism (existing support where appropriate), not a private comment and a fake task badge.

### 4.8 Clients directory and Enquiries

**Clients:** prioritise business, owner/contact, purchased services, payment state, project stage, next action, assigned staff, overdue state. Search by the actual indexed supported fields. Filters: payment/active, kickoff outstanding, project stage, account owner, service. Let row click land on Summary; offer a direct “Open delivery” action for active builds.

**Enquiries:** preserve existing lead workflow, add a clear transition/handoff view when a lead becomes signed-up or paid. Show selected services and intake context only when actually collected. Avoid duplicate client creation or duplicate billing from staff shortcuts.

### 4.9 Website / domains / hosting / content

**Website tab:** live URL, domain configuration, verified DNS/HTTPS (if actually checked), hosting record, monitoring availability, feature toggles, CMS status, business data synchronization, and website configuration. **Delivery tab:** stage-dependent actions such as preview submission and launch checks. Avoid duplicating domain controls in both places; provide contextual links.

CMS author/category controls should stay only where there is a real business reason to manage them. Staff are power users, so legitimate CMS/admin functions can remain even when hidden from the customer portal.

### 4.10 Billing / Payments / Invoices / Pricing / Coupons / Affiliates / Ad credit

**Do not redesign payment logic while redesigning page structure.** Keep existing sources of truth and finance/admin permissions. Improve clarity around paid through, due/failed/processing, invoice number/status, discounts, bundle components, GST treatment, charge/refund side effects and audit trail. Financial actions require explicit confirmation. Include incident links from Today for failures.

Client Billing shows current subscription, collected payments, renewal, receipts/invoices and exception state. Global money screens remain specialist tools with tables, filters, export and permissions; they should not be forced into the same simplified “concierge” cards as customer Home.

### 4.11 System / staff / compliance

**Deliveries:** show failed emails, alerts, webhook events and retries by source, correlation ID, target business/project, last attempt, retry eligibility, final disposition. Integrate actionable delivery failures into Today. **Errors:** route genuine incidents to an error detail with affected customer(s). **Staff:** roles, team assignments, access status. **Settings:** integrations and notifications. **Compliance:** staff access log, privacy requests, breach registers, retention controls. Keep existing protections intact and ensure new pages log staff access when they read customer data.

---

## 5. User-facing outcome matrix (required for all stage commands)

| Event | Admin result | Customer Home / Website | Notification | Follow-up ownership |
|---|---|---|---|---|
| Service payment captured | Client active; relevant project/intake shown | Welcome/kickoff when appropriate | Existing billing confirmation | Scheduling/support |
| Kickoff booked | Call upcoming | Date/countdown; optional preparation | Confirmation if actually sent | Staff preparing call |
| Kickoff completed and confirmed | Outcome recorded, handoff created, website `submitted` | “Preparing your website” **if mapping adopted** | Recap / stage change (record status) | Project owner |
| Builder begins | `building` | “We’re building your website” | Optional milestone; not spam | Assigned builder |
| Preview sent | `preview` and preview version | Preview available; review CTAs | Preview email/outbox status | Customer |
| Feedback submitted | `revisions`, ticket linked | “Changes requested / team working” | Team notification | Builder/support |
| Revised preview sent | `preview` | New version with review CTAs | Retryable customer notification | Customer |
| Preview approved | `approved` | “Preparing to launch” | Team alert | Launch owner |
| Launch verified and recorded | `live` | Live site URL and ongoing management | Launch email/outbox status | Service owner |
| Hold | `on_hold` | Honest customer-safe reason | Optional notice | Named blocker owner |
| Support response | Ticket changed | Thread updated; action request if relevant | Reply notification | Staff/customer depending state |

**Authoritative data contracts**: Implement event mapping in shared code, typed, with test fixtures for every state. Revalidate relevant Next.js paths after accepted transitions; review caching/SSR and external-webhook refresh behavior. UI must not rely on optimistic local state as the only evidence of a successful stage change.

---

## 6. Proposed backend additions and what NOT to duplicate

**Existing tables/models to retain:** `projects`, `project_events`, `setup_call_bookings`, `client_intakes`, support tickets/messages/attachments/events, activity, deliverables, monthly reports, domains, bundled add-ons/subscriptions, invoices/payments, staff/access logs. Inspect exact schemas/migrations before altering.

**Candidate additions: require proof of need before migration:**

| Candidate | Why | Safe minimal shape / decision |
|---|---|---|
| `project_milestones` or structured task rows | Internal actual work without overloading `projects.status` | Project-scoped milestone key/status/completedAt/actor; optional dueAt; uniqueness by project + key where appropriate. Must not duplicate existing deliverables. |
| `project_kickoff_outcomes` or fields/events | Distinguish completed vs no-show vs unknown; track review | Call booking reference, outcome enum, actor, time, optional internal/public recap. Preserve existing `heldAt` semantics until migration. |
| `project_preview_versions` | Preserve revised previews and correlate feedback | projectId, version, URL, sentAt, customer response, screenshot reference, immutable history. Migrate existing `previewUrl`/`previewSentAt` as current version 1 when valid. |
| `project_customer_attention` (only if necessary) | Explicit, targeted one-item customer info request | business/project ID, prompt, due only if genuinely required, status, response link; prefer reuse of support tickets plus typed associations before new table. |
| notification outbox/attempt linkage | Transition succeeded but email/webhook failed | Correlation by project event, recipient/channel, template, attempt state/next retry; inspect current `emails` and `deliveries` schemas first. Do **not** create a competing email queue. |
| `project_launch_checks` | Audit proof before marking live | Project/version, checklist key, result, staff actor, checkedAt, evidence link; manual vs automated. |
| `project_assignments` if multi-owner needed | Builder plus coordinator and QA ownership | Existing `assignedStaffId` may be sufficient for v1. Extend only after workflow roles are agreed. |
| service-cycle tasks | Reliable Social/SEO monthly workflow | Prefer existing `deliverables`, `monthly_reports`, and active add-on state; extend only where real gaps remain. |

**Atomicity:** Project stage change, immutable event and notification intent should commit together wherever critical and feasible; external email/webhook dispatch happens asynchronously and is safely retryable. Use idempotency keys and transactional guards. Don't fire an email before ensuring the new state persisted. Don't rerun the stage mutation merely to retry an email.

**Security:** Staff connection is privileged, so validate both projectId and businessId in write conditions where possible, with role permissions per command. Concurrency gates at the DB, not only disabled UI buttons. Preserve access logging for read/exports, legitimate tenant scoping for the platform, and attachment isolation. File thumbnails and screenshot fetches must resist SSRF, private host access, credential leakage, and public caching of staff/customer content.

**Date policy:** Use stored UTC instants; render Asia/Kolkata deliberately. First-preview SLA is governed by the actual service terms and existing `firstPreviewDueAfterKickoff`, not a hardcoded UI date. Distinguish a deadline/commitment from a staff estimate. After hold/revisions, deadline recalculation needs a documented policy, not arbitrary arithmetic.

---

## 7. UI system and components

Use existing console design contracts: `apps/admin/DESIGN.md`, `packages/shared/src/styles/theme.css`, `apps/admin/components/console/*`. No wholesale shell rewrite.

**New reusable pieces (names illustrative):** `StaffNextAction`, `ProjectStageHeader`, `ProjectTimeline`, `StageActionPanel`, `ProjectBlocker`, `OwnerAssignment`, `CustomerViewPreview`, `ActionImpactPreview`, `KickoffOutcomeForm`, `ProjectBriefSummary`, `PreviewReleaseForm`, `PreviewVersionHistory`, `RevisionFeedbackPanel`, `LaunchVerification`, `NotificationOutcome`, `OperationalEventFeed`, `ServiceWorkPanel`, `QueueFilters`, `EmptyWorkState`, `SafeFailureNotice`.

**All screens:** meaningful loading, empty, permission-denied, error, network/retry and conflict states. Keyboard + focus management; 390 and 1280px responsive verification. Tables can be dense; customer-visible previews must be readable. Preserve audit-sensitive labels and confirm irreversible/money actions with plain language, not generic “Confirm”. Do not use color alone to signal statuses.

**Action behavior:** Show CTA only when transition is allowed, with disabled-state reason when a prerequisite is absent. On click, show what changes in the database, what the customer will see, and whether a notification is sent. After success show new project status and notification outcome separately. On conflict (another staff member already acted), refresh state rather than performing a forced overwrite.

---

## 8. Risk register and unresolved product decisions

### High priority

**R1. Auto-ended kickoff interpreted as completed.** Code supports delayed auto-advance from booked call end, including absence of explicit staff outcome. Decide policy; migrate safely and monitor scheduled job.

**R2. Customer shows “Building” for project status `submitted`, while staff preview/launch controls are incorrectly hidden for kickoff-first projects based on `onboardingSubmittedAt`.** Change shared mapping and client-facing copy in lockstep so it only says “building” after actual staff start, if approved by product owner.

**R3. Launch can be recorded without technical verification.** Add required evidence/checks and explicit staff confirmation. Do not claim automated DNS/SSL validation exists when it does not.

**R4. Preview/launch committed before notification.** Surface pending/failed/missing-email outcomes, retry notifications without repeating stage change, reconcile orphaned records.

**R5. Existing customer compatibility.** Legacy onboarding and current kickoff-first customers coexist. No destructive backfills or silent status reassignment; use explicit migration categories and fixtures.

**R6. Server permissions.** Changes to shared project commands cross apps and privileged staff DB access. Test tenant isolation, staff roles and concurrency thoroughly.

### Product decisions to approve before building

1. Is a kickoff **officially completed only after staff confirmation**, or should elapsed scheduled time continue to auto-advance as an allowed business policy?
2. Should the customer Home use **“Preparing your website”** for `submitted`, and **“Building”** only after staff starts? Recommended **yes**.
3. Who must be assigned: builder only, or coordinator + builder + QA + launch owner? Recommended builder + one accountable owner for v1; avoid false names.
4. Are due dates **contractual SLAs** or **staff estimates**? Are weekend/holiday calculations and revised-preview deadlines defined? Existing code has a first-preview timing helper; do not change meaning without checking terms.
5. Must the client **approve each revised preview**? Recommended yes; existing model supports returning to preview.
6. Can staff override a customer-approval requirement? Recommended **no** without a tightly audited exceptional path.
7. Is website launch always manual or can verified deployment automation trigger it? Recommended manual approval initially with automated checks added as support.
8. Should customer-facing progress show detailed internal tasks? Recommended only validated milestones, not individual internal checkbox progress.
9. What happens if payment lapses mid-build? Do we hold, continue, or escalate? Contract-led decision.
10. What is the policy on included preview rounds versus ongoing website monthly edits? Clarify count semantics and exception handling before charging.
11. What exact Social/SEO monthly commitments should staff track, and what is permitted to be customer visible? Base on actual purchased plan configuration.
12. Who may edit customer-facing project notes and deadline changes? Define permission and audit policy.

---

## 9. Phased implementation plan and acceptance gates

### Immediate P0 repair before the UI project

- Verify and repair the readiness gate in `apps/admin/lib/client-next-step.ts` (legacy `onboardingSubmittedAt` null guard) so submitted/building/revisions and approved kickoff-first projects expose the proper next action. Database eligibility still governs each transition.
- Fix `apps/admin/app/(protected)/clients/[businessId]/project/page.tsx` so a legitimate kickoff-first `submitted`/`building` project is not mislabeled “Still filling in their setup”.
- Add regressions for legacy checklist submission and kickoff-first `onboardingSubmittedAt=null`; confirm `Send preview`, `Go live`, and both stages appear correctly.
- Validate with a staging customer and verify correct client Home status. Do not bypass stage preconditions or force a launch.

### Phase 0. Audit, baseline, signoff (NO code changes)

- Read root and nested `CLAUDE.md`, `AGENTS.md`, admin `DESIGN.md`, current migrations and app routes.
- Inventory all project transition actions, cron routes, webhooks, customer state renderers, notification services, admin queries, tests and actual environment dependencies.
- Verify available deployment checks, preview screenshots, DNS/hosting data, support integrations and production staging/test environment.
- Write one **canonical workflow diagram** and identify differences from existing behavior, especially auto-kickoff and `submitted` semantics.
- Write reversible DB migration plan and product decisions list; gain signoff.

**Exit:** verified source map, approved command matrix, no guessing, baseline tests/typecheck recorded.

### Phase 1. Shared lifecycle contract and safe event surface

- Introduce shared typed stage/next-action/customer-message selectors, backed by current DB enum; do not fork state logic in admin UI.
- Define transition preconditions, actor permissions, side effects and idempotency; wrap existing queries rather than replacing working code without need.
- Surface genuine project history and notification outcomes. Add only essential schema pieces with backward-compatible migrations.
- Add tests for every stage, conflicting actions, double-submit and no project/legacy account.

**Exit:** both apps agree on stage labels and transitions; no production-visible behavior changed until feature flag.

### Phase 2. Client Delivery workspace + website actions

- Build unified `/clients/[businessId]/project` with next-action panel, stage strip, brief, builder, due, proof, preview, revisions and launch sections.
- Reuse existing `WebsiteSection`, `ProjectControls`, `GoLivePanel`, `SendPreviewForm` actions behind a clearer flow; retire redundant visual layers only when new equivalents pass tests.
- Add guarded launch checklist and notification outcome display; stage transitions cannot be bypassed.

**Exit:** staff can walk one test customer from kickoff-ready to live with one authoritative project and accurate customer Home states.

### Phase 3. Calls outcome and handoff (careful migration)

- Replace generic “call ended” interpretation with explicit outcome where approved; reconcile scheduled sync and staff manual completion.
- Add kickoff recap/handoff and no-show/reschedule UX, call action links to Delivery.
- Preserve existing historical `heldAt` records and handle already auto-advanced clients.

**Exit:** no double-start, no false completed call, no regressions to Cal.com webhook/cancellation behavior.

### Phase 4. Projects board + Today + Clients

- Split board stages and add owner/SLA/blocker/notification signals; improve responsive list.
- Unify queue priorities; failed data loads must show a visible error, not “0 items”.
- Improve client directory and summary; remove legacy setup checklist as default after kickoff-first conversion.

**Exit:** a staff member can find overdue/blocked projects and their next step in under 2 clicks.

### Phase 5. Preview conversations and customer attention

- Link preview feedback ticket to project/version where possible; show request thread alongside status and stage.
- Add explicit context-specific customer information requests only when needed; do not add a generic permanent To do workflow.
- Add notification retries via existing delivery infrastructure if possible.

**Exit:** feedback does not consume monthly maintenance edits; all replies and project states reconcile correctly.

### Phase 6. Service operations and ongoing clients

- Reorganize Services for Social/SEO/OyeChats using real deliverables and reports; show genuine monthly activity and ownership.
- Add ongoing client service snapshot without fabricated uptime/rankings or staff actions.
- Audit live website, domain and support workflows for data consistency.

**Exit:** service-only and bundled customers have coherent staff workspaces; no phantom Website project.

### Phase 7. Finance / system UX consistency

- Apply shared layout, clearer labels, filters and error state patterns to Payments, Invoices, Coupons, Pricing, Affiliates, Ad credit, Deliveries, Errors, Staff, Settings and Compliance **without changing financial formulas or permissions**.
- Add operational alerts for actual failed notifications and webhook problems.

**Exit:** money actions still require verified privileges/confirmations; audit logs and exports are intact.

### Phase 8. QA, rollout and legacy cleanup

- Automated unit/integration tests across db/shared/admin/platform, full build/typecheck/lint, E2E for end-to-end website lifecycle.
- Mobile/tablet/desktop, keyboard and accessibility checks; screens at 390px and 1280px; dark-rail focus and responsive tables.
- Dry-run migrations on a safe database snapshot, production backups, monitoring and feature flags.
- Test legacy onboarding/legacy call/paused/revisions/live records and all service combinations.
- Deploy behind cohort/feature flag, observe state divergences, customer notifications, errors and support volumes; rollback without losing new events.

**Exit:** all acceptance scenarios pass and production data integrity verified.

---

## 10. Nonnegotiable test scenarios

1. Website-only new customer, kickoff booked then staff confirmed (with **`onboardingSubmittedAt=null`** after kickoff-first handoff): `onboarding → submitted → building → preview → approved → live`, client UI correct after each step.
2. Website plus Social/SEO bundle: one kickoff; website workflow plus distinct service work, no duplicate questionnaires or projects.
3. Social-only purchase: no Website project controls or forced preview/launch stages.
4. Call scheduled but customer no-shows: no false “kickoff completed” or silent website start under chosen policy.
5. Call manually completed while auto-sync worker concurrently runs: only one project transition/event, no duplicate notification.
6. `submitted` but staff not started: accurate customer message, no claim of building, next staff CTA visible.
7. Builder assignment changed during active work: audit and ownership update; no status reset.
8. Preview URL invalid or unreachable: safe refusal and useful error; screenshot failure handled without false statement.
9. Preview DB move succeeded but email fails: status stays `preview`, delivery failure visible and retryable without re-sending stage move.
10. Customer submits feedback: `revisions`, linked ticket visible, normal maintenance count unchanged.
11. Customer approves first/revised preview: `approved`, no staff auto-approval, launch controls appear.
12. Staff attempts premature live transition: blocked unless all required policy/verification conditions satisfied.
13. Project paused during preview/revisions and resumed: original intended stage preserved and customer reason accurate.
14. Two staff attempt same action concurrently: one succeeds, one sees conflict and refreshed state.
15. Prior live website: ongoing service UI, no open build, no legacy setup pressure.
16. Legacy customer with partially completed old onboarding: safe rendering and explicit eligibility/handoff.
17. Payment failure mid-project: project and billing states handled separately per approved policy.
18. Staff support vs finance vs admin: correct visibility/action permissions; unauthorized direct-route/action access rejected.
19. Staff opens another business by a tampered projectId: server rejects cross-business mutation.
20. Staff customer-data read/attachment export: access log and data protection controls enforced.
21. System alert query fails: admin does not display “all clear” or zero unresolved work.
22. Different timezones and DST-unrelated India times: due dates consistent; no misleading countdown.
23. Customer lacks email: preview/launch remains visible in portal, staff explicitly sees “No email recipient”.
24. Failed outbox job: safe retries and no duplicate external communication on idempotent requests.
25. End-to-end screenshot: staff sees what the client's Home actually says at each stage.

---

## 11. File-level work map (grounded path inventory)

**Read first, likely modify (verified exists):**

- `apps/admin/app/(protected)/page.tsx`, `apps/admin/lib/server/today.ts`, `apps/admin/lib/pipeline.ts`.
- `apps/admin/app/(protected)/projects/page.tsx`, `apps/admin/lib/project-board.ts`.
- `apps/admin/app/(protected)/calls/page.tsx`, `apps/admin/app/(protected)/calls/kickoff-wrap-up.tsx`, `apps/admin/app/(protected)/calls/kickoff-actions.ts`, `apps/admin/lib/server/kickoff-complete.ts`.
- `apps/admin/app/(protected)/clients/[businessId]/layout.tsx`, `page.tsx`, `project/page.tsx`, `website/page.tsx`, `services/page.tsx`, `requests/page.tsx`, `activity/page.tsx`, `billing/page.tsx`, `people/page.tsx`.
- `apps/admin/app/(protected)/clients/[businessId]/project/actions.ts`, `apps/admin/app/(protected)/clients/[businessId]/website-actions.ts`, `apps/admin/app/(protected)/clients/[businessId]/parts.tsx`.
- `apps/admin/components/project-controls.tsx`, `apps/admin/components/console/website-section.tsx`, `apps/admin/components/console/kickoff-call-section.tsx`, `apps/admin/components/console/work-section.tsx`, `apps/admin/lib/client-next-step.ts`, `apps/admin/lib/client-tabs.ts`, `apps/admin/lib/console-rail.ts`.
- `apps/admin/lib/server/project-preview.ts`, `project-launch.ts`, `website-moves.ts`, `activity.ts`, `staff-access.ts`, `staff-access-log.ts`.
- `apps/admin/app/(protected)/support/[ticketId]/page.tsx`, `apps/admin/app/(protected)/support/page.tsx`, `apps/admin/app/(protected)/deliveries/page.tsx`.
- `packages/db/src/schema/projects.ts`, `project-events.ts`, `support.ts`, `deliverables.ts`, `client-intakes.ts` (verify actual filename; listed `client-intakes.ts`), `emails.ts`, `deliveries.ts`; corresponding queries in `packages/db/src/queries/`.
- `packages/db/src/queries/projects.ts`, `project-website.ts`, `project-moves.ts`, `kickoff-build.ts`, `project-staff.ts`, `setup-calls.ts`.
- `apps/platform/lib/server/kickoff-sync.ts`, `apps/platform/app/api/internal/start-builds-after-kickoff/route.ts`, `apps/platform/app/app-host/(protected)/website/actions.ts`, `apps/platform/lib/server/project-response.ts`, `apps/platform/lib/server/website.ts`, `apps/platform/lib/server/overview.ts`, `apps/platform/app/app-host/(protected)/page.tsx`, `apps/platform/lib/home/state.ts`.
- Design/security requirements: root `CLAUDE.md`; `apps/admin/CLAUDE.md`, `apps/admin/AGENTS.md`, `apps/admin/DESIGN.md`, `apps/platform/DESIGN.md`, `packages/shared/src/styles/theme.css`.

**New source paths:** choose after reviewing module conventions; do not create a second independent project state machine in a random admin component. **Potential new shared services**: `packages/shared/src/lib/project-workflow/*` for pure state projections, and `packages/db/src/queries/*` for validated commands/joins; actual paths to be decided after Phase 0.

**Do not delete immediately:** legacy project forms, old onboarding routes, old admin notice redirects, Cal.com hooks, project event/history or delivery tables. Preserve compatibility until migrated and tested.

---

## 12. Claude Code implementation directive (copy as first prompt)

> You are working from the BrandBasket monorepo root. Read root/nested `CLAUDE.md`/`AGENTS.md`, `apps/admin/DESIGN.md`, and this entire document. Inspect the actual current code, migration history, tests and UI before editing. This document is a **product implementation target**, not proof that a capability already exists. Produce a verified Phase 0 audit and list conflicts/open product decisions first. Do not code, create migrations or change the live site until I approve the audit. After approval, implement one phase at a time with real DB-safe state transitions, staff roles, access logs, tests and matching customer portal updates. Never fabricate client metrics, deployment verification, meeting URLs, staff assignments or notification success. Preserve the current shell/design tokens and existing billing/security architecture. For each phase, show the exact files changed, migrations, safety/rollback plan, tests and screenshots, and stop for approval before the next phase.

### Source limitations and validation requirement

This review used an uploaded ZIP. It did not inspect a signed-in production admin console, access a production database, run the full test suite or verify deployment schedules. Some admin design documentation references files under `docs/plans` that may not be present in this ZIP. Claude Code must **verify the live working tree** before implementation and report any differences. New interfaces, checklist fields, notifications and staff role capabilities described here are **proposals**, not assertions that they already exist.
