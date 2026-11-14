# Current journeys (customer and staff)

Customer journeys J1 to J11 come from the customer audit, staff journeys and queues from the admin audit, email links from the email map. All are read from code at c702f6c7. Nothing was run in a browser.


---

<!-- source: customer-ux/customer-journeys.md -->

# Customer journeys, step by step

Labels: V = Verified in code, R = Reported in historical document, I = Inferred, H = Design hypothesis, U = Unknown. Paths relative to apps/customer/src unless stated. Back/forward, expired link, permission denial and mobile are noted per journey. Nothing here was run in a browser; behaviour is read from code.

## J1. Landing handoff to sign up

1. Marketing site links to `/signup?plan=website,growth` (also older `plan=managed`, `addons=`, ad `start` token). `readEntryRequest` parses it (features/entry/rules/account-entry.ts). `/join` and `/login?new=1|plan=` permanently redirect to /signup keeping params (app/(auth)/join/page.tsx, login/page.tsx:22-24). V.
2. /signup (app/(auth)/signup/page.tsx:34-58): already signed in goes to / (or /checkout if the link names a plan); signed in with no business sees NoBusiness. Basket priced by `loadSignUpBasket`. `start` token prefill only when the secret verifies. V.
3. Form (features/entry/components/sign-up-form.tsx): business name, name, email, country/state, phone with country code, password, terms checkbox. Turnstile checked server-side (`checkHuman`, entry/actions.ts:61). V.
- Success: details step returns an OTP step; code confirmed creates the listing account and redirects to `/start?services=...` (entry/actions.ts:98-100) or to an invite return.
- Failure: wrong code, rate limit with countdown (use-otp-retry-cooldown.ts), refused, send failed: all return `SignUpFailure` and keep the form (sign-up-form.tsx:54-58).
- Retry: "Send a new code" (cooldown), "Change email".
- Back/forward and refresh: the code step lives in `useState`, so refresh returns to details and nothing is kept server side (sign-up-form.tsx:80-103). Cost is re-typing, protected by OTP rate limits. V.
- Expired code: code works 10 minutes (copy at sign-up-form.tsx:117); a stale code returns wrong-code message. I.
- Mobile: single column; `EntryScreen` art becomes a band. I.
- Staff counterpart: admin /leads (attribution from `start` token, apps/customer/src/app/api/leads/route.ts) U for display.

## J2. Plan or basket selection, questions

1. /start (app/(pay)/start/page.tsx): `loadStart` redirects members home, sends no `?q=` to the first unanswered question or the summary, unknown `q` to the summary (features/start/loader.ts:75-95). Each answer is saved on submit (question-form.tsx) so refresh and Back resume. V.
2. Summary lets the person change services (`basket-form.tsx`) and shows the same price rows as checkout. V.
- Failure: price read failure shows aside error only (`load("start.aside")`).
- Mobile: aside stacks. I.
- Concern: first-month offer rows ("first month offer", `TRIAL_ADD_ON_IDS`) and `adCredit` line exist in this screen (start/loader.ts:4,113) while root CLAUDE.md says the only offer is free monitoring with all three. Owner decision needed (finding C3).

## J3. Checkout and payment

Entry: summary "Go to checkout", `/signup` redirect, Home "Pay", (app) layout hold, aliases `/plan`, `/onboarding/review?payment=`.

1. /checkout (app/(pay)/checkout/page.tsx, features/checkout/loader.ts:87-111):
   - paid goes Home with ?welcome=1; lapsed goes /billing; non-owner sees "Only the owner can pay" banner (no redirect, avoids a loop with the layout hold).
   - `recordFirstPaymentIfHeld` asks Razorpay about a still-open checkout first, so a payment the webhook missed is recorded and the person moves on instead of seeing Pay again (loader.ts:97, commit c702f6c7). V.
   - intake incomplete goes /start.
   - views: pay, waiting (PaymentWaiting reload), under-review, no-plan, owner-only (checkout-screen.tsx:20-48).
2. Pay (PayForm confirm dialog, then `/checkout/pay` opens Razorpay (app/(pay)/checkout/pay/page.tsx) with callback `/billing/pay/callback` and a `dismissHref`).
- Success: callback route (app/billing/pay/callback/route.ts, 303 redirect to an allow-listed destination) returns to checkout with `?payment=received|failed`; checkout `isWaitingOnPayment` (rules/membership.ts:330-333) shows PaymentWaiting until the webhook records it, then redirect to `/?welcome=1` (Home reads first payment for Tag Manager, page.tsx:30). Payment received email sent from the recording path (packages/shared/src/server/payment-emails.ts:84-105). V.
- Failed: `?payment=failed` banner "We couldn't confirm that payment... try again below" (checkout-screen.tsx:78). V.
- Pending: PaymentWaiting with delayed text and support mailto. V.
- Webhook-missed: handled by the pre-check above; an internal timer route `/api/internal/check-first-payments` exists (purpose inferred from its name, I).
- Dismissing the Razorpay window lands where a failed payment would. V.
- Back/forward: after pay, /checkout redirects Home (paid). Fake provider pages are dev only and 404 otherwise.
- Permission denial: editor/viewer see owner-only banner; Home still shows a Pay button to them (home-screen.tsx:100-110). V.
- Mobile: two column grid becomes one; Help in header is mailto only (pay layout:20). I.
- Staff: admin /payments, clients/[id]/billing, /deliveries (webhook log). V (routes exist).

## J4. Onboarding intake and kickoff

1. Home state `kickoff_unbooked` or `kickoff_booked` (features/home/rules.ts:62-77). KickoffTask offers the slot picker and Book (calls/components/kickoff-panel.tsx:24-51). Missed call line when staff marked missed (home-screen.tsx:122-124).
2. Checklist: "Setup checklist" at /checklist?item=<key>, each item saves alone in a sheet (app/(app)/checklist/page.tsx). Only reached from Home or old /onboarding aliases (no sidebar entry; finding N2).
3. After the call: staff mark held; timer `/api/internal/start-builds-after-kickoff` starts the build (24 hour fallback). Until then `kickoff_unconfirmed` claims nothing and offers Book a new time (rules.ts:82-107). V.
- Viewer or phone-only account cannot book (home-screen.tsx:119-123 text). V.
- Booking read failure: Book a call button vanishes silently (R: E2E-REVIEW-2 O-4, code `BookCallAction` returns null, home-screen.tsx:55). Still true. V.
- Staff: clients/[id] page and project tab, /calls.

## J5. Website preview, feedback, approval, launch

1. Staff send a preview from the console (apps/admin/lib/server/project-preview.ts). Customer gets `previewReadyEmail` whose only link is the external preview URL, and whose copy says "Reply and tell us what to change, or let us know if it's ready to go live" (packages/email/src/templates/preview-ready.ts:14-17, project-preview.ts:61). It does not link /website. V.
2. Customer opens /website: `view.kind === "preview"` shows "Your preview" (picture from `/website/preview-image`), "What do you think?" with Approve and go live (inline confirm, focus moves to the question) and Ask for changes (dialog), rounds line (website-screen.tsx:84-139, preview-decision.tsx). V.
- Approve: `approvePreviewAction` (requireWebsite write, role not viewer) moves status, emails the team, redirects `/website?response=approved` banner. `ProjectNotAwaitingResponseError` redirects `not-ready` notice. V (website/actions.ts:42-54).
- Ask for changes: transaction counts a round, saves a `website_change` ticket, links it, sends team alert and a "changes received" email; body text stays in the box on failure (preview-decision.tsx:58-64; actions.ts:83-136). Rounds used up swaps the dialog for an "Ask for a change" link to Requests (preview-decision.tsx:101). V.
- Double press: `feedbackKey` fresh per render makes it one ticket. V.
- Expired or already answered: `?response=not-ready` notice. V.
- Launch: staff launch emails `websiteLiveEmail` (external https hostname link). Home state `launched` for 7 days (LAUNCH_GREETING_DAYS) then `ongoing`. V.
- Mobile: Columns collapse to one column; preview picture full width. I.
- Back/forward: after redirect with `?response=` Back returns to the form view that no longer exists (project moved); page re-reads status. I.
- Hypothesis (H): approval only exists in the dashboard but the email teaches replying; a reply bypasses round counting and the approved state.

## J6. Social review and approval

1. /social (requirePaid, social service). Two implementations chosen by env: with SOCIAL_AUTO_URL/KEY the legacy page (`LegacySocialPage`) plus tabs See posts (/social/review) and Analytics; without it `SocialOverview` with ApprovalsSection (app/(app)/social/page.tsx:23-26). V.
2. Overview: "Waiting for your approval" cards, Approve, Approve all, Review post sheet, Ask for a change (features/social/components/approvals-panel.tsx:73-139). `approvePostsAction` is `requireService("social",{write:true})` (features/social/actions.ts:23-24).
3. Legacy review: keep or drop topics, edit headline, change day, draw pictures, approve (legacy-social/components/review-workspace.tsx). Errors surface in `useReviewAction` catch (use-review-action.ts:33-35). V.
- No email is sent when posts wait for approval from the templates folder (no social template exists); the `needs_approval` notification topic exists (packages/db/src/schema/notifications.ts:10). Delivery path U.
- Lapsed: reading allowed, approve refused by live guard goes /billing. V.
- Mobile: social fills width; channel column. I.
- Staff: clients/[id]/services, /ads, /ad-credit, /deliveries. U for the exact approval counterpart.

## J7. Ads requests

- Paid Ads page is read-only: spend vs budget, leads, cost per lead, campaigns table, plus "Ad money added by us each month" (features/social/components/social-screens.tsx:100-140). Only action: Ask for a change, which opens a request with `about=website` (social/components/parts.tsx:31, website/rules/paths.ts:10). Request intent is "Posts or ads" (requests/rules.ts:110), shared with Social. V.
- No self-serve campaign change, budget change or pause. Intentional or not: U.
- Staff: /ad-results, /ad-credit, /ads (dormant per CLAUDE.md in admin).

## J8. Monthly activity and reports

1. Timer sends `monthlyReportEmail` per service to the owner (packages/shared/src/server/monthly-reports.ts:236-258) with `/reports/<yyyy-mm>` and a PDF link `/reports/<month>/pdf?service=`. Skipped when the owner switched off the topic, phone-only accounts (no email), or already sent. V.
2. /reports lists sent reports; sidebar link appears only after the first sent report (rules.ts:123). Month page shows per-service blocks, a per-service error banner and PDF download (report-screen.tsx:30-39). V.
3. Home `ongoing` state: overview with metrics and recent activity (home/components/panels.tsx). U for individual panels.
- Expired or invalid: malformed `/reports/xyz` gives 404 (reports/[month]/page.tsx:12). A month with no report: empty state (reports tests). I.
- Permission: all roles read; signed out goes /login then Home (loses the report). V.

## J9. Requests, change requests, quotes, support

1. New request dialog (Ask for a change links, Requests button, search "New request", Help). Intents: Change my website, Posts or ads, Local SEO + AEO (retired), Ask a question, Send you something, Something is not working, Billing (requests/rules.ts:109-116). Service intents only if bought. V.
2. `sendRequestAction`: rate limit 5 per 10 minutes and 20 a day (website/actions.ts:56-66 same rule), submission key, team alert (requests/actions.ts:~100-110). No confirmation email to the customer is sent from this action (the supportRequestOpened template is used only when staff open a request for a client, apps/admin/lib/server/staff-opened-request.ts:81). V.
3. Staff reply/quote: email `changeRequestUpdateEmail` (kinds reply, quote, started, ready, done, closed) links `/requests?open=<id>`; the bell lists quote waiting and ready to check. V.
4. Request page: Accept quote then pay via `/checkout/charges/<id>` (Razorpay), Decline, Approve change, Reopen, Reply (next-step-panel.tsx:34-90). Closed conversation says "Start a new request" (request-detail.tsx:110). V.
- Failure: field errors and banners; a dropped request on reply/new-request forms goes to the route error boundary (see UX findings U2). 
- Permission: another business's or malformed id gives the same 404. Viewers cannot reply (U).
- Mobile: DataTable collapses; inspector sheet. I.
- Staff: admin /support, /support/[ticketId], /support/new, clients/[id]/requests. V (routes exist).

## J10. Billing, invoices, services

1. /billing (all states) shows state panel plus services panel and bill. Owner: Add service dialog opens a combined Razorpay subscription via `/billing/services/pay`, then callback with `return=billing`; Keep, Cancel a service dialog (cancelServiceAction), Options menu (billing/components/services-panel.tsx:14-231). V.
2. Failed renewal: banner "We could not take your last payment" with See billing, then "Change payment method" to /billing/payment, then Change dialog which files a billing request asking staff for a secure link (payment-method-request.tsx header; gate G7). Two screens plus a manual loop. V.
3. Payment failed email Pay now goes to `/billing` (packages/shared/src/server/payment-emails.ts:164), not the pay step. V.
4. Invoices: table and Download all `/billing/receipts` (owner only). V.
- Lapsed: Reactivate card (`reactivateAction`, `requireOwner`) opens Razorpay via `/checkout/pay` with `RETURN_TO_BILLING`; confirmation banner "Payment confirmed. Your website is back online." V.
- Back/forward: `?charge=` and `?payment=` notices persist in the URL; refresh re-shows the banner. I.
- Permission: editors and viewers read; actions refuse. V.
- Staff: /payments, /invoices, /pricing, /coupons, clients/[id]/billing and services.

## J11. Invitations

1. Owner: Settings > Team > Invite someone (invite-dialog.tsx, `createInviteAction`, features/team/actions.ts:60-90): rate limit, invite row, email via intake connection; if the email fails the invite is revoked so the address can be invited again. V.
2. Invitee: email link `/invite/<token>`. Page checks token format only (invite/[token]/page.tsx:20-26). Signed out: Sign in or Create account both carry `?next=/invite/<token>` (the only supported return, team/rules.ts:108-111). Signed in: "Join the team" with button; opening the link changes nothing so scanners cannot burn it. V.
- Expired, revoked, used, wrong address: the refusal appears only after pressing Join (`refusalMessage`, accept-invite.tsx:12-17). R: E2E-REVIEW-2 says all those states were tested. V.
- Owner side: Waiting for a reply list with Revoke; "Remove member". V.
- Mobile: dialog; two stacked buttons. I.
- Staff: clients/[id]/people.

## J12. Cancellation, closure, recovery, reactivation

1. Cancel one service: Plan & billing > Cancel a service dialog (owner, `cancelServiceAction`, live guard): keeps running to period end; "Keep" undoes. V.
2. Cancel everything: Settings > Privacy and data > Delete account (`/settings/delete`, owner): reason (required), optional comment, then DELETE and password; lists plan end date and the erase grace period (`ACCOUNT_CLOSURE_GRACE_DAYS`). There is no cancel-plan entry in Plan & billing. V.
3. After closing: signed out everywhere; every guard sends the account to /restore-account: Restore, Keep my plan (new mandate via /restore-account/keep-plan), Sign out. If nothing is done it erases after the date (timer `/api/internal/erase-closed-accounts`). V.
4. Lapsed (plan ended): banner Reactivate, Home task Reactivate, Plan & billing ReactivateCard. V.
- Email on closure: no template for closure, deletion scheduled, or cancellation confirmation exists in packages/email/src/templates. V (absence). Whether Brevo sends one elsewhere: U.
- Back/forward: closure form keeps `reason` in component state between its two steps; refresh loses it. I.
- Mobile: plain forms. I.
- Staff: /leaving, privacy-requests, clients/[id]/people.

## J13. Passwords, setup links

- Forgot password: same answer for any account (features/entry/actions.ts:107). Reset link `/reset-password/<token>` shows the form even for used or expired tokens; the failure appears after submit (page comment lines 9-12). V.
- Staff-sent setup link `/setup/<token>`: validated before the form; shows no-longer-works or rate-limit messages (app/(auth)/setup/[token]/page.tsx:17-35). V.
- Affiliate setup `/affiliate/setup/<token>`: same plus three modes. V.


---

<!-- source: admin-operations/admin-journeys-and-queues.md -->

# Admin journeys and queues (audit at c702f6c7)

Labels: Verified in code | Reported in historical document | Inferred | Unknown. Paths relative to `brandbasket-platform/`.
"Owner" means a stored assignee column that a human sets. "Queue" means a screen or rail count that lists the work.

## 0. Ownership fields that exist

| Work | Owner column | Set by | Auto-assigned? | Evidence |
|---|---|---|---|---|
| Lead / enquiry | `leads.assigned_staff_id` | `assignLeadAction` | No | `leads/[leadId]/actions.ts:68-81`; `packages/db/src/schema/leads.ts:64` |
| Website project (builder) | `projects.assigned_staff_id` | `assignBuilderAction` (inside a closed fold) | No | `website/actions.ts:63-71`; `components/project-controls.tsx:70-84` |
| Support ticket | `support_tickets.assignee_staff_id` | ticket editor | No | `support-admin-actions.ts:43`; `support/page.tsx:51` |
| App error | assignee on issue page | issue page | No | `support/errors/[issueId]/page.tsx:33-44` |
| Change request, deliverable (post/page/listing), connected account, ad campaign, monthly numbers, add-on setup, press release, chatbot, report review, privacy request, breach, domain move, closure | None | n/a | n/a | schemas and sections read in this audit |
| Staff who created a deliverable | `created_by_staff_id` (history, not ownership) | on create | n/a | `packages/db/src/schema/deliverables.ts:52` |

## 1. The journey, stage by stage

### 1.1 New account to paid customer
| Step | Staff surface | Owner | State | Due / SLA | Customer sees |
|---|---|---|---|---|---|
| Visitor leaves details on website form | `/leads` (Enquiries), Today "New enquiry" | `assignedStaffId` (manual) | lead status new, to_contact | 1 hour late limit (`today-queue.ts:52`) | nothing until staff act |
| Staff send setup link | `/leads/{id}` `sendSetupLinkAction` | lead owner | invite_sent | none | setup email, `/setup/{token}` |
| Customer signs up, has business, not paid | Today "Signed up, not paid"; `/clients` stage Not paid ("Follow up on sign-up") | none | `account_created` | 2 days (`today-queue.ts:57`) | checkout |
| Payment captured by webhook | Money > Payments | none | first payment | none | receipt email, dashboard unlocked |
| Webhook missed | Today "Payment needs a look" (finance only) and Payments "Needs a look"; recovery timer `brandbasket-first-payment-check` is installed but NOT enabled (`deploy/vps/install.sh:453`) | none | flagged payment | 1 day (`today-queue.ts:54`) | receipt only after staff "Record a manual payment" (`actions.ts:119-133`); until then the customer may sit at pay-waiting |
Gap: a support-role staff member never sees flagged payments (`today.ts:84`). Verified in code.

### 1.2 Intake and handoff
| Step | Where | Notes |
|---|---|---|
| Short questions before paying (`client_intakes`) | Client Overview "What they told us" | read-only; `page.tsx:131-152` |
| Website setup answers | Client Overview "Setup answers n of m" (legacy onboarding steps) | `page.tsx:154-171` |
| Social and Ads setup answers (`service_setup`) | Nowhere in the console | only customer app reads or writes them (`rg listServiceSetups`); Verified in code |
| Notes for the builder, logo and photos | Website tab | `website/page.tsx:260-315` |
Handoff finding: for Social and Paid Ads there is no handoff screen, no first task and no owner. The only trigger is the "add-on to contact" row in Today (kind `add-on`, "New add-on to set up: Social Media Management"), cleared by "mark contacted", which has no customer-visible effect (`add-ons-admin.ts:139-153`). Verified in code.

### 1.3 Staff assignment
No auto-assignment exists anywhere (`rg assignedStaffId` shows only manual setters). The board filter "No builder" is the only unowned view. Today does not show owner and has no "mine" filter. Requests has a "Mine" pill (`support/page.tsx:86`); Enquiries has an owner filter (`enquiries.ts`); the Board has Builder filter. There is no cross-type "my work". Verified in code.

### 1.4 Kickoff
| Step | Staff surface | State | Due | Customer sees |
|---|---|---|---|---|
| Customer books via Cal.com | `/calls`, client Website tab "Kickoff call" | booking | call time | "Kickoff booked" countdown |
| Call ends, nobody marks it | Today "Did the kickoff happen?" (14-day look back), `/calls` Just finished | overdue from call end | none | "We're confirming your call" |
| Staff mark held (with notes) | `completeKickoffAction`, website tab, messages tab | project onboarding to submitted | first preview due 48h after call | "We are getting your website started" |
| No-show / rescheduled | `/calls` buttons | booking cleared | none | "Book your kickoff" again |
| Nobody acts | timer `start-builds-after-kickoff` moves it after 24h when `KICKOFF_AUTO_START` is on (default) | submitted, label "started automatically" | 48h | normal build states |
Automatic kickoff is still the default. The timer unit is enabled only if the first deploy created the release dir (`deploy/vps/install.sh:447`). Social-only and Ads-only customers have no kickoff concept at all; the playbook hypothesis that such a customer stays in onboarding is still unexamined (`docs/redesign-29-oct-2026/antigravity-e2e-audit-playbook.md:139`, Reported). Verified in code: Today kickoff rows require `projectStatus` null or onboarding (`today.ts:93`).

### 1.5 Website project stages
| DB status | Staff name | Staff queue | Owner | Due / SLA | Next staff action | Customer sees |
|---|---|---|---|---|---|---|
| onboarding | Waiting for kickoff | Board col 1, Calls | builder (optional) | none | wait or mark held | "We start after your kickoff call" |
| submitted | Ready to start | Today (only if `slaDueAt`), Board col 2 | builder | first preview 48h after call | Start building | "We are preparing your website" |
| building | Building | Today (if sla), Board | builder | same | Send preview | "We are building your website" |
| preview | Awaiting client review | Board col 4 only | builder | none (no customer response SLA) | wait | "Your preview is ready" |
| revisions | Changes requested | Today (using the FIRST preview's `slaDueAt`), Board col 5 (no date) | builder | website tab shows updated preview day (`updatedPreviewDay`), Today and Board do not | send updated preview | "We are making your changes" |
| approved | Approved, ready to launch | Board col 6 only | builder | none | launch checks, Mark live | "You approved the preview" |
| live | Live | Board "Live this month" | builder | none | none | "Your website is live" |
| on_hold | On hold | Board col 7 | builder | none, no auto-resume | resume | "Your build is paused" and the reason |
| cancelled | Cancelled | hidden from Board | none | none | none | "Nothing is being built right now" |
Sources: `project-board.ts:31-93`, `delivery-tab.ts:7-17`, `project-customer-line.ts:4-14`, `waiting-clients.ts:18-27`.
Findings (Verified in code): (a) `approved` has no Today row and no rail count, so a customer who approved sits unseen unless someone opens the Board; (b) `preview` has no follow-up clock or reminder; (c) `revisions` rows in Today use the first preview promise and can read "Preview N days late" while the work is fresh (`slaDueAt` is only written at submit, `projects.ts:138`, and kickoff, `kickoff-build.ts:39`); (d) the rail Clients count is only `countLateProjects`, which covers submitted and building (`project-staff.ts:114,245`), so it disagrees with Today's overdue set.

### 1.6 Social work
Staff objects (all on the Plan and billing tab): deliverables (post, page, listing), connected accounts, monthly numbers, updates ("What we did"), report links.
| Step | State | Owner | Due | Customer sees |
|---|---|---|---|---|
| Staff add post with date, caption, picture | planned | none | `dueOn` on the row only | nothing |
| Send for approval | awaiting_approval | none | none | post in `/social` review with Approve; no email sent by the action (`work-actions.ts:185-218`) |
| Customer approves | approved | none | publish by `dueOn` (promised in text "we will publish on the dates shown", `features/social/rules.ts:187`) | "Approved" |
| Staff mark published | published | none | none | "What we did" line "Published your post: ..." |
Gaps (Verified in code): no global list of posts due, awaiting or approved; approving does not notify staff; customer has no "request a change" on a post (only Approve; changes go through a support request); no `format` or `channel` is set by the add form even though the table has the columns (`deliverable-form.ts` has neither); the customer app has a second, env-gated social path ("posting service", `app/(app)/social/page.tsx:20-23`) that the console cannot see or control (Inferred, covered by the customer auditor). Monthly commitments (posts per month) are not data: the only monthly figure is derived from planned posts (`features/social/rules.ts:139`) and the catalogue promises none; "up to 4 platforms" is catalogue copy while three platforms are listed (`add-ons.ts:58-66`). Verified in code.

### 1.7 Paid Ads work
Ads and Social share one internal service key `social` (`service-setup.ts:30-31`), so a customer with only Paid Ads shows the Social labels "Social & Ads" and sees the post planner. Staff objects: Ad campaigns and Connected accounts sections. There is no ad plan, creative approval, spend check, ad-account access state machine, owner, queue or SLA. The rail item named "Ads" contains Ad credit (dormant because `PACKAGE_OFFERS` is empty, `packages.ts:32`) and Ad results (Brandbasket's own acquisition funnel, `ad-results/page.tsx:28-33`). Unimplemented: Paid Ads operations screen. Dormant: Ad credit. Verified in code.

### 1.8 Approvals
| Approval | Customer action | Staff notification | Staff queue |
|---|---|---|---|
| Preview approve | `approveProjectPreview` to status approved | none | Board col 6 only |
| Preview changes | `requestProjectRevisions` plus feedback ticket | ticket in Requests "Needs reply"; project status revisions | Requests, Today "No reply yet" (4h) |
| Post approve | `approvePostsAction` | none | none |
| Change request quote accepted and paid | payment | none beyond the charge; request state to in_progress | not in Today; ticket stays "waiting on client" because the queue rule only compares messages (`reply-clock.ts:23-29`) |
| Domain move request | customer submits move | none | only Overview "Move them to their own domain" and Website "Move to their own domain" section; no Today row |

### 1.9 Messages
Support tickets, feedback tickets, change-request tickets and staff-opened tickets share `/support`. Clock: needs reply when the newest public customer message is after the newest public staff reply (`support-staff.ts:35`). Soon at 4h, late at 24h (`reply-clock.ts:56-58`). Today caps at 25 tickets (`today.ts:38`). Staff public reply emails the requester; the console shows whether the mail went (`support-admin-actions.ts:25-29`). Closed tickets can only get internal notes.

### 1.10 Delivery (go live)
Launch is manual: eight launch checks must be ticked, optional "Check the address" (reachability only, `site-check.ts`), then Mark live. Email: launch email, resend for 7 days. Missing owner or domain refuses before committing (P0-C fixed, `project-launch.ts`). Customer sees "Your website is live". Hosting pause for lapsed customers depends on `brandbasket-site-hosting.timer`, installed but NOT enabled (`install.sh:450`).

### 1.11 Invoices
Tax invoices are issued automatically on payment and by `issueMissingInvoiceAction` (finance). Customer reads them at `/billing/invoices`. Missing invoices appear in Money > Invoices only; not in Today. Billing details corrected by finance apply to future invoices only (`invoice-actions.ts:40-47`).

### 1.12 Outbox and retries
Every customer email is an `email_messages` row. In process: one retry (`brevo.ts:25`). After that: failed row, rail count "Settings" (failed 24h) and Today "N emails and webhooks failed" (no due time). Manual: Resend per row, or Resend all failed (25 emails + 25 alerts, last 24h). No scheduled retry exists. Redacted copies cannot be resent. Webhook failures (Razorpay, Cal.com, OyeChats) can be viewed but not replayed. Verified in code.

### 1.13 Escalation
No escalation rule exists in code: colours turn red when late, and Teams cards (enquiries, payments, customers, support, system) can be configured by admins (`schema/deliveries.ts:45`). There is no on-call, no reassign-on-late and no daily digest. Verified in code.

### 1.14 Renewal, lapse and cancellation
| Event | Staff sees | Customer sees |
|---|---|---|
| Renewal fails (past_due) | Website tab notice "Billing needs attention" only; Payments "Failed" for the month | failed-payment email (`payment-emails.ts:26`) |
| Period lapsed | same notice; nothing in Today or rail | billing state lapsed |
| Customer cancels or pauses an add-on | no queue; the add-on row shows in Plan and billing | scheduled end shown on their billing |
| Customer deletes account | Clients "Leaving", People tab Leaving section, Compliance "Accounts being erased"; admin can restore or extend | locked with restore link |
| 30 days pass | erase timer is installed but NOT enabled (`install.sh:449`) | Unknown whether data is erased in production |
| Payment lapse policy | "Display only; it never moves a stage" (`billing-attention.ts:5-14`); no policy defined | n/a |

## 2. Customer request types: owner, queue, state, SLA, customer outcome

| # | Request type | Owner | Queue | State model | Due / SLA | What customer sees when staff acts | Gap |
|---|---|---|---|---|---|---|---|
| 1 | Website enquiry (pre-sale) | lead owner | Enquiries, Today | lead status | 1h | setup email | ok |
| 2 | Signed up, not paid | none | Today, Clients | account_created | 2d | nothing | no owner |
| 3 | First payment problem | none | Today (finance only) | flagged | 1d | receipt | support blind |
| 4 | Kickoff booking and outcome | none | Calls, Today | held, no-show, rescheduled | 24h fallback | start state | no owner |
| 5 | Website build | builder (optional) | Board, Today (partial) | 9 statuses | first preview only | headline per status | gaps in 1.5 |
| 6 | Preview feedback | ticket assignee | Requests | ticket | 4h / 24h | public reply, new preview | ok |
| 7 | Change request (quote) | none (ticket assignee only) | Requests via ticket; client Messages tab | 9 states | none | email each move, stepper | state not in queue rule |
| 8 | Support question | ticket assignee | Requests | status | 4h / 24h | reply email | ok |
| 9 | Domain move | none | none (client pages only) | `movingTo` | none | email on switch | NO queue, NO owner |
| 10 | Add-on purchase (Social, Ads, Monitoring) | none | Today "Add-on to start" | pending, contacted | 1d | nothing | no setup flow; contacted has no customer effect |
| 11 | Monitoring (Dedicated Expert Monitoring) | none | none | tag only | none | nothing | UNIMPLEMENTED: only a label (`service-tags.tsx:9`, `service-packages.ts:9`) |
| 12 | Post approval | none | none | 4 states | `dueOn` unqueued | activity line | NO queue, NO owner, NO staff notice |
| 13 | Social / ad account connection | none | none | connected/needs_attention/not_connected | none | account status | NO queue |
| 14 | Monthly report | none | Reports (needs the unenabled timer, `install.sh:455`) | draft, held, approved, sent | none | report and email | Today omits |
| 15 | Press release | none | Today add-on row | in_progress, published | none | status in dashboard (Unknown) | no owner |
| 16 | Chatbot (OyeChats) | none | none | status | none | Unknown | no queue |
| 17 | Missing / corrected invoice | none | Invoices "Missing" | register | none | invoice appears | not in Today |
| 18 | Past due / lapsed subscription | none | none | notice | none | emails | NO queue, NO policy |
| 19 | Refund | finance | none | marked refunded | none | payment shows refunded (Unknown wording); moves no money | no request intake |
| 20 | Account deletion | admin | Compliance | closure | 30d | restore link | erase timer off |
| 21 | Privacy request (DPDP) | none | Compliance only | open, closed | none | confirmation email via customer app (Unknown) | admin only, not in Today |
| 22 | Breach | none | Compliance | duties | 6h/72h display | none | no alert |
| 23 | App error | assignee | Settings > App errors, Today "New error" | new, seen | 1d | none | ok |

### Requests with NO staff owner and NO queue (Verified in code)
Domain move; post approval; connected account upkeep; chatbot; monitoring; past_due and lapsed billing; privacy requests (queue exists but admin only); breaches (same); change-request work after a paid quote; approved website preview.

### Staff actions with NO truthful customer-visible outcome
| Action | Why it is not truthful or not visible | Evidence |
|---|---|---|
| Send for approval (post) | status changes; no notification; customer must open `/social` | `work-actions.ts:185-218` |
| Mark contacted (add-on) | clears staff queue; customer sees nothing, so they cannot tell anyone acted | `add-ons-admin.ts:139-153` |
| Assign builder / assign lead / assign ticket | purely internal; fine, but no customer line either | `website/actions.ts:63-71` |
| Cancel build | customer headline only, no email, no reason, `visibleToClient: false`; billing unchanged | `website/actions.ts:54-61`, `project-controls.tsx:96` |
| Add charge | appears under To pay silently, no email (comment on `addChargeAction`, `actions.ts:136-137`) | |
| Mark payment refunded | records only; money moved elsewhere; customer wording Unknown | `refund-actions.ts:9-13` |
| Connected account status, campaigns, numbers | customer sees data but no event | `account-actions.ts`, `campaign-actions.ts`, `numbers-actions.ts` |
| Resend all failed | emails go out; staff get counts only; customer may receive stale or duplicate mails (Brevo has no idempotency key, `brevo.ts:122`) | `deliveries.ts:78-96` |
| Hold report | customer sees nothing (correct), but no reason or due recorded | `reports/actions.ts:58-60` |
| Settings > setup call URL | silently changes the customer's Book a call target | `settings/actions.ts:20` |
| Mark kickoff held without a call (phone) | starts a build; customer text changes, but "held" is also set automatically 24h after, so staff cannot tell whether the call happened | `kickoff-complete.ts:28-34` |
| Privacy request close | outcome recorded; customer notification Unknown | `privacy-requests/actions.ts:49-57` |

## 3. What is unimplemented versus dormant

| Item | Class | Evidence |
|---|---|---|
| Staff queue for Social/Ads work, ad operations, monitoring, per-service owner | Unimplemented | no code found |
| Social/Search setup answers visible to staff | Unimplemented | `listServiceSetups` unused in admin |
| Approval notification to staff | Unimplemented | `features/social/actions.ts:27-45` |
| Payment lapse policy | Unimplemented (decision open) | `billing-attention.ts:5-14`; plan status |
| Two-factor or Access JWT check | Unimplemented | no code |
| Admin browser E2E | Unimplemented | no `e2e` script in `apps/admin/package.json`; customer has Playwright |
| Directory, Places, Ads (place ads), Deals, listings, verified/trusted marks | Dormant (switched off, code present) | `directory-only.tsx:10`; `brand.ts:30` |
| Free-listing account type and `kind = listing` businesses | Dormant | `CLAUDE.md` "Dormant code" |
| Ad credit | Dormant for new sales | `packages.ts:32` |
| Search (Local SEO + AEO) service | Dormant and unreachable: not sold, never returned as bought, labels remain in request, report and work code | `service-setup.ts:29-30`; `work-section.tsx:23` |
| Monthly reports job, erase job, hosting sync, site health, Google provision and sync, first-payment check | Built and installed, NOT enabled by `install.sh` (production state Unknown) | `deploy/vps/install.sh:449-455` |
| Automatic kickoff after 24h | Live by default | `kickoff-sync.ts:13-15` |


---

<!-- source: customer-ux/email-deep-links.md -->

# Email template links and where they land

Templates: packages/email/src/templates/*.ts (31 files). A template only formats a URL that its caller builds, so each row names the caller. All URLs pass `assertWebUrl` (http or https only, packages/email/src/message.ts:40-50). Labels: V = Verified in code; I = Inferred; U = Unknown. Customer-facing first, then staff and system emails.

Cross-cutting facts (V):
- A signed-out click on any dashboard link goes to plain `/login`, then Home after sign in. Only `/invite/<token>` survives sign-in (apps/customer/src/lib/guard-rules.ts:16, features/team/rules.ts:108-111). So receipt, report, request and billing deep links all lose their target when the person has no session.
- Emails whose link signs someone in or creates an account store a link-less copy in the outbox (`withheldLinkCopy`, message.ts:94).
- Old addresses still sent in emails remain as permanent redirects (list in the route inventory).

## Customer-facing

| Template | Sent by (caller) | Link built as | Lands on | Destination exists | Expired, invalid, denied handling | Notes |
|---|---|---|---|---|---|---|
| signup-code | apps/customer/src/features/entry/server/account-email-code.ts:127 | none (6 digit code) | /signup code step | n/a | Code works 10 minutes (copy sign-up-form.tsx:117); wrong code returns a message; send and confirm rate limits with countdown | Refresh loses the step |
| privacy-request-code | apps/customer/src/platform/lib/privacy-requests.ts:167 | none (code) | /api/privacy-requests/confirm flow | n/a | OTP TTL in code | Customer-facing public form, not part of the dashboard |
| password-reset | apps/customer/src/lib/auth.ts:14-19 | `/reset-password/<token>` via resetPasswordPath (features/entry/rules/account-recovery-form.ts:12) on APP_ORIGIN | app/(auth)/reset-password/[token]/page.tsx | Yes | Token only checked on submit; a used or expired link still shows the form and fails after the person types (page comment lines 9-12). Email says it works once and names minutes (PASSWORD_RESET_LIFETIME_SECONDS) | referrer no-referrer set |
| setup-link | apps/admin/lib/server/invites.ts:43 | `/setup/<token>` on APP_ORIGIN | app/(auth)/setup/[token]/page.tsx | Yes | Checked before the form: "This link no longer works" (expired or used, 7 days) and a rate-limit screen with retry (setup/[token]/page.tsx:17-35) | Best handled link |
| business-invite | apps/customer/src/features/team/actions.ts:71-78 | `invitePath(token)` = `/invite/<token>` (features/team/rules.ts:88) | app/invite/[token]/page.tsx | Yes | Page checks format only. Expired, revoked, used or wrong address refuse after pressing Join (accept-invite.tsx:12-17). Signed out: Sign in and Create account keep `?next=` | Opening does not consume the invite (scanner safe) |
| affiliate-link | apps/admin/lib/server/affiliate-admin.ts:345 | `affiliateSetupPath(token)` (packages/shared/src/lib/affiliate-links.ts:11) | app/affiliate/setup/[token]/page.tsx | Yes | Dead or rate-limited screens, same as setup | Affiliate persona |
| payment-received | packages/shared/src/server/payment-emails.ts:84-105 | `receiptDownloadHref([paymentId])` = `/billing/receipts?ids=<id>` on dashboard origin | app/billing/receipts/route.ts (requireOwner) | Yes (route handler, not a page) | Signed out: redirect to /login then Home, the PDF is not delivered. Not owner: owner guard sends Home. Unknown id handling in `receiptsDownload` (U) | Outbox dedupe keys on the link text |
| payment-failed | payment-emails.ts:157-165 | `BILLING_PATH` = `/billing` | app/(app)/billing/page.tsx | Yes | Any billing state is open; owner sees actions, others read. Email text says "Pay now" but lands on a page where payment may need two more steps (see UX finding B1) | Skipped when owner turned billing emails off |
| monthly-report | packages/shared/src/server/monthly-reports.ts:236-258 | `/reports/<yyyy-mm>` and `/reports/<month>/pdf?service=<svc>` on customer origin | app/(app)/reports/[month]/page.tsx; app/(app)/reports/[month]/pdf/route.ts | Yes both | Bad month gives 404 (`parseMonthParam`); bad service or no report 404 plain text; read failure 500 text "We could not get this report" (pdf/route.ts:18-21). Signed out loses the target | Sent to owner only; skipped for phone-only accounts and when topic is off |
| change-request-update (reply, quote, started, ready, done, closed) | apps/admin/lib/server/request-notify.ts:31-37 | `/requests?open=<ticketId>` | app/(app)/requests/page.tsx opens the inspector sheet | Yes | Non-uuid gives 404; id not in newest 100 redirects to `/requests/<id>` which 404s for another business's or missing ticket (requests/page.tsx:26-33, [id]/page.tsx:22-30) | Bell opens `/requests/<id>` instead (shell/rules.ts:277); two surfaces |
| support-request-opened (staff opened a request for the client) | apps/admin/lib/server/staff-opened-request.ts:81-87 | `/support/<ticketId>` | app/support/[ticketId]/page.tsx, then permanent redirect to `/requests/<id>` | Yes (alias) | Non-uuid gives 404; then same as above | Current email still depends on a legacy alias and a double hop |
| preview-ready | apps/admin/lib/server/project-preview.ts:54-61 | the staff-entered preview URL itself (`input.previewUrl`) | An external site, not the dashboard | Not checked by the customer app; only `assertWebUrl` | Link rot or password protection: U. Customer is told to "Reply" instead of approving in the dashboard (preview-ready.ts:15-17) | Approve and Ask for changes exist only at /website. Design hypothesis H: add a dashboard link. |
| domain-ready | apps/admin/lib/server/domain-ready.ts:33-37 | `/domain` on APP_ORIGIN | app/(app)/domain/page.tsx permanent redirect to /website/domain | Yes (alias) | requireWebsite: a business without the website service goes Home silently; signed out goes /login then Home | Alias deliberately kept (page comment) |
| website-live | apps/admin/lib/server/project-launch.ts:68, 106, 131 | `https://<hostname>` | The customer's own website | Depends on DNS (U) | None in app | External |
| domain-moved | apps/admin/lib/server/domain-switch.ts:27-30 | `https://<newHostname>` | Customer's website | U | None | External |
| listing-enquiry | no live caller found (grep of `listingEnquiryEmail(` outside templates) | `dashboardUrl` | would be /enquiries | n/a | n/a | Likely dormant (directory plan 35). I |
| onboarding-sent | apps/customer/src/features/checkout/server/onboarding-alert.ts:22 and src/platform/lib/server/onboarding-alert.ts:22 | admin client URL | Staff console | Yes | Duplicated in two trees | Staff-facing |

## Staff and system emails (destinations in apps/admin)

| Template | Caller | Lands on | Exists |
|---|---|---|---|
| staff-invite | apps/admin/lib/server/staff-admin.ts:39 `/staff-invite/<token>` | apps/admin/app/staff-invite/[token] | Yes |
| password-reset (staff) | apps/admin/lib/server/auth.ts:24 `/reset-password/<token>` on ADMIN_ORIGIN | apps/admin/app/reset-password/[token] | Yes |
| lead-received | apps/customer/src/platform/lib/server/leads.ts:62 `/leads/<id>` on ADMIN_ORIGIN | admin /leads/[leadId] | Yes |
| preview-approved, preview-revisions-requested | features/website/alerts.ts:60 admin `/clients/<id>` | admin clients/[businessId] | Yes |
| domain-connected, domain-requested | features/website/alerts.ts:159,168 admin `/clients/<id>` | same | Yes |
| support-ticket-alert, support-reply-alert | features/requests/server.ts:99,125 `adminUrl(ticketId)` | admin /support/[ticketId] | Yes (exact path built in `adminUrl`, not opened here, I) |
| security-alert, staff access review | features/entry/server/security-events.ts:66, src/platform/lib/security-review.ts:51 `/access-log` | admin /access-log | Yes |
| privacy-request-alert, due digest | src/platform/lib/privacy-request-alerts.ts:55,90 | admin /privacy-requests | Yes |
| site-down-alert | site health job | admin clients/<id> | Yes |
| system-error-alert | error reporter | admin /support/errors/<issue> | Yes |

## Gaps (V = absence in templates folder)

- No templates for: kickoff booked or reminder (cal.com may send its own, U), social posts waiting for approval (a `needs_approval` notification topic exists, packages/db/src/schema/notifications.ts:10, but no template or sender was found, U), account closure or deletion scheduled, service cancellation confirmed, team member joined or removed, invitation accepted.
- No email links to /checklist, /website (approval), /billing/invoices or /settings.
- Receipt link requires a live owner session; no signed or time-limited link exists. A design choice (secure) with a UX cost (H).

