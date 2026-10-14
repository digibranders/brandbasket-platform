# Feedback and Support System Implementation Plan

> **For agentic workers:** Implement the agreed design task by task using `executing-plans`. Steps use checkbox syntax for tracking. This is an architecture and delivery proposal, not implemented application code.

**Goal:** Replace the platform account menu's email links with an accessible feedback popup, persistent requests, customer conversations, and a Fynix admin inbox with separate user-request and automatic-error views.

**Architecture:** Keep the shared account menu presentational. A platform-owned client provider controls one popup and connects it to authenticated server actions. Store requests and conversations in PostgreSQL through the existing Drizzle and row-level-security patterns; staff manage them through the admin app. Screenshots use separate private storage. Add browser/server error capture and a staff-only issue mirror, using a dedicated monitoring provider for collection and grouping.

**Tech stack:** Existing Next.js App Router, React, TypeScript, Zod, Drizzle/PostgreSQL, native dialog, shared Fynix UI tokens, Vitest, and a private local/R2 storage adapter.

**Status:** Proposed design. The user selected the Fynix admin inbox. This review changed only this planning document.

## 1. Findings from the repository

- `packages/shared/src/ui/panel/account-bar.tsx:325` renders Feedback as a `mailto:` link; Help does the same at line 352. There is no submission persistence or tracking in this flow.
- `packages/shared/src/ui/panel/dashboard-frame.tsx` renders two account bars: mobile header and desktop sidebar. They should share one popup controller rather than mount separate feedback forms.
- The frame is consumed by customer, free-listing, and affiliate shells. Affiliates can have no business. The current admin uses its own `TopPill` and `Dock`, rather than this shared frame.
- `apps/platform/DESIGN.md` defines the existing cream/burgundy palette, Newsreader and Hanken Grotesk typography, fields, buttons, spacing, and accessibility requirements. Preserve those patterns.
- `components/panel/pictures/image-cropper.tsx` supplies an existing native `<dialog>` precedent. `components/panel/form/panel-form.tsx` supplies form-state, field-error, pending, and focus behavior.
- `SessionUser.phone` identifies phone accounts. Their `email` can be an internal placeholder and must never be used for correspondence.
- `withUserScope` and `withTenantScope` already exist. Support should be available without a paid plan, including before membership payment; its permission check must not depend on billing or onboarding status.
- Current `media_assets` cover public website photos/logos. The R2 adapter exposes public URLs and public immutable caching. Feedback screenshots must use a separate private bucket/root and authenticated serving.
- The email package currently records messages through `createOutboxTransport`; that is a development outbox, not a reliable delivery queue or live provider.
- Existing account-exit feedback is anonymous retention research. Keep this identifiable support system separate from `account_exit_feedback` and the admin Leaving page.
- The platform's `app/app-host/error.tsx` and admin's `app/error.tsx` show fallback pages and error digests. They currently do not send automatic reports. Shared `errorLogInfo` deliberately excludes raw messages and stacks because database errors can include patient details, billing identifiers, and tokens. Preserve that boundary when adding monitoring.

## 2. Approach decision

| Approach | Benefit | Tradeoff | Decision |
| --- | --- | --- | --- |
| Native popup, requests, and admin inbox | Fits existing identities, billing context, UI, and phone accounts | Requires ownership of conversation and triage workflows | Recommended; selected by user |
| Popup connected to an external helpdesk | External assignment, email routing, and support operations | Additional integration, identity synchronization, and vendor dependency | Revisit when support scale requires it |
| Popup that only stores or emails submissions | Smallest initial change | No reliable customer follow-up or complete resolution workflow | Insufficient for the requested system |

## 3. Customer experience

### Entry and layout

- Keep the existing Feedback label; make its row a button. Selecting it closes the account menu and opens a popup titled **Feedback and support**.
- Help opens the same popup with **Get support** preselected. Docs keeps its existing destination.
- Offer **New request** and **My requests** inside the popup. After submission, show the reference, **View request**, and **Send another**.
- Use a centered dialog about 40rem wide on desktop. On phones, use the same dialog as a nearly full-height sheet, with safe-area padding, a scrollable body, and controls that remain reachable above the keyboard.
- Use short labeled category rows with icons and a one-line explanation, then one form. Avoid an eight-card grid or a separate multi-step wizard.
- Render outside the sidebar's stacking context; a native modal dialog provides the browser top layer. Maintain one controller across desktop and mobile triggers.
- Use the established tokens, fonts, field classes, buttons, and icon library. This is product form design; the taste skill's marketing-page layouts do not apply.

### Category choices

| Stored category | Customer label | Additional information |
| --- | --- | --- |
| `bug` | Report a bug | Affected area; optional steps, expected result, actual result, and whether it blocks work |
| `support` | Get support | Affected area and description of the help needed |
| `feature` | Suggest a feature | Optional problem to solve and desired outcome |
| `billing` | Billing or payment | Optional existing invoice/charge reference; never ask for card details |
| `website_change` | Website changes | Optional page and requested change; explain that scope and any charges need review |
| `account_access` | Account or sign-in | Account problem; no passwords or OTPs |
| `general` | General feedback | Comments, praise, complaints, or usability feedback |
| `other` | Something else | Free-form request for anything the categories missed |

The required fields are category, subject (3–120 trimmed characters), and description (10–5,000 trimmed characters). Conditional fields are optional and shown only for the selected category. Preserve common fields when the category changes; submit only the active category's optional details. All free-text detail fields have explicit server-side length limits of 2,000 characters, with a total serialized details limit of 8 KB.

### Context and screenshots

- Resolve requester and any business association from the signed-in session. Never ask customers to retype their identity or trust hidden form fields for it.
- Show a compact account/context summary. In-app replies work for everyone. A notification email is optional and only usable after confirmation; never require email to submit.
- Offer **Include technical details** with an inspectable summary: product area, route template, build identifier, browser family, and viewport. Default it off. Do not collect query strings, fragments, raw route identifiers, page content, console logs, cookies, or session tokens.
- Allow up to three PNG/JPEG/WebP screenshots, each at most 4 MiB and 12 MiB total input. Preview and remove them before sending. Re-encode server-side, strip metadata, and constrain dimensions/decode concurrency using existing image-processing patterns. Do not crop screenshots automatically.
- Screenshots are manual uploads. No automatic screen capture or recording.
- Preserve the draft while the provider remains mounted and after errors. Avoid localStorage persistence of sensitive descriptions/screenshots. Ask before discarding a dirty draft; do not silently lose it on Escape or backdrop click.

### States and accessibility

- Cover composing, uploading, submitting, success, validation errors, rate limiting, expired session, offline/network failure, and attachment failure.
- Keep text on upload failure; let the user remove the failed screenshot and submit without it.
- Focus the category/title area on open, the first invalid field on validation failure, and the confirmation on success. Restore focus to the actual account-menu trigger after close, because the selected menu row has unmounted.
- The modal needs a labeled heading, explicit Close button, focus containment, Escape behavior, error associations, and an always-mounted live status region. Reduced-motion settings must be honored.

## 4. Request ownership and access

Make a request **private to its submitting user**, with optional verified business context. Do not automatically expose account questions or screenshots to every business member.

- Use `withUserScope(getAppDb(), user.id, ...)` for requester reads and inserts. Customer RLS checks the requester identity through `app_current_user_id()`.
- When adding business context, derive it from verified membership using `getCustomerAccess`; use a tenant-scoped transaction where the database must validate that association. Affiliates can create a request with no business.
- Provide a dedicated support access helper based on session and account state. It must allow free, Care, Premium, and membership-checkout users, plus signed-in affiliates. It must not call a paid-only feature guard.
- Closing accounts retain their existing lock behavior; provide contact guidance on the restore-account surface rather than reopening their dashboard through support.
- Customer operations can create requests, append customer messages, and update their read cursor. They cannot choose priority, assignee, staff identity, internal visibility, or workflow status.
- Staff pages/actions call `requireStaffAccess()` every time. Staff queries use the staff connection, with actor identity resolved on the server and recorded in events.
- Internal notes have a staff-only RLS policy, not merely a UI condition. Attachment permissions inherit their parent message visibility.
- Host/origin restrictions apply to upload/download routes. Support links use the app-host URL, and reads of private content use `Cache-Control: private, no-store`.

## 5. Data model and workflow

Create a dedicated support schema, separate from onboarding, projects, public media, and exit feedback.

| Table | Responsibility and key fields |
| --- | --- |
| `support_tickets` | UUIDv7 ID, non-identifying unique display reference, requester user ID, nullable business ID, category, subject, status, staff priority, nullable assigned staff ID, bounded optional context, timestamps, version, and submission key |
| `support_messages` | Ticket ID, author identity/role, `public` or `internal` visibility, plain-text body, category-specific structured details on the initial message, created timestamp, and message submission key |
| `support_attachments` | Uploader, nullable ticket/message until attached, storage key, sanitized display filename, verified MIME, byte/dimension/hash metadata, staging expiry, and lifecycle state |
| `support_events` | Append-only status, assignment, priority, and category changes; actor, timestamp, and bounded structured before/after values |
| `support_read_states` | Ticket ID, reader user ID, and last-read public-message cursor; customer grants restricted to their own cursor |

- Create the ticket and initial message in one transaction. Attach only staged uploads belonging to the same requester, still valid and unclaimed. Enforce the count and size limits on the server.
- Enforce unique `(requester_user_id, submission_key)` for creation and author-scoped message keys for replies. A retry after an ambiguous network result returns the existing request/message rather than creating a duplicate. Conflicting payloads with the same key return a conflict error.
- Use composite parent IDs in foreign keys where needed so an attachment cannot name a ticket different from its message's ticket.
- Index requester + creation cursor, status + last activity, assignee + status, category + creation time, and message/event ticket cursors. Use cursor pagination, initially 25 items per page.
- Keep the display reference independent from authorization. Possessing a reference or UUID grants no access.

Workflow: **New → Triaged → In progress / Waiting on you → Resolved → Closed**. Staff may resolve from an active state or reopen to Triaged. A customer reply moves Waiting on you or Resolved back to Triaged; a Closed conversation is read-only and offers a linked new request. Validate transitions on the server and record them transactionally. Use a version check for concurrent staff changes; display a refresh message on conflict rather than overwriting another action.

Feature suggestions can remain Triaged without implying they are promised. Website-change requests do not mutate projects or authorize paid work automatically. Customer-reported impact is separate from staff-set priority.

## 6. Admin inbox and customer follow-up

- Add `/support` and `/support/[ticketId]` to the admin app. Inbox filters: status, category, priority, assigned/unassigned, and search by reference or subject.
- Each row shows reference, subject, category, requester/business label, status, latest activity, and assignee. Keep bodies and screenshots out of summary logs and global search indexes.
- The detail screen contains the customer conversation, private screenshot viewer, context summary, status/assignment controls, and history. **Reply to customer** and **Internal note** are explicitly different composer modes; internal notes are clearly labeled before sending.
- Include the inbox in admin Journey's attention summary with a link and actionable count. The existing Dock already has twelve items; do not append another squeezed icon. Start with a support link in the Journey header/attention area and the Clients page header. A dock redesign is separate scope.
- Customer `/support` and `/support/[ticketId]` pages provide request history and replies; the popup's My requests view links there. Put these under a dedicated signed-in support route group rather than the current business-only protected layout, so affiliates can open them too.
- Render customer support pages in the appropriate customer/listing/affiliate shell; users awaiting payment receive a minimal support shell with a return-to-payment link.
- Track unread public staff replies with a read cursor. Never count internal notes as unread customer activity. Read marking must use the last actually displayed message, so a reply arriving concurrently remains unread.
- Existing bell notices are derived current state, not a stored event stream. Add a derived **Support reply waiting** notice from unread conversations, and clear it by advancing read state. Supply this notice to all supported shells, including affiliates and listing accounts.
- Refresh after sends and on window focus. Do not introduce WebSockets for the first release.

In-app communication is required for launch. Live email/SMS notifications are a separate enhancement: first verify a real provider and implement a transactional delivery queue with attempts, backoff, and deduplication. `createOutboxTransport` alone must not be represented as delivery. Never promise email updates in UI until that path is verified.

## 7. Private files, abuse limits, and lifecycle

- Add a support-specific storage interface and adapter: isolated local root in development and a private R2 bucket in production, with no public URL method. Use opaque keys generated from server IDs and a support-specific key validator.
- Add authenticated serving routes in both apps. Look up the attachment row and authorize its parent before reading storage; return not found for unauthorized IDs. Use no-store, verified MIME, safe Content-Disposition, and `nosniff`.
- Validate upload host/origin and body size before decoding. Rate-limit creation to 5 requests per user per 10 minutes and 20 per day, replies to 30 per hour, and uploads to 20 per hour. Use the existing database limiter and return a retry time. These are initial configurable operational defaults.
- Keep staged uploads private and expire unused uploads after 24 hours. Claim uploads atomically when the request/message commits; expired or already claimed uploads are refused.
- Mark objects pending deletion before deleting storage and delete metadata only after storage succeeds. A maintenance command retries failed deletion and logs opaque IDs, without keeping screenshot contents in logs. This avoids losing the key needed for retry.
- Support account erasure: remove owned request bodies, contextual identifiers, notes, read state, and screenshots; any preserved aggregate analytics must be anonymous. Integrate a private-support deletion manifest with the existing erasure process so its current public-media deleter does not receive private-support keys. Cover retries and partially completed erasure.
- Proposed retention default: remove closed ticket content and screenshots 12 months after closure; keep only anonymous counts. Implement it as configuration and document it before rollout. This is a proposed product policy, not an assertion about an existing policy or a legal requirement.
- Plain text only for messages in version one. Do not render arbitrary HTML/Markdown or clickable user-supplied URLs without validation. Sanitize category/context at the boundary and do not log submitted bodies.

## 8. File boundaries

Paths below are relative to `fynix-platform/`.

| Files | Change and responsibility |
| --- | --- |
| `packages/shared/src/ui/panel/account-bar.tsx`, `dashboard-frame.tsx` | Add optional client interaction wiring; keep mail fallback for consumers that do not opt in |
| `packages/shared/src/lib/support.ts`, `support-form.ts` | Category/status types, bounded schemas, form parsing, workflow rules, and typed outcomes |
| `packages/db/src/schema/support.ts`, `queries/support.ts`, `queries/support-staff.ts`, `src/index.ts`, `src/schema/index.ts`, `migrations/` | Schema, indexes, constraints, RLS/grants, requester queries, staff operations, exports, generated migration |
| `apps/platform/components/panel/support/support-provider.tsx`, `support-dialog.tsx`, `support-form.tsx`, `support-attachments.tsx`, `support-request-list.tsx`, `support-thread.tsx` | Popup ownership, presentation, composer, file previews, history, and conversations |
| `apps/platform/lib/server/support-access.ts`, `support.ts`, `support-uploads.ts`, `apps/platform/lib/support-form-state.ts` | Session/identity resolution, transactional services, limits, upload orchestration, serializable client state |
| `apps/platform/app/app-host/(support)/layout.tsx`, `(support)/support/page.tsx`, `(support)/support/[ticketId]/page.tsx`, `(support)/support/actions.ts` | Signed-in support pages and actions, outside business-only protected layout |
| `apps/platform/components/panel/customer-shell.tsx`, `listing-account-shell.tsx`, `affiliate/affiliate-shell.tsx`, `membership-gate-shell.tsx` | Mount/wire provider, context, and support notices for each surface; payment shell gets a Help entry |
| `apps/platform/lib/server/account-panel.ts`, `packages/shared/src/lib/account-panel.ts` | Merge current unread-support state into notices; preserve existing billing/project notices |
| `packages/shared/src/server/support-storage.ts`, `r2-support-storage.ts`, `support-attachment-serving.ts` | Private local/R2 adapters and authorized shared serving logic |
| `apps/platform/app/api/support-uploads/route.ts`, `app/app-host/support-attachments/[attachmentId]/route.ts`, `apps/admin/app/support-attachments/[attachmentId]/route.ts` | Upload and private download boundaries with host/session/size checks |
| `apps/admin/app/(protected)/support/page.tsx`, `support/[ticketId]/page.tsx`, `support/actions.ts`, `apps/admin/components/console/support/` | Staff inbox, thread, and typed staff mutation UI |
| `apps/admin/app/(protected)/page.tsx`, `clients/page.tsx`, `components/console/staff-shell.tsx` | Inbox discoverability and attention counts without crowding the Dock |
| `packages/db/src/queries/account-erasure.ts`, `apps/platform/lib/server/account-erasure.ts`, support maintenance service/script | Content deletion, private object deletion manifest, expiry, retry, and retention execution |
| Co-located `*.test.ts`, `packages/db/src/support.integration.test.ts`, `docs/support-system.md` | Behavioral tests, real-role RLS tests, and operational documentation |

Keep reusable validation and workflow rules in shared pure modules, database access in DB queries/services, and app-owned actions outside shared UI. Do not import app aliases or server-only helpers into the account bar.

## 9. Implementation sequence and acceptance gates

For each behavior below, write and run the failing test first, implement the smallest complete change, then rerun it. Review at each milestone. Do not expose the menu change until the core customer/admin loop works.

### Milestone 1: Contracts, ownership, and persistence

- [x] Implement discriminated category parsing, limits, context allowlist, typed form outcomes, and workflow transitions.
- [x] Add schema, generated migration plus explicit grants/RLS, indexes, and requester/staff query functions.
- [x] Implement atomic creation, message append, transition events, optimistic concurrency, and retry keys.
- [x] Verify cross-user read/write denial, affiliation without business, business association validation, internal-note isolation, and concurrent duplicate submissions against real app/staff/public DB roles.

**Acceptance:** A requester can create and retrieve their own request, staff can manage it, and another customer or public connection cannot access its content.

### Milestone 2: Popup and submission

- [x] Add the platform provider/client wrapper and account-bar button callbacks. Mount once per shell rather than once per responsive account bar.
- [x] Implement category selection, conditional fields, draft preservation, inline validation, pending states, confirmation, and My requests.
- [x] Connect actions to the authenticated service; identity comes only from the session. Add Help preselection.
- [x] Verify both account-bar placements, menu-to-dialog focus transfer, dirty close, category changes, validation, offline retry, expired session, and phone-account display.

**Acceptance:** Feedback opens in the app, a real record is created exactly once, and its reference is shown. There is no mailbox redirect for opted-in platform shells.

### Milestone 3: Staff inbox and conversations

- [x] Implement admin filtering, pagination, detail, assignment, priority, public replies, internal notes, and event history.
- [x] Add Journey/Clients support entry points and attention counts without modifying the Dock layout.
- [x] Implement customer history/detail/replies, read cursors, and unread-support notices across customer/listing/affiliate shells.
- [x] Verify end-to-end customer submission → staff triage → public reply → customer unread notice → read/reply → resolve. Separately verify internal notes and their attachments never appear to the requester.

**Acceptance:** The team can complete a support conversation entirely in Fynix, including a phone-only account and an affiliate.

### Milestone 4: Private screenshots and lifecycle

- [x] Implement private storage configuration, bounded upload/decode, staged attachment ownership, previews, removals, and authorized serving.
- [x] Implement staged expiry, pending-deletion retries, proposed closed-ticket retention, and account-erasure integration.
- [x] Verify unsupported/corrupt files, MIME spoofing, oversize bodies, decode limits, fourth attachment, cross-user attachment IDs, public URL denial, orphan expiry, and interrupted deletion retries.

**Acceptance:** Screenshots work in both apps while direct public access remains unavailable. Deletion can finish after a transient private-storage failure.

### Milestone 5: Automatic errors in the admin inbox

- [x] Implement the monitoring design in section 13: client/server initialization, error-boundary reporting, explicit handled-failure reporting, and payload filtering before transport.
- [x] Add a staff-only issue mirror, verified provider synchronization, Automatic errors inbox view, and links between user requests and detected issues.
- [x] Verify browser exception, unhandled rejection, React fallback, server-render failure, unexpected caught action/API failure, duplicate occurrence, release regression, provider outage, spoofed webhook, and redaction behavior.
- [x] Upload source maps privately during builds, verify readable stack locations with a deliberate staging error, and ensure build tokens/source maps are not exposed to browsers.

**Acceptance:** A deliberate staging failure appears in Automatic errors without any user submitting feedback; repeats group into one issue. Monitoring failure cannot break the original action or error screen, and sensitive payload fields never leave the app.

### Milestone 6: Launch validation and rollout

- [x] Review source against the senior engineer checklist; verify runtime inputs, RLS, transaction boundaries, no `any`, and safe error handling.
- [x] Run scoped baseline checks and behavioral tests. Manually check desktop, narrow phone viewport, keyboard-only operation, and the mobile keyboard.
- [x] Deploy additive schema and private-storage configuration before exposing the new entry points. Verify production staff access and private file authorization with test requests.
- [x] Enable behind a server-controlled feature flag for internal accounts, then all platform accounts. A rollback disables new submission entry while keeping existing ticket history available.
- [x] Track creation success/failure, upload refusals, oldest untriaged request, unread reply count, and resolution duration without collecting message bodies in telemetry.

**Acceptance:** Complete core workflow and privacy tests pass; the team has an owner for daily triage; no email-delivery promise is shown unless actually verified.

## 10. Verification commands for implementation

This review changed only this planning document, so no lint/typecheck/build results are claimed. During implementation, run these scoped app gates from the indicated working directories:

```bash
# apps/platform
npm run lint
npx tsc --noEmit
npm run build
npm run test

# apps/admin
npm run lint
npx tsc --noEmit
npm run build
npm run test
```

Also run the repository's Next-aware type generation (`pnpm --filter @fynix/platform typecheck` and `pnpm --filter @fynix/admin typecheck`) so new route types exist. App builds consume the changed workspace packages, which do not have standalone lint/build scripts. Run their existing scoped checks from the monorepo root:

```bash
pnpm --filter @fynix/shared typecheck
pnpm --filter @fynix/shared test
pnpm --filter @fynix/db typecheck
pnpm --filter @fynix/db test
pnpm db:migrate:test
pnpm --filter @fynix/db test:integration
pnpm --filter @fynix/shared test:integration
```

Read the installed Next.js guides under the app's resolved `node_modules/next/dist/docs/` before implementation, as required by the app AGENTS.md. Run DB integration only against the repository's explicitly validated `*_test` connections. Add support tables to the integration fixtures through the existing test infrastructure. Do not claim a mocked authorization test proves RLS.

## 11. Scope after the first release

The proposed first release includes the popup, all eight categories, real persistence, admin triage, public replies/internal notes, customer history, unread state, private screenshots, abuse limits, deletion lifecycle, and an Automatic errors view. Milestones are delivery order within that release. Monitoring provider configuration is a deployment dependency; the support workflow can be enabled independently if automatic reporting is still being configured.

Potential later extensions: verified email/SMS notifications, help-article suggestions, duplicate feature grouping, a public voting board, external issue-tracker synchronization, live chat, and SLA reporting. These require separate product decisions and should not delay the initial complete loop. Do not add automatic AI triage, screen recording, or a public feedback feed by default.

## 12. Proposal review

- [x] Covers the popup, broad category selection, persistence, Fynix admin management, and customer follow-up.
- [x] Separates generic feedback from anonymous exit feedback and paid website-change execution.
- [x] Accounts for phone identities, affiliates without businesses, free plans, checkout, and account closing.
- [x] Specifies requester ownership, private staff notes, retry behavior, concurrent staff edits, unread state, and private screenshots.
- [x] Includes staged-upload cleanup, retention proposal, account erasure, rollout, and concrete acceptance checks.
- [x] Does not imply the current email outbox delivers notifications or that the current public media bucket is private.
- [x] Distinguishes user-submitted tickets from automatic incidents, with capture limitations, grouping, provider synchronization, privacy controls, and independent rollout.

## 13. Automatic bug reporting: added after the user's follow-up

### One customer popup; two admin views

Feedback and Help use the same popup. Feedback starts with the category selector; Help preselects Get support. Automatic reporting requires no popup interaction and creates **engineering issues**, not messages falsely attributed to customers.

The admin inbox has **User requests** and **Automatic errors** views. A staff member can link several user requests to one automatic issue. An error screen may offer Report this problem, attaching the opaque event reference to a real user-submitted request; never submit a customer conversation silently.

### Capture coverage

| Failure | Capture point |
| --- | --- |
| Uncaught browser exception or unhandled promise rejection | Early client monitoring initialization in `apps/platform/instrumentation-client.ts` |
| React rendering failure handled by a fallback | Existing `app/app-host/error.tsx` and a root `app/global-error.tsx`; report once per occurrence |
| Uncaught server rendering, route, or action exception | `apps/platform/instrumentation.ts` and Next's `onRequestError` hook |
| Unexpected exception caught and converted to a friendly response | Explicit call to a shared safe reporting helper at selected server action/API catches |
| Selected API/server-action operation failure | Stable operation ID, server-issued correlation ID, and safe error classification; connect frontend symptom to server occurrence |
| Payment/email/SMS dependency failure | Explicit operational reporting at the existing dependency boundary; distinguish a rejected payment or invalid input from an unexpected service failure |

Apply the same hooks to `apps/admin` in a separate monitoring project or surface filter so staff-console errors do not inflate platform impact. Keep development/staging/production separate.

Ordinary field validation, incorrect credentials, user cancellation, expected business-rule refusals, and transient offline errors do not automatically become engineering bugs. Filter browser-extension noise and classify third-party script errors separately, retaining errors that indicate a broken Fynix operation.

Capture cannot guarantee every user-side occurrence: blockers, an offline browser, and process termination can prevent delivery; cross-origin scripts may obscure stack details. Incorrect output that throws no exception needs explicit business assertions, workflow checks, or a user report. Do not advertise complete coverage.

### Recommended implementation

Use a dedicated error-monitoring SDK/provider such as **Sentry**, while keeping the operational inbox in Fynix. It supplies collection, grouping, release/source-map support, and engineering diagnosis. The provider is a recommendation, not an installed or authorized external project. During implementation, select an SDK version compatible with the installed Next/React versions and verify its supported instrumentation and integration APIs.

Build a small adapter so provider IDs and URLs do not enter shared UI contracts. A first-party collector is possible, but would also require ingestion protection, durable buffering, grouping, symbolication, storage quotas, regression detection, and cleanup. Avoid maintaining that infrastructure in the initial support implementation.

The recommended flow is:

`Browser/server failure → local filtering and safe context → monitoring provider → verified webhook/reconciliation → Fynix Automatic errors view`

Provider notifications may describe only new/regressed issues or alerts, rather than every occurrence. Treat them as refresh triggers and reconcile counts/status from the provider API; do not increment a count once per webhook and call it the occurrence total. Record when the summary last synchronized. Use bounded retries and periodic reconciliation to recover missed updates.

### Issue contents and triage

Each grouped issue shows a safe title, severity, surface, product area/route template, release, first/last seen, total occurrences, approximate distinct affected users, browser family, status, assignee, and linked customer requests. A separate detail link opens engineering diagnostics in the provider's authenticated interface.

Example: **Saving a booking failed · 27 occurrences · 6 affected users · Production**. Those numbers are an example of the proposed display, not measured app data. Repeats update the same issue. A recurrence after resolution can mark the issue Regressed; an issue needs investigation before staff claim a confirmed bug or a fix.

Use New, Investigating, Resolved, and Ignored for engineering issues, plus a regression flag. Keep these separate from support conversation statuses. Alert staff on a new high-impact issue, regression, or configurable rate increase; avoid a new alert for every occurrence. Severity derives from affected operations and impact, not only the JavaScript exception class.

### Data, authorization, and correlation

- Add staff-only `error_issues` records with unique `(provider, project_id, provider_issue_id)`, surface/environment, safe summary, counters, first/last seen, release, synchronization time, and staff triage fields. Store summaries locally, not full raw provider payloads or stack traces.
- Add staff-only `support_ticket_error_links` with unique ticket/issue pairs. A customer's My requests page never exposes Automatic errors or another user's impact details.
- Resolve any internal user/business association on the server. Provider identity is an opaque pseudonymous ID; do not send names, email, phone, or business names. Anonymous/signed-out occurrences have no confirmed user association. Distinct counts are approximate and must be labeled accordingly.
- Link browser/server occurrences using a server-generated correlation ID. Never treat a client-supplied user ID or error reference as proof of ownership. Request linking must check a server-verifiable association, or be performed by authorized staff.
- Verify provider webhook authentication according to its current official integration docs before accepting payloads. Enforce body bounds, allowed project/environment, event-id deduplication, and rate limits. Keep provider API/auth tokens server-side and least-privileged.
- Decide whether workflow resolution is Fynix-owned or provider-owned before wiring synchronization. Recommended: Fynix owns staff assignment/notes, provider supplies occurrence data; an explicit resolve action updates provider status and marks local resolution only after confirmation. A failed provider update remains visibly pending/retryable.

### Preserve the current privacy boundary

Automatic diagnostics are separate from the optional technical-context checkbox on a customer submission. Document minimal error telemetry and its controls in product privacy information; turning off submission context does not silently claim to disable independently configured monitoring.

- Filter **before transmission** in every runtime. Preserve `errorLogInfo`'s rule: raw Drizzle/database messages, query parameters, and cause objects may contain sensitive user data and cannot be sent through an unrestricted `captureException(error)` call.
- Send an allowlisted safe exception class/operation code, sanitized source-frame locations, error digest/event ID, route template, release, and browser family. For generic database errors, use safe PostgreSQL codes/constraint names and source frames without query text or variables.
- Strip names, contacts, cookies, authorization headers, request/response bodies, form values, URL queries/fragments, dynamic record IDs, and stack-frame source snippets. Do not mirror raw telemetry to the support inbox.
- Keep automatic console/network breadcrumbs, session replay, screenshots, profiling, performance payloads, and local-variable capture disabled unless separately designed and reviewed. Use allowlisted operation breadcrumbs when needed; no blanket console interception.
- Use private source-map uploads and server-only build credentials. Source maps assist diagnosis but are not publicly downloadable application artifacts.
- Initial retention proposal: provider event retention of 30 days where the chosen plan supports it; Fynix summaries without customer-identifying payloads for 90 days after resolution. Pseudonymous identity mappings and any local event associations follow account-erasure handling. Verify provider deletion capabilities/configuration before claiming erasure coverage.
- Reporting is bounded and fails independently: timeouts, small in-memory buffers, rate limits, and no unbounded retries. Never replace a customer's original failure with a reporting failure or recursively report the reporter's own errors.

### Additional file boundaries and tests

- `apps/platform/instrumentation.ts`, `instrumentation-client.ts`, `app/global-error.tsx`, existing `app/app-host/error.tsx`, plus equivalent admin files: runtime capture integration.
- `packages/shared/src/lib/error-report.ts`, `server/error-report.ts`: safe event contracts, filtering, and reporting adapter. Keep raw error processing server-side where appropriate.
- `packages/db/src/schema/error-issues.ts`, `queries/error-issues.ts`, migration and exports: staff-only issue mirror and ticket links.
- `apps/platform/app/api/error-monitoring/webhook/route.ts`, provider adapter, reconciliation service, and maintenance script: authenticated synchronization. Endpoint is integration-owned, not an unrestricted public error-ingestion API.
- `apps/admin/app/(protected)/support/errors/page.tsx` and `errors/[issueId]/page.tsx`: Automatic errors summary/detail. Resolve the static `errors` route independently of the existing `[ticketId]` route.
- Tests: fixture errors containing patient details, tokens, billing identifiers, query strings, and nested causes must produce payloads containing none of them; caught expected errors produce no issue; duplicate hooks/webhooks remain idempotent; reporting provider timeout leaves application behavior intact; client correlation cannot impersonate another account; a staging crash with no user submission reaches the staff-only inbox.

References verified for the design: [Next.js client instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client), [Next.js server instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation), [Next.js error handling](https://nextjs.org/docs/app/getting-started/error-handling), [official Sentry Next.js SDK](https://github.com/getsentry/sentry-javascript/tree/develop/packages/nextjs), and [Sentry event filtering](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/filtering/). The installed Next documentation takes precedence for implementation in this checkout.
