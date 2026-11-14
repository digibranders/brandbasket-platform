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
