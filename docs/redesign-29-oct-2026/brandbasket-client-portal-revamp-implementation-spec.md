# BrandBasket Client Portal Revamp
## Product + UX + Engineering Implementation Specification

**Version:** 1.0  
**Prepared for:** BrandBasket platform implementation with Claude Code  
**Scope:** `apps/platform` customer web application, with only the minimum admin/database changes required to support the new client experience  
**Repository reviewed:** uploaded `brandbasket-platform-main.zip`, especially `apps/platform`, `apps/admin`, `packages/db`, `packages/shared`  
**Date:** 29 October 2026

---

# 1. Executive directive

This is not a cosmetic redesign. The customer application must be changed from an internal-process-oriented dashboard into a managed-service client portal.

The core product promise is:

> BrandBasket does the work. The client should always understand what BrandBasket is doing, what happens next, whether BrandBasket needs anything from them, and where to contact the team.

The current dark application shell, desktop rail mechanics, mobile shell mechanics, authentication model, billing engine, RLS model, service catalogue, project state machine, and existing server-side security patterns must be retained unless this document explicitly requires a change.

**Do not copy the HTML mockups literally.** The mockups define hierarchy, interaction intent, and information architecture. Production implementation must use the existing BrandBasket design tokens, fonts, Phosphor icon system, responsive shell, server components, security patterns, and repository conventions.

## 1.1 Hard rules for Claude Code

1. Read the repository instructions before editing anything:
   - root `CLAUDE.md`
   - `apps/platform/CLAUDE.md`
   - `apps/platform/DESIGN.md`
   - the Next.js 16 guides referenced by the repository instructions when touching App Router behavior.
2. Work in small implementation phases. Do not attempt the entire revamp in one uncontrolled change.
3. Keep `AppShell`, `Rail`, `PhoneBars`, authentication, RLS, and existing billing calculations as foundations. Update their data/labels only where specified.
4. Never trust `businessId`, service ownership, price, discount, or project ownership from browser form data or query parameters. Derive tenant/business identity from the authenticated session and revalidate service IDs through shared billing utilities.
5. All customer database access must remain tenant-scoped through the repository's existing RLS helpers such as `withTenantScope` / `withUserScope` and existing access guards.
6. Never duplicate package pricing rules in UI code. Continue using `@brandbasket/shared` billing functions as the price authority.
7. Never display fabricated data. If a health check, team member, ranking, metric, SLA date, meeting URL, or activity record does not exist in the backend, omit the element or show an honest empty state.
8. Do not create fake customer tasks merely to make a dashboard look active.
9. Do not expose internal CMS concepts in the main rail unless the client genuinely needs them.
10. Every phase must end with tests and a full type/lint check. Database or billing changes require integration tests.

---

# 2. What is verified in the current repository

The following facts were verified from the uploaded codebase and should be treated as implementation constraints, not assumptions.

## 2.1 Stack and architecture

- Next.js 16 App Router, React 19, TypeScript and Tailwind v4.
- PostgreSQL with Drizzle and row-level security.
- Better Auth for authentication.
- Razorpay billing.
- Customer app: `apps/platform`.
- Staff/admin app: `apps/admin`.
- Shared catalogue and billing logic: `packages/shared`.
- Database schema and tenant-safe queries: `packages/db`.
- Customer pages are primarily under `apps/platform/app/app-host/(protected)`.

## 2.2 Current services and authoritative list prices

These are defined in `packages/shared/src/lib/billing/add-ons.ts` and must remain the source of truth.

| Service | Catalogue ID | INR list price | Notes |
| --- | --- | ---: | --- |
| Managed Website | `managed-website` | ₹2,999/month | GST included in INR price |
| Social Media and Ads | `digital-growth` | ₹9,999/month | Plus the customer's ad spend |
| Local SEO + AEO | `local-seo-aeo` | ₹24,999/month | GST included in INR price |

## 2.3 Current package rules

Package rules are centralized in `packages/shared/src/lib/billing/packages.ts`.

- Any valid two-service package receives 10% off.
- All three services receive 20% off.
- Package savings are calculated centrally and rounded according to the existing shared billing implementation.
- Ad credit at the first checkout is also already centralized:
  - Website + Social: ₹1,500/month ad credit.
  - Website + SEO: no ad credit.
  - Social + SEO: ₹1,500/month ad credit.
  - All three: ₹3,000/month ad credit.
- Do not reproduce these values in a new calculator. Render the result of shared pricing functions.

## 2.4 Current project state machine

The website project states are already defined in `packages/db/src/schema/projects.ts`:

`onboarding -> submitted -> building -> preview -> revisions -> approved -> live`

with `on_hold` and `cancelled` as additional states.

Existing project data includes:

- `slaDueAt`
- `previewUrl`
- `previewSentAt`
- `onHoldReason`
- revision counts
- `launchedAt`
- `assignedStaffId`
- project event history
- preview image storage

This is enough to power most of the proposed client-facing website timeline. Do not invent a second project state machine.

## 2.5 Current kickoff booking capability

The platform already supports:

- availability lookup
- direct Cal.com booking from the customer app
- rescheduling by replacing the previous future booking
- `startsAt`, `endsAt`, `heldAt`, and staff kickoff summary
- staff marking a kickoff as held

The booking service returns a `meetingUrl` when booking, but the current `setup_call_bookings` schema does **not** persist that meeting URL. The current persisted `inviteeUri` is the booking provider's invitee/booking URI and must not automatically be treated as the video join URL.

Therefore: **do not render a “Join meeting” button in production until an actual meeting join URL is safely persisted and returned.**

## 2.6 Existing support/request system

The existing support model is already capable enough to become the new Requests experience:

- support tickets
- public thread messages
- attachments
- unread state
- assignee staff ID
- statuses including `waiting_on_you`
- staff can open a ticket on behalf of a client
- change requests can be linked to support tickets

Do not create another generic customer-task or messaging system unless a real requirement cannot be represented by this model.

## 2.7 Existing data that can show client value

The current repository already stores or derives:

- project events
- visible business activity / service activity events
- website contact events
- OyeChats leads
- social posts and approvals
- monthly social/search snapshots
- monthly reports
- service deliverables
- invoices/receipts
- payment method information
- support/request activity

Use these real data sources before adding new metrics.

---

# 3. Product model for the final app

The customer portal has four responsibilities:

1. **Status:** What is BrandBasket doing for me right now?
2. **Next:** What happens next and when?
3. **Attention:** Does BrandBasket genuinely need anything from me?
4. **Relationship/value:** What has BrandBasket delivered and how do I contact the team?

The application must not behave like a DIY website builder or generic project-management app.

## 3.1 Customer lifecycle

The intended journey is:

`Marketing pricing -> service/package selected -> create account -> adaptive intake -> checkout -> payment -> kickoff booking -> pre-kickoff Home -> kickoff held -> delivery -> preview/review -> launch -> ongoing managed service`

The adaptive intake is **not a plan recommendation engine**. The client already selected a service or package before account creation. The intake only personalizes the service they selected.

## 3.2 Experience rule

At every point, the page should prioritize information in this order:

1. current status or primary outcome
2. next milestone
3. required customer action, only if real
4. BrandBasket activity/value
5. supporting detail

Do not lead with billing facts, task counts, generic forms, or internal workflow terminology.

---

# 4. App shell: preserve the shell, simplify the information architecture

## 4.1 What stays unchanged

Keep the current production shell implementation and its behavior:

- `apps/platform/components/v2/app-shell.tsx`
- dark desktop rail visual system
- mobile `PhoneBars`
- account panel
- responsive behavior
- current brand logo treatment
- current background/page container system
- command/search utility if retained

The HTML mock shell is **not** a replacement for production `AppShell`.

## 4.2 Final primary navigation

The rail should become:

**Home**

**Services**
- Website - only when Managed Website is active
- Social & Ads - only when Social Media and Ads is active
- Local SEO + AEO - only when that service is active

**Manage**
- Requests
- Business

**Account**
- Plan & billing
- Affiliate - only for existing affiliate accounts, preserving current behavior
- Settings

### Remove from primary rail

- To do
- OyeChats as a standalone service
- Calls as a permanent Requests child
- Authors
- Categories
- separate Your plan and Billing entries
- the service label `Search`; use `Local SEO + AEO`

### Search utility

If the current shell's command search remains, that is acceptable. It must index the final visible destinations and actions. The service named Local SEO + AEO must never appear simply as `Search`, because that collides conceptually with global search.

## 4.3 Service ownership source

`AppShell` currently calls `loadTodo()` partly to determine `hasSocial` and `hasSearch`. Remove that dependency.

The shell should determine active services from the canonical subscription/bundled-add-on state, using an existing billing/service loader or a new small server function that reads active bundled add-ons. The shell must not require the deprecated To do system merely to build navigation.

## 4.4 Requests badge

The badge beside Requests should represent useful attention, not every open ticket.

Count:

- unread public staff replies
- support tickets in `waiting_on_you`
- change requests requiring quote acceptance/payment/review

Do not count background requests that need no customer action.

---

# 5. Route strategy and backward compatibility

Do not aggressively rename URLs in the first implementation. Preserve stable routes where possible and change labels/UI first.

| Current route | Final customer meaning | Implementation |
| --- | --- | --- |
| `/` | Home | Keep route; rebuild content/state model |
| `/todo` | Deprecated | Remove from rail; keep compatibility temporarily, then redirect contextually |
| `/requests` | Requests/inbox | Keep and rebuild |
| `/requests/new` | New request | Keep and rebuild intent-first form |
| `/requests/calls` | Meetings/history | Remove rail child; retain reachable compatibility route or later fold into Requests |
| `/website` | Website overview/project | Keep and rebuild |
| `/website/pages` | Website pages | Keep |
| `/oyechats` | Website inquiries | Create `/website/inquiries`; redirect old route after migration |
| `/content/blog` | Blog, if client-facing | Keep as Website tab only if product still requires it |
| `/content/authors` | CMS detail | Remove from rail; keep direct/internal route only if required |
| `/content/categories` | CMS detail | Remove from rail; keep direct/internal route only if required |
| `/details` | Business | Keep route; relabel page and rail |
| `/services` | Plan & billing - services tab | Keep route |
| `/billing` | Plan & billing - billing tab | Keep route and grouped rail highlight |
| `/settings` | Settings | Keep and redesign |
| `/social` | Social & Ads | Keep and redesign |
| `/search` | Local SEO + AEO | Keep URL for compatibility; rename title/UI |
| `/plan` | Checkout only | Keep checkout semantics; do not use as post-purchase plan page |
| `/onboarding/*` | Legacy onboarding | New accounts should not enter these routes; retain temporarily for legacy accounts |
| `/domain` | Website domain detail | Keep as secondary Website destination/action when needed |

## 5.1 `/todo` migration rule

Phase 1: remove the rail link but keep the page working so old deep links do not break.

Phase 2+: migrate every internal link that points to `/todo` to one of:

- Home attention module
- Website
- Social & Ads
- Local SEO + AEO
- Requests

Only after references/tests are clean should `/todo` become a redirect.

---

# 6. Production visual system for all redesigned screens

The current shell and existing BrandBasket theme remain the base. Do not paste the mock's custom CSS into production.

## 6.1 Keep existing brand primitives

Continue using the current documented design tokens and typography from `apps/platform/DESIGN.md`, including:

- Red Hat Display for display/title roles
- Red Hat Text for body roles
- Red Hat Mono for appropriate numeric/technical figures
- Phosphor icons
- existing `bg`, `surface`, `ink`, `ink-2`, `line`, rattan and service colors
- existing shell radius/spacing language

## 6.2 Update the surface grammar

The current design document's “one raised surface per screen” rule is too restrictive for the new service portal. Update `DESIGN.md` with this replacement rule:

- A page may have **one primary status/hero surface**.
- It may have **one or two secondary grouped surfaces per row** when the grouping has real customer meaning.
- Do not put every field or row in its own card.
- Detail lists should prefer hairline-separated rows inside a single surface.
- Use whitespace instead of borders whenever hierarchy is already clear.
- Keep one dominant dark primary CTA per state/screen.
- Secondary actions use the app's existing quiet/soft button treatment. Do not add random outline styles that conflict with the design system.

## 6.3 Required reusable components

Create or evolve reusable v2 components rather than styling every page independently:

- `ClientPageHeader`
- `StatusHero`
- `StatusBadge`
- `MilestoneTimeline`
- `AttentionCard`
- `ActivityFeed`
- `FactList` / `FactRows` reuse
- `EmptyValueState`
- `ServiceTabs`
- `RequestStatusBadge`
- `SectionHeading`
- `MetricRow` / `MetricGroup`

Component names may differ if existing components are more suitable, but the visual contract must be centralized.

## 6.4 Copy rules

- Say “Home”, not “Overview”.
- Say “Business”, not “Business profile”.
- Say “Local SEO + AEO”, not “Search”.
- Avoid internal status words when a human phrase is clearer.
- Never use a task counter for optional preparation.
- “Nothing needed from you right now” is a valid and useful state.
- Do not tell a customer something is “healthy”, “checked”, “maintained”, or “completed” without a corresponding stored event/status.

---

# 7. New pre-checkout adaptive intake

## 7.1 Purpose

The client has already selected one service or a package. After account creation, ask a short adaptive set of questions so BrandBasket has context before payment and kickoff.

This must take roughly 45-75 seconds for a normal path.

No uploads. No content writing. No long free-text brief.

## 7.2 Flow placement

Current new-account flow redirects directly from `joinForListing()` to `/plan?services=...`.

Change it to:

`joinForListing() -> /personalize?services=... -> /plan?services=...`

Add a protected route such as:

`apps/platform/app/app-host/(protected)/personalize/page.tsx`

The route must allow a membership-checkout account before first payment using the same access posture as `/plan`.

## 7.3 Question structure

### Common questions

1. Business category
2. Business subtype, based on category
3. Main business priority

### Managed Website questions - only if selected

4. Existing website state
5. Desired primary visitor action
6. Design direction

### Social Media & Ads questions - only if selected

- channels currently most important / desired focus
- include “Let BrandBasket recommend”

### Local SEO + AEO questions - only if selected

- primary geographic visibility scope
- local area/city, multiple cities/locations, wider regional market, or not sure

### Combo package behavior

Merge the applicable questions into one flow. Do not repeat common questions once per service.

Every uncertain decision should have an honest option such as:

- Not sure yet
- Let BrandBasket recommend
- Let BrandBasket decide

## 7.4 Data model

Do **not** overload `service_setup`. That table represents post-purchase setup for social/search and has a different lifecycle.

Add a dedicated table, recommended shape:

`client_intakes`

- `business_id` UUID primary key / business FK
- `schema_version` integer, default 1
- `selected_services` text array, validated against catalogue IDs
- `business_category` text nullable
- `business_subtype` text nullable
- `primary_goal` text nullable
- `website_state` text nullable
- `existing_website_url` text nullable
- `primary_action` text nullable
- `social_channels` text array, default empty
- `search_scope` text nullable
- `design_direction` text nullable
- `completed_at` timestamptz nullable
- `created_at`
- `updated_at`

Why columns instead of one unbounded JSON blob: the v1 fields are stable, searchable by staff/analytics, and straightforward to validate. `schema_version` gives future branching room without making values database enums that require a migration whenever copy changes.

Add RLS so the app role can only read/update the current tenant's intake.

## 7.5 Saving behavior

Auto-save after each answer.

Server action requirements:

- derive `businessId` from `requireCustomerAccess`, never from form data
- validate answer against centralized Zod/option schemas
- validate selected services with `readBundleSelection`
- cap all text lengths
- normalize optional URL if supplied
- write only the current tenant's row

A refresh/back navigation must resume from stored answers.

## 7.6 Summary screen

The summary must **not** say “Recommended plan”.

It should say:

- what BrandBasket understood about the business
- selected services/package, clearly labeled as already selected
- package discount, using shared billing calculations
- ad credit when applicable, using existing shared functions
- “Continue to checkout”

Optional secondary action: “Change services”. If the customer changes the basket, re-run only questions newly required by the new service; preserve answers that remain relevant.

## 7.7 No plan recommendation logic

Do not add AI or heuristic plan recommendation to this release. The service/package was already chosen on the marketing/pricing experience. This intake personalizes delivery, not sales qualification.

---

# 8. Checkout redesign

## 8.1 Keep the billing engine

Keep `/plan`, `startMembershipCheckoutFor`, shared bundle pricing, referral discount logic, Razorpay confirmation, invoice generation, and all server-side amount validation.

The redesign is presentation and flow, not pricing math.

## 8.2 Change checkout's role

Today the checkout also behaves as a service picker. In the new flow the selected basket arrives from intake.

Final checkout should prioritize:

1. selected services
2. package saving/ad credit if applicable
3. billing details
4. referral code if supported
5. amount taken today
6. renewal terms
7. what happens immediately after payment
8. single primary payment CTA

Keep a quiet “Change services” action, but do not make service toggling the dominant checkout interaction.

## 8.3 Payment confirmation behavior must change for new intake accounts

Current payment confirmation attempts to call `sendOnboardingWithin()` and submit the old onboarding checklist after first payment. That conflicts with the new managed-service flow.

Implement a compatibility branch:

- If this business has a completed `client_intakes` v1 row, first payment activates the membership/services **without attempting legacy onboarding submission**.
- If the account is a legacy account with no new intake row, preserve the existing legacy behavior until those accounts are migrated.

Do not delete legacy behavior in the same release unless all affected accounts have been migrated.

## 8.4 Post-payment landing

Successful first payment should land on Home.

If no kickoff is booked, Home's primary surface becomes **Book your kickoff**.

Do not force another detailed setup form after payment.

---

# 9. Home page - complete state specification

Rebuild `apps/platform/app/app-host/(protected)/page.tsx` around a new derived client state. Stop using `inFirstLook()` as the main UX state controller.

## 9.1 Why `inFirstLook()` must no longer control the page

Current logic ends first look if:

- setup was submitted
- call was held
- website went live
- or a grace window after the call elapsed

That behavior is tied to the old onboarding flow and can move the customer into a monthly dashboard too early.

Create a pure state derivation such as `deriveClientHomeState()` based on real billing, kickoff, project, live-site and attention facts.

## 9.2 Home states

### A. No billing access / payment issue

Keep the existing billing/access protections. Show the real billing banner and appropriate pay/reactivate path. Do not show managed-service progress that the account has not paid for.

### B. Paid, kickoff not booked

Primary surface:

- welcome by first name
- short reassurance that the service is active
- one primary action: Book your kickoff
- what the meeting is for
- no required upload checklist

Secondary content:

- selected active services
- “No preparation required”

### C. Kickoff booked, future

Primary surface:

- `Your kickoff is booked`
- localized date and time
- countdown
- Add to calendar
- Reschedule
- Join meeting **only if a real persisted meeting join URL exists**

Countdown rules:

- over 24 hours: day-based wording is enough
- under 24 hours: hours/minutes
- under 60 minutes: minutes
- no seconds
- never show negative countdown values

Below the hero:

**What we'll cover**
- business
- customer/goal
- service-specific priorities
- look/direction where relevant
- next steps

**If you already have these, keep them handy**
- business basics
- logo/brand assets
- photos
- reference sites/design references
- service-specific material such as a menu if relevant

This is optional content. No checkboxes, completion counts, or red badges.

### D. Kickoff held / website ready to start

For a website client:

- `We're getting your website started` or `We're building your website`
- current project stage
- first preview due, only when `slaDueAt` is set
- “Nothing needed from you right now” when there is no true attention item
- latest BrandBasket activity

### E. Building

- project milestone timeline based on existing project status/events
- expected first preview from `slaDueAt`
- latest service activity
- real attention item, if any

### F. Preview ready

Primary Home action becomes:

- `Your website is ready to review`
- preview thumbnail if available
- Open preview
- direct link to Website review controls

Do not route initial-build revision feedback through monthly included-edit consumption.

### G. Revisions

- `We're making your changes`
- revision stage and next expected step
- no new action unless BrandBasket explicitly needs clarification

### H. Approved / launch preparation

- `Your website is approved`
- launch/domain status if real
- expected next milestone

### I. Live / ongoing managed service

Home shifts from project onboarding to ongoing value.

Show only real data, such as:

- website live address
- website enquiries this month if recorded
- OyeChats leads if recorded
- completed client-visible activity
- open request attention
- social/search metrics for purchased services
- next payment summary as a small secondary fact, not the hero

Primary ongoing question: **What did BrandBasket do for me this month?**

### J. On hold

Use `onHoldReason` exactly as the customer-facing reason, because current admin copy explicitly says the customer reads it.

Clearly distinguish:

- waiting on BrandBasket
- waiting on customer

If customer action is required, show one clear CTA into the relevant Request or information form.

## 9.3 Home attention module

Replace the permanent To do concept with one contextual module.

Data should aggregate:

- support tickets `waiting_on_you`
- unread staff replies when action is implied
- change-request quote/payment/review needs
- waiting social approvals
- any retained structured setup need that genuinely blocks delivery

Do not display completed or optional items.

## 9.4 Activity feed

Use existing real sources:

- project events
- service activity events
- customer-visible business activity
- preview sent
- launched event
- website update activity

Do not auto-generate cosmetic activity messages that do not correspond to a stored action.

---

# 10. Website project transition after kickoff

The old system moves `onboarding -> submitted` when the client submits the onboarding checklist. New clients will not do that.

## 10.1 Required transition

For new-intake website customers, staff marking the kickoff as held should make the website project ready to build.

Recommended implementation:

- add a staff-side DB/service operation such as `markProjectReadyAfterKickoff`
- condition: project status is `onboarding`
- transition to `submitted`
- set `slaDueAt = kickoffHeldAt + 48 hours`
- do **not** require old onboarding checklist completion
- let the existing project-event trigger/history record the transition
- existing admin `Start building` can then continue to transition `submitted -> building`

## 10.2 Legacy field caution

`projects.onboardingSubmittedAt` is semantically tied to old onboarding submission. Do not silently redefine it as “kickoff completed”.

For new flow:

- leave the legacy field as legacy data, or add an explicitly named `readyForBuildAt` if a direct timestamp is required beyond project events
- update timeline code to derive readiness/build start from project events and `slaDueAt`, with legacy fallback to `onboardingSubmittedAt`

This prevents future code from lying about what the timestamp means.

## 10.3 Staff action integration

Update the staff kickoff-held workflow so the website transition happens reliably for businesses that actually own Managed Website.

Do not start or transition a website project for Social-only or SEO-only businesses.

Add integration tests for:

- website package -> kickoff held -> project submitted + SLA set
- non-website package -> kickoff held -> no website project transition
- idempotent second click
- legacy already-submitted project unaffected

---

# 11. Requests - rebuild as client communication center

## 11.1 Keep the existing request backend

The support system is strong enough. Reuse it.

## 11.2 Requests list final content

Header:

- Requests
- short line: ask a question, send information, request an update, or report an issue
- New request CTA

List/group:

- Open
- Waiting for you
- Completed

Each row shows:

- human subject
- service/category
- status
- last public activity date
- unread indicator
- optional assignee display only if a customer-safe staff identity is available

Do not lead with “0 of 2 included edits used”.

## 11.3 Request detail final content

Use an inbox/conversation layout:

- subject
- status
- service/category
- public message thread
- attachments
- composer
- change-request specific timeline/quote/review controls when linked

Keep internal staff notes invisible using the existing support visibility model.

## 11.4 New request screen

Replace the first question `Website / Billing / Something else` with intent-first choices:

- Update my website
- Send BrandBasket information
- I have a question
- Something isn't working
- Billing or plan
- Social/Ads request - only when active
- SEO/AEO request - only when active

Then adapt the form.

### Mapping to existing backend

- Website update -> support ticket + `change_request` kind `website`
- Social change -> change kind `social`
- SEO change -> change kind `search`
- Billing change -> appropriate billing support category, and change request only if actual change workflow needs one
- Question -> plain support ticket, **no change_request row**
- Problem -> support category `bug` or `support`, **no change_request row** unless later converted by staff
- Send information -> plain support/general ticket with attachment/message

Current `Ask for a change` path always centers change requests. Split the action logic so not every conversation becomes a billable/change workflow.

## 11.5 Included edits

Monthly included-edit information remains valid for post-launch website maintenance, but it should be contextual:

- display in Website/Requests when the customer is actually requesting a maintenance update
- explain it quietly
- do not make it a global warning
- initial website preview revisions are not post-launch monthly maintenance edits

---

# 12. Website - final screen specification

Keep `/website` and the existing project loaders, preview image capability and approval actions. Rebuild presentation.

## 12.1 During build

Primary surface:

- `Your website`
- current human stage
- first preview expected date if `slaDueAt` exists
- milestone timeline

Secondary sections:

- latest project/activity update
- website address/domain status if known
- pages planned/in progress when data is available
- no generic “Finish your setup” CTA for new-intake customers

If legacy onboarding remains incomplete for a legacy customer, show a compatibility notice only for that legacy account.

## 12.2 Preview ready

This is a dedicated review state.

Show:

- existing preview screenshot from the current preview-image capability when fresh
- Open preview
- clear review explanation
- primary approval action
- request changes action
- revision allowance/status from existing project data

Do not mix preview feedback with the post-launch maintenance quota.

## 12.3 Revisions

Show:

- `We're making your changes`
- revision count/allowance where helpful
- latest feedback date
- next preview status

## 12.4 Live website

Primary surface:

- live URL
- Visit website
- Request update

Then real operational facts only:

- domain status from stored domain data
- hosting status only if the platform has an authoritative hosting status
- SSL status only if an authoritative status exists
- recent website activity from stored events
- pages list
- enquiries/inquiries summary where recorded

Do not add a fake “last checked today” or generic `Healthy` badge unless a monitoring backend actually records it.

## 12.5 Website tabs

Recommended client-facing tabs:

- Overview
- Pages
- Inquiries
- Blog - only if the current product genuinely expects clients to use/manage it

Remove Authors and Categories from the main rail. If the Blog experience still requires them, expose them as secondary settings inside Blog rather than application-level navigation.

---

# 13. OyeChats becomes Website > Inquiries

The current OyeChats page already has meaningful customer data: lead counts, lead list and conversation access. Preserve that value but integrate it into the website experience.

## 13.1 New route

Create `/website/inquiries`.

Use the existing loaders:

- bots
- leads
- last-week/month counts
- OyeChats conversation activity

## 13.2 Final UI

- total inquiries/leads
- recent period counts
- lead table
- lead detail/conversation
- assistant status/name as secondary information

If no bot exists, show a calm setup state rather than a configuration dashboard.

## 13.3 Compatibility

After the new route is stable:

- redirect `/oyechats` -> `/website/inquiries`
- redirect `/oyechats/leads` -> `/website/inquiries`
- retain or relocate `/oyechats/name` only if customers genuinely need to rename the assistant

---

# 14. Business - source of truth, not a website admin form

Relabel `/details` to **Business**.

## 14.1 Final sections

### Business details

Show available profile data:

- display/business name
- phone
- email
- address
- service area if present

Editing rule:

- if there is a safe existing server action and downstream sync for a field, allow direct edit
- otherwise show the fact read-only with `Request a change`
- do not render an Edit button that has no complete backend behavior

### Opening hours

Keep direct edit; current backend supports it.

### Holidays / temporary closures

Keep direct edit; current backend supports it.

### Announcement

Keep direct edit for website clients; current backend supports it.

For clients without Managed Website, hide website-specific announcement/live-preview behavior.

### Brand assets

Show actual stored logo/photos/reference material when available. If upload/edit tooling is not yet generalized safely outside onboarding, the first release may show read-only assets plus “Send new assets” through Requests.

## 14.2 Access guard change

Current `/details` uses `requireWebsiteClient()`. The new Business concept is useful to Social and SEO clients too.

Change the page to customer access, then conditionally render website-only controls based on service ownership.

Add tests for Social-only and SEO-only accounts.

---

# 15. Plan & billing - one navigation concept, two existing routes

Do not merge all backend code into one monolithic route. Group the existing `/services` and `/billing` pages under one rail item and consistent top-level tabs.

## 15.1 `/services` - Your services tab

Lead with active services.

For each active service show:

- name
- Active status
- current stored monthly line price, not today's catalogue price if the subscription has a grandfathered amount
- what is included
- change/end controls already supported

Unpurchased services appear secondarily under `Other BrandBasket services` with Learn more / Add only when appropriate.

Do not let cross-sell dominate the page.

## 15.2 `/billing` - Billing tab

Keep existing payment/invoice logic.

Final hierarchy:

- next payment amount/date
- payment method
- renewal/problem notice if needed
- invoices and receipts
- billing details

Remove the subscription “1 of 31 days” style progress visualization. It has no meaningful customer decision attached to it.

## 15.3 Payment method truthfulness

Current product explicitly says there is no card/UPI self-service change screen yet and tells the customer to email support.

Therefore do not add a fake `Change payment method` control that suggests instant replacement.

Either:

- keep a clear support/contact action, or
- implement a real provider-backed method change flow first, with tests, before exposing the button.

---

# 16. Settings - simplify and only expose persisted capabilities

Current Settings correctly supports password change, session revocation, privacy, account deletion and sign-out. Preserve those.

## 16.1 Phase 1 final sections

### Account

- name
- sign-in email/mobile
- contact details only if actually editable through a supported action

Current copy says changing sign-in email/mobile requires contacting BrandBasket. Keep that truth unless a real edit flow is implemented.

### Login & security

- Change password
- Revoke other sessions

### Privacy

- existing privacy settings link

### Account actions

- sign out
- delete account

## 16.2 Do not fake preferences

Do **not** add toggles for notifications, language, timezone, or marketing preferences unless a persistent data model and actual behavior are implemented.

If notification preferences are desired, implement a dedicated schema/server-action phase first, then expose the controls.

---

# 17. Social & Ads - value and approvals, not setup chores

Keep `/social` and existing loaders.

## 17.1 Final page hierarchy

Primary section:

- this month's status
- important client action when posts await approval
- report link when available

Then:

### Content requiring approval

Use existing waiting posts. Make the approval action obvious when needed.

### Upcoming/planned content

Show real deliverables within the existing window.

### Ads summary

Use existing monthly snapshot and ad-credit data.

If metrics are unavailable, say `Not reported yet` or omit the metric. Do not display zero unless zero is a real measured value.

### Latest BrandBasket activity / monthly report

Use existing report and activity data.

## 17.2 Remove dependency on To do

Any Social setup/attention item still produced by `loadTodo` should be migrated to either:

- service-specific contextual attention on this page
- a staff-created/request conversation
- a structured service form deep-linked from the attention card

The Social page should not tell the customer to visit a generic To do list.

---

# 18. Local SEO + AEO - rename and rebuild around real work

Keep `/search` URL for compatibility but change page metadata, title, rail label and customer copy to **Local SEO + AEO**.

## 18.1 Final hierarchy

- current month summary
- real visibility metric when the monthly snapshot exists
- work completed this month
- current/next work
- monthly report
- contextual required input, if any

Existing search data supports:

- monthly snapshot
- page/listing deliverables
- monthly report

Use those before adding new analytics.

## 18.2 Missing data behavior

Never turn “not measured” into `0`.

Use honest states such as:

- Not measured yet
- First report is being prepared
- No completed work recorded for this period

---

# 19. Removing the permanent To do model

The To do page is not merely a visual problem. It conflicts with the managed-service proposition.

## 19.1 What replaces it

Use two mechanisms:

1. **Contextual attention** on Home and the relevant service page.
2. **Requests** for ongoing communication and staff-created asks.

## 19.2 Reuse `waiting_on_you`

Staff can already open support tickets for a client. Extend the client attention aggregator so a ticket with status `waiting_on_you` appears as a Home attention item.

This gives BrandBasket a controlled way to say:

- Please confirm your opening hours
- Send your current menu
- Confirm this phone number

without building another task system.

## 19.3 Structured information exception

If a request needs validated structured data that cannot safely fit a thread message, the attention item may deep-link to a focused form. The form should answer one concrete need, not reopen a general onboarding checklist.

---

# 20. Team/person presentation

The refined mock included a named BrandBasket team card. Production must be stricter.

The project currently stores `assignedStaffId`, but customer-safe staff identity exposure is not established as a general contract.

Therefore:

- do not hard-code names or roles
- do not query staff tables from the customer app without a deliberately sanitized server contract
- Phase 1 may simply say `Your BrandBasket team` without named people
- only add named contact cards after implementing a customer-visible team projection with explicit fields such as display name, client-facing role and optional avatar

This avoids accidental exposure of internal staff data and fake team assignments.

---

# 21. Meeting experience details

## 21.1 Before booking

Home should contain the booking picker or existing `KickoffPicker` capability as the dominant action.

## 21.2 After booking

Show date/time and countdown.

### Add to calendar

Use an actual calendar link/file generated from the stored start/end time.

### Reschedule

Reuse current booking behavior that books a new future slot then cancels the earlier future booking.

### Join button

The current booking API receives a `meetingUrl` but does not store it. To support Join meeting:

- add a nullable `meeting_url` to `setup_call_bookings`
- store only a provider-returned URL, never one posted by the browser
- enforce a reasonable length
- return it in `SetupCallBookingView`
- render Join only when non-null and when the time window makes sense

If this migration is not implemented, omit Join meeting in Phase 1.

---

# 22. Preview, approval and revisions

This is a critical customer moment and must not be treated as a normal maintenance request.

## 22.1 Preview ready

Use existing `previewUrl`, `previewSentAt` and preview image.

Controls:

- Open preview
- Approve website
- Request changes

## 22.2 Request changes during initial build

Route feedback into the existing project revision workflow. If the current implementation creates a support/change request for feedback, ensure the resulting request is classified as project revision and does not increment post-launch monthly included-edit usage.

## 22.3 Approval

After approval, Home and Website should show launch preparation, not ask for additional generic setup.

---

# 23. Launch experience

When project status becomes `live`, do not merely replace one badge.

On first post-launch Home/Website visit show a compact launch confirmation:

- website is live
- real hostname
- Visit website
- BrandBasket continues managing it under the active plan

Only show domain/SSL/hosting facts that exist in authoritative backend state.

Then normal ongoing Home takes over.

---

# 24. Ongoing value model after launch

The portal must continue being useful after the project timeline ends.

Potential real values already available include:

- website call/WhatsApp/form events
- OyeChats leads
- completed activity events
- social posts and monthly ad snapshot
- SEO monthly snapshot and deliverables
- completed requests
- reports

Home should use these selectively based on purchased services.

Avoid vanity dashboards containing many zeros. Prefer 3-5 useful facts and recent activity.

---

# 25. System and edge states that must be designed

Every page must have explicit states for:

- loading
- read failure
- empty but valid data
- unpaid account
- renewal failing / grace period
- lapsed/reactivation
- no kickoff booked
- booking exists but start/end time missing
- kickoff booked
- kickoff time passed but staff has not marked it held
- project on hold
- preview missing image but URL exists
- preview ready
- revisions
- approved
- live
- service purchased but monthly report not yet available
- support request waiting on BrandBasket
- support request waiting on client
- payment confirmation still processing

Do not use a generic empty card for all of these. Copy should explain the real state and next action.

---

# 26. Page-by-page change matrix

| Screen | Remove / demote | Add / promote | Keep / reuse |
| --- | --- | --- | --- |
| Home | paid receipt as primary content; optional setup task checklist; repeated generic timeline | lifecycle hero, countdown, optional prep, contextual attention, BrandBasket activity, ongoing value | billing banner, kickoff data, project state, real metrics |
| To do | permanent nav/page model | nothing as a new page; replace with contextual attention | underlying structured data only during migration |
| Requests | narrow “ask for a change” mental model; edit quota as headline | inbox/thread, intent-based new request, `waiting_on_you`, unread | support tickets, messages, attachments, change requests |
| Website | generic “finish setup”; duplicated timeline; CMS leakage | project hero, preview review, page list, activity, live site control center | project states, preview image, domain, approval/revision actions |
| OyeChats | standalone rail destination | Website > Inquiries | lead counts, lead table, conversations, bot status |
| Business | announcement-first page; “everything else” catch-all | business facts, hours, closures, assets, announcement where relevant | current hour/closure/announcement actions |
| Your plan | cross-sell dominance | active services first, inclusions, quieter add-services | existing add-on/bundle server logic |
| Billing | subscription day-progress | next payment, payment method truth, invoices, billing details | renewal/failure logic, receipts, invoices |
| Settings | password dominates; duplicated business/plan facts | compact account/security/privacy/account actions | existing password/session/privacy/delete/sign-out |
| Social & Ads | setup/to-do dependency | approvals, upcoming content, ad snapshot, report/activity | existing posts, snapshots, reports |
| Search | generic name, To do dependency | Local SEO + AEO, deliverables, measured visibility, report | existing snapshots/deliverables/reports |

---

# 27. Server/data architecture changes

## 27.1 New intake table and queries

Implement in `packages/db` with migration, schema export, query module, RLS integration and integration tests.

Suggested query surface:

- `findClientIntake(tx)`
- `upsertClientIntakeAnswer(tx, input)` or focused update functions
- `completeClientIntake(tx, now)`

App server wrappers:

- `loadClientIntake(tenant)`
- `saveClientIntakeStep(tenant, ...)`

## 27.2 New client attention aggregator

Create one server model for Home/rail attention, rather than independently calculating counts in multiple pages.

Input sources:

- support `waiting_on_you`
- request/change needs
- unread staff reply requiring attention
- waiting social approvals
- temporary legacy setup blockers

Recommended output:

```ts
interface ClientAttentionItem {
  key: string;
  service: "website" | "social" | "search" | "billing" | "general";
  title: string;
  hint: string | null;
  href: string;
  priority: "normal" | "important";
}
```

Do not put arbitrary free-form HTML in database data for this.

## 27.3 Home view model

Create one server-side view model rather than spreading state decisions across components.

Example:

```ts
type ClientHomeState =
  | { kind: "payment_required"; ... }
  | { kind: "kickoff_unbooked"; ... }
  | { kind: "kickoff_booked"; ... }
  | { kind: "building"; ... }
  | { kind: "preview"; ... }
  | { kind: "revisions"; ... }
  | { kind: "approved"; ... }
  | { kind: "live"; ... }
  | { kind: "on_hold"; ... };
```

This is a presentation view model, not a database enum.

## 27.4 Active services loader

Create/reuse a canonical lightweight service ownership loader for:

- shell navigation
- adaptive UI
- Business conditional sections
- request intent options

Do not read service ownership from old To do state.

---

# 28. Admin changes required by the client revamp

The customer experience cannot be correct if staff has no way to drive the states.

Minimum admin changes:

1. kickoff held action also readies the website project for build for a Managed Website customer
2. client intake answers visible to staff in the customer record, read-only in the first version
3. support staff can deliberately set a request to `waiting_on_you` with a clear public message
4. current project status controls remain
5. preview send/approval/revision controls remain compatible
6. client-visible activity writing should continue for significant service actions

Do not rebuild the whole admin UI. Add only what is required to power truthful client states.

---

# 29. Responsive behavior

Keep current shell breakpoints/PhoneBars behavior.

Inside redesigned pages:

- desktop: primary content + secondary aside where useful
- tablet: collapse to one column before content becomes cramped
- mobile: one-column flow; primary status first; no horizontal data tables without an alternate stacked view
- countdown must fit on small screens
- request thread composer must remain usable above the phone bottom navigation
- page actions should not overflow header
- tables such as invoices/leads must have a mobile row/card representation or controlled horizontal scrolling with accessible labels

---

# 30. Accessibility requirements

- Semantic headings in logical order.
- Visible focus states using existing tokens.
- Buttons must be buttons; navigation must be links.
- Status must not be communicated by color alone.
- Countdown must have an accessible text equivalent and should not announce every tick to screen readers.
- Dialogs and preview modals require focus trapping/return.
- Form errors must be associated with fields.
- Empty states must state what the absence means.
- Avoid low-contrast muted text below accessible thresholds.

---

# 31. Security and privacy requirements

1. All new intake mutations derive tenant/business from the session.
2. Never accept a customer-supplied `businessId` in platform actions.
3. Existing staff actions may accept a business ID only through current staff authorization patterns and must log sensitive actions as the repo already does.
4. Persist meeting URLs only from the trusted scheduling provider response/webhook, never arbitrary browser input.
5. Do not expose internal staff notes or internal support messages.
6. Do not expose internal staff profile data just because `assignedStaffId` exists.
7. Preserve current attachment restrictions and validation.
8. Continue to sanitize/validate URLs and file uploads with existing patterns.

---

# 32. Performance and server-component rules

- Prefer server components for initial page data as the current app does.
- Use client components only for interactive pieces such as countdown, booking picker, tabs requiring local interaction, request composer, and adaptive intake step navigation.
- Avoid fetching the same data independently in shell and page. Reuse cached loaders or introduce a shared lightweight loader.
- Keep `quietly()` behavior where a non-critical metric failure should not take down the page, but do not turn a critical write/read failure into a fake empty state.
- Do not poll aggressively. Existing payment confirmation polling patterns may be reused where appropriate.

---

# 33. Testing requirements

## 33.1 Unit tests

Add/modify tests for:

- new rail sections and active-service visibility
- intake branching and validation
- intake resume behavior
- Home state derivation
- countdown formatting rules
- attention aggregation
- Local SEO + AEO naming
- request intent mapping
- package display using shared pricing
- route compatibility helpers

## 33.2 Database integration tests

Required for:

- client intake RLS
- intake write/read tenant isolation
- kickoff-held project readiness transition
- support `waiting_on_you` attention query
- any new meeting URL column/query
- any new notification preference schema if later implemented

## 33.3 Billing regression tests

Do not reduce current billing coverage.

Add tests that verify:

- new intake accounts do not run legacy onboarding submission after payment
- legacy accounts still follow legacy behavior during compatibility phase
- package prices/discounts remain identical
- changing services before checkout still uses canonical shared pricing

## 33.4 Page/component tests

Test at least:

- Home kickoff-unbooked
- Home kickoff-booked
- Home building
- Home preview
- Home live
- Home on-hold
- Requests empty/list/thread
- Website build/preview/live
- Business website client and non-website client
- Social metric absent vs measured zero
- SEO metric absent vs measured zero

## 33.5 Required commands before completion

From repository root, follow the repo scripts and run at minimum:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

For DB/RLS/billing changes, run the repository's relevant integration test suite as instructed by `CLAUDE.md`.

---

# 34. Implementation phases for Claude Code

Do not implement all screens in one pass.

## Phase 0 - Baseline and safety

- read all repository instructions
- run existing tests/typecheck before changes
- capture current route behavior
- update/create implementation tracking checklist
- no UI change yet

**Exit condition:** clean baseline or documented pre-existing failures.

## Phase 1 - Navigation and shared internal-page primitives

- update `lib/rail.ts`
- stop shell service detection from depending on To do
- group `/services` and `/billing` under Plan & billing
- rename Overview -> Home, Business profile -> Business, Search -> Local SEO + AEO
- remove To do, OyeChats, Calls, Authors, Categories from primary rail
- build shared page/status/activity/attention primitives
- update `DESIGN.md` surface rules

**Do not redirect old routes yet.**

## Phase 2 - Adaptive intake and checkout compatibility

- add `client_intakes` schema/migration/RLS/query tests
- add `/personalize`
- change new account redirect to intake before `/plan`
- auto-save/resume answers
- selected service/package summary
- adjust checkout presentation
- payment-confirmation compatibility branch for completed new intake

**Exit condition:** new account can select service on marketing link, create account, complete adaptive intake, pay, and reach Home without old onboarding.

## Phase 3 - Kickoff and Home state model

- add `deriveClientHomeState`
- rebuild Home states
- implement contextual attention aggregator
- optional meeting URL persistence only if done safely
- remove `inFirstLook()` as final page-state authority
- preserve billing banners/access

## Phase 4 - Project readiness after kickoff

- implement kickoff-held -> website project submitted/SLA transition for website customers
- update timeline to support new flow without pretending `onboardingSubmittedAt` means kickoff
- admin/int tests

## Phase 5 - Requests

- rebuild list/detail UI
- implement intent-first new request form
- split plain support ticket creation from change-request creation
- include staff-created `waiting_on_you` in attention
- maintain attachments/read state

## Phase 6 - Website + Inquiries

- rebuild Website build/preview/live states
- add `/website/inquiries`
- migrate OyeChats data/view into Inquiries
- remove CMS rail leakage
- preserve preview/approval/revision backend

## Phase 7 - Business + Plan & billing + Settings

- rebuild `/details`
- allow non-website customers to use the appropriate Business sections
- group services/billing tabs
- remove meaningless billing progress
- redesign Settings without fake preferences

## Phase 8 - Social and Local SEO + AEO

- rebuild around approvals/results/work/report
- remove To do dependency from their customer-facing UI
- rename Search everywhere customer-facing

## Phase 9 - Legacy route cleanup

- migrate all internal `/todo` links
- redirect `/todo`
- redirect old OyeChats routes
- handle legacy onboarding accounts deliberately
- remove dead components/loaders only after usage search proves they are unused

## Phase 10 - Full QA

- desktop/tablet/mobile review
- keyboard/accessibility pass
- billing and RLS regression
- visual consistency pass
- production build

---

# 35. File-level implementation map

This is a starting map, not permission to edit only these files. Claude must search usages before changing contracts.

## Shell/navigation

- `apps/platform/components/v2/app-shell.tsx`
- `apps/platform/lib/rail.ts`
- `apps/platform/components/v2/rail.tsx`
- `apps/platform/components/v2/phone-bars.tsx`
- `apps/platform/DESIGN.md`

## Home

- `apps/platform/app/app-host/(protected)/page.tsx`
- `apps/platform/lib/first-look.ts` - legacy/compatibility only after new state model
- `apps/platform/lib/server/overview.ts`
- `apps/platform/lib/server/setup-call.ts`
- current first-look and overview components, to be replaced/refactored

## Intake/login/checkout

- `apps/platform/app/app-host/login/actions.ts`
- `apps/platform/lib/account-entry.ts`
- new `/personalize` route/components/actions
- `apps/platform/app/app-host/(protected)/plan/page.tsx`
- `apps/platform/app/app-host/(protected)/plan/actions.ts`
- checkout components under `components/panel/membership`
- `apps/platform/lib/server/payment-confirmation.ts`
- new DB schema/query/migration in `packages/db`

## Kickoff/project

- `packages/db/src/schema/projects.ts`
- project query modules
- `apps/admin/app/(protected)/clients/[businessId]/kickoff-actions.ts`
- `apps/admin/lib/server/website-moves.ts`
- `apps/platform/lib/website/timeline.ts`

## Requests

- `apps/platform/app/app-host/(protected)/requests/page.tsx`
- `apps/platform/app/app-host/(protected)/requests/new/page.tsx`
- `apps/platform/lib/server/requests.ts`
- current Requests components
- support/change-request query modules in `packages/db`

## Website/Inquiries

- `apps/platform/app/app-host/(protected)/website/page.tsx`
- `apps/platform/app/app-host/(protected)/website/pages/page.tsx`
- new `website/inquiries`
- current `oyechats` components/loaders
- `apps/platform/lib/server/website.ts`
- `apps/platform/lib/server/chatbots.ts`
- `apps/platform/lib/server/chatbot-conversations.ts`

## Business

- `apps/platform/app/app-host/(protected)/details/page.tsx`
- `details/actions.ts`
- business profile/hours/closures/announcement DB queries

## Plan/Billing/Settings

- `/services/page.tsx`
- `/billing/page.tsx`
- `/settings/page.tsx`
- existing loaders/actions

## Social/SEO

- `/social/page.tsx`
- `lib/server/social.ts`
- `/search/page.tsx`
- `lib/server/search.ts`
- associated components/view-model helpers

---

# 36. Acceptance criteria by final screen

## Home

Pass only if:

- there is no permanent generic checklist
- booked kickoff is obvious
- countdown has no seconds
- optional prep is clearly optional
- build/preview/live states are driven by actual backend facts
- real customer attention is impossible to miss
- no fabricated team/health/metric data appears

## Requests

Pass only if:

- customer can open a normal question without creating a change request
- thread replies/attachments work
- staff-created `waiting_on_you` requests surface to the customer
- change-request special states still work

## Website

Pass only if:

- customer can understand current stage within seconds
- preview/review is a first-class state
- initial revisions are distinct from monthly maintenance edits
- live state remains useful after launch

## Business

Pass only if:

- page title/meaning matches its content
- website-only controls are not shown to non-website clients
- every Edit control has a real backend write path

## Plan & billing

Pass only if:

- active services are more prominent than upsells
- displayed prices come from stored/subscription/shared billing data
- invoices/receipts remain intact
- no fake payment-method self-service exists

## Settings

Pass only if:

- password no longer visually dominates the entire page
- current privacy/delete/session capabilities remain
- no non-persisted settings are shown as working controls

## Social / SEO

Pass only if:

- measured data is distinguished from unavailable data
- customer approvals/actions are contextual
- generic To do dependency is gone from visible UX

---

# 37. Things Claude must explicitly NOT do

- Do not rebuild the app shell from the HTML mock.
- Do not replace shared billing calculations with hard-coded ₹ totals.
- Do not add a second customer task table for convenience.
- Do not mark optional prep as incomplete work.
- Do not automatically expose staff names from internal staff tables.
- Do not render a Join meeting link from `inviteeUri`.
- Do not call unavailable metrics zero.
- Do not show domain/SSL/hosting “healthy” without a real status source.
- Do not turn every support conversation into a change request.
- Do not remove legacy onboarding behavior before a compatibility path exists.
- Do not rename database enum values simply for UI copy.
- Do not break old deep links in the same phase as UI redesign without redirects/tests.
- Do not add notification/language/timezone controls without persistence.
- Do not make initial website revision feedback consume monthly maintenance edits.
- Do not allow browser-provided business IDs to scope customer writes.

---

# 38. Definition of done for the revamp

The revamp is complete when a new customer can:

1. select a service/package on the public pricing experience
2. create an account
3. answer a short adaptive intake that reflects the chosen services
4. see their already-selected package and correct shared package pricing
5. pay securely using the existing billing engine
6. land on Home without a long setup checklist
7. book a kickoff
8. return to a calm booked-meeting Home with a countdown and optional preparation
9. have staff mark the call held and see the website move into build without submitting old onboarding forms
10. see truthful project progress and activity
11. review and approve a preview
12. request initial revisions without using post-launch edit quota
13. see the site launch
14. use the portal after launch to understand ongoing value
15. communicate with BrandBasket through Requests
16. see only the services they own in the primary navigation
17. manage appropriate business facts
18. understand their services, bills, invoices and account settings without internal-process clutter

And the engineering implementation is complete only when:

- lint passes
- typecheck passes
- unit tests pass
- relevant integration tests pass
- production build passes
- RLS tests prove tenant isolation for new data
- billing regression tests prove pricing has not changed unintentionally
- desktop/mobile screens have been visually reviewed
- old deep links are either supported or intentionally redirected

---

# 39. Master instruction to paste into Claude Code

Use this after placing this specification in the repository, for example under `docs/plans/`.

> Implement the BrandBasket client portal revamp according to this specification. Treat it as a product and engineering contract, but verify every referenced code path against the repository before editing. First read the root `CLAUDE.md`, `apps/platform/CLAUDE.md`, `apps/platform/DESIGN.md`, and relevant Next.js 16 repository docs. Do not rewrite the app shell. Preserve authentication, tenant RLS, billing calculations, project states and existing secure query patterns. Work phase by phase, beginning with a baseline and then Phase 1 only. Before each phase, state the files/contracts you intend to change and search all usages. After each phase, run the relevant tests, lint and typecheck. Stop and report any mismatch between this document and the actual code instead of guessing. Never fabricate customer data, metrics, meeting links, staff identities or backend capabilities. Do not proceed to the next phase until the current phase passes its acceptance criteria.

---

# Appendix A. Existing code concepts to preserve

- `requireCustomerAccess` / `requireWebsiteClient` and related guards
- `withTenantScope` / RLS
- shared `readBundleSelection`, bundle/package calculations and order summaries
- existing support ticket/thread/attachment/read-state model
- existing project state enum and project event history
- existing preview image flow
- existing direct Cal.com booking capability
- existing business hours/closures/announcement actions
- existing invoice/receipt and renewal-failure handling
- existing Social and Search monthly snapshots/reports/deliverables
- existing OyeChats lead and conversation loaders

# Appendix B. Primary UX reference principles

The final portal should feel like a client relationship with a managed team, not software the client has to operate.

The fastest quality check for any proposed component is to ask:

1. Does this help the client understand what BrandBasket is doing?
2. Does this clarify what happens next?
3. Is the client action genuinely required?
4. Is the information real and supported by backend state?
5. Could this be simpler without losing useful information?

If the answer to the first four is no, the component probably should not exist.
