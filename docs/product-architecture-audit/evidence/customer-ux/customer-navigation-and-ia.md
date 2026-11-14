# Customer app navigation and information architecture

Scope: apps/customer at commit c702f6c7. Labels: Verified in code (V), Reported in historical document (R), Inferred (I), Design hypothesis (H), Unknown (U). Paths are relative to apps/customer/src unless stated.

## 1. Shell rules (current)

| Rule | Evidence | Label |
|---|---|---|
| Four frames: (auth) split panel for sign in, sign up, reset, setup, invite, affiliate setup; (pay) focused frame (logo, Help mailto, Sign out) for /start, /checkout and payment pages; (app) workspace shell; affiliate (portal) own frame | app/(auth)/layout.tsx, app/(pay)/layout.tsx:12-30, app/(app)/layout.tsx:13-19, app/affiliate/(portal)/layout.tsx:20-48 | V |
| (app) layout guards with requireCustomer, then redirects an unpaid Managed Website sign-up (`kind=listing` and `signupChoice=managed`) to /checkout. Every page still runs its own guard | app/(app)/layout.tsx:14-16, features/checkout/server/entry.ts:22-24, lib/guards.ts header comment | V |
| Every guard sends a signed-out visitor to plain `/login`. No return path exists except for `/invite/<43 chars>` | lib/guard-rules.ts:15-21, lib/guards.ts:96-99, features/team/rules.ts:108-111 | V |
| Closing account: every guard goes to /restore-account | lib/guard-rules.ts:48-49 | V |
| `requirePaid` = paid at least once (lapsed reads); `write`/`requireBilling` = paid period running now (lapsed goes to /billing, unpaid to /checkout); `requireOwner`; `requireWebsite`; `requireService` | lib/guards.ts:94-135, lib/guard-rules.ts:60-82 | V |
| Services are three keys only: website, social, search. Paid Ads Management has no key: bought paid-ads maps to `social` | lib/guard-rules.ts:11, packages/db/src/queries/service-setup.ts:40 | V |

## 2. Sidebar (desktop, md and up)

Model: features/shell/rules.ts:112-127, drawn by features/shell/components/sidebar.tsx. Always whole from day one ("owner, 2026-11-13", rules.ts:108).

- Top (no heading): Home `/`, Enquiries `/enquiries` (count of new), Requests `/requests` (count waiting on you).
- Services: Website `/website` (child for search: Pages), Social media `/social`, Paid Ads `/ads`, Local SEO + AEO `/search` only if held. A service not on the plan stays as a link marked `bought:false` with a ServiceMark, and its page shows NotBought (Website, Social, Ads) rather than redirecting.
- Business: Reports `/reports` (hidden until a report was sent; shown if that read fails), Business profile `/business`.
- Foot: Plan & billing `/billing` (child for search: Invoices), Settings `/settings`, Help & calls `/help`.
- Person menu (account-menu.tsx:36-47): Your profile `/settings`, Sign-in and security `/settings/security`, What's new `/changelog`, Help and calls `/help`, Sign out.
- Collapsible to a 64px rail; state in localStorage key bb.sidebar.collapsed (app-shell.tsx:15-43). Hidden below md, where the tab bar takes over.

## 3. Top bar, command menu and mobile nav

- Top bar (top-bar.tsx): breadcrumb (business, current link, child), Search button with Kbd, notification bell, account icon on phones. No page actions.
- Command search (command-search.tsx): combobox over `searchTargets(model)` = "New request" + every sidebar link + children `Website: Pages` and `Plan & billing: Invoices` only (rules.ts:82-86, 180-188). Cmd or Ctrl K (app-shell.tsx:69-77). Not searchable: Blog, Domain, Brand kit, Checklist, Reports by month, Settings tabs, Help contact, What's new, Social analytics, See posts. V.
- Bell (notifications-bell.tsx, rules.ts:285-344): need (quote waiting, ready to check), waiting (team asked), reply, then activity events. Request lines open `/requests/<id>`; activity lines open the service page or Home.
- Phone: bottom tab bar, five slots: Home, Enquiries, Services (menu of Website, Social, Paid Ads, Search), Requests, More (menu: Reports, Business profile, Plan & billing, Settings, Help) (rules.ts:158-174, tab-bar.tsx:15-66). Tab height token is 48px (styles/tokens.css:100). Billing is two taps on a phone (More, Plan & billing). V.
- Billing banner on every page except Home: lapsed (Reactivate), renewal failing (See billing), under review (info). Home draws its own task for lapsed and under review (rules.ts:219-233, billing-banner.tsx). V.
- Skip link in (app) shell (app-shell.tsx:83-88) and affiliate header. Missing in (auth) and (pay), where `main#page` has no tabIndex (auth layout line 13, pay layout line 23). V; impact Low (short pages).

## 4. Per-page guard matrix

| Guard | Pages |
|---|---|
| requireCustomer (any member, any billing state) | /, /requests, /requests/[id], /billing, /billing/invoices, /billing/payment, /settings, /settings/security, /settings/notifications, /settings/privacy, /help, /help/contact, /changelog, /checkout/charges/[id] |
| requirePaid (paid ever; unpaid goes to /checkout; lapsed reads) | /business, /business/brand, /checklist, /enquiries, /reports, /reports/[month], /website (NotBought inline), /social, /social/analytics, /social/review, /ads, /search |
| requireWebsite (website service) | /website/pages, /website/domain, all /website/blog/* (new, authors/new, categories/new use `{write:true}`) |
| requireOwner | /settings/team, /settings/delete, /billing/services/pay, /billing/confirm (fake), billing add, cancel, reactivate and details actions, /billing/receipts |
| requireSignedIn (no business needed) | /restore-account, /restore-account/keep-plan |
| requireAffiliate | /affiliate |
| token is the guard | /setup/[token], /reset-password/[token], /invite/[token], /affiliate/setup/[token] |

## 5. Visibility and access matrix

Legend: S = in sidebar, P = page opens, N = page shows NotBought or an empty explainer, R = redirected, X = no entry point, A = actions work.

| Persona or state | Home | Website | Social | Paid Ads | Enquiries | Reports | Business | Billing | Settings | Team |
|---|---|---|---|---|---|---|---|---|---|---|
| Owner, website only | S,P | S,P,A | S,N | S,N | S,P | after first report | S,P | S,P,A | P | P |
| Owner, social only | S,P | S,N | S,P,A | S,P (read) | S,P | after first report | S,P | S,P,A | P | P |
| Owner, ads only | S,P | S,N | S,P,A (see issue C1) | S,P | S,P | after first report | S,P | S,P,A | P | P |
| Owner, all three | S,P | S,P | S,P | S,P | S,P | yes | S,P | S,P | P | P |
| Editor | P | P, can Approve and Ask for changes | P, can approve | P, Ask link | P | P | P | P read, actions refused (owner only) | P | R to Home (silent) |
| Viewer | P | read only, no Approve (preview-decision.tsx:98) | read only, no Ask (parts.tsx:31) | read, no Ask | P | P | read only (brand-kit readOnly) | P read | P | R to Home |
| Unpaid Managed sign-up | R to /checkout (layout.tsx:15), no sidebar | R | R | R | R | R | R | R | R | R |
| Unpaid, staff-invited client (kind client) | P: Pay task | R to /checkout (paid pages) | R | R | R | R | R | P with Go to checkout | P | owner only |
| Lapsed | P: Reactivate task | read by plan, writes R to /billing | read, writes R | read | read | read | read, save R | P Reactivate | P | owner |
| Cancelled service (end requested, period running) | P | Nav marks Website not bought (servicesFrom drops it, guard-rules.ts:97-99) while requireWebsite follows `billing.hasWebsite` (guard-rules.ts:77-82): the two can disagree until month end | same pattern | same | I | I | I | P | P | P |
| listing_only (dormant account type) | P | R to /checkout for paid pages | R | R | R | R | R | P | P | P |
| Closing account | R to /restore-account everywhere | | | | | | | | | |
| Signed in, no business | /login shows NoBusiness | | | | | | | | | |
| Affiliate only | /affiliate stripped frame | | | | | | | | | |

Labels: rows for owner/editor/viewer, unpaid, lapsed: V (guard-rules.ts, guards.ts, page files). Cancelled-service row: I (needs a running test). listing_only row: I (`signup_choice=listing_only` is dormant per CLAUDE.md; guard behaviour derived from isAwaitingFirstPayment).

Editor note: the Website preview decision is gated by `context.role !== "viewer"` (website-screen.tsx:126), so editors may approve a preview and go live. Team, receipts, checkout, plan changes and delete are owner only. Whether editors should approve go-live is an owner decision (H).

## 6. Dead ends and orphan routes

| # | Finding | Evidence | Label |
|---|---|---|---|
| D1 | /checklist is not in the sidebar, phone tabs or command search; only Home's first open item and legacy /onboarding/* aliases reach it | rules.ts:112-127, app/(app)/onboarding/*/page.tsx | V |
| D2 | Blog and Domain have no navigation before the site is live: the Website Overview renders `PageHeader` without tabs for none, setup, kickoff, preview, building states | features/website/components/website-screen.tsx:63-80, 88-140, 202-208 vs 147; websiteTabs only used when live and in the blog frame | V |
| D3 | Non-owner opening /settings/team is sent Home with no message, and the Team tab is hidden for them | app/(app)/settings/team/page.tsx:10, settings-header.tsx:16 | V |
| D4 | /search silently redirects to / for businesses without the retired service | app/(app)/search/page.tsx:12 | V |
| D5 | Unpaid Managed sign-ups cannot open Settings, Billing or Help: layout redirects everything to /checkout; only a mailto Help and Sign out | app/(app)/layout.tsx:15, app/(pay)/layout.tsx:20-27 | V |
| D6 | /social/analytics and /social/review return 404 whenever SOCIAL_AUTO_URL/KEY are not set, so the same account sees different tabs per deployment | social/analytics/page.tsx:17, social/review/page.tsx:13, features/social/analytics/rules.ts:193 | V |
| D7 | A viewer opening a charge pay link gets a 404, not a "ask your owner" message | app/(pay)/checkout/charges/[id]/page.tsx:85 | V |
| D8 | What's new exists only in the account menu | account-menu.tsx:42 | V |
| D9 | The renewal-failing path ends in a request to the team, not a self-serve card change (gate G7) | billing-screens.tsx StatePanel, payment-method-request.tsx header | V |
| D10 | A signed-out email click always ends on Home after sign in | guard-rules.ts:16 | V |

## 7. Duplicated destinations

- Request detail: inspector sheet at `/requests?open=<id>` (requests-table.tsx:30-50) and full page `/requests/<id>`. Bell links the page (rules.ts:277); change-request emails link the sheet (apps/admin/lib/server/request-notify.ts:35); staff-opened emails link `/support/<id>` which hops to the page (apps/admin/lib/server/staff-opened-request.ts:85). V.
- Help: sidebar foot, account menu "Help and calls", Contact tab, Requests "New request", pay layout mailto.
- Settings profile: sidebar Settings and account menu Your profile.
- Logo and brand upload: Business > Brand kit and Checklist brand-form. I.
- Ask for a change: one constant `ASK_FOR_CHANGE_HREF=/requests?new=1&about=website` used by Website and Paid Ads pages (website/rules/paths.ts:10, social/components/parts.tsx:31). V.
- Services management: Plan & billing "Your services" panel, plus `/services` and `/add-ons` aliases.
- Enquiries: sidebar plus its own bottom-tab slot; staff console also has an "Enquiries" (apps/admin/lib/console-rail.ts:65) that is the Brandbasket sales inbox (I). Name collision between the customer's leads and Brandbasket's own.
- Two parallel server trees: apps/customer/src/platform (ported, used by API routes) and src/features (pages) both define `resetPasswordPath`, `invitePath`, onboarding alert. platform/lib/team/rules.ts:130 vs features/team/rules.ts:88. V.

## 8. Proposed task-first IA (Design hypothesis, not a code claim)

Principle: organise by what the customer is trying to do this week, not by feature tables.

1. **Today** (Home): one next action, in priority: pay or fix payment, book kickoff, answer what is waiting, then live status. Owner sees payment tasks; members see read-only copy instead of a Pay button.
2. **Needs your OK** (new inbox, also the bell): preview approval, social posts, quotes, change checks. Today these live on three screens (Website, Social, Requests detail) and in the bell.
3. **My website**: Overview, Pages, Blog, Domain as one tab strip that is present from day one (fixes D2), with Domain and Blog visible but explained before launch.
4. **Social** and **Ads** as separate services with their own entitlement key (fixes C1 below), each with approvals and monthly numbers.
5. **Messages and calls**: Requests, Help and calls, Contact as one place; one canonical request URL (page) and the sheet kept only as a preview.
6. **Reports**: always visible once the plan is live, with an empty explanation instead of a hidden link.
7. **Account**: Business profile and brand, Plan & billing (Services, Invoices, Payment, Cancel plan), Team, Settings, Privacy and Delete (linked from Plan & billing so cancelling is findable).
8. Command menu indexes every route in the table above including Blog, Domain, Checklist, Settings tabs.

Open questions for owner: should editors approve go-live; is Paid Ads sold standalone (root CLAUDE.md says yes, entitlement code says it rides on social); do yearly billing, first-month offer (plan 63) and monthly ad money still exist (see UX findings C1 to C3).
