# Admin information architecture proposal

Labels: Verified in code | Reported in historical document | Inferred | Unknown. Every proposal names the user problem and the evidence. Paths relative to `brandbasket-platform/`. This proposes moves; nothing was changed.

## 1. Current rail (as coded)
Today | Clients (List, Board, Reports) | Inbox (Requests, Enquiries) | Calls | Money (Payments, Invoices, Prices, Coupons, Affiliates) | Ads (Ad credit, Ad results) | Team (Staff, Compliance) | Settings (Settings, App errors, Emails and webhooks). Aliases: `/breaches` and `/privacy-requests` under Compliance. `/leaving` is in no group. Evidence: `apps/admin/lib/console-rail.ts:47-107,144`.

Support sees 6 items (no Money, no Team), finance 7, admin 8 (`railFor`, `console-rail.ts:114-120`).

## 2. Proposed rail

| Item | Pages | Role | Replaces |
|---|---|---|---|
| Today (my work) | My work, Unowned, Late | all, content differs by role | Today (`/`) |
| Work | Website, Social, Paid Ads, Monitoring, Kickoffs, Reports (lanes of one board with owner and due) | support, admin (finance read) | Clients > Board, Clients > Reports, Calls, Ads |
| Clients | List (with Leaving filter), client workspace | all | Clients > List, `/leaving` |
| Inbox | Requests (tickets, change requests, feedback), Enquiries | all | Inbox |
| Money | Payments and renewals, Invoices, Prices, Offers (Coupons plus Affiliates), Acquisition (ad results) | finance, admin | Money, Ads > Ad results, Ad credit |
| Compliance | Privacy requests, Breaches, Access log, Staff | admin | Team |
| System | Settings, App errors, Emails and webhooks (with retry state) | all (admin parts gated) | Settings |

## 3. Proposals tied to problems

| # | Proposal | User problem | Evidence |
|---|---|---|---|
| P1 | Add owner and state to every work object and show "mine" and "unowned" on Today | A customer request has no owner or next action: only leads, builds and tickets have assignees, and none is auto-assigned; Today shows no owner | `rg assignedStaffId`; `today-queue.ts:9-20`; Verified in code |
| P2 | Move Posts, Numbers, Campaigns, Accounts, Updates out of Plan and billing into Social and Paid Ads tabs; split `social` service key into social and ads | Support staff hunt for delivery work under billing; ads cannot be owned separately | `billing/page.tsx:53-78`; `service-setup.ts:30-31`; Verified in code |
| P3 | Create Work board lanes for Social posts (planned, awaiting, approved, due, published), Ads, Monitoring | Posts due and approved are unseen; approval notifies nobody | `work-actions.ts:185-218`; `features/social/actions.ts:27-45`; Verified in code |
| P4 | Add Today kinds: approved previews awaiting launch, previews waiting on the customer past N days, revisions with their own due date, domain moves, past_due and lapsed subscriptions, reports to review, post approvals, change requests started | Items that need a person never reach the queue; a revision shows a stale "late" from the first preview | `waiting-clients.ts:18-27`; `projects.ts:138`; `project-staff.ts:114,245`; Verified in code |
| P5 | Merge Calls into Work > Kickoffs and keep one "mark held" action | Same action on three screens plus an automatic timer, so staff cannot trust "held" | `calls/kickoff-actions.ts:32`; `kickoff-actions.ts:31`; `kickoff-sync.ts:13-47`; Verified in code |
| P6 | Fold change requests into Inbox > Requests as a type with quote state | A paid started request looks "waiting on client" in the inbox and exists as a list only on one client page | `reply-clock.ts:23-29`; `requests-section.tsx`; Verified in code |
| P7 | Remove the Ads rail item: retire Ad credit, move Ad results to Money > Acquisition | "Ads" suggests customer Paid Ads work; contains a dormant legacy report and Brandbasket's own funnel | `packages.ts:32`; `ad-results/page.tsx:28-33`; Verified in code |
| P8 | Merge Coupons and Affiliates into Money > Offers; add one place for owner decisions (no package discounts) | Two lists for acquisition levers; policy says the only offer is monitoring free with all three plans | `console-rail.ts:77-78`; root CLAUDE.md (Reported) |
| P9 | Put Privacy requests and Breaches on Today for admins with due dates; add an owner | DPDP deadlines sit on a page nobody is sent to; support cannot help | `access-log/page.tsx:50-79`; `breaches/page.tsx:32-100`; Verified in code |
| P10 | Replace the Systems block and the Settings > Emails and webhooks list with one System queue showing failed items with retry state; add scheduled retry | Failed emails are visible but only retried by hand; webhooks cannot be replayed | `deliveries.ts:78-96`; `brevo.ts:25`; Verified in code |
| P11 | Retire `/outbox`, `/referrals*`, `/ads`, `/deals`, `/directory`, `/geography`, and the three client redirect pages; remove `/leaving` orphan into Clients filter | Dead and duplicate routes obscure what is live; dormant actions still exported | CSV dispositions; `directory-only.tsx:10`; Inferred for action exposure |
| P12 | Make list pages role aware: hide Monthly and Paid through for support or accept it; retire the Ad credit open-to-support | Role model is inconsistent | `clients/page.tsx:196-214`; `console-rail.ts:85`; Verified in code |
| P13 | Add roles beyond support: builder, social and ads manager, compliance, so assignment lists only the right people | `listAssignableSupportStaff` returns every active staff for every assignment | `support-staff.ts:103-105`; `access.ts:60-69`; Verified in code |
| P14 | Decide and record payment lapse policy (what stops, when) and show it on Money | Notice says "never moves a stage"; hosting pause timer is installed but not enabled | `billing-attention.ts:5-14`; `install.sh:450`; Verified / Reported |
| P15 | Rail counts: compute only the counts the role sees, cache once per request | Every page render reads clients, leads, tickets and more to draw the rail | `rail-counts.ts:23-49`; `console-shell.tsx:19`; Verified in code |

## 4. Role-based work queues

| Role | Queue lines | Source today | Missing |
|---|---|---|---|
| Support / builder | My builds due, previews to send, revisions to make, approved previews to launch, kickoffs needing outcome, requests needing reply, posts due, unowned requests | Today partial | owners, posts, approved, revisions clock |
| Finance | Flagged payments, past_due and lapsed, missing invoices, refunds to mark, add-on charges, payout owed to affiliates | Today (flagged only), Payments, Invoices | lapsed and past_due, owed payouts |
| Admin | Privacy requests and breach deadlines, failed deliveries, errors, staff changes, closures nearing erase | scattered | Today rows and owners |

## 5. Role changes to decide
1. Add "builder" or "service owner" capability to restrict who may cancel builds, add free rounds, change domains and send live emails (currently any support: `website/actions.ts:54-79`).
2. Let finance read the access log if the spec expects it (open, see plan-status-recheck).
3. Let support view and work privacy requests with an owner, or define a hand-off (now admin only).
