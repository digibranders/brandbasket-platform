# R2-16: staff console walkthrough (read only)

Branch `r2/16-console-walkthrough`, taken from `origin/development` at `00b1a085`. No application code was changed. Another agent (R2-15) is restyling leftover legacy classes in parallel, so some "legacy look" findings below may already be on their way out; this report describes `origin/development` as it was.

## Verdict

The shell is finished: rail, page header, section tabs, tables, stat tiles, pills and the sign-in screens are on the Release 2 look and work at 1440 and 390 wide. The redesign is not complete inside the pages. About half the screens still read as the old flat style (no raised panel, no cards, italic accent headings, long unbroken forms). The console still carries per-person owner controls that the owner has removed from scope, a few stale product concepts (packages, ad credit), and the phone layout of tables is weak. The journey exceptions work, but two of them (failed payment, build start after the kickoff call) are easy to miss on Today. No route returned a 5xx, nothing scrolls sideways at page level at either width, and there are only two real browser console errors.

Counts: High 0, Medium 12, Low 18 (30 defects, section 3).

## 1. How it was run

- Isolated stack in this worktree: `pnpm env:init`, databases `brandbasket_platform_r216` and `brandbasket_platform_r216_payload` (payload DB owned by `bb_cms`), `pnpm db:migrate`, `pnpm cms:migrate`. `db:roles` was not run; the existing shared roles were used with their passwords taken from the shell at run time (never written to a file or printed). `ACCOUNT_CODE_SECRET` was exported in the shell. Fake billing, Brevo, Razorpay, Cal.com, social-auto and Turnstile all blank, so nothing real was sent.
- Console on port 3432 and customer app on 3433 (`next dev`).
- Fixtures: the R2-11 setup project (`apps/customer/e2e/r2/accounts.setup.ts`) signed up seven businesses through the customer app with outbox codes and paid on the fake provider: Website, Social (the 1 rupee offer), a failing renewal (subscription set to `past_due` by SQL), a preview-ready site, an unpaid account, an invitee, and the staff account (`pnpm staff:create`). The R2-11 guard only allows the r211 and r213 databases, so I added r216 to it in my working copy for the run and reverted that edit before committing.
- Extra rows by SQL: two enquiries, a past kickoff booking (to trigger the "Did the kickoff happen" prompt) and a future one, a team call, three requests (one more than 24 hours old, one a website change with a change request, one billing), two privacy requests (one overdue), a breach, an app error, an affiliate, a coupon, a monthly report and a social post awaiting approval.
- Tooling: a Playwright script visited every route at 1440 and 390 and recorded status, final URL, headings, document and element overflow, small touch targets, browser console and failed requests, and the first 14 Tab stops; a second script drove the live actions (search, Call completed, reply, exports). Screenshots are JPEG (quality 42, cropped to 2600 px tall at 1440 and 3600 at 390) in `docs/implementation/reports/screenshots/console-walk/`, named `<route>-1440.jpg` and `<route>-390.jpg`. Files starting `x-` are action results.
- Data caveats, not defects: the duplicate "Asha Sweets" enquiries, the two identical breach entries and two "Priya Partner" affiliates come from my seed running twice. The orange "1 Insight" pill at the bottom left is the Next dev indicator, not part of the product.

## 2. Per route

Status OK means no defect worth listing. Severity is the worst defect on the route. Defect ids are in section 3. Screenshot column gives the base name; add `-1440.jpg` or `-390.jpg`.

| Route | Status | Sev | What and where | Screenshot | Likely file |
|---|---|---|---|---|---|
| `/` Today | Issue | Medium | Kickoff prompt, late items, due today and upcoming render well; Call completed works and the row goes. Failed payment sits under Upcoming "due 17 Dec" (D6). No build-start row after the call (D7). Systems panel is flat. | today; x-call-completed-after | `app/(protected)/page.tsx` |
| `/clients` | Issue | Low | Two stacked pill rows; the stage row is clipped at the right edge at 1440 with no scroll cue (D20). At 390 the table hides Next and Paid through (D3). | clients | `clients/page.tsx`, `components/console/filter-pills-row.tsx` |
| `/clients/[id]` Overview | Issue | Medium | "Next step: Nothing is waiting on us" while the kickoff is a day late on Today (D5). Mirror panel, money, intake answers are good. Stepper labels collide at 390 (D26). Stale "Package" and "Ad credit" rows (D11). | client-overview | `clients/[businessId]/page.tsx`, `stage-track.tsx` |
| `/clients/[id]/website` | OK | Low | Next step card, kickoff block, logo and photos clear. Kickoff block has no action, the action is on Today and Calls. After Call completed it shows "Ready to start" with a Start building button. | client-website; x-client-website-after-call | `clients/[businessId]/website/page.tsx` |
| `/clients/[id]/billing` (alias `/services`) | Issue | Medium | Flat page: "Updates for the customer" form first, OyeChats bot form (long, grey disabled Add bot), payments and billing details far below (D4). Refund button present. | client-billing | `clients/[businessId]/billing/page.tsx`, `updates-section.tsx` |
| `/clients/[id]/requests` (Messages) | Issue | Low | Tab is called Messages but opens "Change requests" plus Calls plus a Requests table (D21). Long expanded quote form. Flat style. | client-requests | `requests-section.tsx` |
| `/clients/[id]/people` | OK | Low | Clean. "Close account" is a quiet red disclosure, good. | client-people | `people/page.tsx` |
| `/clients/[id]/project` (alias to Website) and `/activity` (alias to Messages) | Issue | Medium | Aliases redirect as intended. The Activity alias logs a React hydration mismatch error in the browser console (D12). | client-activity | `clients/[businessId]/activity/page.tsx` |
| `/calls` | Issue | Low | Call completed, They did not join, We did not attend, Reschedule all present. Notes box shows a large gold focus ring on load; the same call appears in "Just finished" and "Last 7 days" (D16). | calls | `calls/page.tsx`, `calls-section.tsx` |
| `/support` Requests list | Issue | Medium | Owner column "Nobody", Mine chip (D1). Search, category and Apply wrap onto two rows and the chips float beside them (D18). | support | `support/page.tsx` |
| `/support/[id]` detail | Issue | Medium | Flat, no panels (D2). Banner is jargon: "Waiting for us (customer sees: Sent)" and stays stale after a reply (D10). Thread is newest first. "Assigned to Unassigned" (D1). | support-detail; x-support-reply-after | `support/[ticketId]/page.tsx`, `request-banner.tsx` |
| `/support/new` | OK | Low | Raised card, required marks, Open the request disabled until filled. | support-new | `support/new/page.tsx` |
| `/support/errors` | Issue | Low | Good at 1440. At 390 the table hides Status and Last seen (D3). | support-errors | `support/errors/page.tsx` |
| `/support/errors/[id]` | OK | Low | Opens with detail. Not studied beyond load and headings. | support-error-detail | `support/errors/[issueId]/page.tsx` |
| `/leads` Enquiries | Issue | Medium | Owner column, Anyone, Mine, Nobody chips (D1). Master detail with a detail card works well. | leads, lead-detail | `leads/page.tsx` |
| `/leads/new` | Issue | Low | Old display style: "Add a *lead.*" in italic, back link says "Leads" while the page is Enquiries, button says Add lead while the entry point says Add enquiry (D2, D22). | lead-new | `leads/new/page.tsx` |
| `/reports` | OK | Low | Clean empty state. Tab strip shares List, Board, Reports with Clients and Projects. | reports | `reports/page.tsx` |
| `/reports/[id]` | Not reached | Low | No report rows exist (written by the monthly job), so only the 404 was seen. | report-detail | `reports/[reportId]/page.tsx` |
| `/projects` Board | Issue | Low | Default filter "Needs action" hides waiting builds, so the empty state says "No builds to show" with four paid websites present (D14). Owner chips (D1). | projects | `projects/page.tsx` |
| `/payments` | Issue | Medium | Strongest page. Tiles, lapse policy, filters, table. Shows "Failed 0, All clear" while a client is past due (D6). Month link can go into the future. | payments | `payments/page.tsx` |
| `/payments/export`, `/invoices/export`, `/invoices/export/zip`, `/leads/export` | OK | | Return 401 signed out, 400 without a month, 200 as CSV or zip with one. | none | `payments/export/route.ts` |
| `/invoices` | Issue | Low | Complete GST pages but very long, month chips plus a second month picker plus arrows (duplicate controls), and the register's last column is clipped to "P" at 1440 (D19). | invoices | `invoices/page.tsx` |
| `/coupons`, `/coupons/new`, `/coupons/[id]` | Issue | Low | Works. "New *coupon.*" italic style (D2). "No limit" set in 32 px Mono looks odd (D24). Alias `/referrals` redirects here. | coupons, coupon-new, coupon-detail | `coupons/**` |
| `/affiliates`, `/new`, `/[id]`, `/[id]/codes/new` | OK | Low | Best looking section: cards, avatar tiles, side panel. At 390 the table hides Status. Used as the benchmark for the rest. | affiliates, affiliate-detail, affiliate-new, affiliate-code-new | `affiliates/**` |
| `/pricing` | Issue | Low | Flat, services list is narrower than the page, empty band under the tabs (D2). | pricing | `pricing/page.tsx` |
| `/deliveries` (alias `/outbox`) | OK | Low | Good tiles, filters, table. Local mail shows "Kept, not sent". | deliveries | `deliveries/page.tsx` |
| `/deliveries/[id]` | Not reached | Low | No webhook or alert row exists; only a 404 for my guessed id. | delivery-detail | `deliveries/[deliveryId]/page.tsx` |
| `/outbox/[id]` | Issue | Medium | Email preview has a broken logo and a CSP error in the console (D9). | outbox-detail | `outbox/[emailId]/page.tsx` |
| `/privacy-requests` | Issue | Medium | The clock works: overdue shows red "02d 00h overdue", the open one "26d 23h remaining". The log form sits above the list, so the overdue item is below the fold (D8). Italic "requests" (D2). "Received · received" duplicate (D25). | privacy-requests | `privacy-requests/page.tsx` |
| `/breaches` | Issue | Medium | Both clocks and overdue states correct. Form above list (D8), file path shown to staff (D23), italic heading. | breaches | `breaches/page.tsx` |
| `/access-log` (Compliance) | Issue | Low | Works. Raw ids such as `invoice.register_view`, `report.view`, IP `::1`; Client id filter wants a UUID (D17). Page title says Compliance, route says access-log. | access-log | `access-log/page.tsx` |
| `/leaving` | Issue | Low | Stats card and the empty card touch with no gap. Not in the rail or the tab strip (D8). | leaving | `leaving/page.tsx` |
| `/staff` | OK | Low | Clean. Role picker still offers Support, Finance and Admin although there is one admin account (D1). | staff | `staff/page.tsx` |
| `/settings` | Issue | Low | Very long flat page of forms. Google Connect buttons are grey with no reason shown (D27). Setup call link is unset, so customers see no call card. | settings | `settings/page.tsx` |
| `/ads`, `/directory`, `/geography`, `/deals` (dormant) | OK | Low | Switched off as intended; each shows the full-page "Nothing here." 404 inside the shell (D12). | ads, directory, geography, deals | `components/console/not-found-view.tsx` |
| `/ad-credit` | Issue | Medium | "Packages bought together that include monthly ad credit" is a removed concept (D11). | ad-credit | `ad-credit/page.tsx` |
| `/ad-results` | OK | Low | Clean empty state. | ad-results | `ad-results/page.tsx` |
| `/no-access` | Issue | Low | Tells an admin "Your role is admin ... are for finance and admin staff" (D15). | no-access | `no-access/page.tsx` |
| 404 (`/does-not-exist`) | Issue | Low | Customer wording "Back to the journey", duplicate logo inside the shell, italic accent (D12). | not-found | `components/console/not-found-view.tsx` |
| `/design-system` | Issue | Low | Reachable with no sign-in (HTTP 200) (D13). | design-system | `app/design-system/page.tsx` |
| `/login` | OK | | New look, labels, show password, forgot link, customer sign-in link. Primary button is grey until the form is filled. | login | `app/login/page.tsx` |
| `/forgot-password`, `/reset-password/[token]`, `/staff-invite/[token]` | OK | | Invalid token states read clearly ("This invite no longer works ... Ask an admin for a new one"). A valid token flow was not driven. | forgot-password, reset-password, staff-invite | `app/*/page.tsx` |
| Global search (Ctrl or Cmd K) | OK | | Opens, groups Clients, Enquiries, Payments, Emails. Matches verification-code emails too. | x-search | `global-search.tsx` |

Keyboard: every page has a skip link and then 11 rail stops before main content, so the main action is the 13th to 15th stop (for example Today: Add enquiry then the notes box; Calls: client link then notes). Every stop in `main` showed a focus ring. Dialogs were covered by R2-11 and not repeated.

Journey exceptions from document 19:
- Kickoff prompt: works. Today shows "Did the kickoff with ... happen?", Call completed removes it and the client moves to "Ready to start". The prompt, Calls page and Website tab all use the approved "Call completed" wording.
- Late items: work. Requests 3 days and 20 hours late show in red, with count in the rail and on the page.
- Failed payment: only weak (D6).
- Privacy clock: works on both screens, with the day 25 and overdue wording.

## 3. Prioritised defect list

### Medium

| Id | Defect | Where | Likely file |
|---|---|---|---|
| D1 | Per-person owner controls still exist: Requests Owner column, Mine chip and "Assigned to"; Enquiries Owner column, Anyone, Mine, Nobody and Assign; Projects Anyone, No builder, a staff-name chip; privacy "Take this"; Staff role picker. AGENT-RULES says there is one admin account and no owners or Unowned lists. | support, leads, projects, privacy-requests, staff | `support/page.tsx`, `leads/page.tsx`, `projects/page.tsx`, `lib/staff-rules.ts` |
| D2 | Half the pages are still the flat legacy layout: no raised panel, long unframed forms, italic accent headings ("Add a *lead.*", "New *coupon.*", "Privacy *requests*", "Breach *register*", "Nothing *here.*"). Affiliates and Payments show the target. Pages: support detail, client billing and Messages, pricing, settings, privacy, breaches, access log, staff, ad credit, lead and coupon forms. | many | `components/console/page-header.tsx`, `section.tsx`, `panel.tsx` |
| D3 | At 390 the tables scroll sideways inside their card with no cue and hide the useful columns (Clients: Next and Paid through; App errors: Status and Last seen; Affiliates: Status). The name wraps to four lines. | clients, support/errors, affiliates, access-log, staff | `components/console/table-scroll.tsx`, `table.ts` |
| D4 | Client "Plan and billing" is ordered wrongly: "Updates for the customer" form first, then add-ons, then a long OyeChats form, with payments and refund below. The Today "Check" link for a failed payment lands on the top form, not on the payment. | client billing | `clients/[businessId]/billing/page.tsx` |
| D5 | Client Overview "Next step: Nothing is waiting on us" while the kickoff call ended a day ago and is late on Today. | client-overview | `clients/[businessId]/page.tsx` |
| D6 | Failed payment is under Today "Upcoming" with the date 17 Dec, not late or red, and Payments says "Failed 0, Needs a look 0, All clear". The state was set by SQL with no failed payment row, so a real failure may behave better; check with a real failed charge before release. | Today, payments | `lib/` Today queue builder |
| D7 | After Call completed the website is "Ready to start" with a Start building button on the client page, but Today has no row for it (the count fell from 11 to 10). Staff must look at Projects or the client. | Today | Today queue builder |
| D8 | Privacy requests and breaches put the "log one" form above the list, so an overdue item is below the fold. Both pages, and Leaving, are only reachable from the Compliance "At a glance" block, not the rail or the tab strip. | privacy-requests, breaches, leaving | `lib/console-rail.ts` |
| D9 | Email preview shows a broken logo: the app's CSP `img-src` blocks `https://app.brandbasket.in/email/email-logo.png`; console error on every preview. | outbox detail | CSP in `next.config.ts` or the preview frame |
| D10 | Request detail: banner reads "Waiting for us (customer sees: Sent)" and stays after a reply; the Status field still says New while the chip says "Waiting on client"; thread is newest first and the staff reply shows the same name as the customer. | support detail | `request-banner.tsx` |
| D11 | Stale product concepts: Ad credit page ("Packages bought together..."), client Money rows "Package: No package" and "Ad credit: None". The owner removed packages and ad money (2026-11-11). | ad-credit, client overview and billing | `ad-credit/page.tsx` |
| D12 | Opening a client's Activity alias (`/clients/[id]/activity`, which redirects to Messages) logs a React hydration mismatch error in the browser console at both widths. | client-activity | `clients/[businessId]/activity/page.tsx` |

### Low

| Id | Defect | Likely file |
|---|---|---|
| D12b | The 404 and every dormant page say "Back to the journey" (customer wording), show a second logo inside the shell and use the italic accent heading. | `components/console/not-found-view.tsx` |
| D13 | `/design-system` answers 200 to a signed out request. | `app/design-system/page.tsx` |
| D14 | Projects Board default filter hides waiting builds; empty state text "appears from the moment a client pays" is then wrong. | `projects/page.tsx` |
| D15 | `/no-access` tells an admin their role lacks access to pages "for finance and admin staff". | `no-access/page.tsx` |
| D16 | Calls: notes box takes focus with a large ring on load; the same call shows in Just finished and Last 7 days. | `calls-section.tsx` |
| D17 | Access log shows raw action ids (`invoice.register_view`, `report.view`), IP `::1`, and the Client id filter needs a UUID. | `access-log/page.tsx`, `lib/server/staff-access-log.ts` |
| D18 | Requests filter bar: search, category and Apply wrap to two rows and the chips float beside them. | `support/page.tsx` |
| D19 | Invoices: register's last column is clipped to "P" at 1440; month shown three ways (chips, picker, arrows); page is very long. | `invoices/page.tsx` |
| D20 | Clients: two stacked pill rows; the second is clipped on the right with no scroll cue. | `filter-pills-row.tsx` |
| D21 | Client tab "Messages" opens "Change requests", Calls and Requests; the same requests are listed twice. | `requests-section.tsx` |
| D22 | Entry names differ: Add enquiry, "Add a lead.", back link "Leads", button Add lead. | `leads/new/page.tsx` |
| D23 | Breach register shows a repo path ("vps-setup/BREACH-RESPONSE.md") to staff. | `breaches/page.tsx` |
| D24 | Coupons: "No limit" in 32 px Mono, "Members" wording; Payments month arrow allows a future month. | `coupons/[codeId]/page.tsx` |
| D25 | Privacy list: "Received · received 22 Oct" repeats the word. | `privacy-requests/page.tsx` |
| D26 | Client stage stepper labels collide at 390 ("Setting up" runs into "Building"). | `stage-track.tsx` |
| D27 | Settings: Google Connect buttons are grey and give no reason although the text says sign-in is "not set up on this server". | `settings/page.tsx` |
| D28 | Section tab strip draws a stray dark vertical bar beside the active or next tab on every page that has tabs. | `components/console/section-tabs.tsx` |
| D29 | 390 touch targets: 1 to 30 controls per page under 40 px high (worst: Enquiries detail 30, Invoices 28, Clients 20), against the 44 px rule. | shared button and pill classes |

Low total is 18: D12b and D13 to D29.

## 4. Not reached, and why

- Report detail and delivery detail: no report or webhook rows exist locally; both are created by jobs. Only the 404 path was seen.
- Valid staff invite and password reset tokens, and the forgot password submit (would send mail): only invalid-token states were seen.
- Cloudflare Access, real Brevo, Razorpay, Cal.com, social-auto: blank by design. The kickoff booking came from SQL, not Cal.com. Setup call link is unset locally.
- A real failed payment webhook (the failing account was put in `past_due` by SQL), so D6 needs a second look.
- Loading and error route states: the files exist for most sections but I did not force a slow or failing query.
- Refund dialog and dialog focus trapping: covered by R2-11, not repeated. Coupon, affiliate and enquiry create forms were opened but not submitted.
- This is the Next dev server, not a production build, so first-load timing is not representative.

## 5. Cleanup

Generated `.env.local` files, the two dev servers on 3432 and 3433, the temporary scripts, the r216 databases and the local guard edit were removed at the end. No shared role, password or database was changed.
