# Proposed navigation and screen contracts

Status: PROPOSAL. Nothing here is implemented. Every row ties back to a route in the two inventories (`02` customer, `03` admin) and to evidence in `evidence/`. Items marked "decision" need the owner (see `14`). Design is proposed inside the existing BrandBasket design system (`apps/customer/DESIGN.md`, `apps/admin/DESIGN.md`); no new visual style is proposed.

## 1. Disposition summary

| App | Routes in inventory | Keep | Redesign | Merge | Move | Split | Retire | Redirect or alias (retire later) |
|---|---|---|---|---|---|---|---|---|
| Customer | 96 pages (about 53 real screens, 40 redirects, 3 test pages, 1 dormant) | 40 | 9 | 5 | 4 | 1 | 1 | 36 |
| Admin | 56 pages | 29 | 2 | 8 | 4 | 2 | 11 | included in Retire |

## 2. Proposed customer navigation (task first)

Problem solved: today's menu is organised by feature tables, three things need the customer's OK in three places, the setup checklist has no entry point, Blog and Domain are hidden until launch, Paid Ads is sold the wrong product (shares Social's key).

| Level | Item | Contents | Visible when |
|---|---|---|---|
| Top | Home | One next action in priority order: fix payment, book kickoff, answer what is waiting, then live status | always |
| Top | Needs your OK | Preview approval, social posts awaiting approval, quotes, change checks. The bell links here | always, empty state explains |
| Top | Messages | Requests, Help and calls, Contact as one place with one canonical request URL | always |
| Services | Website | Overview, Pages, Blog, Domain as one tab strip from day one (Blog and Domain explained before launch) | service held or NotBought pitch |
| Services | Social | Posts, approvals, accounts, analytics | Social held |
| Services | Paid Ads | Spend, leads, campaigns, ask for a change, own entitlement key `ads` | Paid Ads held |
| Business | Reports | Always shown once the plan is live, empty explanation until the first report | live plan |
| Business | Business profile | Brand kit and checklist merged here | always |
| Account | Plan and billing | Services, Invoices, Payment method, Cancel plan, link to Delete account | owner acts, others read |
| Account | Team and Settings | Profile, Security, Notifications, Privacy, Team | always |

Phone: five tabs Home, Needs your OK, Services, Messages, More. Billing stays under More but gets a Home task when something is wrong. Command menu indexes every route in the table, including Blog, Domain, Checklist and each Settings tab.

## 3. Proposed admin navigation (work first)

Problem solved: staff find Social and Ads delivery inside a billing tab, requests have no owner, Today misses approved previews, domain moves, lapsed billing and privacy requests, and the "Ads" rail item holds a dormant credit report.

| Item | Pages | Role | Replaces |
|---|---|---|---|
| Today | My work, Unowned, Late, role aware | all | Today |
| Work | Lanes: Website builds, Kickoffs, Social posts, Paid Ads, Monitoring, Reports | support, admin (finance read) | Clients Board, Clients Reports, Calls, Ads |
| Clients | List with Leaving filter, per-client workspace with Website, Social, Paid Ads, Billing, Messages, People tabs | all | Clients List, Leaving |
| Inbox | Requests (support, feedback, change requests with quote state), Enquiries | all | Inbox |
| Money | Payments and renewals, Invoices, Prices, Offers (Coupons plus Affiliates), Acquisition (ad results) | finance, admin | Money, Ads |
| Compliance | Privacy requests, Breaches, Access log, Staff | admin | Team |
| System | Settings, App errors, Emails and webhooks with retry state | all, admin parts gated | Settings |

Full reasoning, role queues and the 15 numbered proposals are in `evidence/admin-operations/admin-ia-proposal.md`.

## 4. Screen contract template

Every active screen must satisfy this contract before it is built or changed:

1. User goal in one sentence and the person (owner, editor, viewer, support, finance, admin).
2. Entry points (menu, email, bell, empty state) and exit (the one next action).
3. Primary CTA, secondary actions, and what is deliberately absent.
4. Data required and guard (login, paid, service, role).
5. States: loading, empty, error with recovery, success, permission denied, expired link.
6. Cross-app consequence: the staff screen or queue that sees the result and the customer status it produces.
7. Acceptance test from `13`.

The tables below fill items 1 to 5 as far as the audit evidence supports. Items marked blank in "States covered today" need work.

## 5. Customer screens (non-redirect), disposition and contract summary

| Route | Disposition | Proposed placement | Primary CTA | Exit | States covered today | Issue |
|---|---|---|---|---|---|---|
| / | Redesign | Keep as task-first Home; split states into owner payment task vs member view | state-dependent: Pay /checkout / Reactivate /billing / Book a kickoff call / See your web... | /checkout, /billing, /website, /requests?new=1, /checklist?item= | error (HomeStateError); per-panel Loaded errors; loading none (no loading.tsx) | Home is the one state-machine page (15 states in features/home/rules.ts:38-55) mixing payment, kickoff, build, ongoing; payment task shown to non-owners |
| /ads | Split | Give Paid Ads its own service key; own request intent; remove ad-money row if owner confirms no ad money | Ask for a change /requests?new=1&about=website (non-viewer) | /requests?new=1&about=website | empty (No ad figures yet), error per panel, NotBought; loading none | Paid Ads access follows the SOCIAL service key (shell/rules.ts:88-89; db service-setup.ts:40): social-only customers see Ads as bought and ads-only customers s... |
| /billing/invoices | Keep | Billing > Invoices | Download all (owner, when payments downloadable) | /billing/receipts, /checkout/charges/<id> | empty/error via PanelError; loading none | Viewer/editor can read invoices (requireCustomer) while Pay is owner only; intended per comment |
| /billing | Redesign | Plan & billing > Plan tab; add a direct self-serve card change once G7 is proven | state-dependent: Go to checkout / Change payment method / Reactivate card / Add service /... | /checkout, /billing/payment, /requests?new=1 (billing), Razorpay window via /checkout/cha... | loading none; empty n/a; error (PanelError notices/services); success banner; pending (Pa... | Renewal-failing primary 'Change payment method' leads to /billing/payment where the only action is a request to the team (payment-method-request.tsx header, ga... |
| /billing/payment | Redesign | Billing > Payment | Change (opens dialog that sends a billing request) | /requests (request created) | empty (No payment yet), error PanelError | Change payment method is a support request not an action (see /billing) |
| /business/brand | Merge | Business profile; checklist item should deep link here | Upload logo/photos | same page | error panel; empty; loading.tsx exists for /business only | Brand kit duplicated in Checklist brand-form (features/checklist/components/brand-form.tsx) |
| /business | Keep | Business profile | Save changes (SaveBar) | same page | loading.tsx present (business/loading.tsx); error; empty | Unsaved edits lost on in-app link (no navigation guard in save-bar-host.tsx) |
| /changelog | Keep | Account menu | none | none | static | Not discoverable except the account menu; not in command search |
| /checklist | Move | Add under Home task or Business profile | Add / open item (?item=) | /checklist?item= | empty (nothing to set up), error PanelError | No sidebar entry: reachable only from Home or old links. Not in navModel (shell/rules.ts:112-127) |
| /enquiries | Redesign | Show only when a lead source exists (website/chatbot); else fold into Website | Export (download CSV) / open enquiry sheet | /enquiries/export | empty (filtered), error, success; loading none | Shown in sidebar and a bottom-tab slot to every paid customer even with no website or chatbot; name collides with admin 'Enquiries' (console-rail.ts:65) |
| /help/contact | Keep | Help | Email us / New request /requests?new=1 | /requests?new=1 | error | none |
| /help | Keep | Help | Book a call | cal.com booking via /api/webhooks/calcom | empty, error (two identical banners when one read fails, E2E-2 O-5) | Duplicate error banner (Reported; shape still true: two panels share one loadCalls) |
| /reports/[month] | Keep | Reports > month | Download PDF per service | /reports/<month>/pdf | per-service error Banner (report-screen.tsx:31), empty, notFound | Signed-out email click lands on /login without return (no next outside invites) |
| /reports | Keep | Business > Reports | Open a month | /reports/<month> | empty, error | Sidebar link hidden until first report, yet route open; bell/email are the only first-report path |
| /requests/[id] | Keep | Requests > detail (single canonical) | state-dependent: Accept quote / Pay / Approve change / Reply | /checkout/charges/<id> (quote pay), /requests?new=1 | error ({ok:false}), notFound, closed conversation | Bell opens this page; emails open /requests?open= sheet instead (see /requests) |
| /requests | Merge | Requests list + single detail page | New request (dialog) | /requests/<id>, /requests?open= | empty, filtered, error, success notices (?charge) | Two surfaces for one request (inspector sheet at ?open= and full page /requests/<id>); changes limited to newest 100 rows |
| /search | Retire | Retire after grandfathered customers end | - | / | n/a | Local SEO + AEO no longer sold (page comment); silent redirect gives no explanation |
| /settings/delete | Move | Plan & billing > Cancel plan (link here) | Delete my account | /restore-account (after sign-out) | error panel; field errors | Cancel-everything path is inside Privacy; no cancel affordance from Plan & billing beyond per-service Cancel |
| /settings/notifications | Keep | Settings | Email switches | same | error; optimistic? | Topics (new_enquiry, needs_approval, request_reply, billing...) not mapped to every template (e.g. monthly_report used in monthly-reports.ts:236) |
| /settings | Keep | Settings | Save | same | error field errors | none |
| /settings/privacy | Keep | Settings | Download your data | /settings/privacy/export, /settings/delete | error | none |
| /settings/security | Keep | Settings | Change password | same | field errors | none |
| /settings/team | Keep | Settings > Team | Invite someone (dialog) | /invite/<token> via email | error per panel, empty | Editors/viewers cannot even see the team list; redirected Home with no message |
| /social/analytics | Keep | Social > Analytics | range/channel filters | same | error; 404 when env missing | Existence depends on server env (postingServiceSettings, analytics/rules.ts:193) so the route 404s in some deployments |
| /social | Redesign | Single Social approval surface | Approve (post) / Approve all | /requests?new=1 (changeHref), /social/review, /social/analytics | error per panel; empty; NotBought; success toast | Two different Social screens chosen by server env; legacy tree uses raw Phosphor/arbitrary sizes (legacy-social/components/review-view.tsx, review-workspace.ts... |
| /social/review | Merge | Social > Posts approval | Keep topic / Draw pictures / approve pictures | /social | pending, error (useReviewAction catch), empty | Page title 'See posts' while sidebar says 'Social media'; Back arrow has aria-label |
| /website/blog/[id] | Keep | Website > Blog | Publish / Save draft | /website/blog | error panel; notFound; viewer read-only | none |
| /website/blog/authors/[id] | Keep | Website > Blog > Authors | Save | /website/blog/authors | error; notFound | none |
| /website/blog/authors/new | Merge | inline dialog on list | Add author | /website/blog/authors/<id> | field errors | Create-then-edit two screens for one field |
| /website/blog/authors | Keep | Website > Blog | New author | /website/blog/authors/new | empty, error | none |
| /website/blog/categories/[id] | Keep | Website > Blog | Save | /website/blog/categories | error; notFound | none |
| /website/blog/categories/new | Merge | inline dialog on list | Add category | /website/blog/categories/<id> | field errors | Create-then-edit two screens for one field |
| /website/blog/categories | Keep | Website > Blog | New category | /website/blog/categories/new | empty, error | none |
| /website/blog/new | Keep | Website > Blog | Create post | /website/blog/<id> | field errors | none |
| /website/blog | Move | Website > Blog always visible | New post | /website/blog/new | empty, error, locked usage | Not reachable by navigation before launch (website-screen.tsx:63-80 renders no tabs); absent from command search (shell/rules.ts:82-86) |
| /website/domain | Move | Website > Domain | Connect / Move domain (state-dependent) | /requests?new=1 ; domain request alert to team | empty (No web address yet), error | Prelaunch customers have no tab to this page |
| /website | Keep | Website > Overview | by project status: Open preview / Approve and go live / Ask for a change / See your kicko... | /requests?new=1&about=website, external preview/site | error; empty EmptyState per view kind; loading none | preview-ready email does not link here (see email-deep-links); Ask for changes consumes revision rounds, 'Ask for a change' outside preview is a request |
| /website/pages | Keep | Website > Pages | none | - | error; empty | none |
| /forgot-password | Keep | Auth | Send link | / (email link) | success (same answer for unknown account), error | none |
| /login | Redesign | Auth | Sign in | / or ?next invite | error, notice | No return path: guards send to plain /login (guard-rules.ts:16); only /invite/ paths survive as ?next (team/rules.ts:108-111) |
| /reset-password/[token] | Redesign | Auth | Set new password | /login | expired/used token shown only after submit (page comment) | Used or expired link still shows the form; failure only after typing a password |
| /restore-account/keep-plan | Keep | Recovery | Razorpay window (auto) or fake Confirm | / | invalid-token refusal screen | Fake path is dev only |
| /restore-account | Keep | Recovery | Restore | / | refusal banner (?keep) | No email tells the owner the account is scheduled for deletion or the erase date (no closure template in packages/email) |
| /setup/[token] | Keep | Onboarding | Create account | / | expired/used message, rate-limit message | none |
| /signup | Keep | Onboarding | Email me a code / Create account | /start?services= | error, rate limit with countdown (use-otp-retry-cooldown) | none |
| /billing/charges/confirm | Keep | dev | Pay | chargeReturnHref | refusal screen | none |
| /billing/confirm | Keep | dev | Pay <amount> | / or /billing | refusal | none |
| /billing/services/pay | Keep | Billing | opens payment window | /billing/pay/callback?return=billing | redirect to /billing when nothing payable | Interstitial |
| /checkout/charges/[id] | Keep | Billing | opens window for quote or charge | /billing/charges/callback | not-open -> notice | Viewer gets 404 not a message (checkout/charges/[id]/page.tsx:85) |
| /checkout | Redesign | Checkout | Pay (confirm summary dialog) | Razorpay via /checkout/pay or fake confirm; /?welcome=1 | views: pay, waiting (PaymentWaiting reload), under-review, no-plan, owner-only; failed ba... | Yearly switch, ad-credit line and first-month offer exist while owner says monthly-only and no ad money (checkout-screen.tsx:97, rules/membership.ts:33) |
| /checkout/pay | Keep | Checkout | opens window | /billing/pay/callback | redirect if nothing to pay | none |
| /start | Keep | Onboarding | Continue / Go to checkout | /start?q=, /checkout | per-question save; summary | none |
| /affiliate (portal) | Keep | Affiliate | view coupon codes | - | error per panel (affiliate/(portal)/error.tsx, loading.tsx) | Not a customer persona; out of customer IA |
| /affiliate/setup/[token] | Keep | Affiliate | Set up | /affiliate | expired, rate limited | none |
| /design-system | Keep | dev only | - | - | - | none |
| /invite/[token] | Redesign | Invitations | Join the dashboard | / | format-invalid screen; refusal banner after click (expired/revoked/wrong address) | Late failure for expired invites |

The 36 redirect or alias pages are listed with their targets in `02`. They keep working until traffic and email links are confirmed clear, then retire.

## 6. Admin screens (non-redirect), disposition and contract summary

| Route | Rail today | Role | Disposition | Proposed placement | Primary CTA | Customer outcome | Issue |
|---|---|---|---|---|---|---|---|
| / | Today | support/finance/admin | Redesign | Keep as Today but turn into role-based work queue (My work / Unowned / Late) with the missing kinds; stop computing it for the rail on every page | Add enquiry (/leads/new) | NONE (read-only dashboard) | Queue omits: approved previews awaiting go-live, preview sent and waiting on customer, social posts awaiting staff publish/approved posts, deliverables past du... |
| /clients | Clients > List | support/finance/admin | Merge | Keep as the single client directory; add per-service state column; hide money columns for support or declare them non-sensitive | Open client (row link) | NONE (read-only) | Shows Monthly amount and Paid through (clients/page.tsx:196-214) to support although Payments/Prices are money-gated. Search reads whole client list in memory.... |
| /clients/{id} | Clients (client workspace: Overview tab) | support/finance/admin (money panel finance/admin) | Redesign | Client workspace home: per-service cards (Website, Social, Ads, Monitoring) each with owner, state, next action, due | Open website (next step; always this label) | NONE (read-only) | Next step considers only website (client-next-step.ts:38-46). Shows pre-payment intake (client_intakes) but never the post-payment Social/Search setup answers... |
| /clients/{id}/website | Clients (client tab: Website) | support/finance/admin | Split | Split into Website project workspace (stages, preview, launch) and Domain and hosting; surface builder/owner on the card | Next step card (Start building / Send preview / Send updated preview / Mark live) | sendPreview: email + dashboard preview card (customer /website, headline 'Your preview is... | Largest page in the console (about 15 action groups). Builder assignment and cancel are inside a closed fold (page.tsx:201-211). Cancel and grant-round need on... |
| /clients/{id}/billing | Clients (client tab: Plan and billing) | support/finance/admin for work/ads/accounts/add-ons; finance/admin for BillingSection | Split | Move Posts/Numbers/Campaigns/Accounts/Updates into new per-client Social and Ads tab(s); leave Plan, add-ons, billing here | Posts, pages and reports: Add post/Send for approval/Mark published | Send for approval: post appears in customer /social review with Approve (no email sent by... | The service-delivery workspace for Social and Ads is hidden under a tab called Plan and billing. Paid Ads and Social share one 'social' service (service-setup.... |
| /clients/{id}/requests | Clients (client tab: Messages) | support/finance/admin | Merge | Merge change requests into the global Requests inbox as a type with state and owner | Send quote / Start as included edit / Start at no charge / Mark done | Every quote, start, send for checking, done and decline emails the requester and moves th... | Two things called requests: support tickets (global /support) and change requests (only here, no global queue). A change request moving to in_progress after a... |
| /clients/{id}/people | Clients (client tab: People) | support/finance/admin; restore/extend closure admin | Merge | Keep as a section of a Settings/Account tab on the client workspace | Save name | renameOwner: name shown on dashboard and emails; restore: account unlocked on customer re... | Closure restore is admin only but a support member who receives a 'please restore' request cannot act; erase timer is installed but not enabled by install.sh (... |
| /projects | Clients > Board | support/finance/admin | Merge | Fold into a Work queue screen with a Website lane beside Social/Ads lanes | Open build (card link to /clients/{id}/website) | NONE (read-only) | Website builds only. Late rule covers only submitted/building with slaDueAt (project-board.ts:106-123): a customer who approved the preview and waits for go-li... |
| /reports | Clients > Reports | support/finance/admin | Merge | Work queue type 'Report to review'; single report path | Open report to review | NONE (read-only) | Report drafts only exist if brandbasket-monthly-reports.timer is enabled, which install.sh leaves 'installed, NOT enabled' (deploy/vps/install.sh:455). Second... |
| /reports/{id} | Clients > Reports | support/finance/admin | Keep | Work queue detail | Send (approves, makes PDF, emails owner unless report emails off) | Send: report appears in customer /reports/{month} with PDF and owner email; Hold: custome... | Send action logs ok after success but failure path only logs failed; no retry queue for an email that failed after the report was marked sent (Unknown). |
| /support | Inbox > Requests | support/finance/admin | Keep | Inbox > Requests with type, owner, due columns and Unowned filter | New request for a client (/support/new) | NONE (list) | Queue is derived from messages, not from status (support-staff.ts:35). Unowned tickets show 'Nobody' but no unassigned filter and no auto-assign. SLA only on f... |
| /support/{id} | Inbox > Requests | support/finance/admin | Keep | Inbox detail | Reply (public) or Add internal note | Public reply emails the requester and shows in customer /requests/{id} (mail outcome show... | Closed-ticket reply is an internal note only, so customer cannot be told anything after closure without reopening (page.tsx:62). Log written before id validate... |
| /support/new | Inbox > Requests (action) | support/finance/admin | Keep | Inbox new action | Open request for a client | Customer receives an email and a request in /requests | Whole client list loaded to fill a picker. |
| /support/errors | Settings > App errors | support/finance/admin | Move | Settings > System health (Systems) | Open issue | NONE (internal) | Support role sees diagnostic context of all customers' errors with no access log. In Today only when status 'new'. |
| /support/errors/{id} | Settings > App errors | support/finance/admin | Move | Settings > System health | Update status | NONE (internal) | Assignee exists here but errors are not owned in Today (Today lists new errors with 24h limit only). |
| /leads | Inbox > Enquiries | support/finance/admin | Merge | Inbox > Enquiries stays; 'signed up, not paid' shown once | Add enquiry | NONE (list) | Whole leads table read per request (code comment shortcut). Pre-sale; overlaps with Clients stage 'not-paid'. |
| /leads/{id} | Inbox > Enquiries | support/finance/admin | Keep | Inbox detail | Send setup link | sendSetupLink: customer gets setup email with link to /setup/{token}; attachAccount: repa... | Lead owner exists; no SLA display beyond Today 1h new-lead limit (today-queue.ts:52). |
| /leads/new | Inbox > Enquiries (action) | support/finance/admin | Keep | Inbox new action | Create enquiry | NONE (staff-entered lead; no outbound mail) |  |
| /calls | Calls | support/finance/admin | Merge | Work queue lane 'Kickoffs'; client workspace shows state only | Mark kickoff held with notes (starts the build) | Held: customer Home 'We are getting your website started', build moves to submitted, firs... | Same 'held' action exists on three screens (/calls, website tab Kickoff call, messages tab Calls) plus automatic 24h fallback timer when KICKOFF_AUTO_START is... |
| /payments | Money > Payments | finance/admin | Keep | Money > Payments with a Renewals/Overdue lane | Export for the CA | NONE (read-only) | No list of subscriptions past_due or lapsed; only payments. Lapse state is only a per-client notice (website/page.tsx:133-137). |
| /invoices | Money > Invoices | finance/admin | Keep | Money > Invoices | Export register (route handoff) | Issued invoice appears in customer /billing/invoices | Missing invoices are not in Today or rail counts. |
| /pricing | Money > Prices | finance/admin | Keep | Money > Prices | Save prices | New price appears on checkout and /api/pricing for new purchases (customer checkout) | Plan note: owner says price lives in one pricing module per repo; this page edits stored prices (Unknown whether they override the code module). |
| /coupons | Money > Coupons | finance/admin | Keep | Money > Offers | Create coupon | Coupon works at customer checkout and shows discount on checkout; retire/delete stops it | Coupons are a offer type but owner statement says the only offer is monitoring free with all three plans; whether coupons are still valid commercial policy is... |
| /coupons/new | Money > Coupons | finance/admin | Keep | Money > Offers | Save | Coupon works at customer checkout and shows discount on checkout; retire/delete stops it | Coupons are a offer type but owner statement says the only offer is monitoring free with all three plans; whether coupons are still valid commercial policy is... |
| /coupons/{id} | Money > Coupons | finance/admin | Keep | Money > Offers | Save | Coupon works at customer checkout and shows discount on checkout; retire/delete stops it | Coupons are a offer type but owner statement says the only offer is monitoring free with all three plans; whether coupons are still valid commercial policy is... |
| /affiliates | Money > Affiliates | finance/admin | Keep | Money > Offers and partners | Add affiliate | Login link emailed to affiliate; payout recorded shows on affiliate's own dashboard; none... | docs/STAFF-ACCESS.md:36 lists Affiliates among switched-off directory sections but they are live and role-gated (console-rail.ts:78). Payout records money move... |
| /affiliates/new | Money > Affiliates | finance/admin | Keep | Money > Offers and partners | Save | Login link emailed to affiliate; payout recorded shows on affiliate's own dashboard; none... | docs/STAFF-ACCESS.md:36 lists Affiliates among switched-off directory sections but they are live and role-gated (console-rail.ts:78). Payout records money move... |
| /affiliates/{id} | Money > Affiliates | finance/admin | Keep | Money > Offers and partners | Save | Login link emailed to affiliate; payout recorded shows on affiliate's own dashboard; none... | docs/STAFF-ACCESS.md:36 lists Affiliates among switched-off directory sections but they are live and role-gated (console-rail.ts:78). Payout records money move... |
| /affiliates/{id}/codes/new | Money > Affiliates | finance/admin | Keep | Money > Offers and partners | Save | Login link emailed to affiliate; payout recorded shows on affiliate's own dashboard; none... | docs/STAFF-ACCESS.md:36 lists Affiliates among switched-off directory sections but they are live and role-gated (console-rail.ts:78). Payout records money move... |
| /ad-credit | Ads > Ad credit | support/finance/admin (no role gate) | Retire | Remove from rail; keep a read-only legacy report under Money if legacy rows exist | Open client | NONE | Dormant for new sales: PACKAGE_OFFERS is empty (packages.ts:32) and the owner says there are no package discounts and no ad money, so nothing new can be listed... |
| /ad-results | Ads > Ad results | finance/admin | Move | Money or Growth > Acquisition | none | NONE | It reports Brandbasket's OWN acquisition ads (leads to paid), not the customers' Paid Ads Management service, but sits under an item named Ads next to customer... |
| /deliveries | Settings > Emails and webhooks | support/finance/admin | Keep | Settings > System (Deliveries) | Resend all failed (max 25 emails + 25 alerts, last 24h) | Resend delivers the stored email to the customer again (customer inbox); webhook rows NONE | No automatic retry: Brevo layer tries twice in-process (brevo.ts:25), then only manual resend. Resend/ack by any role. Failed webhook events (Razorpay, Cal.com... |
| /deliveries/{id} | Settings > Emails and webhooks | support/finance/admin | Keep | Settings > System | Resend alert | NONE |  |
| /outbox/{id} | Settings > Emails and webhooks | support/finance/admin | Keep | Settings > System | Resend (failed and not redacted only) | Resend re-delivers to the customer | Any role reads full customer email bodies (non-redacted); sign-in links and codes are redacted by the email package (outbox.ts:13). When BREVO_API_KEY is unset... |
| /settings | Settings > Settings | support/finance/admin; Teams and Google admin; rounds admin | Keep | Settings | Save | Setup call URL: shown to customers as the Book a call target; rounds: default rounds show... | Support can change the customer-facing setup call URL (settings/actions.ts:20). No settings for SLA, payment-lapse policy, notification rules. |
| /staff | Team > Staff | admin | Keep | Team | Invite someone | Invite emails staff; deactivate blocks next request (findActiveStaffMember) | Contradicts apps/admin/CLAUDE.md claim that accounts are created only by staff:create (invites exist). Staff have no owner/assignment view or workload. |
| /access-log | Team > Compliance | admin | Keep | Team > Compliance | Filter (Person, Action, Client id, dates) | NONE | Filter dropdown lists only STAFF_ACCESS_ACTIONS; 16 actions that code writes are missing from the list (account.save, campaign.*, numbers.save, report.send/vie... |
| /privacy-requests | Team > Compliance (alias of /access-log) | admin | Move | Team > Compliance queue with owner and due | Log a request | Closing records outcome; whether the customer is emailed is Unknown from this page; custo... | Not in Today or rail; admin only so support cannot work customer privacy requests; no owner field. |
| /breaches | Team > Compliance (alias of /access-log) | admin | Keep | Team > Compliance | Log a breach | NONE automatic; staff mark duties | Deadlines are display only; no alert/countdown in Today. |
| /leaving | none (not in rail; reached from /clients?stage=leaving) | support/finance/admin | Merge | Clients > Leaving as filter plus an Insights section | none | NONE | Orphan screen: no rail entry and no needs gate; only one conditional link on /clients (clients/page.tsx:144-150). It names nobody so staff cannot act on it ('n... |
| /no-access | none | any staff | Keep | Utility | none | NONE | Message says money, pricing, invoices and the access log are for finance/admin; does not name Compliance/Staff/Settings admin parts. |
| /ads | none (not in rail) | n/a (404 for everyone) | Retire | Delete or quarantine (CLAUDE.md says dormant, do not build on) | none | NONE | Page unreachable, but its server actions are exported from a 'use server' file with only requireStaffAccess and no sellsDirectory check, so the action endpoint... |
| /deals | none (not in rail) | n/a (404 for everyone) | Retire | Delete or quarantine (CLAUDE.md says dormant, do not build on) | none | NONE | Page unreachable, but its server actions are exported from a 'use server' file with only requireStaffAccess and no sellsDirectory check, so the action endpoint... |
| /directory | none (not in rail) | n/a (404 for everyone) | Retire | Delete or quarantine (CLAUDE.md says dormant, do not build on) | none | NONE | Page unreachable, but its server actions are exported from a 'use server' file with only requireStaffAccess and no sellsDirectory check, so the action endpoint... |
| /geography | none (not in rail) | n/a (404 for everyone) | Retire | Delete or quarantine (CLAUDE.md says dormant, do not build on) | none | NONE | Page unreachable, but its server actions are exported from a 'use server' file with only requireStaffAccess and no sellsDirectory check, so the action endpoint... |
| /[...missing] | none | n/a | Keep | Utility | none | NONE |  |
| /login | none | n/a (redirects granted staff to /) | Keep | Auth | Sign in | NONE | Password only: no second factor in the app (STAFF-ACCESS.md). Access in front of it is a deployment assumption. |
| /forgot-password | none | n/a | Keep | Auth | Send link | Staff receives reset email | Not described in docs/STAFF-ACCESS.md (which says passwords are only set by staff:create). |
| /reset-password/{token} | none | n/a | Keep | Auth | Set password | All sessions signed out |  |
| /staff-invite/{token} | none | n/a (invite role applied) | Keep | Auth | Join the staff console | Staff gains access at invited role |  |

Redirect pages and the dormant directory pages are in `03`.
