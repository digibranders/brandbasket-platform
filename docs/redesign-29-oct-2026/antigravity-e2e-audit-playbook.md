# BrandBasket end to end audit playbook (for Antigravity)

Written 31 October 2026 from the production `main` code (`5935a103`), the website repo and the CMS repo. This is the reference. The short prompt that starts the run is in `antigravity-prompt.md`. Where this playbook and the running code disagree, the code wins and the disagreement is a finding.

Everything marked HYPOTHESIS comes from a code review, not from running the product. Confirm or refute each one with evidence.

---

## 0. Mission and rules

Act as a careful human tester, then as an engineer. Use the product through its screens exactly as a real visitor, customer and staff member would, from the first visit to the marketing site to a suspended and restored website, an exited account and an erased account. Record everything.

**Hard rules**
1. Never skip a step. Every step ID in this playbook gets a status: PASS, FAIL, MISSING, BLOCKED-THEN-BYPASSED, or N/A with a written reason. Silence is not allowed.
2. Never stop midway. If a button, page, route or feature is missing or broken: write it in the log, then complete the action another way (section 4), then continue with the next step. Stopping is allowed only for the three reasons in section 4.5.
3. Two sessions at the same time. Keep a customer session and a staff session logged in side by side for the whole run, in two separate browser profiles or contexts (cookies are host only, so `app.*` and `console.*` do not clash). Switch between them like two people working at once.
4. Log as you go. After every step, append one line to `audit-output/STEP-LOG.md` (format in section 6). Do not batch the log to the end.
5. Evidence. A screenshot at desktop (1280) and phone (390) for every distinct screen and every state change. Name files as in section 6.
6. Never touch production. Use only a throwaway local database and local servers. Never push to `main` or `development`. Work on branches named `audit/*`.
7. Never delete or "clean up" OyeChats code. The directory and clinic code is dormant: note it, do not build on it.
8. Copy rules for anything you write or build: no em dashes or en dashes, light theme only, use design tokens, prices include 18 percent GST, do not change the approved homepage headline or the offer line.

---

## 1. Environment (set this up first, record every deviation)

**Repos (all under `/Users/a12345/Desktop/AI/BrandBasket/`)**
- `brandbasket-website` (Next.js, brandbasket.in). `npm`, Node 22. Dev port 3130.
- `brandbasket-platform` (pnpm 10 workspace, Node 24): `apps/platform` (customer dashboard), `apps/admin` (staff console), `packages/*`.
- `brandbasket-cms` (blog CMS, pnpm). Dev port 3140.

**Start from the latest `origin/development`** in a fresh worktree: `git worktree add ../wt/e2e -b audit/e2e origin/development`, then `pnpm install --frozen-lockfile`. Read `CLAUDE.md` in the root and in both apps first.

**Database.** Create a brand new database, for example `brandbasket_platform_e2e`, with `psql` using the owner URL from `apps/platform/.env.local` (swap only the database name and print `select current_database()` to prove it before every destructive step). Run `pnpm db:roles` once if the roles are missing, then `pnpm db:migrate` against the new database by overriding `DATABASE_URL_OWNER`, `DATABASE_URL`, `DATABASE_URL_STAFF` and `DATABASE_URL_PUBLIC` in the process environment (process variables win over `.env.local`). Traps already found on this machine:
- The shared dev and test databases have a broken migration history (migration 0194 fails with "type lead_source already exists"). Do not use them.
- Never run anything against `brandbasket_platform_test`; the test suites truncate it.
- macOS bash 3.2 silently ignores `source <(...)`. Use `eval "$(...)"` or zsh.
- Do not kill processes on ports you did not start. If 3198 or 3199 are taken, use other ports and set the origins to match (below).

**Environment variables to set for the two apps** (names as found in the code; confirm in `apps/*/lib/server/env.ts`):
- `APP_ORIGIN=http://app.brandbasket.localhost:<port>` for the dashboard and `ADMIN_ORIGIN=http://console.brandbasket.localhost:<port>` for the console. Defaults 3198 and 3199.
- `BILLING_PROVIDER` unset (fake provider). To test the Razorpay path also set a webhook secret and craft signed requests (section 1.4).
- `CLIENT_SITE_BASE_DOMAIN=sites.example.test` for both apps (free addresses). It is optional in the console.
- `LEADS_API_TOKEN` (32 or more characters) for `POST /api/leads`; the same value goes to the website.
- `KICKOFF_SYNC_TOKEN`, `SITE_HOSTING_SYNC_TOKEN`, `SITE_ANALYTICS_TOKEN`, `ACCOUNT_ERASE_TOKEN` (each 32 or more characters) for the internal job routes.
- `KICKOFF_AUTO_START` unset (means on). Test both `on` and `off`.
- Leave `BREVO_API_KEY` unset: mail is then written to the outbox only. Read codes and links from the console `/outbox` page or from the table `email_messages` (columns `to_address`, `subject`, `body_text`).
- Cal.com and Calendly keys unset: the dashboard uses a fixed fake scheduler in development.

**1.1 Staff accounts.** `pnpm staff:create` asks for a password on a real terminal and will fail from an agent. Instead write a throwaway script inside `packages/auth/scripts/` that calls `createAccountWithGrant` with a generated password and inserts a `staff_members` row (roles `support`, `finance`, `admin`), then delete the script. Create one staff user per role. Keep every credential in `audit-output/secrets/` (outside git, never printed in the report).

**1.2 Customer accounts.** Do not seed them for the main journey: register through the real screens. A seeding helper exists (`pnpm --filter @brandbasket/db db:seed:kickoff`) but it only accepts the databases `brandbasket_platform` and `brandbasket_platform_preview`; use it only for shortcuts when a state is hard to reach, and note when you do.

**1.3 Reading email.** Sign-up codes, reset links, setup links and every system email are in the outbox. Always open the real email in the outbox before continuing, as a human would open their inbox.

**1.4 Webhooks and jobs you must drive yourself** (no real Razorpay, Cal.com or Vercel locally):
- Razorpay webhook: `POST /api/webhooks/razorpay`, header `x-razorpay-signature` = HMAC-SHA256 hex of the raw body with the webhook secret. Event shapes and fixtures are in the unit tests under `packages/billing/src` and `apps/platform/lib/server/razorpay-webhook-handler.test.ts`. Events: `subscription.charged`, `order.paid`, `payment.failed`, and status events (authenticated, activated, pending, halted, paused, cancelled, completed, expired). Test: valid, bad signature (400), wrong amount (kept as `amount_mismatch`), duplicate delivery, out-of-order delivery.
- Cal.com webhook: `POST /api/webhooks/calcom`, header `x-cal-signature-256` = HMAC-SHA256 of the raw body. Events `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`. A created booking with purpose `kickoff` is ignored by design.
- OyeChats webhook: `POST /api/webhooks/oyechats`, signed with the bot's own secret.
- Internal job routes (bearer token): `POST /api/internal/start-builds-after-kickoff`, `/sync-site-hosting`, `/roll-up-site-analytics`, `/retry-conversions`, `/erase-closed-accounts`. Also the nightly maintenance script `pnpm support:attachments:maintain`.
- Vercel: not reachable. Run the hosting sync in dry run and read the plan it prints; record that the real pause and unpause call was not exercised.
- Time travel: to test renewals and lapse, edit `paid_through_at` and timestamps in the throwaway database and say so in the log.

**1.5 Dev server notes.** First visit to a page in `next dev` takes several seconds; wait for content before judging. The round "N" badge and "1 Issue" pill are the Next dev overlay, not product UI. A server warning "Calling client.query() when the client is already executing a query" is already known: record whether it still appears.

---

## 2. Personas and the data they need

| Persona | Account | Used for |
|---|---|---|
| Visitor | none | marketing site, basket, ad page, contact form |
| Customer A | self sign-up, Website only, INR | the main journey end to end |
| Customer B | staff setup link, Website + Social, with a coupon | package discount, ad credit, setup link path |
| Customer C | Social only | no website build: confirm no website controls anywhere |
| Customer D | Website + Social + Local SEO, USD | all three plans, 20 percent offer, USD no tax |
| Customer E | legacy checklist path (customer sends onboarding) | the older onboarding steps |
| Staff support, finance, admin | three console accounts | permission matrix, every console page |
| Affiliate | portal account | affiliate flow |
| CMS editor and admin | CMS accounts | blog flow |

---

## 3. The test matrix

For every row: do it through the UI as a person would, check the stated result, check the database or the outbox where listed, screenshot, log. IDs are stable; keep them in the report.

### A. Marketing site (brandbasket-website, port 3130)
- A1 Visit `/` signed out as a first time visitor. Record what a stranger understands in five seconds. Check the locked H1 is untouched.
- A2 Every route under `app/[currency]/`: `/`, `/pricing`, `/services/<each slug>`, `/about`, `/contact`, `/blog`, blog paging, a category, an author, a post, `/glossary`, each legal page, `/compare/website-options`, each `/for/<slug>`, `/website-landing-page` (ad page). Click every nav, footer, in-page link and button; list dead links and wrong targets. Include the 404 page.
- A3 Currency: with and without cookie `bb_currency`, `?currency=` links in the footer, a bot user agent (always rupees), prefixed URL redirects, INR and USD prices (INR 2,999, 9,999, 24,999 including GST; USD 65, 150, 350, no tax).
- A4 Basket: pick one, two, three plans; verify 10 percent for two, 20 percent for three, ad credit amounts (INR 1,500 for Website + Social or Social + SEO, 3,000 for all three; USD 30 and 60), rounding down, struck-through prices. "Start my plan" opens the basket; "Proceed to checkout" goes to `app.brandbasket.in/login?plan=...` (point it at the local dashboard for the run and record how).
- A5 Ad page form: validation, honeypot, rate limit (8 per 10 min per IP), the sealed token, redirect to `/login?plan=website&start=<token>` pre-filled. Expired token (over 1 hour) behaviour.
- A6 Contact form `/contact`: validation, honeypot, rate limit (5 per 10 min), success state, what staff receive (outbox mail, Teams card if configured, a lead in the console).
- A7 Blog: list, post, category, author, search if any, preview link, 404 for a missing slug, redirects for renamed slugs (308), reading time and meta.
- A8 Consent banner (only if a GTM id is set): accept, reject, Global Privacy Control, persistence, what loads before and after consent.
- A9 SEO and indexing: `robots.txt`, `sitemap.xml`, meta tags, `noindex` when `SITE_INDEXING` is not `on`, canonical to www, structured data, Open Graph images, alt text, heading order, Lighthouse for `/`, `/pricing`, a post, the ad page.
- A10 Mobile (390) and tablet (768) of every route above; horizontal scroll must never happen.
- A11 Analytics events (`cta_click`, `whatsapp_click`, `basket_open`, `contact_submit`, `start_submit`): confirm what fires and when.

### B. Enquiries (console)
- B1 The contact and ad leads from A5 and A6 appear in Enquiries with the right source, currency, plans and consent record.
- B2 Lead limits: 5 per hour per IP, 3 per hour per email, 60 per hour global; confirm a dropped lead is silent (HYPOTHESIS: the website ignores the copy failure and loses the lead).
- B3 Enquiry detail: edit details and notes, assign an owner, Mark talking, Mark lost, Add enquiry (staff created), Send setup link, Attach account (repair). Confirm staff cannot set `account_created` or `paid` and that `call_booked` and `agreed` have no writer (HYPOTHESIS).
- B4 Setup link: the email in the outbox, the 7 day expiry, revoking earlier links, redeeming twice, an expired link, a revoked link, rate limits on `/setup/<token>`.

### C. Registration and sign in (dashboard)
- C1 Path A: basket to `/login?plan=...` opens Create account. Email code (6 digits): wrong code, expired code, resend, existing email refused, existing mobile refused, password policy (8 to 128 and complexity), terms checkbox. After success: account, business of kind `listing`, lead `account_created`, attribution stored, signed in.
- C2 Path B: ad page token opens pre-filled.
- C3 Path C: staff setup link creates a business of kind `website` with an onboarding project and an owner membership.
- C4 `/join` redirects. `/login` signed in redirects to `/` or `/plan`.
- C5 Sign in: right password, wrong password messages (generic), rate limits (35 per account and per IP), email or mobile as the login, session 7 days, sign out, "Sign out other devices".
- C6 Forgot password and reset: link in outbox, 1 hour expiry, single use, other sessions revoked, bad token page.
- C7 `/confirm-email/<token>` and `/restore-account` pages: reach them if possible; HYPOTHESIS: email verification is configured but nothing calls it.
- C8 Personalize (`/personalize`): every question in every group (common, website, social, search), skip, back, resume, saved answers visible later to staff on the client Overview.

### D. Plan, checkout and payment
- D1 `/plan` for each persona: add and remove services (the last service cannot be removed), coupon and affiliate code (valid, invalid, expired, used up, own code), package discount, ad credit shown, GST line, USD no tax, billing profile required for INR (GSTIN, address, state), validation of every field.
- D2 Pay with the fake provider through `/billing/confirm`: success, abandon, back button, double click, refresh after paying. Check in the database: `payments`, `subscriptions` status `active`, `paid_through_at` one month ahead, `bundled_add_ons` active, tax invoice issued (`FY/26-27/000147` style), lead `paid`, project opened for website buyers, affiliate earning, discount frozen, ad credit stored.
- D3 Razorpay path via signed webhooks (1.4): success, wrong amount, bad signature, duplicate, out of order, `payment.failed`. Confirm the browser return page writes nothing.
- D4 Customer after paying: Home state, receipts download (tax invoice, GST split CGST and SGST or IGST by place of supply), billing page contents, "payment under review" state.
- D5 Emails and alerts: confirm which emails exist for payment (HYPOTHESIS: none; `paymentReceivedEmail` has no caller), what the team gets (Teams card, GA4 `purchase`, Meta `Purchase` with consent and keys), and that the staff Payments page shows the payment.
- D6 Staff side: Payments list, flagged payments, manual first payment (record a manual payment), Invoices register, missing invoice repair, monthly export CSV and ZIP for the CA, GST summary, Prices page (edit and see effect), Coupons (create, edit, limits), Affiliates (create, portal sign-in link, codes, earnings, payout), Ad credit page.

### E. Customer first look and kickoff booking
- E1 Home states in order: payment required, payment processing, kickoff unbooked, kickoff booked, starting, preparing, building, preview ready, revisions, approved, on hold, launched (7 days), ongoing, lapsed. Reach each with real actions where possible; use the database only where no action exists, and log it.
- E2 Kickoff booking: slot picker (28 days, India time, morning and afternoon groups), book, confirmation state, countdown, Add to calendar (.ics), Reschedule, cancel (HYPOTHESIS: no customer cancel for the kickoff), book a second time, the "booking page only" fallback when no scheduler is configured.
- E3 What is stored in `setup_call_bookings`; HYPOTHESIS: the meeting link is not stored and Home says the link is in the confirmation email. Verify what the customer can actually do on the day of the call.
- E4 Cal.com webhook (signed): rescheduled moves times, cancelled deletes an unheld booking, created with purpose `kickoff` is ignored, created without purpose after a held kickoff becomes a later call.
- E5 Customer pages during this stage: Website, Requests, Business, Plan and billing, Settings, Blog, search box, notification bell, What's new, keyboard shortcuts.
- E6 Legacy path for Customer E: `/onboarding` steps (business, content, brand, domain, review), validation of each, uploads (logo, photos: size, type, alt text), domain step (own domain with ownership box, free address), Send, and what staff see afterwards.

### F. Console: from booking to a completed kickoff
- F1 After booking: Today, Calls (Today, Coming up, Last 7 days, Booked time not reported), client Overview, Delivery, Activity tabs.
- F2 There is no accept step. Record every place a human would expect one (Enquiries, Calls, client page) and what exists instead.
- F3 Complete the kickoff: "Save and start the build" with and without notes (3 to 600 characters), then check: held, outcome `completed`, project `submitted`, due date 48 hours out, customer activity line, customer Home "preparing".
- F4 The three no-show buttons (customer did not attend, we did not attend, rescheduled): booking deleted, outcome recorded with no note, customer Home back to "Book your kickoff", the Cal.com event not cancelled.
- F5 Mark call held and Undo on the client page (HYPOTHESIS: undo does not revert project status).
- F6 Timer: call `POST /api/internal/start-builds-after-kickoff` with a right token, a wrong token (401), no token env (503). Cases: call ended over 2 hours ago, held, `KICKOFF_AUTO_START=off`, Social-only customer (HYPOTHESIS: project never leaves onboarding and the call sits in Just finished for 14 days), running twice.
- F7 Today queue after each step: the "N kickoff calls need an outcome" item, the "Add-on to start" items (HYPOTHESIS: they persist for every Managed Website customer until marked contacted, even after launch).

### G. Build, preview, review, launch (staff and customer together)
Run the whole sequence as both people. After every action look at both screens.
- G1 Delivery tab content for each status. HYPOTHESIS: for "Ready to start" the first card is "Send a preview" while "Start building" is at the bottom of a very long page.
- G2 Assign builder, planned launch day, add a round, Start building, Put on hold (reason 3 to 200 characters), Resume (returns to the exact earlier status), Cancel build (confirm box).
- G3 Send preview: empty, invalid URL, `http://`, private address and localhost URLs (must be refused), valid URL. Check the email in the outbox, the screenshot capture, preview version history, activity line, customer Home "ready to review". Break the email transport and confirm the outcome notice plus Resend email works without moving the stage.
- G4 Customer review: Open preview, Approve (one tap, no confirmation: HYPOTHESIS), Ask for changes with text and attachments (3 files, 4 MB each), round counting (2 included, not enforced by the server), the feedback ticket created and linked to the project, staff view of "Client feedback", revised preview as version 2, approve version 2.
- G5 Domain: free address button for a business with none; own domain through the customer domain step; DNS records shown (A 76.76.21.21, CNAME `cname.vercel-dns.com`); "Check my domain" outcomes (pending, awaiting DNS, verifying, misconfigured); staff "Ready for customer DNS" email; Switch domain; move to own domain after launch; Domain Connect is not implemented (confirm).
- G6 Launch gate: Mark live with no checks (must refuse), with 7 of 8, with all 8, with no owner, no domain, not approved. The eight checks are self ticked. Check the address button (DNS, private address refusal, HTTPS). HYPOTHESIS: Mark live sets the domain active without checking DNS. After launch: customer Home "Your website is live" for 7 days then ongoing, launch email and Resend email (7 day window), `website_url` stored, project closed.
- G7 Live site connection: site token, `GET /api/site/info`, `/api/site/posts`, `/api/site/media/<id>`, `POST /api/site/events`, analytics script `/t/v1.js` and `POST /api/t`, nightly roll-up route, customer enquiries page, OyeChats lead webhook and the staff chatbot setup.
- G8 Customer blog and content pages inside the dashboard (blog, authors, categories, posts) and Website > Pages.
- G9 Every project transition table check: onboarding to submitted, to building, to preview, to approved, to live, pause, resume, cancel, and the illegal ones (approve twice, mark live twice, send preview from onboarding). Two staff acting at once (two sessions): one must win.

### H. Live customer: running the account
- H1 New request with every intent (question, send information, change website, social, search, billing, other). Attachments. Confirmation. Staff inbox, assignment, status changes (new, triaged, in progress, waiting on you, resolved, closed), public reply (emailed) versus internal note (not emailed), customer reply, reply clock colouring, email notifications.
- H2 Change requests: included edits (2 per month, website only, India time month), start without quote, send quote (1 to 40 hours, 1 to 30 days, price from plan), customer accepts and pays the hours charge, customer declines (withdrawn), staff declines with reason, preview, approve, ship, reopen within 14 days, illegal moves refused by the database.
- H3 Social and Ads: staff add posts, customer approves (posts only), staff publish, monthly numbers, report link. Local SEO + AEO: pages and listings, no approval. Confirm nothing is published to any third party.
- H4 Customer pages: Business details and contact, hours and offer, Services (Your services), add-on purchase, pause or cancel an add-on, change request for an add-on, Plan and billing, Settings (name, email, password change, privacy settings, data export, delete account), What's new, search.
- H5 Staff client pages: every tab (Overview, Delivery, Billing, Services, Website, Requests, People, Activity) in every state, including Social-only and Search-only customers (no website controls should show).

### I. Money after launch: renewal, failure, suspension, recovery
- I1 Renewal: send a signed `subscription.charged` with a later `current_end`; `paid_through_at` moves; a payment row and a tax invoice are created.
- I2 Failed payment: `payment.failed` and the status event for `pending`; the subscription becomes `past_due`; access stays until the paid-through date. Record exactly what the customer and staff see and what emails or alerts go out (HYPOTHESIS: none).
- I3 Lapse: move `paid_through_at` into the past or send `halted`; customer Home "lapsed", pay screen, and what still works (HYPOTHESIS: the Website page still says live and approve and change requests still work).
- I4 Website suspension: the platform site API answers 403 `site_offline`; run the hosting sync dry run for a business with a `website_hosting` row and read the plan (pause, held, brake); confirm the timer is not enabled by default; the maintenance page of the client site template.
- I5 Pay again: reactivation (first charge on a new subscription for a business that paid before buys one month of the lapsed lines; a package offer is forfeited), site API answers again, sync plans an unpause, Home returns to ongoing.
- I6 Other money: add-on purchase and end (pause, cancel, 7 day failed window), removal at renewal, upgrade, charges (add, mark paid, waive), manual payments by staff, Razorpay order for a charge, referral code at checkout, affiliate earning stops after its reward cycles, payouts, ad credit spent by staff.

### J. Exit and compliance
- J1 Close the account (grace: paid-through plus 30 days), the locked state, restore, staff extend (+30 days), the erase run via the route with the token (blocks: live subscription, another member, staff account), what is erased and what is kept (payments, tax invoices, affiliate earnings). The erase timer is not enabled by default.
- J2 Data export download, privacy request intake with a one time code, deadlines (30 day target, 90 day ceiling, reminders at day 20 and 25), breach register entry, consent records, staff access log: confirm the list pages and detail pages now write entries and that the log page filters work.
- J3 Staff roles: for each of support, finance, admin open every console page and attempt every action; record allowed and denied; a direct URL to a forbidden page; the rail items hidden by role; a customer session opening the console host; a staff session opening the dashboard; tampered business and project IDs in URLs and form posts; the Ad credit page has no role gate (HYPOTHESIS).

### K. Complete console page sweep
Visit every rail item and every sub route, desktop and phone: Today, Enquiries (list, new, detail), Clients (list, search, filters Stage and Build, each tab of a client), Projects (board, list, scopes Needs action, Late, On hold, All, builder filter), Requests (inbox, new, detail), Errors (list, detail), Calls, Payments, Invoices (register, export), Prices, Coupons (list, new, detail), Affiliates (list, new, detail, codes/new), Ad credit, Ad results, Deliveries (webhooks, alerts, email health, resend), Staff (list, invite), Settings, Compliance (access log, privacy requests, breaches), Outbox (list, detail), global Search, Leaving, and the dormant sections (directory, geography, ads, deals): record whether they are reachable and what they show.

### L. Cross cutting, on every screen
- L1 Every link, button, form, menu, tab, filter, sort, pagination, modal and keyboard shortcut. For each: does it do what its label says; what happens with empty, long, unicode and script input; double submit; back button; refresh.
- L2 States: loading, empty, error, success, disabled, permission denied, 404 and 500 pages (also on the app and console hosts).
- L3 Responsive: 390, 768, 1280, 1920. No horizontal page scroll; tables scroll inside their own box; touch targets at least 44 px on phones (24 px minimum); body text at least 12 px.
- L4 Accessibility: axe on every page, keyboard only run through the main journeys, visible focus, labels, landmarks, one heading level one, colour contrast (measure it), reduced motion, zoom 200 percent, screen reader names for icon buttons.
- L5 Copy: no em or en dashes, typos, tone, consistent names (for example "Building" versus "Ready to start", the 24 hour clock versus 12 hour, "Start my plan" versus "Get my free website").
- L6 Security: auth guard on every route signed out; CSRF on actions; rate limits (login, setup, leads, checkout 10 per hour); open redirects; file upload type and size limits; SSRF on preview and address checks; secrets in HTML or logs; security headers; cookies host only and `HttpOnly`; session lifetimes (staff 12 hours, customers 7 days); no second factor for staff (HYPOTHESIS).
- L7 Performance: Lighthouse and the Network tab on the main pages; list any request over 1 second or any page over 1 MB of JavaScript.
- L8 Data integrity: after the whole run, check that no orphan rows exist, that `project_events` matches the visible history, and that every email in the outbox corresponds to a real event.
- L9 Console errors and failed requests on every page; the server log for errors.

### M. Background jobs
Run each job route with the right token, a wrong token and no token, and read the result: kickoff builds, hosting sync (dry run), analytics roll-up, retry conversions, erase closed accounts, maintenance script. List the systemd units under `deploy/vps/systemd` and record which are installed but off by default (erase and hosting sync). Record that backups and restore tests were not run.

### N. Blog CMS (brandbasket-cms, port 3140)
Sign in, invite a user, password reset, create a post, checklist blockers (title, address, excerpt, cover with alt text, category, author, no em or en dashes), save, publish, schedule, preview link (7 days), rename a slug (308), categories, authors, media upload (WebP sizes), role limits (admin and editor), last admin protection, the site API with the bearer token, the revalidate call to the website, and how a post appears on the live blog.

---

## 4. When something is missing or broken (do not stop)

1. **Detect and record.** Write the finding immediately: ID, page, what a human expected, what happened, screenshot, console and network evidence.
2. **Try the human alternatives.** Another route, another button, the keyboard, the phone layout, a refresh. Record each attempt.
3. **Complete the action another way** so the run continues: call the same server action or API with `curl` or the browser console, or write the minimal SQL against the throwaway database. Write every bypass in `audit-output/BYPASS-LOG.md` with the exact command and why.
4. **Decide whether to build.** If the missing item is clearly part of the product (for example an action every staff member needs, or a state the customer cannot leave), build the smallest working version on a branch named `audit/build-<slug>` cut from `audit/e2e`, with a test, using the project conventions, then continue. If it is a bigger design question, only record it with a proposal. Everything built goes in the report under "Built during the audit" with branch and commit.
5. **Only stop for these three reasons:** the environment cannot start after three honest attempts and a documented workaround; the next action would touch production or a shared database; a real credential is needed that you cannot generate. In every other case, log and continue.

---

## 5. Order of work

Environment, then A, B, C, D, E, F, G in one continuous customer story with both sessions open (Customer A). Then repeat the lighter variants for Customers B, C, D, E. Then H, I (the suspension and recovery loop on Customer A), J, K, L (continuously), M, N. Re-run the full Customer A story at the end on phone width only.

---

## 6. Logging and evidence formats

**`audit-output/STEP-LOG.md`**, one line per step:
`| ID | time | actor | action | expected | actual | status | evidence file | note |`
Status values: PASS, FAIL, MISSING, BYPASSED, N/A.

**Screenshots:** `audit-output/screenshots/<ID>-<short-name>-<desktop|phone>.png`, plus a short caption in the log. Keep at least one screenshot per distinct screen and per state change; mark the important ones with `KEY-` at the start.

**Findings:** `audit-output/FINDINGS.md`, one block each:
```
### F-<number> <short title>
Severity: P0 blocks the journey or loses data or money | P1 serious | P2 should fix | P3 polish
Type: MISSING | BROKEN | UX | A11Y | COPY | SECURITY | PERF | EXTRA | REFACTOR | REBUILD | DOC-MISMATCH
Where: URL or file
Steps: numbered, repeatable
Expected / Actual:
Evidence: screenshot, log line, query result
Proposed fix:
Status: open | built on audit/build-<slug>
```

**Database checks:** save the queries you ran and their results in `audit-output/db-checks.md`.

---

## 7. Final deliverables (in `audit-output/`)

1. `REPORT.md` with these sections: executive summary and verdict; coverage table (every step ID with status); what is missing; what is broken; what is extra or not needed (features, pages, buttons, code nobody can reach); what was built during the audit (branches and commits); what to add next (ranked); what to refactor; what to rebuild and why; ranked UX punch list; security findings; accessibility findings; performance findings; copy and naming inconsistencies; data and billing integrity findings; operations findings (timers, env, alerts, backups); open product decisions; hypotheses confirmed or refuted (the list in section 8).
2. `STEP-LOG.md`, `BYPASS-LOG.md`, `FINDINGS.md`, `db-checks.md`, `screenshots/`.
3. A one page `SUMMARY.md` for the owner: ten most important things, in plain words.

---

## 8. Hypotheses to confirm or refute (from the code review, not yet run)

1. There is no staff "accept" step for a kickoff; only complete, no-show, or the 15 minute timer.
2. The meeting link is not stored; the customer must find it in the booking email.
3. A no-show button deletes the booking but leaves the Cal.com event; after a timer start Home reverts to "Book your kickoff".
4. Social-only and Search-only customers' projects never leave onboarding and their calls sit in "Just finished".
5. "Add-on to start" items persist on Today for every Managed Website customer until marked contacted, even once live.
6. The first card on the Delivery tab for "Ready to start" is "Send a preview"; "Start building" is at the bottom.
7. Mark live does not check DNS; the eight checks are self ticked.
8. Customer Approve is one tap with no confirmation.
9. Preview rounds are not enforced by the server.
10. A lapsed customer's Website page still says the site is live and they can still approve and ask for changes.
11. No email is sent for a successful payment or a failed payment.
12. The first Razorpay payment path may not send the onboarding alert that the fake checkout path sends.
13. Lead copies from the website are dropped silently when limits are hit or the copy fails.
14. The hosting sync and the erase job are installed but not enabled by default; the live site pause was proven only once on a throwaway project.
15. Monthly report automation is not built (data layer only).
16. Nothing is published to Instagram, Facebook or Google from the platform.
17. Staff have no second factor; staff sessions 12 hours; customers 7 days.
18. The Ad credit page is open to every staff role.
19. Email bounces and opens are not tracked.
20. The client header strip says "Building" for "Ready to start"; the customer progress strip says "Building" for "Preparing".
21. On a phone, the console Today queue truncates client names and the Projects board shows an empty first column and clipped cards.
22. The customer-facing time format is 24 hour ("19:28").
23. The Requests empty state shows two "New request" buttons.
24. A server warning about concurrent queries on one database client appears in the dashboard log.
25. Domain Connect is not implemented; DNS is manual; Vercel domain add is manual.
26. The website button reads "Start my plan"; the workspace rule names "Get my free website".
27. Retention doc says maintenance runs at 03:00 IST but the timer is 03:30 UTC.
28. Home moves on at the call end time; booking a second call stays closed until two days after.
29. The Meta Pixel is described in privacy copy but was dropped from the site.
30. `Undo call held` does not move the project status back.

---

## 9. Reference

**Ports and hosts:** website 3130; dashboard `http://app.brandbasket.localhost:3198`; console `http://console.brandbasket.localhost:3199`; CMS 3140. Check what is already listening first and use free ports; never kill another project's process.

**Project statuses:** `onboarding`, `submitted`, `building`, `preview`, `revisions`, `approved`, `live`, `on_hold`, `cancelled`. Staff names: Waiting for kickoff, Ready to start, Building, Awaiting client review, Changes requested, Approved ready to launch, Live, On hold, Cancelled. One open project per business.

**Transitions:** onboarding to submitted (kickoff completed by staff, timer, or the customer sending the old checklist); submitted to building (staff); submitted, building or revisions to preview (staff, may skip Start); preview to approved (customer); preview to revisions (customer feedback, round plus one); revisions to preview (staff); approved to live (staff, eight checks); submitted, building, revisions or preview to on_hold and back to the exact earlier status; any open status to cancelled (staff).

**Launch checks (eight):** `approved_version_identified`, `production_deployment`, `hostname_configured`, `dns_and_https`, `key_pages_load`, `mobile_checked`, `contact_paths_work`, `customer_informed`.

**Domain statuses:** `pending`, `awaiting_dns`, `verifying`, `misconfigured`, `active`.

**Lead statuses:** `new`, `call_booked`, `call_done`, `agreed`, `invite_sent`, `account_created`, `paid`, `lost`.

**Change request states:** `requested`, `quoted`, `in_progress`, `preview`, `revisions`, `approved`, `shipped`, `declined`, `withdrawn`. Support ticket states: `new`, `triaged`, `in_progress`, `waiting_on_you`, `resolved`, `closed`.

**Deliverable states:** posts `planned`, `awaiting_approval`, `approved`, `published`; pages and listings `planned`, `published`.

**Billing:** subscription status `incomplete`, `active`, `past_due`, `inactive`, `cancelled`. Access exists only while `paid_through_at` is in the future for active, past_due and cancelled; incomplete and inactive never grant it. Customer states `unpaid`, `paid`, `lapsed`. No grace period on the plan; add-ons have a 7 day failed window. Prices (monthly, GST included): 2,999, 9,999, 24,999 rupees; 65, 150, 350 dollars.

**Staff roles:** `support` (day to day: enquiries, clients, delivery, requests, calls); `finance` (support plus money pages); `admin` (everything, plus access log, privacy requests, breaches, staff list, Teams settings).

**Key tables for checks:** `users`, `businesses`, `business_members`, `leads`, `setup_invites`, `projects`, `project_events`, `project_preview_versions`, `project_launch_checks`, `project_feedback_tickets`, `setup_call_bookings`, `setup_call_outcomes`, `client_intakes`, `subscriptions`, `payments`, `bundled_add_ons`, `add_on_subscriptions`, `charges`, `tax_invoices`, `domains`, `website_hosting`, `support_tickets`, `support_messages`, `change_requests`, `deliverables`, `monthly_reports`, `email_messages`, `staff_access_log`, `account_closures`, `error_issues`, `referral_codes`, `affiliates`, `affiliate_earnings`.

**Docs to read first (code wins over docs):** root and app `CLAUDE.md` and `DESIGN.md` files, `docs/kickoff-builds.md`, `docs/site-hosting.md`, `docs/STAFF-ACCESS.md`, `docs/redesign-29-oct-2026/admin-console-plan-status.md`, `docs/redesign-29-oct-2026/BrandBasket_Admin_Console_Revamp_Plan.md`, and the lifecycle diagram artifact `https://claude.ai/artifact/HTefZiJF7EJZpWvXX6urnU`.
