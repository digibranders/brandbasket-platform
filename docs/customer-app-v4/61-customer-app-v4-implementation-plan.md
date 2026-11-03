# 61. Customer app v4: implementation plan

Status: written 2026-11-03 after the owner approved the mock. Nothing here is built. Building starts only after the owner approves this plan and answers section 1.

Design rules: `docs/plans/60-customer-app-v4-design-system.md`. Mock: https://claude.ai/artifact/EQWTapbw81EHHZCbwQiia6.

**Goal.** Replace the customer app at app.brandbasket.in with a new application built from the foundation: new routes, new page logic, new data loading, new actions and new components. Nothing of the current customer UI is wrapped, restyled or imported. The admin console is out of scope, except small staff input forms a new customer screen cannot work without.

## 1. Decisions

### Made by the owner

| # | Decision |
|---|---|
| O1 | Full reconstruction with all paths and logic. Not a reskin, restyle or wrapper |
| O2 | Customer app only; the console waits |
| O3 | Mock approved 2026-11-03. Cobalt accent |

### Assumed: stop me now if any is wrong

| # | Assumption | Why | If you disagree |
|---|---|---|---|
| A1 | New app `apps/customer` in the same repo | The only way to guarantee no old UI leaks in. Lint can refuse the old code outright | Rebuilding inside `apps/platform` saves one server process but mixes old and new until the end |
| A2 | Keep as foundations: PostgreSQL schema and row-level security, Better Auth, Razorpay integration (`packages/billing`), tax invoicing and pricing (`packages/shared`), email outbox (`packages/email`) | They hold money, tax and access rules with thousands of tests and no UI. Rewriting them adds risk and the customer sees nothing different | Tell me which one you want rebuilt; it becomes its own plan |
| A3 | Public endpoints stay in `apps/platform` until the last phase: Razorpay, Cal.com and OyeChats webhooks, `/api/site/*`, `/api/t`, `/t/v1.js`, `/api/leads`, `/api/pricing`, internal jobs | Client websites and payment providers depend on these addresses. They have no UI | They move last, or stay as an API-only app |
| A4 | Geist in the app, Red Hat stays on the website | Geist is what the approved mock uses | Say so if the two must match |
| A5 | No pause feature in v1. Customers can cancel a service from the next billing date | Pause has no billing support today and raises hosting questions | Pause becomes a new billing feature |
| A6 | Business email is not shown | Nothing in the plan inclusions (`lib/checkout-included.ts`) offers it. Removed from the mock | Say so if you sell it |

### Needed from you

| # | Question | Default if you do not answer |
|---|---|---|
| Q1 | **Other branches are still changing the old customer pages** (`feat/website-page-rebuild`, `feat/website-changes-and-requests`, `website-no-bought`, `feat/customer-payment-emails`, all active on 2 Nov). Freeze new UI work on the old customer app once those merge? | Yes: bug fixes only on old pages. Backend parts of those branches carry forward. Their UI work will be thrown away at cutover |
| Q2 | How many paying customers are live today? | Treat as live: full parity, staged cutover, instant rollback |
| Q3 | Which gates in section 7 do you want opened first? | Order given in section 7 |

## 2. Architecture

```
app.brandbasket.in
        |
      nginx
        |--- /api/*, /t/*                      -> apps/platform (API only, later)
        |--- everything else                   -> apps/customer  (new)

apps/customer
  src/app/        routes only: a page reads a guard, calls a loader, renders a feature
  src/features/   one folder per domain
     <name>/rules.ts       pure logic, no I/O, fully unit tested
     <name>/loader.ts      server only: reads data, returns a view model
     <name>/actions.ts     server actions: guard, validate, write, return a result
     <name>/components/    screens built only from ui/ and components/
  src/ui/         primitives on @base-ui/react
  src/components/ application components
  src/lib/        format, guards, form helper, db connections
  src/styles/     tokens.css, globals.css
```

**Stack.** Next.js 16.4 App Router, React 19.2, TypeScript strict, Tailwind v4, `@base-ui/react`, `@phosphor-icons/react` (light), `geist`, `nuqs` for URL state, zod, Vitest, `vitest-axe`, Playwright with axe. No other UI or state library without an entry in plan 60.

**Hard rules.**

1. `apps/customer` never imports from `apps/platform`, `@brandbasket/shared/ui/*` or `@brandbasket/shared/styles/*`. Lint fails the build.
2. **Moving logic.** When a feature needs existing logic from `apps/platform/lib/server`:
   - If the public API or the console also needs it, move it to `packages/shared/src/server` in its own commit, repoint the old imports and keep its tests green.
   - Otherwise rewrite it in the feature's `rules.ts` or `actions.ts` and bring its tests across first. A rule keeps its behaviour unless this plan says otherwise.
3. **Access.** Every page and every action calls a guard itself. Layouts are never the only guard. Business id comes from the session, never from the request. Customer data goes through `withTenantScope` or `withUserScope`.
4. **Money.** No screen computes a price, discount, tax or ad credit. All of it comes from the shared billing functions.
5. **Input.** Every action validates with zod and returns `{ ok: true } | { ok: false, fieldErrors, message }`. Repeated submits on payments and approvals use idempotency keys.
6. **Failure.** The old `quietly()` pattern is banned. A loader returns data or a typed failure per panel, the panel shows its error state, and the failure goes to Sentry.
7. **Migrations** are additive until the old app is retired, so rollback stays possible.
8. **No fake data.** A panel renders only with real data. Sample data lives only in tests and fixtures.

## 3. Route map

Every old path keeps working through a permanent redirect. Emails already sent contain old links.

### Entry and payment

| New path | Replaces | Guard | Notes |
|---|---|---|---|
| `/login` | `/login` | Public | Sign in only |
| `/signup` | `/login?new=1`, `/join` | Public | Keeps `claim` and `plan` parameters, Turnstile, phone or email, attribution capture |
| `/forgot-password`, `/reset-password/[token]` | Same | Public | |
| `/setup/[token]` | Same | Token | States: valid, expired, rate limited |
| `/restore-account`, `/restore-account/keep-plan` | Same | Closing account | |
| `/start` | `/personalize` | Signed in, unpaid | Short questions before payment |
| `/checkout` | `/plan` | Signed in, unpaid | Basket, referral code, GST details, pay |
| `/checkout/pay`, `/checkout/charges/[id]` | `/billing/pay`, `/billing/charges/[id]/pay` | Signed in | Razorpay window. Fake provider confirm pages in development only |

### Workspace

| New path | Replaces | Guard | Template |
|---|---|---|---|
| `/` | `/`, `/todo`, `/monitoring` | Customer | Overview or Task, by state |
| `/checklist` | `/onboarding/*` | Paid | Task, per-item saving, no send step |
| `/enquiries`, `?open=id` | `/website/enquiries`, `/oyechats` | Paid | List and sheet |
| `/requests`, `/requests/[id]` | `/requests`, `/support`, `/support/[id]`, `/requests/new` | Customer | List, Detail. New request is a dialog with `?new=1` |
| `/website` | `/website`, `/project` | Website bought | Overview, or Task while building |
| `/website/pages` | `/website/pages` | Website | List |
| `/website/blog`, `/new`, `/[id]`, `/authors`, `/categories` | `/content/*` | Website | List, Editor |
| `/website/domain` | `/domain` | Website | Task, with all 8 current states |
| `/social`, `/social/content`, `/social/ads`, `/social/accounts` | `/social` | Service, else Not bought | Overview, List |
| `/search`, `/search/rankings`, `/search/ai-answers`, `/search/reviews`, `/search/google-profile` | `/search` | Service, else Not bought | Overview, List |
| `/reports`, `/reports/[month]` | New | Paid | List, Detail |
| `/business`, `/business/brand` | `/details` | Paid | Form |
| `/billing`, `/billing/invoices`, `/billing/payment`, `/billing/refer` | `/services`, `/billing` | Customer | Form, List |
| `/billing/receipts/*` | Same | Owner | Route handler |
| `/settings`, `/settings/security`, `/settings/notifications`, `/settings/team`, `/settings/privacy`, `/settings/delete` | `/settings/*` | Customer | Form |
| `/help`, `/help/contact` | `/requests/calls` | Customer | List |
| `/affiliate`, `/affiliate/setup/[token]` | Same | Affiliate | Rebuilt in plain tables |
| `/changelog` | Same | Customer | Reached from the account menu |
| `not-found`, `error` | Same | | Branded 404 returns a real 404 status (today it returns 200). One error boundary per route group |

Dead and dropped: the `/content` and `/content/blog/settings` redirects stay as redirects. The dormant directory, clinic and free-listing flows are not rebuilt.

## 4. Screen contracts

This is the rule for what each screen shows. A screen fails review if it shows something in "Never".

**Home `/`.** *What is happening and what do you need from me?*
- Shows: Needs you, the last 30 days strip, Your services, enquiries by day, What we did, Coming up, small edits used.
- Never: a marketing upsell, tiles of links, confetti, a step counter.
- Primary: the first Needs you item, else New request.
- Layout comes from one pure function, ported from `lib/home/state.ts` with its tests:

| State | Layout | Primary action | In the mock |
|---|---|---|---|
| `payment_required` | Task | Pay | Phase 0 |
| `payment_processing` | Task | None, a status line | Phase 0 |
| `lapsed` | Task, plus a banner everywhere | Reactivate | Phase 0 |
| `kickoff_unbooked`, with `missedAt` | Task | Book the call | Yes |
| `kickoff_booked` | Task with checklist | First open item | Yes |
| `kickoff_unconfirmed` | Task | Book a new time | Phase 0 |
| `starting`, `preparing`, `building` | Progress | None, with dates | Phase 0 |
| `on_hold` | Progress with the reason | The action that unblocks it | Phase 0 |
| `preview_ready`, `revisions` | Review | Open preview | Yes |
| `approved`, `launched` | Progress, then a launch greeting for 7 days | Visit site | Phase 0 |
| `ongoing` | Overview | Needs you, else New request | Yes |

**Enquiries.** *Who contacted me and who still needs a reply?*
- Shows: new count, 30 day total, status filters, source filters, one-tap Call and WhatsApp.
- Never: invented names. Taps have no identity, so they show as "Counted" with no reply action. Google profile calls appear only as a daily count because Google does not share callers.
- Primary: none on the list. Call in the sheet.

**Requests.** *Where is my change, and do you need me?*
- Shows: filters, status, Waiting for you. Detail: stepper, NextStep, thread, attachments, who is looking after it.
- Never: ticket numbers in the list, a contact form as a separate path.
- Primary: New request; on a request waiting on the customer, its action. Quote acceptance states the price and the date it unlocks.

**Website.** *Is my website healthy, and is it working for me?*
- While building: timeline with dates. Preview ready: preview, Open preview, Approve, Ask for changes, rounds left. Live: status, uptime, visits, enquiries, top pages, sources, site health.
- Never: DNS terms in the main view, a "Pages" tab with no pages.
- Primary: Ask for a change.

**Social & Ads.** *What are you posting, what do you need me to approve, and what did the ads bring?*
- Shows: approvals first, calendar, spend against budget, cost per lead, campaigns, connected accounts.
- Never: social vanity numbers without a source.
- Primary: Approve all when posts wait.

**Local SEO + AEO.** *Can people find me, and is it improving?*
- Shows: searches on page one, biggest moves, Google profile actions, rating, AI answers, what we did. Tabs for each.
- Never: a combined score, ranks without a check date, unexplained "AEO".
- Primary: none unless something needs the customer.

**Reports.** *What did I get for my money last month?*
- Shows: a list by month, three plain sentences first, then one card per service, then what we did, Download PDF.
- Never: months with no sent report shown as if complete.

**Business profile.** *What do you know about my business, and where is it used?*
- Shows: sections with "Where this appears", hours, holidays, announcement, brand kit, photos.
- Never: fields we do not use, a separate copy of these fields anywhere else.
- Primary: Save, in the SaveBar.

**Plan & billing.** *What am I paying for, and what happens next?*
- Shows: services with prices, discount, total with GST, next payment, invoices with PDF, payment method, billing details, cancel with the new total.
- Never: a price computed on the page, "email us" as the only way to do something once the feature exists.
- States: paid, under review, renewal failing, lapsed, unpaid, each with its action. USD customers see no GST wording.

**Settings.** *Who can use this, and how do you reach me?* Profile, security, notifications, team, privacy, delete.

**Help & calls.** *How do I talk to someone?* Upcoming call, past calls with what was agreed, Book a call, contact details.

**Service not bought.** *What would this do for me and what would it cost?* Two sentences, what is included, price with the package discount, Add to plan. No fake dashboard preview.

## 5. Logic to carry over

Each is rewritten in the feature with its existing tests brought across first. Behaviour stays unless noted.

| Logic | Source | Goes to | Note |
|---|---|---|---|
| Home state | `lib/home/state.ts` | `features/home/rules.ts` | |
| Sidebar rules | `lib/rail.ts` | `features/shell/rules.ts` | New groups in plan 60 |
| Website project view | `lib/server` project loaders, `components/website` | `features/website` | Do not add a second state machine: `projects.status` stays |
| Preview approval, feedback rounds | `website` actions | `features/website` | Keeps the idempotency key |
| Domain states | `domainPageState` | `features/website/domain` | All 8 states |
| Requests, change quotes, included edits | `lib/server/requests*`, `change-quote`, `support` actions | `features/requests` | Keeps version guards and ticket `details` key limits |
| Calls and slots | `call-scheduling`, `calls`, `calcom-webhook` | `features/calls`; webhook stays in platform | Shared parts move to `packages/shared` |
| Kickoff auto start | `start-builds-after-kickoff` job | Stays in platform | No staff "held" chore |
| Service add and remove, reactivation | `add-ons`, `billing` | `features/billing` over `packages/shared` | |
| Checkout, referral code, billing details | `checkout-*`, `billing-details` | `features/checkout` | |
| Blog rules | `lib/blog-*`, `blog-access`, `blog-allowance` | `features/blog` | Fixes the stale "no limit" copy |
| Account exit, erasure, nominee, export | `account-*` | `features/account` | Legal and privacy behaviour unchanged |
| Affiliate dashboard | `affiliate-*` | `features/affiliate` | |
| Social and search setup asks | `setup-asks` | `features/setup` | |

**Behaviour that is easy to lose. All of it must survive; the parity test in Phase 11 checks each.**

- Turnstile on sign-up and sign-in forms, rate limits, email codes (nothing goes to phones).
- `claim` and `plan` parameters, signup attribution capture (`signup_attribution`), paid conversion events (plan 59), consent banner and analytics (GA4, GTM).
- Referral code at checkout, USD visitors and pricing, GST details validation, first payment ad money.
- Payment welcome state, payment processing and "under review", failed renewal, lapsed, reactivate.
- Account closure grace, restore, keep my plan, data download, nominee, cookie settings, privacy requests.
- Sentry, `/api/error-reports`, deployment update notice, `noindex` on every response.
- Upload rules: type and size checks, alt text required on photos.
- Rename chatbot, conversation view and contact figures from today's Enquiries page.

## 6. New backend

Each screen panel was tagged in the mock (Build tags). Exists means the data is ready. Staff only means the data exists without a customer read path. New means it must be built.

| Item | Tables and work | Tag | Phase |
|---|---|---|---|
| Enquiries v1 | New `enquiries` (business, kind, source, name, phone, email, message, status, note, received_at, source_ref). Filled from `chatbot_leads` and `site_events`. RLS. Backfill | New | 7 |
| Enquiries from forms | New endpoint for client-site forms; client sites change to post to it. Stores personal data | New | 12, gate G2 |
| Ad leads in Enquiries | Meta lead ads webhook | New | 12, gate G5 |
| Reports pages | Read path over `report_documents` (RLS already allows sent reports) and `listSentReports`; PDF route | Staff only | 10 |
| Website traffic | Customer read over `metric_daily` and `metric_breakdowns`: a new RLS policy | Staff only | 12, gate G1 |
| Site health | New `site_checks` and a timer: uptime, SSL expiry, phone speed | New | 12. **Checkout promises this today, so it must ship or the promise must change** |
| Pages list | New `website_pages`, nightly from the site's sitemap | New | 7 |
| Post format and channel | Two columns on `deliverables` | New | 8 |
| Ad campaigns | New `ad_campaign_snapshots`, staff entered monthly; small console form | New | 12; API later under G5 |
| Social reach | Add to `monthly_snapshots`, staff entered | New | 12; API later under G5 |
| Connected accounts | New `connected_accounts`, staff maintained until the API exists | New | 8 |
| Rankings, AI answers | New `tracked_searches`, `search_positions`, `ai_answer_checks` | New | 12, gate G6 |
| Reviews, Google profile | New `google_reviews`, `google_profile_checks` | New | 12, gate G4 |
| Notifications preferences | New `notification_preferences`, every email checks it | New | 10 |
| Notification bell | Read from activity and request events plus a per-user seen time | New | 4 |
| Team | Extend `business_member_role` (owner, editor today) with viewer, new `business_invites`, email, role guards, RLS tests | New | 10 |
| Cancel a service | Existing `cancelRequestedAt`, add-on removal; new screens and reason capture | Exists | 3 |
| Change payment method | Razorpay spike first | New | 3, gate G7 |
| Refer a business | Uses `referral_codes`; needs an offer | New | 12, gate G8 |

Console work is limited to forms for the staff-entered items above.

## 7. External gates

A gate blocks only its panels. Those panels stay hidden until it opens, and cutover does not wait for any of them except where stated.

| Gate | Needs | Blocks | Ships without it |
|---|---|---|---|
| G1 | Counsel's answer and approved privacy wording on first-party analytics (`docs/site-analytics.md`) | Website traffic | Website page without visits and sources |
| G2 | Privacy review: we would store the personal data of the customer's enquirers. Retention, processor wording, DPDP notice on client sites | Form contents in Enquiries | Chat leads and taps only |
| G3 | Owner lifts "nothing is sent to phones" and picks a WhatsApp Business provider, with cost | WhatsApp notifications | Email only; the WhatsApp column is removed |
| G4 | Google Business Profile API access (Google approval) | Reviews and profile data | Staff-entered monthly figures |
| G5 | Meta app review for Graph and Marketing APIs | Automatic social and ad data | Staff-entered monthly figures |
| G6 | Pick the rankings and AI answer source: idraft or DataForSEO directly. idraft already does this, so I recommend it, if it can serve this data | Rankings, AI answers | `monthly_snapshots` page-one count only |
| G7 | Spike: can Razorpay change a subscription's payment method without a new mandate? Not verified | Self-serve change | A clear request flow |
| G8 | Owner decides the referral offer | Refer a business | Tab hidden |
| G9 | Owner approves new copy, by table, in every pull request | Release of that copy | Nothing ships unapproved to production |

## 8. Phases

Build in order. A phase is finished only when its exit test passes. Sizes are relative (S, M, L, XL). I am not giving calendar dates because they depend on the gates and on how much runs in parallel.

### Phase 0: finish the mock (M)

Mock the screens not yet designed: sign-up and reset, questions before payment, checkout, pay pending and failed, every Home state marked above, setup checklist, lapsed and failing billing, Not bought, domain states, blog editor, affiliate portal, 404 and error, delete account.

Exit: owner approves these screens. **No screen is built before the owner has seen its mock.**

### Phase 1: foundation (M)

1. Create `apps/customer`, port 3197 in development, with its `CLAUDE.md` and `DESIGN.md` pointing to plan 60.
2. Tokens, Geist, type utilities, `src/lib/format` with tests.
3. Lint: boundaries, Tailwind, imports, format rule. Copied and adjusted from idraft. Token contrast test, copy test.
4. Vitest, Playwright, axe, visual snapshot setup.
5. Auth session reading, guards, db connections, Sentry, `noindex`, error boundary, form helper.
6. CI jobs. Add the third app to `deploy.yml`, the release script, a systemd unit and nginx. Check the VPS memory budget before adding the process.
7. `next.brandbasket.in` behind Cloudflare Access, on production data with a test account, routed to the new app.

Exit: signed-in empty page on `next.brandbasket.in`. A deliberate lint violation fails CI. Old app untouched.

### Phase 2: design system (L)

1. All primitives in plan 60 section 10, each with tests and a preview entry.
2. Application components with fixtures.
3. Shell, sidebar rules, phone tabs, search, notifications bell shell.
4. `/design-system` in development only. Visual baselines at 1440 and 390.

Exit: owner reviews the preview route on a real phone and desktop. Axe clean. This is the last point to change the look cheaply.

### Phase 3: entry and money (XL, highest risk)

1. Sign in, sign up, reset, setup, restore, keep plan.
2. Questions, checkout, pay, charge pay, confirm, with referral, USD, attribution and conversions.
3. Plan & billing: services, add and remove, cancel, invoices, receipts, billing details, payment, failing, lapsed, reactivate.
4. Integration tests over `packages/billing` with the fake provider, then Razorpay test mode through the tunnel.

Exit: a new account goes from sign-up to paid and back through cancel in Razorpay test mode, and a tax invoice matches the old app to the rupee on the same inputs.

### Phase 4: Home and first run (L)

Home with every state, kickoff booking, setup checklist, Needs you aggregator, What we did, notifications bell.

Exit: a Playwright flow reaches each Home state from seeded data. Owner walks a new customer from payment to booked call.

### Phase 5: Requests and calls (L)

List, detail, new request dialog, quotes and pay, approve change, reopen, thread, attachments, badge counts, Help & calls, book and change and cancel.

Exit: staff reply in the console shows in the new app and emails the customer. A quote accepted and paid moves the request.

### Phase 6: Business profile (M)

Details, hours, holidays, announcement, brand kit, photos, one source of truth replacing the three old forms.

Exit: an edit reaches the live client site through `/api/site/info` as it does today.

### Phase 7: Website and Enquiries v1 (XL)

1. Website states, preview approval and feedback, pages list and sitemap sync, domain with all states.
2. Blog list, editor, authors, categories. The editor is a rewrite of a 597 line screen: its rules are ported, the UI is new.
3. `enquiries` table, backfill, list, sheet, status, note, export, rename chatbot, conversation view.

Exit: preview approval and a published blog post both work end to end. A chat lead appears in Enquiries.

### Phase 8: Social & Ads (M)

Approvals, calendar, spend against budget from existing data, accounts, setup card, Not bought page.

Exit: a post staff create in the console can be approved in the new app, with the existing approval record written.

### Phase 9: Local SEO + AEO (S at parity)

Overview from existing snapshots and deliverables, setup card. Other tabs stay hidden until G4 and G6 open.

Exit: nothing on the page is empty or invented for a real test business.

### Phase 10: Reports, Settings, the rest (L)

Reports list, detail and PDF. Settings: profile, security, notifications preferences, team and invites, privacy, delete. Affiliate portal. Changelog. Redirects for every old path.

Exit: an invited editor sees only what the role allows, proved by RLS integration tests. A sent report opens and downloads.

### Phase 11: harden and cut over (L)

See section 10.

Exit: owner signs off, then the cutover runs.

### Phase 12: new capabilities (XL, gate by gate)

Site health first because checkout already promises it. Then, as gates open: website traffic, forms and ad leads in Enquiries, rankings, AI answers, reviews, social and ad numbers, WhatsApp, payment method, referral. Each ships on its own and each is a normal pull request.

### Phase 13: retire the old app (M)

Two stable weeks after cutover, and only on the owner's yes:

1. Delete the old pages and customer components from `apps/platform`. `apps/platform` keeps API routes only.
2. Delete unused `packages/shared/src/ui` parts the console does not use, and the customer block of `theme.css`.
3. Run `pnpm dead-code`, delete what it finds, and update `CLAUDE.md`, `README.md` and the runbooks.

## 9. Definition of done for every screen

A screen is done only when all of these are true:

- [ ] It matches the approved mock at 1440 and 390.
- [ ] It answers its question from section 4 and shows nothing from its "Never" list.
- [ ] One primary action per state.
- [ ] Loading, empty, error, partial and stale states exist and are tested.
- [ ] Guard on the page and every action. Tenant from the session. Zod on every input.
- [ ] Full keyboard use, axe clean, focus handled.
- [ ] All strings use glossary words, and new copy is in the owner table.
- [ ] Money comes from shared functions. Numbers carry their unit and date.
- [ ] Unit tests for rules. Integration test if it touches data or access. Playwright flow if it is on a key path.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass. `pnpm test:integration` when `packages/db`, billing or RLS were touched.

## 10. Testing and cutover

**Key Playwright flows, run on every pull request to `development`:** sign up to paid; book kickoff; approve preview; new request to quote to pay; approve post; change business hours; download invoice; add and cancel a service; invite a teammate; lapsed to reactivated.

**Before cutover, all required:**

1. Parity audit against section 5's list, item by item, with evidence.
2. Every old path redirects correctly: a test reads the old route list and every link in `packages/email`. Razorpay and Cal.com callback addresses are checked.
3. Independent security review of guards, actions and RLS, by a reviewer who did not write the code.
4. Accessibility pass with keyboard and a screen reader, plus a real phone.
5. Lighthouse on Home, Enquiries and Billing on a throttled phone profile.
6. Owner walks all three customer journeys on `next.brandbasket.in` and approves the copy table.

**Cutover.**

1. Announce to customers if Q2 says they are live.
2. Merge to `main` through the normal release pull request. A merge to `main` deploys.
3. Change the nginx `location /` upstream from platform to customer, keeping `/api/` and `/t/` on platform. Same host, so sessions continue.
4. Watch Sentry, payment webhooks and the first real logins for one day.

**Rollback.** Point nginx back to platform: one config change and a reload. The old app stays deployed until Phase 13. No destructive migrations before then, so data written by either app is readable by both. New tables are ignored by the old app.

## 11. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Parallel work on old pages | Wasted work and moving parity target | Q1 freeze; parity list re-checked at Phase 11 |
| A payment path breaks | Lost revenue, wrong invoices | Phase 3 first, shared billing unchanged, to-the-rupee comparison, test mode walk, instant rollback |
| Lost behaviour nobody remembered | Silent regression | Section 5 list, tests brought across first, route-level old and new comparison |
| Screens with no data look empty | App looks unfinished at launch | Panels hidden until real. The mock shows the full version: at cutover several panels will not be there, and the owner must expect that |
| Third server process on the VPS | Memory pressure on a shared box | Measure before Phase 1 ends. Fallback: serve platform's API from a smaller process, or move hosting |
| Gates take months (Google, Meta, counsel) | Local SEO and Social stay thin | Staff-entered figures, clearly dated |
| Scope growth | Never ships | Parity first. Anything new goes to Phase 12 |
| New copy backlog | Blocks release | Copy table per pull request, reviewed in batches |

## 12. How the work runs

- **Branch.** Worktree `wt/customer-v4`, branch `customer-v4` from `development`. Other sessions share checkouts: commit only your own files, by path. Phase pull requests merge into `development`; the app is not routed until cutover, so merging is safe.
- **Commits and pushes** happen when the owner has said to, per the repo rules. Each pull request carries its new copy table and screenshots at 1440 and 390.
- **Agents.** Sonnet by default. Haiku only for tasks with full code and a mechanical check. A separate reviewer for security and each phase's final diff.
- **Local data.** A private development and test database per worktree, as the shared one can be out of sync. Integration tests do not run in parallel against one test database.
- **Before every phase** the plan for that phase is written out as tasks with exact files and checks, in `docs/plans/61-phase-N.md`. This document stays the source of scope.

## 13. What the owner must do

| When | What |
|---|---|
| Now | Approve this plan and plan 60. Answer Q1, Q2 and Q3, and correct any of A1 to A6 |
| Phase 0 and Phase 2 | Review mocks and the component preview |
| Every pull request | Approve new copy |
| Soon, because each has a lead time | Ask counsel (G1, G2). Apply for Google and Meta access (G4, G5). Decide G3, G6 and G8 |
| Phase 11 | Walk the journeys, sign off cutover |
| Phase 13 | Say when the old app can be deleted |
