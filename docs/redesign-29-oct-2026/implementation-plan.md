# Client portal revamp: audit and implementation plan

Date: 29 October 2026. Status: for the owner's approval. No code has been changed.

## 0. Decisions after the owner's review (29 October, second pass)

These override the sections below where they differ.

**New design language.** The old customer design system is dropped: the warm paper palette, the dark rail, "one raised surface per screen" and the hairline-only rule. The portal gets a new light SaaS language. It is defined on the design canvas (https://claude.ai/artifact/Mw3CRSTGpNZWpKwFWC8tCF):
- Cool neutrals: bg #F6F7F9, surface #FFFFFF, line #E3E6EB, ink #111418, ink-2 #4A5260.
- One brand accent: rattan #C48A47, with rattan-ink #9A6428 for text and focus.
- Status colours appear only with a word.
- The Red Hat family: Display for headings, Text for body, Mono for money and dates. Body text is 16px, small text 15px and labels 13px. Every button is at least 44px tall. (Owner's choice, 29 October.)
- Radii: 14px cards, 10px controls, round pills.
- A white 248px sidebar instead of the dark rail.
- A bottom tab bar on phones.

The logo, rattan and Red Hat stay from the brand. The console keeps its look until the owner asks. This supersedes C16, D1 and the spec's "keep the dark shell".

**Kickoff without "Mark call held" (replaces C8 and D3).** No staff click is needed after a normal call.
- A booked kickoff counts as done once its end time passes. Home moves on at that moment.
- A Website project then moves from `onboarding` to `submitted` on its own, with the first preview due at the call's end plus 48 hours. This is done by an idempotent function, run hourly by a timer (the same pattern as the site-hosting sync) for calls that ended at least 2 hours ago. Cal.com's Meeting Ended webhook can run it sooner where available.
- Staff only handle exceptions:
  - "Did not happen" clears the booking, so the customer sees "Pick a new time" and gets an email.
  - "Log a call held by phone" covers calls with no booking. It uses the existing `held_at`.
- Cal.com's Booking No-show Updated webhook can feed "Did not happen" later.
- Call notes no longer require `held_at`. The `setup_call_bookings_summary_check` is relaxed to "held or has an end time" (one migration).
- The console gets a Kickoffs view: Just finished (write notes, did not happen), Coming up (sign-up answers) and Setup still needed.

**Business details are customer-editable (D4: yes).** Name, phone, email, address, areas and the Google listing are edited directly, reusing `saveBusinessProfile` outside the onboarding lock. Staff copy contact changes to the site and listings; hours, holidays and the announcement already reach the site through `/api/site/info`.

**Social and SEO setup (D5, my call).**
1. The sign-up questions ask only light choices: channels and where to be found.
2. Everything else is collected on the kickoff call. Staff fill it in from the console ("Fill in"), into the same `service_setup.answers`. This needs a staff writer; there is no new table.
3. Anything still missing 24 hours after the call becomes one "We need one thing from you" card, on Home and on the service page. The form sits in the card. Cards come one at a time, the most blocking first, and never as a list or a count.
4. Admin access gets "Show me how" plus "I have done it". Staff confirm with "We have it", and that closes the card.
5. "What to promote this month" leaves setup. Each month we propose posts for approval instead.

**OyeChats (D2, my call).** It becomes the Website > Enquiries tab, together with website call, WhatsApp and form counts. The section is named "Website chat", with "Powered by OyeChats" underneath. The product is not renamed; the navigation names the job.

**Refinements from the Codex (ChatGPT) review, adopted:**
- Saving kickoff notes completes the kickoff at once. The 2-hour automatic start stays as the fallback, so no step is required.
- The staff "Setup still needed" panel shows each item as Missing, Submitted, Verified or Needs correction. Each item says whether it blocks delivery and links its Request.
- Setup forms warn if someone types what looks like a password.
- A business contact change shows as "We are updating your website and listings" until staff confirm it. Hours, holidays and the announcement are live straight away.
- D6, the overdue preview: say "We need a little more time. We will confirm your new preview date today." Alert staff, and require a new date. The plan used to hide the date; this replaces that.
- Home keeps its many backend states, but each one draws one of only four layouts: Kickoff, In progress, Review, Ongoing.

**Codex disagreed:**
- Codex would keep Red Hat and a 16px body size. The owner agreed on 29 October, and the canvas now uses them.
- Codex would ask the sign-up questions after payment to protect conversion. The spec and the onboarding reference put them before checkout; the canvas keeps them there with "Skip for now".

**Still open:** D7 (the Pages list), D8 (a launch date column), D9 (live customer count), and the owner's yes on all new copy.

Inputs: `brandbasket-client-portal-revamp-implementation-spec.md` (the spec), the two HTML references in this folder, and the repository at `origin/development` (90c4443). The local `development` checkout is two commits behind (it lacks the Affiliate rail link from PR #68); Phase 0 syncs it.

Paths: `P/` is `apps/platform`, `PR/` is `apps/platform/app/app-host/(protected)`, `A/` is `apps/admin`, `DB/` is `packages/db/src`, `SH/` is `packages/shared/src`, `M/` is `packages/db/migrations`.

---

## 1. Executive summary

The spec is accurate about most of the backend. The repository already holds nearly everything the new portal needs: the project state machine with a trigger-written event history, preview images, Cal.com booking with reschedule, an `.ics` download, a support system with `waiting_on_you`, public and internal messages, attachments and read state, change requests with quotes and an included-edit quota, activity lines, monthly snapshots, reports, deliverables, site contact events and OyeChats leads.

The redesign is therefore mostly presentation, state derivation and a few honest gaps. Four backend changes are actually required:

1. A `client_intakes` table for the adaptive questionnaire.
2. A staff "kickoff held" step that moves a Managed Website project from `onboarding` to `submitted`. Nothing does this today: once the checklist is gone, no project would ever leave `onboarding`.
3. A plain-ticket path for customer questions. Today every customer request creates a `change_request` row.
4. Separating build-phase preview feedback from the monthly included-edit quota.

Optional: a nullable `meeting_url` on `setup_call_bookings` (needed only for a Join button).

Seven spec statements do not match the code. The most important:

- First payment for new sign-ups already skips legacy onboarding (`P/lib/server/payment-confirmation.ts:343`). The spec's "compatibility branch" (8.3) is not needed.
- "Add to calendar" already exists (`SH/lib/call-slots.ts:35`).
- Removing OyeChats, Calls, Authors and Categories from the rail in Phase 1, as the spec says, would leave those pages unreachable. Each needs a new entry point in the same phase.
- In the new flow nobody writes the business contact facts (`business_profiles`). Only the onboarding Business step writes them, and the client website API does not serve them.

Recommended Phase 1: the rail, the active-services loader that frees the shell from To do, the renames, Plan and billing grouping, entry points for every page leaving the rail, and the shared v2 primitives. No schema change and no route removed.

---

## 2. Current architecture (verified)

### 2.1 Shell and routing

- `P/proxy.ts` rewrites by host into `P/app/app-host/`. Every response is `noindex`.
- `PR/layout.tsx:20` guards with `requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" })`. An account awaiting its first payment gets `MembershipGateShell` (no dashboard, `PR/layout.tsx:24`). The billing banner renders on every page except `/` (`PR/layout.tsx:25-33`, `HiddenOnPaths`).
- `P/components/v2/app-shell.tsx` builds the rail:
  - `loadTodo(tenant)` (`P/lib/server/todo.ts:29`, React `cache`) supplies `todoCount` and also `hasSocial` / `hasSearch` (lines 36-58).
  - `loadRequestNeeds` supplies the Requests badge.
  - `getProjectOverview` and `getLiveWebsite` supply `websiteSetupDone`.
- `P/lib/rail.ts` `railSections()`:
  - First group: Overview, To do and Requests (Calls under Requests).
  - Services: Website (Authors and Categories under it), OyeChats, Social & Ads, Search.
  - Account: Business profile, Your plan, Billing, Affiliate (on `origin/development` only) and Settings.
  - Search and the phone menu index the same structure (`railTargets`, `searchRail`).
- Primitives already exist in `P/components/v2/page.tsx`: `PageHeader`, `PageFrame`, `PageColumns`, `EmptyState`, `PageSection`, `FactRows` and `ActionRow`. `P/components/v2/classes.ts` holds `DARK_BUTTON`, `SOFT_BUTTON`, `SERVICE_DOT` and `PAGE_MAX`.
- `P/DESIGN.md` rules that the spec touches: "One raised surface per screen" (Surfaces 2), "Not allowed: more than one raised surface", and no modals for confirmation.

### 2.2 Access guards (`P/lib/server/customer-access.ts`, `P/lib/server/billing.ts`)

| Guard | What it does |
|---|---|
| `requireCustomerAccess(opts)` `:105` | Returns `{ user, tenant, billing }`. Does not redirect unpaid or lapsed accounts. |
| `requireWebsiteClient()` `:122` | Sends a paid account without Managed Website to `/`. Unpaid accounts pass. |
| `requireBillingAccess()` `billing.ts:68` | Throws `BillingRequiredError` when unpaid. Used by actions. |
| `requireWebsiteAccess()` `billing.ts:75` | Billing plus Managed Website. `paidCustomerOrNull` (`P/lib/server/blog-access.ts:13`) wraps it for the content and details actions. |

`CustomerBilling` (`SH/lib/billing/status.ts:14`) has `status` (unpaid, paid or lapsed), `hasAccess`, `hasWebsite`, `subscription`, `paymentUnderReview` and `renewalFailingUntil`. There is no grace period for the plan (`packages/billing/src/access.ts:11`). Add-ons have 7 days (`SH/lib/billing/add-ons.ts:17`).

### 2.3 Sign-up, checkout and first payment

1. The marketing site links to `/login?new=1&plan=website,growth,search` (`P/lib/account-entry.ts:28-36`). The basket travels in a hidden `services` field (`P/components/panel/join-form.tsx:288`).
2. `joinForListing` (`P/app/app-host/login/actions.ts:34`) sends an email code, then creates the account (`P/lib/server/listing-account.ts`, with a lead via `recordLeadForSignup`). The account is a business of kind `listing` until it pays. It then redirects to `/plan?services=...` (`actions.ts:76-80`, `membershipHrefWithServices` at `P/lib/membership.ts:34`).
3. `/plan` renders `MembershipPage` (`P/components/panel/membership/membership-page.tsx:55`):
   - It is also a service picker: chips and `toggle()` in `checkout-ledger.tsx:96-185`, URL rewritten with `history.replaceState`.
   - It holds an optional referral code (`:227-241`) and INR billing details (`checkout-billing.tsx`, required for rupee checkout by `billingDetailsMissing`).
   - The server re-reads the basket with `readBundleSelection` (`SH/lib/billing/bundle.ts:30`) and prices it in `startMembershipCheckoutFor` (`P/lib/server/checkout.ts:290`).
4. First payment: `activateFirstPayment` (`SH/server/billing-activation.ts:91-145`) runs in one staff transaction. It records the payment, activates the bundled lines and settles discounts and affiliate earnings. Then `openMembershipForListingBusiness` (`DB/queries/directory-ads.ts:789`) sets `kind = website` and inserts an `onboarding` project only when Managed Website is in the basket. Finally it issues the tax invoice.
5. `confirmFirstPayment` (`payment-confirmation.ts:246`) is used by the fake provider. The Razorpay webhook calls `activateFirstPayment` directly (`P/lib/server/razorpay-webhook-handler.ts:331`).
   - For a membership opening, confirmation returns early (`payment-confirmation.ts:343`) and never calls `sendOnboardingWithin`.
   - Only legacy setup-link website clients still auto-submit onboarding after payment.
6. Landing: `/?welcome=1` (`P/lib/billing/confirm-href.ts:19`, `P/lib/celebration.ts:13`).

### 2.4 Onboarding (legacy checklist)

- Steps are business, content, brand, domain and review (`SH/lib/onboarding/steps.ts:10-16`). Progress is kept in `onboarding_progress` (`DB/schema/projects.ts:83`).
- What each step writes:
  - Business: `business_profiles` and `business_hours`.
  - Content: `services` and `project_briefs` (notes, style likes, reference URLs).
  - Brand: `media_assets`, through `/api/uploads`.
  - Domain: `domains`.
- Submit runs `submitProject` (`DB/queries/projects.ts:117-132`). It moves `onboarding` to `submitted` and sets `onboarding_submitted_at` and `sla_due_at = now + 48h`. It is gated by `SH/lib/onboarding/checklist.ts:27-68`: name, phone or email, at least one service, a logo or photo, alt text, and a confirmed domain.
- The trigger `projects_guard_customer_transition` (`M/0132`) lets the customer role make only that one move.
- Booking the kickoff does not depend on onboarding.

### 2.5 Kickoff

- State: `P/lib/server/setup-call.ts`. `SetupCallBookingView` (`:22-31`) has `bookedAtIso`, `startsAtIso`, `endsAtIso`, `heldAtIso` and `summary`.
- Slots: `loadSetupCallSlots` (`:76`) calls `listCallSlots` (Cal.com `/v2/slots`, 28-day window).
- Booking: `bookSetupCall` (`:95`). Reschedule books the new time, then cancels the old future booking (`:107-127`). `KickoffPicker` and `SlotPicker` are the UI, with actions in `PR/setup-call-actions.ts`.
- Table `setup_call_bookings` (`DB/schema/projects.ts:111-150`) has one row per business: `invitee_uri` (`https://api.cal.com/v2/bookings/<uid>`), `starts_at`, `ends_at`, `held_at`, `held_by_staff_id` and `summary`.
- The Cal.com response's `meetingUrl` is parsed (`P/lib/server/call-scheduling.ts:184`) but only passed to the Teams alert. It is not stored.
- Webhook (`P/lib/server/calcom-webhook.ts:126`): created, cancelled and rescheduled events. It handles no no-show event.
- Add to calendar exists: `callInviteHref` (`SH/lib/call-slots.ts:35`), used in `P/components/first-look/booked-line.tsx:30`.
- Staff "held": `markCallHeldAction` (`A/app/(protected)/clients/[businessId]/kickoff-actions.ts:26`) calls `markSetupCallHeld` (`DB/queries/setup-calls.ts:78`). It does not touch `projects`.

### 2.6 Home today (`PR/page.tsx`)

- Unpaid accounts get `UnpaidHome`.
- Paid accounts get first look or the month view:
  - First look: `PaymentWelcome` and `WelcomeOverview`, which shows the kickoff picker, the booked line and the ready list.
  - Month view: `MonthOverview`, fed by `loadOverview` (`P/lib/server/overview.ts:69`): To do items, request needs, included edits, result lines, activity, next payment and next call.
- `inFirstLook` (`P/lib/first-look.ts:67`) is true while the account is paid, the site is neither live nor sent, the call has not been held, and the call either has no end time or ended less than 2 days ago.
- `nextStep` (`SH/lib/next-step.ts`) and `projectStageIndex` (`P/lib/project-stages.ts`) map project status to the card and stage. Both still treat `onboarding` as "set up your website".
- Going live closes the open project, so `getProjectOverview().project` is null after launch. `getLiveWebsite` then carries the live state (`PR/page.tsx:36-39`).

### 2.7 To do

- `buildTodo` over `READY_ITEMS` (`P/lib/ready-items.ts:18-26`) produces:
  - Website: three link items to the onboarding steps for brand, services and domain.
  - Social: three form items for accounts, offers and budget.
  - Search: one form item, areas.
- The forms save to `service_setup.answers` (jsonb, `DB/schema/client-activity.ts:21`) through `saveSetupItemAction` (`PR/todo/actions.ts:35`). That is the table's only writer.
- `loadTodo` callers: the shell, Home (first look), `/todo`, `P/lib/server/search.ts:40` and `P/lib/server/overview.ts:71`.
- Links to `/todo`: `ready-list.tsx`, `month-overview.tsx`, `search-view.tsx`, `lib/todo.ts` (`todoItemHref`) and the rail.

### 2.8 Requests

- List and detail: `/requests` and `/requests?open=<uuid>` (`PR/requests/page.tsx:27-61`). The grouping is Open and Done (`P/lib/requests/rows.ts:52`). The lede shows "This month: U of N included edits used" (`rows.ts:81`).
- New request:
  - The first question is "What is it about?", answered from `kindOptions` (`P/lib/requests/form.ts:29`): Website, Social & Ads, Search (if bought), Billing, Something else.
  - The action is `askForChangeAction` (`PR/requests/actions.ts:32`), which always passes `changeRequest`.
  - The DB layer allows a ticket without one: `DB/queries/support.ts:80,98-122`.
- Change requests (`M/0190`, `DB/change-states.ts`):
  - States: requested, quoted, in progress, preview, revisions, approved, shipped, declined, withdrawn.
  - Coverage: undecided, included, free or paid.
  - Quote acceptance opens a `change_hours` charge.
  - Customer moves go through the SQL door `change_request_customer_move`.
- Included edits: 2 a month for Managed Website (`SH/lib/change-requests.ts:13`). `countIncludedEdits` (`DB/queries/change-requests.ts:230`) counts rows that staff set to `included`.
- Rail badge: `listRequestNeeds` counts change requests that are quoted or in preview (`DB/queries/change-requests.ts:258`). It does not include `waiting_on_you` tickets or unread replies. Unread replies feed the account bell only (`P/lib/server/account-panel.ts:32`).
- Customer status words (`SH/lib/change-requests.ts:60-70`):
  - `waiting_on_you` shows as "In progress", so the customer is never told they are being waited on.
  - Staff-opened tickets (`A/lib/server/staff-opened-request.ts:23`) have no change request and show as "Question".
- Staff can set `waiting_on_you` (`DB/queries/support-staff.ts:126`) and post internal notes. The customer role reads only public messages (`M/0127:192`).
- Attachments: images only (PNG, JPEG or WebP), at most 3 files of 4 MiB, re-encoded to WebP (`P/lib/server/support-uploads.ts`). Files are stored in R2 or on local disk. They are served through `/support-attachments/<id>` after an ownership check and only for public messages (`DB/queries/support.ts:220`).

### 2.9 Website

- `/website` uses `loadWebsite` (`P/lib/server/website.ts:50`) and `P/lib/website/progress-view.ts:35-61`.
  - States: none, onboarding ("Finish your setup" plus "Carry on setting up"), building, on hold (with the stored reason), preview, revisions, approved and live.
  - Timeline (`P/lib/website/timeline.ts`) combines project status, `onboardingSubmittedAt`, `slaDueAt`, `previewSentAt`, `launchedAt`, `project_events` and the kickoff time.
- Tabs: Progress, Pages and Blog (`P/lib/website/tabs.ts:13`). Pages is a static list (`P/lib/website/pages-map.ts:18`, whose comment says "assumed, confirm before this ships").
- Preview:
  - Staff send it with `sendPreviewAction`. A screenshot goes into `project_preview_images` (bytea) and is shown only when the image URL matches `previewUrl`.
  - Customer actions: `approvePreviewAction` and `askForChangesAction` (`PR/website/actions.ts:26,32`).
  - The latter calls `requestProjectRevisions`, which sets `revisions` and adds 1 to `revision_rounds_granted`, then opens `/requests/new?kind=website&page=Preview`. Submitting that form creates a website change request with coverage `undecided`, which staff could mark `included`.
- Domain: `/domain` with a full state machine (`P/lib/domain-page.ts:38`) and a DNS check. There is no SSL, uptime or health source; monitoring was retired (`PR/monitoring/page.tsx`). `website_hosting` is staff-only.
- Staff moves (`A/lib/server/website-moves.ts`, `project-preview.ts`, `project-launch.ts`):
  - Start building moves the project from submitted to building.
  - Send preview, put on hold (reason shown verbatim), resume and mark live.
  - Each move writes a customer-visible `activity_events` line.

### 2.10 OyeChats

- `/oyechats` is the only real page. `leads` and `name` redirect to it.
- What the customer gets:
  - Lead figures and a leads table (10 a page).
  - A conversation pop-up, fetched live from OyeChats and not stored (`P/lib/server/chatbot-conversations.ts:46`).
  - Bot status.
  - One control: renaming the bot (`renameChatbotAction`).
- Bots are created only by staff (`A/app/(protected)/clients/[businessId]/actions.ts:628`).
- The page guard is `requireWebsiteClient`. The two actions use only `requireCustomerAccess`; data is still scoped by business.

### 2.11 Business (`/details`)

- Sections: announcement, holidays, opening hours, and "Everything else", which sends the customer to Requests.
- It uses `requireWebsiteClient`. Actions use `paidCustomerOrNull` and `holidayAccessOrNull` (`PR/details/actions.ts`).
- Changes reach the client site by pull: `/api/site/info` (60-second cache) serves hours, closures and the announcement only.
- `business_profiles` (phone, email, address, service areas) has no write path outside the locked onboarding step and is not served to client sites.

### 2.12 Plan, billing and settings

- `/services` ("Your plan") is one list in catalogue order:
  - Held lines are priced from the stored `bundled_add_ons` row (`bundledLinePrice`).
  - Unheld lines are priced with `packageLineWith`.
  - Add opens a pro-rated charge; remove takes effect at the next billing date (`P/lib/server/add-ons.ts`).
- `/billing`:
  - `PlanSummary` with the day bar ("N of M days", `P/components/panel/billing/plan-summary.tsx:58-78`).
  - Payment method: changing it means emailing support (`payment-method.tsx:28`).
  - Receipts and tax invoices (`/billing/receipts`), INR billing details, the renewal-failing card, and reactivate for a lapsed plan.
- `/settings`:
  - Name and sign-in contact (read-only, with "email us" to change).
  - A business block (read-only) and a password change. Revoking other sessions happens only as part of it, plus a retry button.
  - Privacy (data export, nominee), delete account and sign out.
  - No notification-preference schema exists.

### 2.13 Social and Search

- Both need `hasAccess` and redirect to `/services` if the service was not bought. Ownership comes from `listBoughtSetupServices` (`DB/queries/service-setup.ts:56`), which reads `bundled_add_ons` and the legacy `add_on_subscriptions`.
- Social (`P/lib/server/social.ts:37`):
  - Posts within a window, with approval through the `approve_deliverables` SQL function.
  - The month snapshot, the ads panel (null fields hidden; zeros are never invented) and the latest report.
- Search (`P/lib/server/search.ts:28`):
  - Title "Search". Uses deliverables (pages and listings), the snapshot and the report.
  - A "Waiting on you" list built from To do.
  - Null and zero are handled correctly ("No count yet").

### 2.14 Data that can show value (all real)

- `activity_events`: the customer "What we did" lines, by service.
- `business_activity`: rows with `visible_to_client`.
- `project_events`: written by a trigger.
- `site_events`: call, WhatsApp and form contacts.
- `chatbot_leads`, `deliverables`, `monthly_snapshots`, `monthly_reports`, and `report_documents` (customer sees `sent` only).
- Receipts and tax invoices.

### 2.15 Security facts that matter here

- RLS is applied with `withTenantScope` and `withUserScope` (`DB/scope.ts`), which set `app.user_id` and `app.business_id`. `app_current_business_id()` is defined in `M/0002`.
- Support tickets are scoped by `requester_user_id`, not by business (`M/0127:186`).
- `staff_members` is denied to `bb_app`. `users` has no RLS and is readable by `bb_app` (`DB/rls.integration.test.ts:175-198`), so any customer-facing staff name must come from a deliberate projection, never from a join.
- The coverage test `DB/rls.integration.test.ts:171` fails if a new table the app role can read lacks RLS.
- Account erasure must list every new business-linked table (`DB/queries/account-erasure.ts` and `account-erasure.integration.test.ts`).

---

## 3. Spec and implementation conflicts

Each conflict lists what the spec says, what the code does, the options, a recommendation and the risk.

**C1. First-payment onboarding submission (spec 8.3).**
- Spec: first payment calls `sendOnboardingWithin`; build a compatibility branch.
- Code: membership openings return before it (`payment-confirmation.ts:343`); the webhook never calls it.
- Recommendation: no branch. Add a regression test that a membership opening never submits onboarding.
- Risk: low.

**C2. Add to calendar (spec 21.2).**
- Spec: implies it must be built.
- Code: `callInviteHref` exists.
- Recommendation: reuse it. Add `LOCATION` when a meeting URL exists.
- Risk: none.

**C3. Phase 1 removes rail items before their new homes exist (spec 34, Phase 1).**
- Code:
  - OyeChats, Calls (`/requests/calls`) and Authors and Categories are reachable only from the rail.
  - The blog page does not link to authors or categories. `blog/settings` redirects to categories but nothing links to it.
- Options:
  - (a) Remove them anyway (pages become unreachable).
  - (b) Add entry points in the same phase.
- Recommendation: (b).
  - OyeChats becomes a Website tab "Inquiries" pointing at `/oyechats` until Phase 6 moves the route.
  - Requests gets a quiet "Book a call" link to `/requests/calls`.
  - Blog gets "Authors" and "Categories" links.
- Risk: medium if ignored.

**C4. `waiting_on_you` (spec 2.6, 19.2).**
- Spec: usable as is.
- Code: the status exists, but customers see "In progress" (`ticketStatusWord`). Staff-opened tickets read as "Question".
- Recommendation: add a customer word "Waiting for you" and an Open, Waiting for you and Done grouping. This is copy, so it needs the owner's yes.
- Risk: low.

**C5. Requests badge (spec 4.4).**
- Spec: count unread staff replies, `waiting_on_you` tickets and quote or review needs.
- Code: counts quoted and preview change requests only.
- Recommendation:
  - Badge = quoted + preview + `waiting_on_you`.
  - Unread replies stay on the bell and as the row's "New reply" tag. An unread reply alone does not mean action is needed, and counting it twice inflates the number.
- Risk: low.

**C6. Every customer request becomes a change request (spec 11.4).**
- Code: `askForChangeAction` always passes `changeRequest`. The DB layer already accepts a ticket without one.
- Recommendation: split by intent at the action. No schema change.
- Risk: low. Staff queues must show plain tickets, which they already do for staff-opened ones.

**C7. Preview feedback can consume the monthly quota (spec 12.2, 22.2).**
- Code: "Ask for changes" sets `revisions`, then opens the generic Ask form. That creates a website change request (undecided), and staff can mark it `included`.
- Options:
  - (a) Inline feedback on the Website preview that, in one action, moves the project to revisions and opens a plain support ticket (no change request) whose `details` carry `{ projectId, round }`.
  - (b) Keep the form but mark the change request `free` automatically.
- Recommendation: (a). Build feedback is project work, not a maintenance change, and staff already see plain tickets.
- Risk: medium. Staff must learn that preview feedback arrives as a plain ticket. Show a "Preview feedback" label in the console.

**C8. Project readiness after kickoff (spec 10).**
- Code: nothing moves `onboarding` to `submitted` except the customer checklist. Without a staff step, every new-flow website stays in "Finish your setup" forever.
- Agree with the spec: add `markProjectReadyAfterKickoff` in the same staff transaction as `markSetupCallHeld`, but only for Managed Website businesses whose project is in `onboarding`.
- Disagree on the clock: `sla_due_at = held_at + 48h` assumes staff have everything at the call. Brand assets may arrive later.
- Options:
  - (a) 48 hours after held.
  - (b) Staff enter the first-preview date when marking held, defaulting to 48 hours.
- Recommendation: (b). It is one date field on the existing console form.
- Undo held never reverts the project (the history is in `project_events`).
- Risk: medium. This is the owner's promise to the customer (decision D3).

**C9. `onboarding_submitted_at` readers (spec 10.2).**
- Code: read by `inFirstLook` (`setupSent`), the shell (`websiteSetupDone`), `projectStageIndex` (on hold), the website timeline and `nextStep`.
- Spec: optionally add `ready_for_build_at`.
- Recommendation: no new column. Derive "ready since" from the `project_events` row with status `submitted` (written by the trigger and backfilled in `M/0192`), falling back to `onboarding_submitted_at`. Leave the legacy column untouched for new-flow projects (null).
- Risk: low. One helper, unit-tested, used by all readers.

**C10. Business category list (spec 7.3, mock).**
- Mock: six categories.
- Code: `BUSINESS_TYPES` (`SH/lib/business-types.ts`), 13 slugs already used for leads and the console pipeline.
- Recommendation: reuse `BUSINESS_TYPES` as the category question, add a typed subtype map per slug in code, and write the category back to the signup lead (`leads.business_type`) so the staff pipeline gains it.
- Risk: low. The question list is longer than the mock's six, so it may need a two-column layout.

**C11. Intake `selected_services` (spec 7.4).**
- Code: the basket's authority is the checkout (`bundled_add_ons` after payment). A second "selected services" column invites drift.
- Recommendation: store `asked_for_services` (the basket the questions were asked for) and say so in the column comment. Never read it for billing or navigation. Use it only to restore the basket on `/personalize` and `/plan` when the URL lost it.
- Risk: low.

**C12. Two service pickers (spec 7.6, 8.2).**
- Code: `/plan` is a full picker today. The spec wants the intake summary to offer "Change services" too.
- Recommendation:
  - Move the toggle to the intake summary.
  - `/plan` shows the basket read-only with a quiet "Change services" link back to the summary.
  - The summary recomputes the visible questions, so a newly added service asks only its new questions.
- Risk: medium. It changes `checkout-ledger.tsx`, and the checkout tests must still prove server-side pricing.

**C13. Business page for every customer (spec 14).**
- Code:
  - Hours, closures and the announcement feed only the client website (`/api/site/info`), and their actions require Managed Website.
  - `business_profiles` has no live write path, and the site API does not serve contact facts. In the new flow the table stays empty unless someone fills it.
- Options:
  - (a) Business facts are read-only, with Request a change; staff fill them from the kickoff.
  - (b) The customer edits contact facts directly by reusing `saveBusinessProfile` outside the onboarding lock.
  - (c) Staff get a console editor and the customer sees read-only.
- Recommendation: (b) for name, phone, email, address and service area.
  - It is the customer's own data, the write path already exists and is RLS-safe, and it gives the page a reason to exist for Social and SEO clients.
  - Hours, closures and the announcement stay website-only.
- Risk: medium. Edits do not reach a live site's baked-in contact details, so the page must say "We update your website and listings from this" only if staff act on it (decision D4).

**C14. Brand assets (spec 14.1).**
- Code: support attachments accept images only and re-encode them to WebP, so SVG or PDF logos cannot be sent. `media_assets` with `/api/uploads` already handles logo and photos for onboarding.
- Recommendation: Business > Brand assets reuses the existing media uploader for logo and photos.
- Risk: low. It is the same upload route and RLS.

**C15. Social and Search setup answers (spec 17.2, 19).**
- Code: account access, offers, ad budget and search areas live in `service_setup` and are reachable only through To do.
- Options:
  - (a) Show an attention item "We need one thing from you" on Home and the service page until each answer exists, opening the same small form on the service page.
  - (b) Collect them at the kickoff and have staff ask through `waiting_on_you` tickets.
- Recommendation: (a), limited to items that block delivery (account access and ad budget). It reuses `saveSetupItemAction`, moved to the service route.
- Risk: low (decision D5).

**C16. `DESIGN.md` surface rule (spec 6.2).**
- The current owner-approved rules allow one raised surface per screen and no section cards. The refined mock and spec 6.2 loosen this.
- Recommendation: change `DESIGN.md` as the spec words it, but only with the owner's yes, because it reverses an approved design rule.
- Risk: low.

**C17. Named team card (mock, spec 20).**
- Mock: shows named staff.
- Code: no customer-safe staff projection exists. `users` is readable without RLS.
- Recommendation: "Your BrandBasket team" with no names, as the spec says. Any later projection should be a narrow view or SQL function with explicit columns.
- Risk: none.

**C18. Mock elements with no data.**
- These are not built: service health, "last checked today", SSL Active, Hosting Active, notification toggles, timezone, language, "Edit" beside the sign-in email, "Change" payment method, and Website size "Up to 10 pages" (no stored page allowance).
- Risk: none.

**C19. Missed kickoff and project delay.**
- Neither has data. There is no no-show event, and no "delayed" flag (only `sla_due_at` passing).
- Recommendation:
  - Kickoff passed and not held: after 48 hours, show "Pick a new time" with Reschedule.
  - Preview overdue: never show a past date. Say "Your first preview is on its way" and alert staff (Teams) instead.
- Risk: low (decision D6).

**C20. Reversal of plans 28 and 30.**
- To do and the first look were approved and built on 2026-10-26 to 27 (`docs/plans/28`, `30`). This spec removes To do. The prompt says so explicitly, so treat it as decided. The old plans should be marked superseded so future sessions do not rebuild them.

**C21. Revoke other sessions (spec 16.1).**
- Code: exists only as part of a password change, plus a retry button.
- Recommendation: add a standalone "Sign out other devices" button using the same Better Auth call. It is real and small.

**C22. OyeChats placement (prompt rule 14).**
- Evidence:
  - The customer can read leads and conversations and rename the bot.
  - Bots are created and configured by staff.
  - The leads are website enquiries, and Home already adds chatbot leads to website contacts (`overview.ts:57-66`).
- Recommendation: Website > Inquiries, combining `site_events` (call, WhatsApp, form) and chatbot leads, with the OyeChats name kept as the assistant's section heading.
- Note: commit 6f10859 gave OyeChats its own rail icon days ago. The owner may want the brand visible, so the rename keeps "OyeChats" on the page.

---

## 4. Route-by-route change matrix

| Current route | Decision | Why |
|---|---|---|
| `/` Overview | REDESIGN (label Home) | Rebuilt on `deriveClientHomeState`; first look and the month view become states of one page. |
| `/todo` | REMOVE FROM NAVIGATION (P1), then REDIRECT (P9) | Items move to contextual attention (C15). The page stays working until every link is migrated. |
| `/requests` | REDESIGN | Inbox with Open, Waiting for you and Done; included edits move into context. |
| `/requests?open=<id>` | REDESIGN | Conversation layout; change-request controls kept. |
| `/requests/new` | REPLACE (same URL) | Intent-first form; plain tickets for questions and information. |
| `/requests/calls` | REMOVE FROM NAVIGATION, KEEP | The only place to book later calls; linked from the Requests header (C3). |
| `/website` | REDESIGN (tab "Overview") | Lifecycle hero, preview review, live state; no "Finish your setup" for new-flow accounts. |
| `/website/pages` | KEEP, light REDESIGN | Static list stays; its "assumed" comment must be confirmed (D7). |
| `/website/preview-image` | KEEP | Route handler. |
| `/website/inquiries` | NEW (P6) | Site contacts plus OyeChats leads. |
| `/oyechats` | MERGE into Website, then REDIRECT to `/website/inquiries` (P9) | C22. Until then it is reached through the Website tab. |
| `/oyechats/leads`, `/oyechats/name` | REDIRECT (already redirects) | Point at `/website/inquiries` in P9. |
| `/content/blog` | KEEP as Website tab | Customers really write posts; there is a paid allowance. |
| `/content/authors`, `/content/categories` | REMOVE FROM NAVIGATION, KEEP | Linked from inside Blog (C3). |
| `/onboarding/*` | KEEP for legacy, hidden for new flow | Setup-link clients and accounts mid-checklist still use them; not linked for new-flow accounts. |
| `/domain` | KEEP | Real state machine; linked from Website Overview. |
| `/details` | REDESIGN (label Business) | Guard changes to customer access; website-only sections conditional (C13, C14). |
| `/services` | REDESIGN (Plan & billing, tab "Your services") | Owned services first, others second. |
| `/billing` | REDESIGN (Plan & billing, tab "Billing") | Next payment, payment method, invoices, details; the day bar goes. |
| `/plan` | REDESIGN (checkout only) | Basket read-only, service toggle moved to intake summary (C12). |
| `/personalize` | NEW (P2) | Adaptive intake between sign-up and checkout. |
| kickoff booking | REDESIGN inside Home | `KickoffPicker` stays; booked state gets countdown, Add to calendar and Reschedule. |
| `/social` | REDESIGN | Approvals first, then upcoming content, ads, report and activity; setup answers contextual. |
| `/search` | REDESIGN, rename to Local SEO + AEO | Keep URL; drop the To do dependency. |
| `/settings`, `/settings/privacy`, `/settings/delete` | REDESIGN (compact) | Same capabilities plus standalone sign-out-elsewhere. |
| `/changelog` | KEEP (unlinked today) | Out of scope; nothing links to it. |
| `/monitoring`, `/project` | KEEP redirects | Already compatibility redirects. |
| `/support`, `/support/[id]` | KEEP redirects | Old links. |
| `/affiliate/*` | KEEP | Rail entry for affiliate owners already exists on `origin/development`. |

---

## 5. Final information architecture

```
Home
Services            (section hidden when empty)
  Website           Managed Website active, or unpaid legacy setup-link client
    tabs: Overview | Pages | Inquiries | Blog
  Social & Ads      digital-growth owned
  Local SEO + AEO   local-seo-aeo owned
Manage
  Requests          badge: quoted + preview + waiting_on_you
  Business
Account
  Plan & billing    /services and /billing, one link, two tabs
  Affiliate         only for affiliate accounts
  Settings
```

Search indexes the visible links, the Website tabs, "New request", "Book a call" (when calls are open), Blog: Authors and Blog: Categories. "Ask for a change" becomes "New request".

Service ownership comes from one cached loader, `loadActiveServices(tenant)` in `P/lib/server/active-services.ts`. It is the existing `loadSetupServices` logic (`bundled_add_ons` website line plus `listBoughtSetupServices`) without `service_setup` or the project. It is used by the shell, Home, Requests intents, Business and the intake.

---

## 6. Home lifecycle state model

`deriveClientHomeState(facts): ClientHomeState` is a pure function in `P/lib/home/state.ts`, with unit tests for every branch. `loadHomeFacts(tenant, billing, now)` in `P/lib/server/home.ts` reads the facts once.

Precedence, top first: billing problem, then kickoff states, then the website project for website clients, then ongoing service. The attention module and the billing banner layer on top of any state.

| State | Authoritative condition | UI | Primary CTA | Secondary | Never show |
|---|---|---|---|---|---|
| `payment_required` | `billing.status === "unpaid"` (legacy setup-link) | Existing `UnpaidHome` | Pay or Finish setup (banner) | | Service progress |
| `payment_processing` | `billing.paymentUnderReview` | "We're confirming your payment" | none | | Kickoff picker |
| `lapsed` | `billing.status === "lapsed"` | Plan ended, site offline, content safe | Reactivate | Contact | Progress, metrics |
| `renewal_failing` (overlay) | `renewalFailingUntil !== null` | Banner on top of the underlying state | See Billing | | Alarm copy beyond the stored date |
| `kickoff_unbooked` | paid, no booking with a start time, not held | Welcome, service is active, what the call is for | Book your kickoff (picker) | Selected services | Checklist, upload asks |
| `kickoff_booked` | booking `starts_at > now`, not held | Date and time, countdown, What we'll cover, optional prep | Reschedule | Add to calendar; Join only if `meeting_url` and within 15 min of start | Seconds, negative values |
| `kickoff_awaiting_notes` | `ends_at < now`, not held, under 48 hours since | "Thanks for the call. Next steps appear here once we've written them up." | none | Requests | "Completed" claims |
| `kickoff_missed` | `ends_at` more than 48 hours ago, not held | "Let's find a new time" | Reschedule | | Blame |
| `building` | website, project `submitted` or `building` | Stage, first preview date if `sla_due_at` is in the future, activity | none ("Nothing needed from you right now") | Website | A past due date |
| `on_hold` | project `on_hold` | `on_hold_reason` verbatim | Open the linked Request if a `waiting_on_you` ticket exists | | Invented reasons |
| `preview_ready` | project `preview` | Thumbnail (if fresh), review explainer | Review your website (to Website) | Open preview | Monthly edit count |
| `revisions` | project `revisions` | "We're making your changes", round n of included | none | Website | New asks |
| `approved` | project `approved` | Approved, launch next, domain state from `domains` | Domain action only if the domain needs the customer | | SSL or hosting claims |
| `launched` (first visit) | live and launched within 7 days and not yet seen | Live hostname, still managed | Visit website | Request an update | Health badges |
| `live_ongoing` | live website, or a non-website service after kickoff held | This month: activity, enquiries, Social and SEO figures that exist, next payment as a small fact | New request | Service links | Zeros that were not measured |
| `cancelled` | project `cancelled`, or no owned service | Calm empty state | Contact | | Progress |

Notes:

- Social-only and SEO-only accounts go from `kickoff_*` straight to `live_ongoing` once the call is held.
- `launched` needs a "seen" marker. Use the `?welcome=launched` pattern from `P/lib/celebration.ts`. It is set once by the go-live email link and the first Home visit after `launchedAt`, held in a cookie. No schema is needed.
- Attention module (`P/lib/server/attention.ts`) returns `ClientAttentionItem[]` from:
  - Quoted and preview change requests (`listRequestNeeds`).
  - `waiting_on_you` tickets (a new query, `listWaitingTickets`).
  - Social posts awaiting approval (`loadWaitingPostCount`).
  - Missing blocking setup answers (C15).
  - Legacy accounts only: none. The legacy checklist is no longer asked for once Phase 4 ships.
- The rail badge and Home use the same loader.
- Countdown: `formatCountdown(msLeft)` in `P/lib/home/countdown.ts`. Over 24 hours it shows days ("in 2 days"); under 24 hours, "3 h 18 min"; under 60 minutes, "18 min"; then "Starting now". It is never negative and has no seconds. It is a client island refreshing every 30 seconds, `aria-live="off"`, with the absolute time as text.

---

## 7. Adaptive onboarding

### 7.1 Placement

1. `joinForListing` redirects to `/personalize?services=...` instead of `/plan?services=...` (`login/actions.ts:79`).
2. `/personalize` (new, `PR/personalize/page.tsx`) sits inside the protected layout, so the membership gate shell wraps it. That is the same posture as `/plan`: `requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" })`. Only businesses of kind `listing` (not yet paid) may use it; a paid account is redirected to `/`.
3. The summary's "Continue to checkout" links to `/plan?services=...`.
4. A returning unpaid account landing on `/plan` without an intake row is redirected to `/personalize` once.

### 7.2 Rules model (code, not page chains)

`P/lib/intake/questions.ts` holds a typed list of question definitions:

```ts
interface IntakeQuestion {
  key: IntakeField;                 // a column of client_intakes
  for: "common" | ServiceKey;       // website | social | search
  appliesWhen?: (a: IntakeAnswers) => boolean;   // e.g. subtype only after category; URL only when website_state != "none"
  options: (a: IntakeAnswers) => readonly IntakeOption[];  // subtype options depend on category
  multi?: boolean;                  // social_channels
  honest: IntakeOption;             // "Not sure yet" or "Let BrandBasket recommend/decide"
}
```

- `visibleQuestions(services, answers)` returns, in order, the common questions, then Website, then Social, then SEO. Each appears once, whatever the bundle. It drops a question whose `for` service is not in the basket or whose `appliesWhen` fails.
- `nextQuestion(services, answers)` is the first visible question that has not been answered.
- Validation: one zod schema built from the same definitions (`P/lib/intake/schema.ts`), so the options and the validation cannot drift.

Questions:

- Common: category (`BUSINESS_TYPES`), subtype (per category, plus "Something else"), main priority.
- Website: current website state, existing URL (only for "I have one"), primary visitor action, design direction.
- Social: channels (Instagram, Facebook, Google Business Profile, "Let BrandBasket recommend").
- SEO: visibility scope.

### 7.3 Persistence

- One row per business in `client_intakes` (section 8). `saveIntakeAnswerAction` auto-saves each answer:
  1. Takes `businessId` from `requireCustomerAccess`.
  2. Validates the field and value with the schema.
  3. Caps text and normalises the URL with the existing `safeExternalHref` or URL schema.
  4. Writes only the tenant's row under `withTenantScope`.
- Resume: the page opens at `nextQuestion`. Refresh and Back work because state lives in the row and the URL (`?q=<key>`).
- Skip: "Skip for now" goes straight to the summary. Unanswered fields stay null and the summary shows "We'll ask at your kickoff". `completed_at` is set when the customer presses Continue to checkout, answered or not, so a skip is recorded.
- Changed basket: the summary's service toggle writes `asked_for_services`, then `nextQuestion` returns any new service's questions before checkout. Answers for removed services are kept, which is harmless; they are not shown.

### 7.4 Reuse

- Console: client record, read-only "What they told us".
- The kickoff card ("What we'll cover"): service-specific lines only for answered fields.
- The signup lead's `business_type`.
- Staff kickoff prep.

The intake never drives billing, navigation or service access.

### 7.5 Existing users

- No intake row means no questions. Paid customers are never sent to `/personalize`.
- Accounts that signed up but never paid (kind `listing`, no row) get the intake on their next visit to `/plan`.
- The console shows "Not asked" for older accounts.

---

## 8. Database changes

| # | Table | Change | Reason | Null and default | Migration | Index | RLS | Compatibility |
|---|---|---|---|---|---|---|---|---|
| 1 | new `client_intakes` | `business_id uuid pk references businesses on delete cascade`; `schema_version int not null default 1`; `asked_for_services text[] not null default '{}'` (check: subset of the three ids); `business_type text`; `business_subtype text`; `primary_goal text`; `website_state text`; `existing_website_url text` (length at most 300, https); `primary_action text`; `design_direction text`; `social_channels text[] not null default '{}'`; `search_scope text`; `completed_at timestamptz`; `created_at`, `updated_at` | Intake answers (C10, C11) | All answer columns nullable | `0205_client_intakes.sql`: generated DDL plus hand-appended grants, policies and an `updated_at` trigger | PK only | `bb_app` select, insert, update where `business_id = app_current_business_id()`; `bb_staff` all; no delete for the app | New table; nothing reads it for billing. Add to account erasure (ERASED) and the RLS coverage test |
| 2 | `setup_call_bookings` | `meeting_url text` with a check that it is https and at most 500 characters | Join button (spec 21.2) | Nullable | `0206`: additive | none | Existing policies cover it; the app role does not need update rights (written by `recordSetupCallBooking` under the tenant scope, value from the provider only) | Old rows null, so there is no Join button |
| 3 | `projects` | none | C9: readiness comes from `project_events` | | | | | |
| 4 | `support_tickets` / `change_requests` | none | C6, C7: plain tickets already supported; preview feedback marker goes in `support_messages.details` jsonb (`SupportDetails` gains `projectRevision?: { projectId, round }` in TypeScript and its zod) | | | | | Older rows have no key |
| 5 | `service_setup` | none | Reused for Social and SEO setup answers (C15) | | | | | |
| 6 | `business_profiles` | none | Direct customer edit reuses `saveBusinessProfile`; check that the app role has update or insert grants outside onboarding (`M/0014`). If the grant ties to project status, add a narrow grant in `0207` | | | | | |

Integration tests:

- `client-intakes.integration.test.ts`: a tenant reads and writes its own row and cannot read or write another's. Unknown service ids are refused. Erasure deletes the row.
- A meeting URL check.
- A project readiness test (section 10).

---

## 9. Requests and communication model

| Need | Reuse | Change |
|---|---|---|
| Website update | ticket + change request `website` | none |
| Question | ticket only (`changeRequest` omitted) | new action branch; category `general` |
| Send information | ticket only, attachments | category `general`, intent stored in `details.intent` |
| Something isn't working | ticket only | category `bug` |
| Billing or plan | ticket only (no change request unless staff convert) | category `billing` |
| Social or SEO request | ticket + change request `social` / `search` | only when owned |
| BrandBasket replies | public staff messages, emails | none |
| Asked by BrandBasket | staff-opened ticket + `waiting_on_you` | customer word "Waiting for you"; attention item |
| Attachments | existing route and checks | none (images only; Brand assets go through media upload, C14) |
| Status | change states or ticket status | `ticketStatusWord` adds "Waiting for you" |
| History | thread, change events | none |

Also:

- `kindOptions` becomes `intentOptions(services)` in `P/lib/requests/form.ts`. The `?kind=` deep links (Pages tab, Social empty state, help link) map onto intents, so old links keep working.
- Included edits show only on the Website-update intent and in a website change request's detail, never in the page lede.

---

## 10. Website project experience

| Customer stage | Backend | Notes |
|---|---|---|
| Project received | `onboarding` + kickoff not held | Home kickoff states; Website Overview shows "We start after your kickoff". |
| Ready to build | `onboarding` to `submitted` at kickoff held (new `markProjectReadyAfterKickoff`) | `sla_due_at` from staff date (C8); trigger writes `project_events`. |
| Building | `submitted`, `building` | Staff "Start building" unchanged. |
| Preview ready | `preview` (`preview_url`, `preview_sent_at`, image) | Approve, Open preview, inline feedback. |
| Revision requested | `revisions`, `revision_rounds_granted` | Feedback is a plain ticket linked to the project (C7); round n of `revision_rounds_included` shown. |
| Approved | `approved` | Launch preparation; domain state from `domains`. |
| Launch | `approved` to `live` (`markLiveAction`) | `launched_at`, domain active, owner email. |
| Live | live website (`getLiveWebsite`) | Overview: hostname, Visit, Request update, domain state, recent website activity, enquiries. |
| Paused | `on_hold` + reason | Reason verbatim. |

`markProjectReadyAfterKickoff(tx, { businessId, staffId, firstPreviewDueAt })` lives in `DB/queries/project-staff.ts`:

- It updates only where `status = 'onboarding'` and the business has an active `managed-website` line.
- It is idempotent: a second call is a no-op.
- It leaves `onboarding_submitted_at` null.
- It is called inside `markCallHeldAction`'s transaction and logged as `project.ready_after_kickoff`.

Its integration tests cover:

- A website package moving to submitted with the SLA set.
- A Social-only package, which must stay untouched.
- A repeated click.
- A legacy project that is already submitted, which must stay unchanged.
- An undo of held, which must not revert the project.

Legacy accounts mid-checklist benefit from the same step: staff mark the call held and the build starts without the checklist.

---

## 11. Business section

Duplicates found:

- Phone: `business_profiles`, `billing_profiles`, `directory_business_profiles`, `directory_claims`, `leads`.
- Address and email: `business_profiles`, `billing_profiles`, directory tables.
- Website URL: `businesses`, `chatbots`, directory tables.
- Service area: `business_profiles.service_areas`, `service_setup.answers.areas`.
- Holidays: `business_closures` (structured) and `directory_business_profiles.holiday_hours` (text, dormant).

Canonical model:

- Public business facts: `business_profiles` (name shown to customers, phone, email, address, service area).
- `businesses.name` is the account name.
- Tax and invoice identity: `billing_profiles`. It stays separate on purpose because the legal name and GSTIN differ from the shop name.
- Hours: `business_hours`.
- Temporary closures: `business_closures`.
- Banner: `business_announcements`.
- Logo and photos: `media_assets`.
- References: `project_briefs.reference_urls`.
- Directory tables are dormant and excluded.
- `service_setup.areas` for SEO stays as a service answer. The Business page shows `service_areas` only.

Page sections, in order:

1. Business details (editable, C13).
2. Opening hours, Holidays and Announcement (website clients only, live preview kept).
3. Brand assets (logo, photos, references; upload through the media route, C14).

Guard: `requireCustomerAccess()` on the page, with `requireWebsiteAccess` kept on the website-only actions.

---

## 12. Plan and billing

Safe to redesign, because it is presentation only:

- Ordering.
- Grouping into tabs.
- Hiding the `PeriodBar`.
- Copy around the next payment.
- An "Other BrandBasket services" section that reuses `AvailableAddOn` rows.

Not touched:

- `bundledLinePrice` and `packageLineWith`.
- `addBundledAddOnFor` and `removeBundledAddOnFor`, with their rate limits and pro-rating.
- `renewalCharge`, `nextPaymentDate` and `paymentsContinue`.
- Receipts and the tax-invoice route.
- `saveBillingDetailsAction`.
- Reactivation.
- The payment-method email copy.

There is no Change payment method button. Billing regression tests stay as they are, plus one that `/services` shows the stored line price, not the catalogue price, for a grandfathered line.

---

## 13. System states

| State | Representation today | Plan |
|---|---|---|
| Payment failed (renewal) | `past_due` + `renewalFailingUntil`, banner `retrying` | Keep; Home overlay. |
| Past due, access ended | `lapsed`, banner `reactivate` | Home `lapsed` state. |
| Payment confirming | `paymentUnderReview`, `PaymentWaiting` | Home `payment_processing`. |
| Kickoff not booked | no `setup_call_bookings` start | `kickoff_unbooked`. |
| Missed meeting | not represented | `kickoff_missed` after 48 hours (C19). |
| Project delayed | `sla_due_at < now` only | Never show a past date; Teams alert to staff (D6). |
| Awaiting BrandBasket | change states, ticket new or in progress | Row status words. |
| Awaiting customer | quoted or preview change, `waiting_on_you` (hidden today) | Attention + "Waiting for you". |
| Preview ready, revision, approved, live | project status | Section 10. |
| Launch scheduled | not represented (no launch date column) | Not shown; "approved" says "We'll confirm your launch date" only if staff give one in a message. No new column unless the owner wants a date (D8). |
| Service paused | add-on `pausing` and `paused`; project `on_hold` | Plan & billing rows already show add-on states; project hold on Home. |
| Cancelled | add-on `ended`, subscription `cancelled`, project `cancelled` | Calm states; no progress. |

---

## 14. Security review

- Intake: the tenant comes from the session; values are validated by zod from the question config; URL and text are capped. RLS is on the new table, covered by the coverage test, and the table is in erasure. No staff-only data is exposed.
- Meeting URL: written only from `bookCallSlot`'s provider response and the signed Cal.com webhook. It is never accepted from the browser and is rendered through `safeExternalHref`.
- Kickoff transition: staff connection, `requireStaffAccess`, logged. It checks website ownership in SQL, not from form data.
- Plain tickets: the same rate limits and support rollout flag (`canCreateSupportRequest`). The insert policy already forces `status = new` and no assignee.
- Preview feedback: one server action that checks `requireWebsiteAccess`, the project's business against the session, and `status = preview` before calling `requestProjectRevisions`.
- Attachments: no change. The ownership query requires public visibility and the requester. Brand asset uploads reuse `/api/uploads` and its checks.
- Staff identity: no joins to `users` from customer pages. The thread keeps "Brandbasket team".
- Business edit: `saveBusinessProfile` under `withTenantScope`. Check the column grants (section 8, row 6).
- Cross-customer risk to watch: support tickets are scoped by requester, not business. A business with two members shows each member only their own tickets. The attention loader must keep `ownTicketsOfBusiness` as `listRequestNeeds` does.
- The OyeChats actions should gain the website-service check when they move under Website (today `requireCustomerAccess` only).

---

## 15. Backward compatibility and migration

| Group | Effect | Handling |
|---|---|---|
| Subscriptions, invoices, payments | none | No billing code changes; regression tests. |
| Website projects in flight (submitted to live) | none | State map uses the same statuses. |
| Projects in `onboarding`, paid, call not held | stop being asked for the checklist after Phase 4 | Staff mark held, then build; onboarding pages stay reachable from Website Overview as "Your earlier answers" only when `onboarding_progress` rows exist. |
| Unpaid legacy setup-link clients (kind `website`, unpaid) | keep the old path | `UnpaidHome`, billing banner "Finish setup" and the submit-after-payment behaviour unchanged. |
| Listing accounts that never paid | get intake on next `/plan` | Redirect once if no row. |
| Existing requests | none | Statuses and threads unchanged; `waiting_on_you` now shown honestly. |
| OyeChats bots and leads | none | Route moves with redirects in P9. |
| Social and Search `service_setup` answers | kept | The same forms move to service pages. |
| Deep links (`/todo`, `/oyechats`, `/requests/new?kind=`, emails) | kept | Redirects only in P9 after a link search (including `packages/email` templates). |
| Service combinations | none | Ownership loader reads the same tables. |

---

## 16. Component architecture

Evolve `P/components/v2/` and keep one visual contract. Existing pieces are reused first: `PageFrame`, `PageHeader` with tabs, `PageColumns`, `PageSection`, `FactRows`, `ActionRow`, `EmptyState` and the `DARK_BUTTON` / `SOFT_BUTTON` classes.

New components in `P/components/v2/`, server components unless marked:

| Component | Purpose |
|---|---|
| `status-hero.tsx` `StatusHero` | The one raised surface: eyebrow word, title, line, primary and secondary actions, optional aside slot. |
| `status-word.tsx` `StatusWord` | Word plus tone dot (never colour alone), shared by requests, projects, add-ons and posts. |
| `milestones.tsx` `Milestones` | Ordered stages from a `{ title, state, date? }[]`; replaces `ProjectTimeline` and `website/timeline.tsx` rendering. |
| `attention.tsx` `AttentionList` | "We need one thing from you" items, or the calm "Nothing needed from you right now". |
| `activity-list.tsx` `ActivityList` | Dated rows from `activity_events`, project events, preview and launch. |
| `metric-row.tsx` `MetricRow` | A figure with "Not measured yet" when null; zero only when measured. |
| `countdown.tsx` `Countdown` (client) | Section 6 rules. |
| `section-tabs.tsx` | Generalises the Website tabs for Plan & billing. |
| `skeletons.tsx` | `loading.tsx` shapes per page. |
| `read-failure.tsx` `ReadFailure` | Honest "We couldn't load this" for critical reads (never an empty state). |

Feature components:

- `components/home/*`: one file per state, fed by `ClientHomeState`.
- `components/requests/*`: `intent-picker`, `request-thread`, existing `next-step-box`.
- `components/intake/*` (client islands): `intake-question`, `intake-summary`.
- `components/business/*`, `components/website/inquiries/*`.

---

## 17. File-level plan (verified paths)

Created:

- `P/lib/server/active-services.ts`, `P/lib/home/state.ts` (+ test), `P/lib/home/countdown.ts` (+ test), `P/lib/server/home.ts`, `P/lib/server/attention.ts` (+ test).
- `P/lib/intake/questions.ts`, `P/lib/intake/schema.ts` (+ tests), `P/lib/server/intake.ts`.
- `PR/personalize/page.tsx`, `PR/personalize/actions.ts`.
- `PR/website/inquiries/page.tsx`.
- `DB/schema/client-intakes.ts`, `DB/queries/client-intakes.ts`, `DB/client-intakes.integration.test.ts`.
- `M/0205_client_intakes.sql` (+ `0206` meeting URL).
- The components in section 16.

Modified:

- Shell and IA: `P/lib/rail.ts` (+ `rail.test.ts`), `P/components/v2/app-shell.tsx`, `P/components/v2/rail-icon.tsx`, `P/lib/website/tabs.ts`, `P/DESIGN.md`.
- Home: `PR/page.tsx`, `P/lib/first-look.ts` (`SERVICE_NAMES.search`), `P/lib/server/overview.ts`.
- Sign-up and checkout: `P/app/app-host/login/actions.ts`, `P/components/panel/membership/checkout-ledger.tsx`, `membership-page.tsx`.
- Kickoff and project: `P/lib/server/setup-call.ts`, `P/lib/server/call-scheduling.ts`, `P/lib/server/calcom-webhook.ts`, `DB/schema/projects.ts`, `DB/queries/setup-calls.ts`, `DB/queries/project-staff.ts`, `A/app/(protected)/clients/[businessId]/kickoff-actions.ts` (and its form), `P/lib/website/timeline.ts`, `P/lib/project-stages.ts`, `SH/lib/next-step.ts`.
- Requests: `PR/requests/actions.ts`, `PR/requests/page.tsx`, `PR/requests/new/page.tsx`, `P/lib/requests/form.ts`, `P/lib/requests/rows.ts`, `SH/lib/change-requests.ts` (`ticketStatusWord`), `DB/queries/support.ts` (waiting list).
- Website and OyeChats: `PR/website/page.tsx`, `PR/website/actions.ts`, `P/lib/website/progress-view.ts`, `P/components/website/preview-card.tsx`, `PR/oyechats/*`.
- Business: `PR/details/page.tsx`, `PR/details/actions.ts`.
- Account: `PR/services/page.tsx`, `PR/billing/page.tsx`, `P/components/panel/billing/plan-summary.tsx`, `PR/settings/page.tsx`.
- Social and SEO: `PR/social/page.tsx`, `PR/search/page.tsx`, `P/components/search/search-view.tsx`, `P/lib/server/search.ts`.
- Erasure: `DB/queries/account-erasure.ts` (+ test).
- Console: the client record page, for intake display.

Deprecated, then deleted after a usage search in P9:

- `P/lib/server/todo.ts`, `P/lib/todo.ts`, `P/components/todo/*`, `P/lib/ready-items.ts`.
- `components/first-look/*` once Home states replace them.
- `components/overview/month-overview.tsx`, `next-step-card.tsx`, `prepare-checklist.tsx`.

Redirected in P9: `PR/todo/page.tsx` to `/`, `PR/oyechats/**` to `/website/inquiries`.

---

## 18. Phased delivery

Every phase ends with `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`, plus `pnpm test:integration` when `packages/db`, RLS, billing or email is touched. It also ends with a desktop and 390px walk in the browser and an owner "New copy" table in the PR. Work goes on `development` (or a worktree branch merged into it); `main` only moves through the release PR.

**Phase 0: baseline (no UI change)**
- Sync local `development` to `origin/development`.
- Run all checks and the integration suite in a scratch `*_test` database (the shared one fails at 0194).
- Record pre-existing failures.
- Mark plans 28 and 30 as superseded in `docs/plans`.
- Done when: the baseline is recorded.

**Phase 1: navigation, ownership loader, primitives**
- Revised by section 0. Phase 1 now ships the new design language too:
  - New tokens under `[data-app="customer"]` in `packages/shared/src/styles/theme.css`. Old token names are aliased to the new values, so pages not yet rebuilt still render.
  - Red Hat Display, Text and Mono, already loaded through `next/font`, at the new 16px body scale.
  - The light sidebar and phone tab bar replace `components/v2/rail.tsx` and `phone-bars.tsx`. `lib/rail.ts` stays the data source.
  - A rewritten `DESIGN.md`.
- Scope:
  - The section 5 rail.
  - `loadActiveServices` replaces `loadTodo` in the shell.
  - Renames (Home, Business, Plan & billing, Local SEO + AEO in rail, titles and search).
  - Plan & billing tabs across `/services` and `/billing`.
  - Website tab "Inquiries" pointing at `/oyechats`.
  - Requests "Book a call" link.
  - Blog links to Authors and Categories.
  - Section 16 primitives with tests.
  - `DESIGN.md` update (after the owner's yes, C16).
- Dependencies: none. Database: none.
- Tests: rail sections per service mix, current-link marking for grouped routes, search targets, ownership loader (legacy add-on subscriptions included).
- Done when: every old page is still reachable in two clicks or fewer, and no route is removed.

**Phase 2: adaptive intake and checkout**
- Scope: `client_intakes` (0205), the question config, `/personalize`, the sign-up redirect, the summary with the service toggle, the read-only checkout basket and the console intake display.
- Dependencies: P1. Database: 0205.
- Tests:
  - Branching per basket, merge without duplicates, resume, skip, and a changed basket asking only new questions.
  - RLS isolation, erasure, and pricing unchanged (`bundle` and `packages` tests).
  - A membership opening never submits onboarding (C1).
- Done when: the spec's Phase 2 exit condition holds on the fake provider and Razorpay test mode.

**Phase 3: Home state model and kickoff**
- Scope: `deriveClientHomeState`, the attention loader (badge switches to it), Home states, countdown, and meeting URL (0206, provider-only).
- Dependencies: P1. Database: 0206.
- Tests: every state in section 6, countdown rules, attention across services, badge.
- Done when: no Home render path calls `inFirstLook` or `loadTodo`.

**Phase 4: readiness after kickoff (console + DB)**
- Scope: `markProjectReadyAfterKickoff` with the first-preview date field, timeline and stage readers via the `project_events` helper (C9), and Website Overview without "Finish your setup" for new-flow and post-held accounts.
- Dependencies: P3. Database: none.
- Tests: the section 10 integration tests.
- Done when: an account with no checklist reaches `building`.

**Phase 5: Requests**
- Scope: intents, plain tickets, "Waiting for you", grouping, thread layout, included edits in context, and the `?kind=` mapping.
- Dependencies: P3 (attention). Database: none.
- Tests: intent mapping, no change request for a question, `waiting_on_you` surfaces, quote, pay and approve still work, rate limits.

**Phase 6: Website and Inquiries**
- Scope: Website Overview states, inline preview feedback (C7), `/website/inquiries` (site events plus chatbot leads, rename bot, conversations), and the website-service guard on the OyeChats actions.
- Dependencies: P4, P5.
- Tests: preview feedback not counted in included edits, inquiries empty and with data.

**Phase 7: Business, Plan & billing, Settings**
- Scope: the Business page (C13, C14), the services ordering, removing the billing day bar, compact Settings with standalone sign-out-elsewhere.
- Database: a possible grant (section 8, row 6).
- Tests: Social-only and SEO-only Business, grandfathered price display, Settings has no fake controls.

**Phase 8: Social and Local SEO + AEO**
- Scope: page rebuilds and setup answers moved from To do (C15).
- Tests: absent versus measured zero, approvals, setup attention.

**Phase 9: legacy cleanup**
- Scope: migrate every `/todo` and `/oyechats` link (app, console, email templates), then the redirects. Delete dead loaders and components after a usage search.
- Tests: redirect tests, plus a link scan.

**Phase 10: QA**
- Desktop, tablet and 390px; keyboard and screen reader on Home, intake, Requests and the preview; billing and RLS regression; production build; Codex read-only review of the branch.

---

## 19. Risks

1. Phase 4 is the load-bearing change. Until it ships, a new-flow website customer whose call is held still sits in `onboarding`. Do not release Phase 3's Home without Phase 4, or keep the legacy "Finish your setup" path visible until then.
2. A shared checkout and many worktrees: other sessions commit to `development`. Commit only these files by path.
3. Migration numbering: the journal idx runs behind the tags. Generate, then rename to the next tag (0205) and keep the idx (see the site-hosting memory traps).
4. The shared test database is broken at 0194; use scratch databases.
5. Copy volume: every phase adds customer copy that needs the owner's yes before production.
6. Support tickets are scoped by requester. Multi-member businesses see partial request lists; that is unchanged, but the attention counts inherit it.
7. The static Pages list is marked "assumed" in code. Showing it more prominently makes wrong page names more visible.

---

## 20. Decisions needed from the owner

- D1. Approve the `DESIGN.md` change to allow one hero surface plus grouped secondary surfaces (C16).
- D2. OyeChats moves under Website as "Inquiries", with the OyeChats name kept on the page (C22). Yes or keep top-level?
- D3. First-preview date after kickoff: a fixed 48 hours, or staff enter it when marking the call held, defaulting to 48 hours (C8)?
- D4. Business contact details: the customer edits them directly (staff then update the site and listings), or read-only with Request a change (C13)?
- D5. Social and SEO setup answers (account access, ad budget, areas): a contextual "We need one thing" form, or staff ask through Requests (C15)?
- D6. Overdue first preview: hide the date and alert staff, or tell the customer it is running late (C19)?
- D7. Confirm the four website pages listed on the Pages tab (Home, About, Services, Contact), or should that tab list only real pages staff record?
- D8. Do you want a launch date shown before go-live? That needs a new nullable `projects.launch_planned_on` column; without it, "approved" shows no date.
- D9. How many paying customers are on app.brandbasket.in today, and are any mid-checklist? It decides how careful the Phase 4 rollout must be.

---

## 21. Recommended Phase 1 scope

Exactly the Phase 1 entry in section 18:

- The new rail and search.
- `loadActiveServices`.
- The labels.
- The Plan & billing tabs.
- The three entry points that keep OyeChats, Calls and the blog settings reachable.
- The v2 primitives with tests.
- The `DESIGN.md` change (if D1 is yes).

It needs no migration, touches no billing or RLS code and removes no route, so production risk is limited to navigation. It unblocks every later phase.
