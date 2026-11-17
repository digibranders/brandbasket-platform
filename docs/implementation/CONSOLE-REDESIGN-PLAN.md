# Console redesign plan: a full UI and UX rebuild of the staff console

Status: proposal for the owner. Nothing here is built. Branch `r2/17-console-plan`. Prepared 2026-11-17.

Read with: `docs/product-architecture-audit/19-end-to-end-user-journey.md` (the journey), `14-open-questions-and-product-decisions.md` (decisions), `18-social-automation-and-revised-scope.md`, `docs/design/redesign/05-PREMIUM-DESIGN-LANGUAGE.md` (binding), `apps/admin/DESIGN.md`, `docs/implementation/RELEASE-2-PLAN.md`, and the notifications build plan on `origin/claude/notifications-review-f79eb2` (`docs/notifications/03-build-plan.md`).

## 0. Why a rebuild, and what this plan binds to

Release 2 gave the console a new look, not a new design. The evidence:

- `apps/admin/lib/console-rail.ts` still has eight items (Today, Clients, Inbox, Calls, Money, Ads, Team, Settings). `RELEASE-2-SPEC.md` section 6 asked for seven without Ads. `reports/R2-08.md` says it "preserved all 8 existing menu destinations". The dormant Ads item (Ad credit, Ad results) is still in the menu.
- `reports/R2-09.md` and `R2-12.md` state "re-theme only, no behaviour change". R2-09 open question 4 records that the Staff page still shows a role picker and an invite form, although the owner decided there is one account (D12, D13).
- The client workspace still has five tabs (`apps/admin/lib/client-tabs.ts`: Overview, Website, Plan and billing, Messages, People). Social and Paid Ads delivery forms still sit under "Plan and billing" (`clients/[businessId]/billing/page.tsx`), the finding raised in audit `03` and `09`.
- The kickoff popup component `apps/admin/components/console/kickoff-prompt-popup.tsx` exists, but no file in `apps/admin` imports it (checked with a search of `apps/` for `kickoff-prompt-popup` and `KickoffPromptPopup`). It is not mounted. The notifications package N2 remounts it in `apps/admin/app/(protected)/layout.tsx`. The "Call completed" action also still lives in `calls/kickoff-wrap-up.tsx`, `today/kickoff-prompt.tsx`, `console/calls-section.tsx` and `console/kickoff-call-section.tsx`, so audit finding "four places" is still true.
- The mocks `docs/design/redesign/mock-console-*.html` and `notes-console.md` cannot be the base for a rebuild. They show Paytm gateway health, a WhatsApp Meta Cloud API status, webhook latency and "Active refunds" tiles. R2-09 open question 6 confirms these have no data source. (The only WhatsApp strings in code are a contact link on an enquiry, `components/enquiries/enquiry-detail.tsx`, and listing contact fields.) The refund dialog mock says a refund cancels the plan and revokes hosting; R2-09 open question 1 says the code does not do that. Wave A redoes the mocks under one rule: **no data source, no element**.

Owner decisions this plan binds to, and treats as fixed:

| Decision | Effect on the console |
|---|---|
| D12, D13, D24 (one staff account, no roles, no assignment, no Unowned) | No owner column, no "mine" filter, no role variants of any screen. Today is one list. |
| D16, D23 (social-auto operates Social, staff do no Social work) | No staff Social workflow. The console shows at most a read-only Social status per client (`18`, section 5). |
| D25 and `19` Phase 9 (Paid Ads on sale, display only) | Paid Ads appears as a service with a figures entry form that already exists. No new Paid Ads workflow. |
| D31, D33 (kickoff prompt: popup plus notification plus push plus email; "Call completed"; 24 hour labelled fallback) | One place to act. Notifications work (N2) builds the channels; this plan owns where the prompt sits in the UI. |
| D29 (host stays console.brandbasket.in) | No rename. |
| Light theme only, no em or en dashes, no invented clients or results | Applies to mocks, copy and test data. Mocks use placeholders like `<business>`. |

IDs for new decisions use the prefix CD (console decision), listed in section 7. Existing ones (D10, D11, D15, D19, D30) are reused by their number.

Tags used in this plan so cost is honest:

- **[E]** exists today (data and action), screen work only.
- **[Q]** needs a new read query in `apps/admin/lib/server` or `packages/db` (integration tests when it touches `packages/db`).
- **[A]** needs a new or changed server action.
- **[N]** depends on a notifications package (N1 to N7).
- **[S]** needs a schema change. Avoided unless stated; only N1 adds migrations right now (next number 0229, per the build plan).

## 1. What the one staff person does

Source: `19` phases 5 to 13, "One staff account" section of `19`, and `apps/admin/lib/today-queue.ts` (`WAIT_LIMITS`: new enquiry 1 hour, request 4 hours, payment 1 day, add-on 1 day, error 1 day, sign-up 2 days, domain move 1 day).

### 1.1 A day

| Time | Job to be done | Where it happens today | Frequency | Risk |
|---|---|---|---|---|
| Start | See what is late and what is due, without opening five pages | Today (`/`) plus rail counts | Every session | Medium: a missed row is a missed customer |
| Any time a booked call ends | Confirm the kickoff call happened (Call completed, did not join, reschedule). This starts the build and the 48 hour first-preview clock | Four places; popup not mounted | Per new Website sale | High: wrong answer starts or stalls a paid build |
| Throughout | Answer a customer request or support ticket within 4 hours, send a quote, start the work, close it | `/support`, `/support/[id]`, client Messages tab (two lists for two kinds of request) | Daily | High: the main customer-facing promise |
| Throughout | Call back or set up a new enquiry within 1 hour, send a setup link | `/leads` | Daily | Medium |
| Per build | Build the site, paste the preview link, send it, handle change rounds, check launch, mark live | Client Website tab (`website/page.tsx`, 323 lines, about 15 action groups), Board `/projects` | Daily while a build is open (about 2 weeks each) | High: promised dates, customer emailed |
| Per exception | Look at a payment that needs a look, a first payment whose webhook was lost, an unapplied payment, a failed renewal, a lapse | Payments page (flagged only); renewals and lapses are not on Today (`19` 12.1 and 12.2) | Several a week | High: money and customer lockout |
| Glance | Check systems: failed emails, errors, Google problems | Today "Systems" block, `/deliveries`, `/support/errors` | Daily | Medium |
| Glance | See a social-auto alert (failed post, expiring connection) | Outside the console today (`19` 8.7). N7 adds a receiver | Rare, but customer-visible | Medium |

### 1.2 A week and a month

| Job | Frequency | Risk | Today's home |
|---|---|---|---|
| Review and send the monthly report drafts (written on the 1st of the next month, `reports/page.tsx` empty state) | Monthly burst, review across several days | Medium (customer-visible, timer may be off, `19` 10.1) | `/reports` |
| Watch renewals and lapses, chase failed payments | Weekly | High | Not on Today; only a per-client notice |
| Export invoices and payments for the CA | Monthly | Medium (GST) | `/invoices`, `/payments` exports |
| Enter Paid Ads figures (display only) | Monthly | Low | Client Plan and billing tab |
| Move a client's domain, handle a domain move | Occasional | Medium | Website tab, no queue except Today "domain" row |
| Review the access log | Weekly (recommended in `19`: one account cannot tell people apart) | Medium | `/access-log` |
| Edit prices, offers, coupons, affiliates | Rare | High (changes what customers pay) | `/pricing`, `/coupons`, `/affiliates` |

### 1.3 The rare and risky

| Job | Why it ranks high on risk | Today's home |
|---|---|---|
| Breach: 6 hour and 72 hour clocks | Statutory | `/breaches`, not on Today |
| Privacy request: 30 day clock (DPDP) | Statutory | `/privacy-requests`, not on Today, admin only |
| Refund | Moves money, customer emailed, cannot be undone | Dialog on the client's Plan and billing tab (R2-09) |
| Close an account, restore, extend, erase after 30 days | Irreversible data loss; erase timer may be off (`19` 13.3) | `/leaving`, Compliance "Accounts being erased", client People tab |
| Cancel a build, mark live, send a report | Customer-visible and hard to reverse | Website tab, `/reports/[id]` |

### 1.4 Ranking

By frequency, high to low: confirm kickoff and reply to requests (daily, several times); enquiries; build steps; payment and renewal exceptions; system glance; reports; invoices and exports; compliance clocks; refunds and closures; prices.

By risk, high to low: breach and privacy clocks; refunds and money-moving actions; erase and closure; go live and cancel build; kickoff confirmation; customer-emailing actions; everything else.

Design consequence: the highest-risk jobs (compliance clocks, renewal failures, refunds) are the least frequent, which is exactly why they hide today. Frequency decides what sits in the main flow. Risk decides what must appear on Today the moment it is due, and which actions get a confirm dialog.

## 2. Target information architecture

### 2.1 Navigation

Rail, in order, six items (down from eight). One staff account, so no item is hidden by role (the `needs` capability filter in `console-rail.ts` stops affecting the menu; see CD-4).

| Item | Holds | Replaces |
|---|---|---|
| Today | The work queue. Filters: All, Late, Customers, Builds, Money, Enquiries, Compliance, System | Today, Calls, the Systems block |
| Clients | Directory with views List, Builds (board), Leaving. Opens the client workspace | Clients List, Board, `/leaving` |
| Inbox | Requests (support and change requests, one list), Enquiries, Reports to review | Inbox, Clients > Reports |
| Money | Payments (with Needs a look and Renewals lanes), Invoices, Plans and offers (prices, coupons, affiliates), Acquisition (ad results) | Money, Ads |
| Compliance | Privacy requests, Breaches, Closures, Access log | Team > Compliance, `/leaving` erase list |
| System | Health, Emails and webhooks, App errors, Settings, Access (staff accounts, sign-in protection) | Settings, Team > Staff |

Top bar (new): the command bar field with the `⌘K` hint, the notifications bell (slot filled by notifications package N1: "Console: bell in the console shell reading staff rows"), and the account menu. The rail's footer keeps the signed-in staff member. On phone the rail becomes the existing phone bar menu.

The kickoff popup and the notification toast stack mount once in `app/(protected)/layout.tsx` (N2's mount point). The shell never moves that mount.

### 2.2 Every route, and what it becomes

Verified against `apps/admin/app` (`page.tsx` and `route.ts` files) with a script; the list in this table equals that list.

Legend: Keep, Merge, Move, Retire.

**Core screens**

| Route (current) | Becomes | Disposition | Notes |
|---|---|---|---|
| `/` | Today | Keep, rebuild | Section 3, S3 |
| `/calls` | Today filter "Calls" plus the kickoff prompt | Merge | The "Today / Coming up / Last 7 days / Just finished" lists become a Calls side panel on Today. Route redirects to `/?filter=calls` (CD-1) |
| `/clients` | Clients, views List, Builds, Leaving | Keep, rebuild | S5 |
| `/projects` | Clients, view Builds | Merge | Board of website builds as a view of the directory |
| `/leaving` | Clients view Leaving (filter) and Compliance > Closures | Merge | Removes the orphan route (audit `03`) |
| `/clients/[id]` | Client workspace, Overview | Keep, rebuild | S6, the 360 |
| `/clients/[id]/website` | Workspace Website tab | Keep, split | Domain and hosting become their own panel (S7) |
| `/clients/[id]/billing` | Workspace Money tab (URL kept, label "Money") | Keep, split | Social and Ads delivery forms move to Services (S8) |
| `/clients/[id]/requests` | Workspace Requests tab; same data as Inbox | Merge | One request model, two views (global and per client) |
| `/clients/[id]/people` | Workspace Account tab | Keep | Closure, restore, privacy requests for this client |
| `/clients/[id]/services` | Workspace Services tab (new content) | Move | The slug is a legacy redirect today (`LegacyServicesPage`); reused for the new tab |
| `/clients/[id]/activity` | Workspace Overview timeline | Retire route | Redirect kept (CD-14) |
| `/clients/[id]/project` | Workspace Website tab | Retire route | Redirect kept (CD-14) |
| `/support` | Inbox > Requests | Keep, rebuild | S12 |
| `/support/[ticketId]` | Request detail, side panel and page | Keep, rebuild | S12 |
| `/support/new` | Inbox action "New request" | Keep | Becomes a dialog from the command bar and Inbox; route stays for links |
| `/support/errors` | System > App errors | Move | S19 |
| `/support/errors/[issueId]` | System > App errors detail | Move | S19 |
| `/leads` | Inbox > Enquiries | Keep, rebuild | S13 |
| `/leads/[leadId]` | Enquiry detail, side panel and page | Keep | S13 |
| `/leads/new` | Inbox action "Add enquiry" | Keep | Dialog plus route |
| `/leads/export` (route handler) | Export action on Enquiries | Keep | Must stay `logStaffAccessOrThrow` |
| `/reports` | Inbox > Reports to review, plus Today rows | Move | S14 |
| `/reports/[reportId]` | Report review page | Keep | Send needs a confirm (S14) |
| `/payments` | Money > Payments | Keep, rebuild | S15 |
| `/payments/export` (route) | Export action on Payments | Keep | Logged export |
| `/invoices` | Money > Invoices | Keep | S16 |
| `/invoices/[invoiceId]` (route) | Invoice file | Keep | Logged download |
| `/invoices/export`, `/invoices/export/zip` (routes) | Export action on Invoices | Keep | Logged export |
| `/pricing` | Money > Plans and offers, tab Prices | Merge | S17 |
| `/coupons`, `/coupons/new`, `/coupons/[codeId]` | Money > Plans and offers, tab Coupons | Merge | Owner rule: the only offer is monitoring free with all three plans (root `CLAUDE.md`); coupons stay because they are live, flagged for CD-3 |
| `/affiliates`, `/affiliates/new`, `/affiliates/[affiliateId]`, `/affiliates/[affiliateId]/codes/new` | Money > Plans and offers, tab Affiliates | Merge | Live, not dormant (audit `03` note on `STAFF-ACCESS.md:36`) |
| `/ad-results` | Money > Acquisition | Move | It reports Brandbasket's own acquisition ads, not the customers' Paid Ads service (audit `03`) |
| `/ad-credit` | none | Retire | Dormant for new sales (`PACKAGE_OFFERS` empty, D4). Hide the row unless a stored credit exists, then remove (CD-3) |
| `/access-log` | Compliance > Access log | Keep | S18 |
| `/privacy-requests` | Compliance > Privacy requests, plus Today rows with clocks | Keep, rebuild | S18 |
| `/breaches` | Compliance > Breaches, plus Today rows with clocks | Keep, rebuild | S18 |
| `/staff` | System > Access | Keep, simplify | One account: no role picker (CD-4) |
| `/settings` | System > Settings | Keep | S19 |
| `/deliveries`, `/deliveries/[deliveryId]` | System > Emails and webhooks | Keep, rebuild | S19 |
| `/outbox` | none | Retire | Lists nothing (audit `03`) |
| `/outbox/[emailId]` | System > Emails and webhooks detail | Keep | Redacted bodies stay |
| `/search` (route) | Command bar data source | Keep, extend | S2 |
| `/no-access` | Utility | Keep | Wording update: there are no roles after CD-4 |
| `/[...missing]` | Not found | Keep | |
| `/design-system` | Console and shared pattern gallery | Keep | Add the new console patterns |

**Dormant and legacy (retire, with a recommendation each)**

| Route | Recommendation | Why |
|---|---|---|
| `/ads` | Retire. Delete the page, its server actions and components (`place-ad-form`, `edit-ad-form`, `staff-ad-picture-field`). Keep database tables | Unreachable page; its actions are still exported from a `'use server'` file with only `requireStaffAccess` (audit `03`). Root `CLAUDE.md` says do not build on it. Ask the owner first (CD-2) |
| `/deals` | Retire, same treatment | Same |
| `/directory` | Retire page, actions, `client-listing*`, `directory-only.tsx`, `directory-tag-marks`. Keep tables | The directory and clinic code is switched off (`apps/customer`-side plan 35). `businesses.kind = 'listing'` is also the live unpaid sign-up state, so no schema or query removal (audit `00` section 2) |
| `/geography` | Retire, same treatment (`geo-*` components, `geocode.ts`) | Same |
| `/referrals`, `/referrals/[codeId]` | Retire | Became coupons and affiliates on 2026-10-06 |
| `/staff-ad-pictures/[pictureId]`, `/directory-pictures/[pictureId]` (routes) | Retire with the dormant pages, after confirming no live image is served | They serve dormant content only |
| `/deliverable-images/[deliverableId]` (route) | Keep until CD-5 is answered, then retire | Serves manual Social deliverables, retired by D16 once production data shows no live use |

**Utility, auth and API routes**

| Route | Disposition |
|---|---|
| `/login`, `/forgot-password`, `/reset-password/[token]`, `/staff-invite/[token]` | Keep. Restyle only. `/staff-invite` stays for the offline recovery admin (D30) |
| `/media/[mediaId]`, `/support-attachments/[attachmentId]` (routes) | Keep. Both are customer data downloads: keep access logging |
| `/api/client-brand-assets`, `/api/error-reports`, `/api/google/callback`, `/api/google/connect` | Keep. No UI |

**New screens that do not exist yet**

| Screen | What it is | Tags |
|---|---|---|
| Command bar | Search plus actions plus go to, one overlay | [E] search, [A] none new, section S2 |
| Today (unified work queue) | New row kinds, filters, side panel, bulk, keyboard | [E] and [Q] |
| Client 360 Overview | Service cards, what the customer sees, next step, timeline, exceptions strip | [E] mostly, [Q] for Social status |
| Services tab | Social read-only status, Paid Ads figures, Monitoring line | [Q], [N] N7 for Social events |
| Money > Renewals lane | Subscriptions past due or lapsed | [Q] (audit: "No list of subscriptions past_due or lapsed") |
| Compliance > Closures | Merges `/leaving` and "Accounts being erased" | [E] |
| System > Health | One page for failed deliveries, errors, Google problems, timers | [Q], [N] N3, N6 |
| Notification toast with undo | Shared pattern | pattern package |

One canonical home per job:

| Job | Its one home |
|---|---|
| See what needs me | Today |
| Find a client, request, invoice, payment, email | Command bar |
| Confirm the kickoff call | The kickoff prompt (popup, bell and Today row all open the same prompt) |
| Work one client | Client workspace |
| Build and ship a website | Workspace Website tab |
| Answer a customer | Inbox > Requests |
| Handle a new enquiry | Inbox > Enquiries |
| Review a monthly report | Inbox > Reports to review |
| Check a payment, renewal, refund | Money > Payments |
| Issue or export invoices | Money > Invoices |
| Change prices, offers, partners | Money > Plans and offers |
| Privacy request, breach, closure, access review | Compliance |
| Failed email or webhook, app error, settings, staff access | System |

## 3. Screen specifications

Shared patterns that exist now in `packages/shared/src/ui/patterns/`: `ApprovalCard`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `NeedsYourOkList`, `NextActionCard`, `PageHeader`, `PreviewFrame`, `PromptPopup`, `ServiceCard`, `SettingsTabs`, `Skeleton`, `StatTile`, `StatusChip`, `StatusTimeline`, `Stepper`, `ThumbStrip`. Console building blocks in `apps/admin/components/console/`: `buttons`, `table`, `filter-pills`, `section-tabs`, `status-pill`, `notice`, `stat-tiles`, `confirm-dialog`, `route-states`, `global-search`, `customer-mirror-panel`. New patterns this plan adds are in section 4 and built in CD-01: `DataTable`, `FilterBar`, `SidePanel`, `CommandBar`, `Toast` (with undo), `BulkBar`, `RowActions`, `InlineEdit`, `ShortcutHelp`.

Common to every screen: all four states (loading with `Skeleton` matching the layout, empty with `EmptyState`, error with `ErrorState` and Try again, success as a toast or `Notice`), a keyboard path, 390 wide usable, access logging on any customer data (`logStaffAccess`, `logStaffAccessOrThrow` on exports and downloads, per `apps/admin/CLAUDE.md`), and every side panel has its own URL (`?open=...`) as `DESIGN.md` already requires.

### S1 Shell and navigation

- Purpose: always show where I am, what is late, and give one way to search.
- Main action: none. The shell has one primary object, the command bar.
- Data: rail counts from `lib/server/rail-counts.ts` [E]. Counts shrink to Today (all work), Inbox (requests plus enquiries), Money (needs a look plus overdue), Compliance (clocks under 72 hours or overdue), System (failed). Red means late or failed.
- States: counts that fail to read are left off (existing `countOrNothing`). Loading: static rail, counts appear. Error: rail still works.
- Exceptions surfaced: count in red on Compliance when a clock is under 72 hours (new [Q]).
- Patterns: `PageHeader`, new `CommandBar` trigger, bell slot (N1).

### S2 Command bar (global search and actions)

- Purpose: reach any client, request, enquiry, invoice, payment or email in two keystrokes, and run common actions without a menu.
- Main action: open the highlighted result.
- Data: today six search kinds (`SEARCH_KINDS` in `lib/console-search-kinds.ts`: client, enquiry, request, invoice, payment, email, 8 per kind) [E]. Add groups "Go to" (the six rail items and their tabs, static) and "Actions" (Add enquiry, New request, Export payments, Open privacy requests; static, each opening the existing route or dialog) [E]. Recent items (last five opened, stored in the browser, no server data). Prefix modes: `>` for actions, `#` for request references.
- States: empty term shows Recent and Go to; loading shows three skeleton rows; no result says what was searched and offers "Add enquiry" and "New request"; error says search failed and keeps Go to and Actions usable.
- Exceptions: none; it only navigates.
- Notes: `⌘K` or `Ctrl K` is bound in `components/console/global-search.tsx` and the hint is shown in `rail.tsx`; the dialog is a native `<dialog>`. Keep it that way. Results never include customer email bodies beyond the subject (existing behaviour). Search by phone and by domain are [Q] additions; defer unless the owner asks.
- Patterns: new `CommandBar` (extends `global-search.tsx`), `EmptyState`, `Skeleton`.

### S3 Today (the unified work queue)

- Purpose: the one list of everything that needs the one person, late first.
- Main action: the row's one verb, on the row (Reply, Check, Send preview, Launch, Open). Never more than one primary per row.
- Data. Existing kinds [E] (`TodayKind` in `lib/today-queue.ts`, built in `lib/server/today.ts`): pipeline attention kinds (payment needing a look, add-on to start, overdue and due builds, new enquiry), request, sign-up not paid, app error, failed delivery, kickoff needing an outcome, Google problem, approved preview awaiting launch, domain move, unconfirmed start. New kinds, each with the clock it needs:

| New row | Source | Clock | Tag |
|---|---|---|---|
| Renewal failed, past due, lapsed | subscription status (audit: not on Today) | Lapse policy D10 (open) | [Q] |
| Unapplied payment (money arrived, nothing bought) | existing flagged payments with `attention_reason` | 1 day | [E] relabel |
| Privacy request | `/privacy-requests` data | 30 days, red under 72 hours | [Q] |
| Breach | `/breaches` data | 6 hours and 72 hours | [Q] |
| Closure erasing soon | closure rows | Erase date | [Q] |
| Report to review | report drafts | 1st to 5th of the month (CD-15) | [Q] |
| Preview sent, customer silent | project state | 5 days (CD-8) | [Q] |
| Service ending (cancel pending) | `end_requested_at` | Period end | [Q] |
| Social alert (failed post, connection expiring) | social-auto events | Immediate | [Q] [N] N7 |
| Failed email after retries | email queue | After 3 attempts | [N] N3 |
| Timer not running (erase, reports, hosting, first-payment) | job run stamps | One missed cycle | [Q] [S?] CD-20 |

- Layout: header with greeting and a one-line summary; four `StatTile`s (Late, Due today, On track, Active clients, as R2-08); a sticky filter bar with chips and counts (All, Late, Customers, Builds, Money, Enquiries, Compliance, System); the list as a `DataTable` with 44px rows: icon tile, business and the one line of what, clock in Mono (red only when late), primary verb, overflow `RowActions`. Groups remain Late, Due today, Waiting on someone, Upcoming (`groupTodayQueue`). The Late group is the one focal card. Right aside, 4 columns: Calls today (the old `/calls` content, [E]) and Systems.
- Row interaction: Enter or click opens a `SidePanel` with the context (what the customer sees, last message, the exact next step, and the same primary button), URL `?open=<key>`. `Open client` goes to the workspace.
- Bulk: select rows with `x`; `BulkBar` appears only for the sets where a bulk action exists (see 3.1).
- Keyboard: `j` and `k` move, `Enter` opens, `e` runs the primary verb, `x` selects, `/` focuses the filter, `g t`, `g c`, `g i`, `g m` jump, `?` shows help.
- States: loading skeleton rows; empty "Nothing needs you right now" with a line on what will appear and that Social posting and monitoring continue on their own; error shows `ErrorState` plus the per-source failure notice (existing `guarded` reads record failed labels; the page names the source that failed instead of hiding it); success is a toast with Undo where an undo exists.
- Exceptions: every row in the table above, plus "Started without call confirmation".
- Patterns: `StatTile`, `StatusChip`, `EmptyState`, `Skeleton`, `ErrorState`, `PromptPopup` for the kickoff row, new `DataTable`, `FilterBar`, `SidePanel`, `BulkBar`, `RowActions`, `Toast`.

#### 3.1 Bulk and keyboard actions, only where they save time

| Set | Bulk action | Confirm or undo | Tag |
|---|---|---|---|
| Failed deliveries | Resend all failed (existing, max 25 emails and 25 alerts in the last 24 hours, `deliveries.ts`) | Confirm (emails customers) | [E] |
| Enquiries | Mark contacted; Send setup link to selected | Undo for the status; confirm for the link (emails customers) | [A] |
| Requests | Close selected (resolved) | Undo (reopen exists) | [A] |
| App errors | Set status on selected | Undo | [A] |
| Payments, invoices, enquiries | Export selected | Logged export, no confirm | [E] |
| Anything that moves money | Never bulk | | |

#### 3.2 Confirm and undo rules (apply to every screen)

| Pattern | Use for | Rule |
|---|---|---|
| Undo toast (10 seconds, bottom left) | Reversible, internal: enquiry status, close or reopen a request, error status, an internal note, select and filter changes | Only where a reverse action exists. The toast names the object and the undo restores it |
| `ConfirmDialog` with consequence line | Anything that emails or changes what the customer sees (send preview, mark live, send report, resend email, send setup link, cancel build), anything irreversible (close privacy request or breach, switch off staff, delete a coupon code, restore or extend closure) | Consequence in plain words, primary on the right, "Keep" as the cancel |
| `ConfirmDialog` plus a first-person tick box | Anything that moves or records money (refund, manual refund, add charge, waive) | Tick sentence names the amount, as `DESIGN.md` "Money" requires. Refund dialog text is the one R2-09 shipped (true to the code) |
| `PromptPopup` | A question the system asks the person ("Did the kickoff call with `<business>` happen?") | Three outcomes plus Dismiss; repeats until answered (N2) |

### S4 Kickoff prompt (popup, bell and Today row)

- Purpose: capture whether the kickoff call happened, once, in one place.
- Main action: "Call completed" (notes optional). Secondary: "They did not join", "Reschedule".
- Data: pending kickoffs (`lib/server/pending-kickoffs.ts`, `lib/kickoff-prompt-rule.ts`) [E]. N1 adds `kickoff_prompt_state` for server-side dismissal and the 15 minute repeat [N].
- States: loading none (server data in layout); success banner "The 48 hour first preview clock has started" and the row leaves Today; error inside the dialog keeps the notes; empty not applicable.
- Exceptions: the 24 hour fallback labelled "Started without call confirmation" appears as a Today row (existing `unconfirmed_start`) and as a badge on the workspace.
- One action place: the popup, the bell item and the Today row open the same prompt component. The button is removed from `calls/kickoff-wrap-up.tsx`, `console/calls-section.tsx` and `console/kickoff-call-section.tsx`; those places show state only (decision D31).
- Patterns: `PromptPopup`. The mount is N2's; this plan only gives it the same component to open from Today and the bell.

### S5 Clients (directory)

- Purpose: find a client and see which services are healthy.
- Main action: open the client.
- Data [E]: client rows (`lib/client-rows.ts`, `client-search.ts`), stage filters, `Leaving`. Add a services column showing one `StatusChip` per service (Website, Social, Paid Ads, Monitoring) [Q small].
- Views: List (default), Builds (the `/projects` board, as columns), Leaving (the `/leaving` content with its figures).
- Interaction: sticky filters, `DataTable` with column choice for Monthly and Paid through, `SidePanel` quick view, keyboard as Today.
- States: skeleton; empty "No clients yet. Clients appear here as soon as someone signs up."; filtered empty offers Clear filters; error with Try again.
- Exceptions: a red dot on a client with something late; "Not paid" and "Leaving" chips.
- Patterns: `DataTable`, `FilterBar`, `StatusChip`, `SidePanel`, `EmptyState`.

### S6 Client workspace, Overview (the 360)

- Purpose: understand one customer fully in one screen.
- Main action: the single next staff action for this client (existing `lib/client-next-step.ts`, which today considers the Website only and must consider all services) as the focal `NextActionCard`.
- Data: header (business, owner, plan, contact, id in Mono, services as chips) [E]; an exceptions strip at the top for anything wrong for this client (failed renewal, lapsed, unapplied payment, closure pending, privacy request open, domain failure) [Q small, joins existing reads]; `ServiceCard` per service with state and its one next step [E]; `CustomerMirrorPanel` "What the customer sees" (R2-08) [E]; `StatusTimeline` "What happened" from `lib/server/activity.ts` [E]; side column: facts (kickoff booking, money summary, intake answers "What they told us", read-only) [E].
- States: skeleton; no services yet (unpaid) shows Intake answers and "Not paid" with the sign-up time; error per panel so one failed read does not blank the page.
- Exceptions: all of the above strip.
- Patterns: `NextActionCard`, `ServiceCard`, `StatusTimeline`, `StatusChip`, `PreviewFrame`, `EmptyState`.

### S7 Workspace, Website tab

- Purpose: run one website build from call to live.
- Main action: the stage's one verb (Start building, Send preview, Send updated preview, Launch). Today these are about 15 action groups on one page (`website/page.tsx`, 323 lines).
- Structure: `Stepper` of stages; focal `NextActionCard` for the current step; Preview panel (`PreviewFrame`); Rounds and changes list; Launch checks (eight checks, optional address check, Mark live) as a checklist; below a collapsed "Domain and hosting" panel (domain move, free address, hosting). Cancel build, add a free round, put on hold sit in a menu with `ConfirmDialog` (kept confirmation on cancel build, `19` 7.9). Builder assignment is dropped (D12).
- Data [E]: everything exists (`project-preview.ts`, `project-launch.ts`, `domain-switch.ts`, `website-moves.ts`, `site-check.ts`).
- States: before the call (waiting on booking), after the call time before confirmation (shows the prompt), building, preview sent, changes requested, approved awaiting launch, live, on hold, cancelled. Error: domain verification failed shows the DNS detail as the mock intended (from `site-check.ts`).
- Exceptions: "Started without call confirmation", approved preview not launched, domain move waiting, preview silent for N days.
- Patterns: `Stepper`, `NextActionCard`, `PreviewFrame`, `ConfirmDialog`, `StatusTimeline`, `InlineEdit` for the preview link.

### S8 Workspace, Services tab (new)

- Purpose: see and, where staff have a job, run the non-website services.
- Content:
  - Social: read-only status card. Connected channels, last post, last failure, link to the social-auto dashboard. Never an action that edits content (D16, D23). Data [Q] [N] N7 events stored by the receiver. Until N7 lands there is no data, so the card is hidden (CD-16).
  - Paid Ads: display only. The existing Numbers form (monthly figures) moves here from Plan and billing, nothing else added. [E] (`numbers-section.tsx`, `numbers-actions.ts`). Campaigns and Accounts forms (`campaigns-section.tsx`, `accounts-section.tsx`): keep only if production data shows use, else retire with CD-5.
  - Monitoring: a line stating whether it is included, with the D15 gap noted in the plan, not on screen. No screen until D15 is decided.
- States: each card has its own empty ("Not on this plan") and error.
- Exceptions: social-auto alerts for this client.
- Patterns: `ServiceCard`, `EmptyState`, `StatTile`.

### S9 Workspace, Money tab (`/billing`)

- Purpose: understand this client's money and act on an exception.
- Main action: the one thing wrong (Check this payment, Issue invoice) or none.
- Data [E]: plan lines, payments (each with an anchor `#payment-<id>` used by search), refund dialogs (`refund-dialogs.tsx`), charges (`client-charges.tsx`), invoicing (`client-invoicing.tsx`), billing details (`billing-details-form.tsx`), add-ons.
- Structure: plan and renewal summary with next date; Payments table with row actions (Refund, Record manual refund, Issue invoice); Add charge in a side panel; invoices.
- States: skeleton, empty ("No payments yet"), error; lapse and failed renewal banner at top [E notice, becomes the exceptions strip].
- Exceptions: failed renewal, lapse, unapplied payment, refund pending a credit note.
- Patterns: `DataTable`, `ConfirmDialog` (R2-09), `StatTile`, `SidePanel`.

### S10 Workspace, Requests tab

- The client's slice of Inbox > Requests (S12), same component with a client filter fixed. Change requests and support tickets show as one list with a type chip.

### S11 Workspace, Account tab (`/people`)

- Purpose: people on the account, intake answers, closure state, privacy requests for this client.
- Main action: none by default; Restore or Extend appears only while the account is closing, behind `ConfirmDialog`.
- Data [E]: `people/page.tsx`, closure data. Rename owner stays as `InlineEdit`.
- Exceptions: closing (days to erase), privacy request open.

### S12 Inbox, Requests

- Purpose: answer customers inside the 4 hour clock and move paid changes to done.
- Main action: Reply (public). Secondary: Add internal note, Send quote, Start as included edit, Close.
- Data [E]: `/support` and `/support/[id]` plus the change requests that today exist only on the client page (`requests-section.tsx`). Audit `03`: "Two things called requests"; merge into one model, a type chip (Support, Change). Closed-ticket reply is an internal note only today; allow "Reopen and reply" in one step (one action, [A] small). Queue is derived from messages (`support-staff.ts:35`); show the clock in Mono and "Waiting on customer" explicitly. The paid-started request that looks "waiting on client" (audit `19` 11.3) gets its own chip "Paid, in progress".
- Layout: list left, detail in a `SidePanel` on wide screens with its own URL; page view on phone.
- Interaction: `Enter` opens, `r` focuses the reply, `c` closes with undo, `n` new request.
- States: skeleton; empty "No requests here. Requests from customers appear here with how long each has been waiting." (R2-12 wording); error.
- Exceptions: past 4 hours (soon) and 24 hours (late), a quote not paid, attachments (`support-attachments`).
- Patterns: `DataTable`, `FilterBar`, `SidePanel`, `StatusChip`, `Toast` with undo.

### S13 Inbox, Enquiries

- Purpose: contact a new enquiry inside 1 hour and turn it into a setup.
- Main action: Send setup link (confirm, emails the person).
- Data [E]: `enquiries-screen.ts`, `lead-updates.ts`, `lead-repair.ts`. "Signed up, not paid" shown here once, not also on Clients (audit `03`). D21 (one reminder email after 1 day) is customer-side and N5.
- States as S12; `/leads/new` is a dialog.
- Exceptions: over 1 hour, signed up not paid after 2 days.
- Patterns: as S12, `InlineEdit` for status and notes.

### S14 Inbox, Reports to review

- Purpose: review and send the month's report drafts.
- Main action: Send (approves, makes the PDF, emails the owner) behind `ConfirmDialog` that names the recipient.
- Data [E]: `reports/page.tsx`, `reports/[reportId]/page.tsx`, `monthly-reports.ts`. Failure path today only logs `failed` with no retry (audit `03`): show a failed-send row with Retry [A].
- States: empty "No reports are waiting. The drafts for a month are written on the 1st of the next month." (R2-12). If the timer is off, the empty state is a lie; see CD-20.
- Exceptions: draft not generated, send failed.

### S15 Money, Payments

- Purpose: confirm money arrived, resolve exceptions, refund.
- Main action: open the payment that needs a look; Export for the CA.
- Data [E]: `payments/page.tsx`, `payments-needing-attention.tsx`, `payments-count.ts`, month filters and figures. New lane "Renewals and overdue": subscriptions past due or lapsed with days and amount [Q].
- Structure: three tiles (Monthly volume, Successful charges, Failed or flagged); sections Needs a look, Renewals and overdue, then the table as the one focal card. Row action opens the `SidePanel` with the payment, the client link, and Refund (dialog from R2-09). No gateway latency or "Active refunds" tiles (no data source).
- States: skeleton; empty per month ("No payments to show for `<month>`"); error.
- Exceptions: lost webhook payment, unapplied payment, failed renewal, refund recorded but no provider call (D11 open; the dialog keeps R2-09's honest line).
- Patterns: `StatTile`, `DataTable`, `FilterBar`, `SidePanel`, `ConfirmDialog`.

### S16 Money, Invoices

- Purpose: reconcile and export tax invoices.
- Main action: Export register (logged).
- Data [E]: `invoices/page.tsx`, `invoices-admin.ts`, `invoice-reconciliation`. Missing invoices appear as a Needs a look section and on Today [Q small] (audit `03`).
- States and patterns as S15.

### S17 Money, Plans and offers

- Purpose: change what customers pay and offer, rarely.
- Main action: Save, behind a `ConfirmDialog` that states what changes for new purchases (`pricing-admin.ts`; audit: "New price appears on checkout and /api/pricing").
- Tabs: Prices, Coupons, Affiliates (with codes). Layouts mostly unchanged: re-themed only in R2-09 with no mock. A mock is needed here (CD-A3).
- Exceptions: a price that differs from the pricing module (open, audit D3).

### S18 Compliance

- Purpose: never miss a statutory clock and keep an auditable record.
- Tabs: Privacy requests, Breaches, Closures, Access log.
- Main action per tab: Log a request, Log a breach, Restore or extend (confirm), Filter.
- Data [E]: `deadline-clock.ts` (R2-09 "17d 08h remaining", "5h 12m left"), access log with its 16 missing action filter values fixed (audit `03`: filter lists only `STAFF_ACCESS_ACTIONS`) [A small].
- Surfaces on Today and the rail count when a clock is under 72 hours or overdue [Q].
- States: R2-09 wording for empty states. Warning banner for a deadline under 72 hours.
- Exceptions: overdue clock, erase run order risk (`19` 13.3, a code gap not a UI one).
- Patterns: `StatTile`, `DataTable`, `StatusChip`, `ConfirmDialog`.

### S19 System

- Purpose: know whether the machinery works and fix it.
- Tabs: Health, Emails and webhooks, App errors, Settings, Access.
- Health [Q] [N]: failed deliveries, webhook failures with replay (N6), error count, Google problems, social-auto alerts (N7), and the state of the four timers if a run stamp exists (CD-20). Only real signals; no gateway latency.
- Emails and webhooks [E] [N]: failed list with retry state after N3; Resend all failed (confirm); detail pages keep redaction.
- App errors [E]: moved from `/support/errors`.
- Settings [E]: Teams addresses (confirm remove, a gap R2-09 open question 3), setup call URL, rounds default.
- Access [E]: `/staff` reduced: one account list, the read-only "Sign-in protection" section from R2-09 (`protection-status.ts`), an invite only for the offline recovery admin (D30, CD-4).

### S20 Auth and utility

Restyle `/login`, forgot and reset, staff invite, no-access and not-found with `QuietFrame`. No flow change. D19 and D30 (Cloudflare Access verified, second factor, recovery admin) stay owner and infra decisions, surfaced on System > Access.

## 4. Addendum proposal: console extras for the premium design language

This is a proposal to add as section 8b of `05-PREMIUM-DESIGN-LANGUAGE.md` and to apply to `apps/admin/DESIGN.md` in package CD-00. It resolves three conflicts between the existing rules.

### 4.1 Conflicts to settle

| Conflict | Source | Proposal |
|---|---|---|
| `DESIGN.md` says "Modals for confirmation" are not allowed; R2-09 shipped `ConfirmDialog` for refunds and destructive actions | `apps/admin/DESIGN.md` "Not allowed"; `reports/R2-09.md` | Allow a native dialog for confirmation only for money and irreversible or customer-emailing actions (3.2). Everything else uses undo or inline confirm |
| Language file says 52px table rows; console says 44px | `05` section 3 Tables vs section 8 | Console rows 44px, header 12px muted; 36px compact only for read-only registers (Invoices, Access log) |
| "One raised surface per screen" vs side panels | `DESIGN.md` Surfaces | A `SidePanel` is an overlay layer, not a second raised surface; the list stays the one focal card |

### 4.2 Additions

1. **Dense data table (`DataTable`).** Sticky header, 44px rows, first column the object (bold name, small line below), figures in Mono right aligned, a time or age column with red only when late, a last column with the primary verb and an overflow `RowActions` button. Hover `#FAF9F6`. Selected row gets the gold wash `#FBF4EA` and a 3px left marker. Column resize not included; column show and hide only where a table has optional money columns.
2. **Row actions (`RowActions`).** One visible verb plus a three dot menu. The menu holds the less common actions, each a plain verb, destructive ones last and red. Same menu on right click. Never more than five items.
3. **Side panels (`SidePanel`).** 480px from the right at 1100px and up, full sheet below; slide 240ms (the language file's sheet motion), scrim only on phone. Focus moves in and returns. Escape closes. URL carries `?open=`. Header has the object, the primary button sits at the foot, sticky.
4. **Sticky filters (`FilterBar`).** Pins under the page header while the list scrolls. `FilterPills` with counts (existing), a search field, and active filters echoed as removable chips. Default filter shows work to do, never an empty list (existing rule).
5. **Inline editing (`InlineEdit`).** For names, notes, status, preview link and enquiry fields: click or `Enter` to edit, `Enter` saves, `Escape` cancels, a saved toast with Undo. Errors stay in the field with the fix. Never for money fields or anything that emails the customer.
6. **Toast with undo (`Toast`).** The language file's toast (bottom left, ink, 4 seconds) lengthens to 10 seconds when it carries Undo and is announced politely to screen readers.
7. **Command bar and shortcuts.** `⌘K` overlay (S2) and `?` help listing every shortcut. Single key shortcuts fire only when focus is not in a field; they never destroy data (no delete key). `Escape` always closes the top layer.
8. **Bulk bar (`BulkBar`).** Appears at the top of the list when rows are selected: count, the permitted actions, Clear. Replaces the filter bar while active.
9. **Status vocabulary.** Reuse `StatusChip` and `StatusPill`: late red, waiting gold wash, done sage, idle sunken. Every state has a word. Clocks use Mono (`17d 08h remaining`, `5h 12m left`).
10. **Gold budget stays at 3 per viewport.** The rail mark, the Late card edge and one count. Selected rows use the wash, not more gold.
11. **Density rule.** One density. No user setting (CD-10).

## 5. Work packages and waves

Common to every package (as `RELEASE-2-PLAN.md` section 5): worktree `../bb-cd-NN`, branch `cd/NN-name` from current `origin/development`, own databases and ports (`AGENT-RULES.md` section 4), tests first for logic, existing components first, tokens only, no new libraries, report `docs/implementation/reports/CD-NN.md`, PR into `development`, never `main`. Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, plus `pnpm test:integration` when `packages/db`, billing, refunds, tax invoicing or email are touched. Mocks come first and an area's build package does not start until its mock is approved (as R2).

### 5.1 Waves

| Wave | Packages | Parallel | Exit gate |
|---|---|---|---|
| A: design | CD-A1 to CD-A4 | All four parallel | Owner approves IA, Today and the addendum (G2), then Client 360 (G3), then the rest (G4) |
| B: foundation | CD-00, CD-01, CD-02 | CD-00 then CD-01 in parallel with CD-02 design review; CD-02 waits for N1 merge | Patterns in `/design-system`; rail and routes cut over (G5) |
| C: core workflows | CD-03 Today, CD-04 command bar, CD-05 client shell and Overview, CD-06 Website, CD-07 Services and Money tab, CD-08 Inbox Requests, CD-09 Enquiries and Reports | CD-03, 04, 05, 08 parallel; 06, 07 after 05; 09 after 08 | Each green against its mock |
| D: money, compliance, system, cleanup | CD-10 Money, CD-11 Compliance, CD-12 System, CD-13 retire routes and dormant code, CD-14 states, forms, bulk and keyboard sweep | CD-10, 11, 12 parallel; 13 after owner approves the retire list (G6); 14 last | Green |
| E: verify | CD-15 | Single | All console journeys pass; release candidate walkthrough (G8) |

### 5.2 Design packages (wave A)

Each writes static HTML mocks to the language file, with in-page states (new, live, empty, error) at 1440 and 390, using only tokens. Rule: no data source, no element; every number and word traces to a field named in this plan. No sample business names; use `<business>`. Each also writes `docs/design/redesign/notes-console-v2-<area>.md` (decisions, states, open questions). Read only on code.

| Pkg | Mocks |
|---|---|
| CD-A1 | Shell and rail (six items), command bar overlay, Today with filters, side panel, bulk bar, keyboard help, kickoff prompt as popup and as row |
| CD-A2 | Client workspace: Overview 360 with exceptions strip, Website tab with stepper and states, Services, Money tab, Requests and Account tabs |
| CD-A3 | Inbox Requests with side panel, Enquiries, Reports to review, Money (Payments with Renewals lane, Invoices, Plans and offers), Compliance (four tabs), System (five tabs) |
| CD-A4 | The addendum as a living page: `DataTable`, `RowActions`, `SidePanel`, `FilterBar`, `InlineEdit`, `Toast`, `BulkBar`, `CommandBar` with all states; written spec of keyboard map and the confirm and undo rules |

### 5.3 Build packages

| WP | Scope and files (indicative) | Acceptance | Tests | Depends on | Parallel with |
|---|---|---|---|---|---|
| CD-00 | Fold the addendum into `docs/design/redesign/05-PREMIUM-DESIGN-LANGUAGE.md` section 8b and rewrite `apps/admin/DESIGN.md` (modal rule, row height, side panel rule). Docs only plus token additions in `packages/shared/src/styles/theme.css` if needed | The three conflicts in 4.1 are resolved in the docs; no behaviour change | none new | G2 | A review |
| CD-01 | New patterns in `packages/shared/src/ui/patterns/`: `data-table.tsx`, `filter-bar.tsx`, `side-panel.tsx`, `command-bar.tsx`, `toast.tsx`, `bulk-bar.tsx`, `row-actions.tsx`, `inline-edit.tsx`, `shortcut-help.tsx`, a `use-shortcuts` hook; entries in `/design-system` (both apps); export in `patterns/index.ts` | Each follows the addendum; keyboard, focus return, reduced motion, AA | Unit tests per pattern in `patterns.test.ts` style: render, props, keyboard, reduced motion | CD-00 | CD-02 design |
| CD-02 | Shell and IA: `lib/console-rail.ts` (six items, `RAIL_ALIASES` updated), `components/console/{console-shell,rail,rail-nav,phone-bar}.tsx`, top bar, `lib/server/rail-counts.ts`, redirects for moved routes (`/calls`, `/projects`, `/leaving`, `/reports`, `/pricing`, `/coupons`, `/affiliates`, `/ad-results`, `/privacy-requests`, `/breaches`, `/access-log`, `/staff`, `/deliveries`, `/support/errors`). Remove the `needs` filter from menu building (guards stay in pages and actions) | Rail has six items; every old URL still lands somewhere sensible; no role variant of the menu; `RELEASE-2-SPEC.md` rail requirement met | Update `rail.test.ts`, `console-rail.test.ts`; test each redirect | CD-01, N1 merged | CD-03 start |
| CD-03 | Today: `app/(protected)/page.tsx`, `lib/today-queue.ts`, `lib/server/today.ts`, `components/today/*`, new row kinds, filters, side panel, bulk set, keyboard | Every row in the S3 table appears when its condition is true; one primary per row; late first; filters with counts | Extend `today.test.ts` (488 lines now) and `today-queue.test.ts` for each new kind; integration tests where a `packages/db` query is added | CD-01, CD-02; consumes N1 `kickoff_prompt_state` | CD-04, CD-05, CD-08 |
| CD-04 | Command bar: `components/console/global-search.tsx`, `lib/console-search*.ts`, `app/(protected)/search/route.ts` | Go to, Actions, Recent, prefix modes; no customer data in the Recent list on the server; search results logged as before | `console-search.test.ts` additions; component test for focus and keyboard | CD-01 | CD-03 |
| CD-05 | Client shell and Overview: `clients/[businessId]/{layout,page}.tsx`, `lib/client-tabs.ts` (six tabs), `lib/client-next-step.ts` (all services), `parts.tsx`, exceptions strip | Tabs Overview, Website, Services, Money, Requests, Account at the URLs in 2.2; legacy tab URLs redirect; next step covers Social, Paid Ads, Monitoring | `client-tabs.test.ts`, `client-next-step.test.ts`, `page.test.ts`, `legacy-tabs.test.ts` | CD-01, CD-02 | CD-03, CD-08 |
| CD-06 | Website tab split: `website/page.tsx`, `components/console/website-section.tsx`, `kickoff-call-section.tsx` (state only), `lib/hosting-form.ts` | Behaviour unchanged for every action (existing action tests pass untouched); Domain and hosting panel; confirm on cancel build; no duplicate kickoff button | `website-section.test.ts`, `kickoff-actions.test.ts` unchanged | CD-05 | CD-07 |
| CD-07 | Services tab and Money tab: `services/page.tsx` (new), `billing/page.tsx` (slimmed), move `numbers-section`, `campaigns-section`, `accounts-section`, `updates-section` per CD-5 | Paid Ads figures entry works from Services; Plan and billing holds money only | Move tests with their components; `numbers-actions.test.ts` unchanged | CD-05 | CD-06 |
| CD-08 | Inbox Requests, one list: `support/page.tsx`, `support/[ticketId]`, `support/new`, `clients/[businessId]/requests`, `requests-section.tsx`, `lib/support-staff.ts` view code | Support tickets and change requests in one list with type chips; reply, quote, close, reopen and undo; client Requests tab uses the same component | `requests-section.test.ts`, `request-actions.test.ts`, `support-admin-actions.test.ts` unchanged plus new list tests | CD-01 | CD-03, CD-05 |
| CD-09 | Enquiries and Reports: `leads/*`, `components/enquiries/*`, `reports/*` | Send setup link behind confirm; report Send behind confirm; failed send shows Retry | `enquiry-list.test.ts` and existing | CD-08 | CD-10 |
| CD-10 | Money: `payments/page.tsx`, `payments-needing-attention.tsx`, `invoices/*`, plans and offers tabs from `pricing`, `coupons`, `affiliates`, Acquisition from `ad-results`; Renewals lane query | Renewals lane lists past due and lapsed [Q]; refund dialog unchanged; exports logged | `client-payments.test.ts`, `pricing-admin.test.ts` unchanged; integration test for the new lane query | CD-01, CD-02 | CD-11, CD-12 |
| CD-11 | Compliance: `access-log`, `privacy-requests`, `breaches`, Closures from `leaving`; Today and rail clock rows | Clocks appear on Today; access log filter lists every action the code writes | `deadline-clock.test.ts`, `access-log-filters.test.ts` | CD-02, CD-03 | CD-10, CD-12 |
| CD-12 | System: Health page, `deliveries/*`, `outbox/[emailId]`, `support/errors/*`, `settings`, `staff` simplified, `lib/protection-status.ts` | One Health page; no role picker; Teams remove behind confirm | `deliveries-view.test.ts`, `system-health.test.ts`, `staff-admin.test.ts` | CD-02; consumes N3, N6 | CD-10, CD-11 |
| CD-13 | Retire routes and dormant code after G6: `/ads`, `/deals`, `/directory`, `/geography`, `/referrals*`, `/outbox` list, `/ad-credit`, picture routes, `geo-*`, `place-ad-form`, `edit-ad-form`, `client-listing*`, `directory-only`; exported dormant server actions removed | Build still green; routes return 404; tables untouched; no migration | Delete the matching tests; `rail.test.ts` | Owner approval (G6), CD-02 | none (cleanup) |
| CD-14 | States and forms sweep across the console: `loading.tsx`, `error.tsx` on new routes, forms keep input on rejection, every list has an empty state, keyboard map completed | As R2-10 for the console; no list without an empty state | Component tests for the states | Wave C and D | none |
| CD-15 | Playwright console journeys at 1440, 768, 390: kickoff, build to live, request and quote, enquiry, payment exception and refund, privacy request clock, closure, command bar, keyboard; axe sweep; screenshot set; access log written for every customer-data page | Journeys from `19` phases 5 to 13 that touch the console pass; zero serious axe issues | The suite itself | All | none |

### 5.4 Parallelism summary

At most five packages run at once. The hot shared files are `lib/console-rail.ts` and `console-shell.tsx` (CD-02 owns them; everyone else rebases after it merges), `lib/today-queue.ts` and `lib/server/today.ts` (CD-03 owns them), `lib/client-tabs.ts` (CD-05 owns it), and `packages/shared/src/ui/patterns/` (CD-01 owns it). Other packages add files, not edits, to these.

### 5.5 Interplay with the notifications work

Source: `docs/notifications/03-build-plan.md` on `origin/claude/notifications-review-f79eb2`; branch `origin/claude/notify-01-foundation-324d17` already exists.

| Notifications package | Touches | What this plan does |
|---|---|---|
| N1 foundation (schema 0229, `notify()`, stored bell, console bell in the shell) | `console-shell.tsx`, bell | Land N1 first (the owner merges N1 before the rest, per the build plan). CD-02 rebases on it and keeps the bell slot in the new top bar. No console redesign package adds a migration |
| N2 kickoff (D33): remount `KickoffPromptPopup` in `(protected)/layout.tsx`, remove the duplicate Today row, 15 minute repeat from `kickoff_prompt_state` | the popup files, `today/kickoff-prompt.tsx`, `calls/*` | N2 lands before CD-03 and CD-06. CD-03 consumes the single prompt; CD-06 removes remaining buttons only if N2 has not. The layout mount is never moved by CD-02 |
| N3 email queue and retries | deliveries | CD-12 builds the Health and Emails views on top; until N3 merges the view shows today's two in-process tries (`brevo.ts`) |
| N4 push | service worker, opt-in | Console opt-in lives in System > Access or the account menu (CD-A1 mock). No other UI work |
| N5 events | Today rows for failed payment, lapse, unapplied payment | CD-03 and N5 share these rows. Rule: CD-03 builds the row and its query; N5 only calls `notify()`. Avoid two implementations |
| N6 webhooks and ops (replay, Teams retry, timers) | System | CD-12 shows replay and retry state; N6 supplies the data |
| N7 social receiver | stored social events | CD-07 Social card and CD-03 Social alert row read what N7 stores. Both wait for N7 or ship hidden |

Files both streams edit and the owner of each: `console-shell.tsx` (CD-02 after N1), `(protected)/layout.tsx` (N2), `lib/server/today.ts` (CD-03, with N5 adding `notify()` calls in other files), `lib/server/rail-counts.ts` (CD-02), `components/console/kickoff-prompt-popup.tsx` (N2, CD only restyles through patterns). Each PR states what it is stacked on.

## 6. Gates and estimate

### 6.1 Owner approval gates

| Gate | When | What the owner approves |
|---|---|---|
| G1 | Now | This plan, and answers to the open decisions that block mocks: CD-1, CD-2, CD-4, CD-5, CD-19 |
| G2 | After CD-A1 and CD-A4 | The six item rail, Today, kickoff prompt, command bar, addendum (including the three conflict rulings) |
| G3 | After CD-A2 | Client workspace tabs and the 360 |
| G4 | After CD-A3 | Inbox, Money, Compliance, System mocks |
| G5 | After CD-02 | Rail and redirects live on `development` |
| G6 | Before CD-13 | The exact list of routes, actions and components to delete, with the production data check for CD-5 |
| G7 | After each wave | Green checks and screenshots at 1440 and 390 |
| G8 | After CD-15 | Browser walkthrough, then the release PR. The owner enables any new timer on the server |
| Copy | With each report | All new staff wording listed in the package report |

### 6.2 Agent run estimate

A run is one agent session. Counts assume a review and fix pass per build package.

| Item | Runs |
|---|---|
| Wave A: four design agents, plus one revision round each after owner comments | 8 |
| CD-00 | 1 |
| CD-01 (large, nine patterns) | 3 |
| CD-02 | 2 |
| CD-03 Today (new queries, large) | 3 |
| CD-04 | 1 |
| CD-05 | 2 |
| CD-06 | 2 |
| CD-07 | 2 |
| CD-08 | 2 |
| CD-09 | 2 |
| CD-10 | 2 |
| CD-11 | 2 |
| CD-12 | 2 |
| CD-13 | 1 |
| CD-14 | 2 |
| CD-15 | 3 |
| Rebase and conflict runs against notifications packages | 3 |
| Diff review by Claude for CD-01, CD-02, CD-03, CD-10 (billing adjacent) | 4 |
| **Total** | **about 47, plausible range 40 to 60** |

Critical path (longest dependency chain): CD-A1 and G2, CD-00, CD-01, CD-02 (after N1), CD-03 or CD-05, CD-06, CD-14, CD-15. About six sequential steps after the mocks are approved.

### 6.3 Risks

- Rail and route moves break emailed links and bookmarks. Keep redirects (CD-14) and check `notice` links in `lib/client-tabs.ts` ("Which tab shows each notice an action redirects with").
- Merge conflicts with notifications (5.5). Mitigation: order above and the shared-file owners.
- Deleting dormant code touches actions that are still exported. Mitigation: G6 and CD-13 ships alone.
- New Today rows need new queries; a slow queue hurts every session. `rail-counts.ts` already reads many tables on every render (audit proposal P15). Mitigation: cache per request, compute only the counts shown.
- Mocks that invent. Mitigation: the no-source rule and a checklist item in each review.
- Removing roles in the UI while server guards remain. Mitigation: CD-4 keeps guards and treats the account as admin.
- Production state unknown for four timers (erase, site hosting, first-payment check, monthly reports; `19`). The new empty states would say "nothing waiting" when a timer is off. Mitigation: CD-20.

## 7. Open decisions for the owner

Each has a recommended default. Existing decisions that still gate parts of this plan are listed first by their ID.

### 7.1 Existing decisions that gate screens

| ID | Gates | Recommended default (from `14`) |
|---|---|---|
| D10 lapse policy | Renewals lane and Today lapse rows (what "lapsed" means and when hosting pauses) | Grace period, then pause hosting, keep data, allow reactivation |
| D11 refund behaviour | The refund dialog wording and Money copy | Provider refund by the one account with a credit note and customer email. Until built, the dialog keeps the true wording from R2-09 |
| D15 Dedicated Expert Monitoring | The Monitoring line on Services and Overview | Define a monthly deliverable, or hide from the console until defined |
| D19 and D30 protect the single account | System > Access copy, second factor, recovery admin | Cloudflare Access verified in code, a second factor, and an offline recovery admin credential |

### 7.2 New decisions

| ID | Decision | Recommended default |
|---|---|---|
| CD-1 | Does Calls stay a rail item? | No. Calls become a Today filter and a side panel; the kickoff prompt covers the action |
| CD-2 | Delete the dormant routes `/ads`, `/deals`, `/directory`, `/geography` with their exported server actions and components? (Root `CLAUDE.md` says ask first.) | Yes, delete code, keep every table and column. Reason: the exported actions are a risk, the pages are unreachable |
| CD-3 | `/ad-credit` and the coupons screen | Remove Ad credit once no stored credit exists. Keep Coupons while any coupon is live; add the owner offer rule to the screen header |
| CD-4 | Roles after one account | Hide every role picker and `needs`-based menu filtering now, keep the schema and server guards unchanged, treat the account as admin. Retire roles from the data model only in a later release with its own migration |
| CD-5 | Manual Social staff screens (Posts, Accounts, Updates, deliverable images) | Confirm with a read-only production query that no live customer uses them, then delete in the following release (D16). Until then keep them reachable from the Services tab behind a "Legacy" label |
| CD-6 | Where Paid Ads figures are entered | Services tab, existing form only, no new workflow |
| CD-7 | Snooze for Today rows | No. It hides late work. Today shows only what is true |
| CD-8 | How long a sent preview may wait before it shows on Today | 5 days |
| CD-9 | Single key keyboard shortcuts | On, with `?` help, never while typing in a field |
| CD-10 | Density | One density (44px), no user setting |
| CD-11 | Side panel or full page | Side panel for Today, Inbox, Enquiries, Payments; full page for the client workspace |
| CD-12 | Bulk set | Only the sets in 3.1. Nothing that moves money |
| CD-13 | Phone support | Console is usable at 390 for the kickoff prompt, a reply and a payment check; long work (build, compliance, pricing) is designed for desktop |
| CD-14 | Legacy URL redirects | Keep until a check of emailed and notice links shows none points to them (about 90 days) |
| CD-15 | Report review window on Today | Rows appear from the 1st to the 5th of the month, or while any draft is unsent |
| CD-16 | Social status in the workspace | Show last post, last failure and connected channels from social-auto events once N7 lands; hide the card until then |
| CD-17 | Keep the tab URL `/billing` with the label "Money" | Yes. URLs do not change for a relabel (`DESIGN.md`) |
| CD-18 | Search scope | Keep six kinds; add phone and domain search only if the owner asks |
| CD-19 | The Release 2 console mocks and `notes-console.md` | Discard as the base. Redo under the no data source, no element rule |
| CD-20 | Show whether the four timers run (erase, hosting, first-payment check, reports) | Show a "last ran" time only where a run record already exists. If none exists, the owner confirms the timers are enabled on the server before this release (R2 owner action). A new run record is a schema change and is not assumed |
