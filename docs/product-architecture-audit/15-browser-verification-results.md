# Browser verification results (first pass)

Run 2026-11-14 against commit `c702f6c7` on an isolated local stack. This is a first, partial pass: one new Paid Ads only customer and one support-role staff session. It upgrades some findings from "Verified in code" to "Verified in browser" and adds new ones. Everything not listed here is still code-only.

## Stack used

| Piece | Value |
|---|---|
| Customer app | `http://localhost:3197` (`pnpm dev:customer`) |
| Staff console | `http://console.brandbasket.localhost:3199` (`pnpm dev:admin`) |
| Database | existing seed database `brandbasket_platform_v4b` (migrated to head, 223 migrations, then the v4 seed re-run; the seed is documented as never deleting). A dump taken before the run was kept outside the repo. Payload content used `brandbasket_platform_v4b_payload` |
| Billing | fake provider ("Test payment. No money will move.") |
| Email | `BREVO_API_KEY` blank; sign-up code read from the local outbox (transport `outbox`, status `local_only`), so nothing was sent to a real inbox |
| Other keys | Razorpay, social posting service, Vercel and Turnstile keys blanked in the shell only; no `.env.local` was edited |
| Fake domain | `CLIENT_SITE_BASE_DOMAIN=sites.example.test`, shell only, because the seed refuses to run without one |

Test data created in that database: business "Audit Ads Only Test", owner `e2e+adsonly1@example.test`, which was then granted support-role console access so one login could see both sides. Nothing outside the isolated database or the repo docs was changed, except that the seed script wrote to `../local-test-logins.txt` as designed (its two lines are the pending affiliate link and one comment).

Viewports: 1440 and 375 pixels. Not done: 768 pixels, keyboard and screen reader checks, any admin finance or admin role session.

## Scenario run

Sign up with `?plan=ads`, email code from the outbox, skip the intake questions, fill billing details, pay on the fake provider, then inspect the customer app and the console.

## Findings confirmed in browser

| # | Finding | What was observed | Evidence |
|---|---|---|---|
| 1 | Paid Ads shares Social's entitlement (finding 1 in `00`) | The Paid Ads only account opens `/social` as a bought service: "Instagram and Facebook pages" setup items, "Waiting for your approval", a post calendar and "Posts this week". The sidebar lists Social media and Paid Ads as held and marks only Website as "not on your plan" | Page text and sidebar links captured during the run. The saved screenshot `evidence/browser/adsonly-ads-1440.png` shows `/ads` (empty ad figures), not `/social`; the `/social` screenshot failed to save |
| 2 | The INR 1 first month is live (finding 2) | `/start` and `/checkout` show "Paid Ads Management, first month INR 1", "Due today INR 1" and "then INR 2,999 (GST included) is taken each month" | same run |
| 3 | The Yearly switch is live (finding 2) | Checkout shows "Monthly" (selected) and "Yearly Save 10%" | same run |
| 4 | Ads only customers are treated as Social customers | After payment Home says "Your Social & Ads service is active" and offers a kickoff call: "We go through your business and plan your social media with you", with a "Have these ready" list for Social & Ads (Instagram and Facebook access, offers, monthly ad budget) | `evidence/browser/adsonly-home-375.png` |
| 5 | Sign up and checkout copy is website-first | The sign-up side panel for a Paid Ads link lists "We build your website. You review it. It goes live."; checkout "What happens next" promises a kickoff call and "we start on your plan within 48 hours of the call" | sign-up and checkout pages |

## Findings confirmed on the staff side (support role)

| # | Finding | What was observed | Evidence |
|---|---|---|---|
| 6 | Paid Ads purchases reach staff as one generic row, with no owner | Today shows the new customer only under "Waiting for someone: Add-on to start: Audit Ads Only Test, New add-on to set up: Paid Ads Management, due 15 Nov". No assignee, no setup answers, no separate Ads queue | `evidence/browser/support-today-1440.png` |
| 7 | The client page contradicts Today | The same customer's client Overview says "Nothing is waiting on us", shows the website pipeline (Leads, Setting up, Building, Preview, Live) and "No project yet", and "Setup answers 0 of 4 done" lists website steps (business, what you offer, logo and photos, domain) | client page |
| 8 | Social and Ads delivery sits under "Plan and billing" and the two are merged | The tab shows "Posts, pages and reports", "Monthly numbers", "Ad campaigns" and "Connected accounts" under the label "Social & Ads". The tab is open to the support role | `evidence/browser/support-adsonly-billing-tab-1440.png` |
| 9 | Support rail has six items | Today, Clients, Inbox, Calls, Ads and Settings. No Money. The rail still carries an "Ads" item | Today screenshot |
| 10 | Staff login advertises a retired service | The staff sign-in page lists "Websites, Social & ads, Local search" | login page |

Also observed on Today with seeded data: a "Systems" block shows Razorpay payments, Cal.com, OyeChats and Teams as "working, none in 24 hours" although none of them is configured in this stack, so the status reflects "no recent failures", not a live health check. This is a design hypothesis (misleading status), not yet confirmed against code.

## Findings still not browser-verified

Invitee lands in a personal business; first payment recovery; refund; erasure ordering; preview email; every guard and permission test for editor, viewer, support destructive actions; mobile layouts beyond Home at 375 pixels (no horizontal scroll there); 768 pixel layout; accessibility with keyboard and screen reader. These remain "Verified in code" or "Inferred" in `00`.

## Other observations

- One server-side console warning appeared on `/social`: a `pg` deprecation about calling `client.query()` while a query is already running. It is a library warning and a possible concurrency smell, not a user-visible error.
- The customer app needed one extra environment variable (`CLIENT_SITE_BASE_DOMAIN`) that `apps/customer/.env.local` lacks, so the documented seed command fails on a clean checkout of the local file. The environment doc in `evidence/journey-qa/e2e-environment-and-fixtures.md` should list it.
- `pnpm staff:create` can grant console access to an existing customer account without a password prompt, which made one-login testing possible in the isolated database.

## How to reproduce or stop

Start (from the repo root, in a fresh shell, using the helper kept outside the repo):

```bash
. /private/tmp/claude-501/-Users-a12345-Desktop-AI-BrandBasket-brandbasket-platform/fdb2b145-f6b6-4e7e-9ccc-b6539b758697/scratchpad/iso-env.sh customer
pnpm dev:customer
```

The helper copies passwords from `apps/customer/.env.local` at run time and prints nothing. Use `iso-env.sh admin` before `pnpm dev:admin`. The helper lives in the session scratchpad, so it may disappear; the recipe it implements is in `evidence/journey-qa/e2e-environment-and-fixtures.md` section 3.

## Second pass (parallel browsers, journey focus)

Six scripts ran in separate headless Chromium sessions, each with its own customer and console sessions. Scope was narrowed to journey checks; UI and accessibility sweeps were set aside. Two reruns were needed: sign-up refused a repeated mobile number, and the sign-up form allows 10 code requests per hour per network, so the isolated database's rate-limit counters were cleared (as the repo's own e2e helper does). That limit is a real control and worked as designed.

| # | Finding | What was observed |
|---|---|---|
| 11 | Invitees land on the wrong workspace (finding 5 in `00`) | A new account created through an invite link ended with two memberships: its own personal business (owner, created at sign-up) and the inviter's business (editor). Pressing "Join the dashboard" opened `/start?services=managed-website&q=businessType`, the sign-up questions of the personal unpaid business, because the app shows the oldest membership. The invitee never reaches the inviter's dashboard |
| 12 | Signed-out email links lose their target | `/requests/<id>`, `/reports/2026-10`, `/billing`, `/website`, `/ads` and `/checkout` all bounce to plain `/login`. Only `/invite/<token>` keeps its return path |
| 13 | An unpaid sign-up is locked to the intake questions | Home, Website, Billing, Settings, Help, Requests and Ads all redirect to `/start` question 1 of 5. Settings, Billing and Help are unreachable until payment |
| 14 | A fake invite token is not rejected up front | `/invite/<43 random characters>` shows "You have been invited to join a team" with Sign in and Create an account. Setup and reset links behave better: a fake setup link says "This link no longer works" |
| 15 | The wrong product is pitched on the Paid Ads page | A website-only customer opening `/ads` sees the Social plan: "We plan and publish your posts each month on up to 4 platforms", ₹2,999, "Add to plan". `/social` shows the same card, so Paid Ads cannot be sold from its own page |
| 16 | Support can run destructive build actions | On a preview-stage client the support role sees "Add a round of changes", "Cancel this build", "Cancel build" and "Put on hold" on the Website tab |
| 17 | Page-level role gates work | Support is sent to a "You don't have access" page for `/payments`, `/invoices`, `/pricing`, `/coupons`, `/affiliates`, `/ad-results`, `/staff`, `/access-log`, `/privacy-requests` and `/breaches`; finance gets the first six and loses `/staff`, `/access-log`, `/privacy-requests` and `/breaches`. This is a strength to keep. It also means finance cannot see privacy requests or breaches, and the rail gives support 6 items and finance 7 |
| 18 | Retired and dormant console routes return 404 | `/ads`, `/deals`, `/directory` and `/geography` return "Nothing here" for support and finance |
| 19 | Layout sweep of 40 customer routes at 1440, 768 and 375 px | No horizontal overflow at any size. The only axe serious or critical hits are on the `/design-system` test page; every real screen was clean in that one state. This does not prove accessibility (keyboard and screen reader checks are still manual). Routes the ads-only paid account cannot use redirect silently to Home: all of `/website/blog/*`, `/website/pages`, `/website/domain` and `/search` |

Not completed: an admin-role console session (the script's admin account sign-up timed out), the social-only account (its sign-up timed out), and the admin layout sweep (stopped on request). Still outstanding: webhook-missed recovery, refund behaviour, erasure ordering, preview and approval, Social approval, failed renewal and lapse, and keyboard and screen reader checks.
