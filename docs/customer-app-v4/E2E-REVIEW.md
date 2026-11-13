# Customer app v4: end-to-end tests and screen review

Run on Tue 3 Nov 2026 against the local dev server (http://localhost:3197, database `brandbasket_platform_v4`, fake billing provider). Screenshots were taken before the sidebar redesign (commit c9ed7288 and earlier), so sidebar details in them may be out of date. The dev server stopped during the last full run, so the final run is partial; the numbers below come from the last complete runs.

## How to run

```bash
cd apps/customer
pnpm e2e                                  # setup, flows (1440 only), sweep at 1440 and 390
pnpm e2e e2e/flows.spec.ts --project=desktop
pnpm e2e e2e/sweep.spec.ts
E2E_ONE_WAY=1 pnpm e2e e2e/flows-one-way.spec.ts --project=desktop   # finishes the one-way flows; run last, then re-seed a fresh database
```

- `E2E_BASE_URL` (default http://localhost:3197), `E2E_WORKERS` (default 4), `E2E_LOGINS_FILE` (default the workspace `local-test-logins.txt`). Passwords are read from that file at runtime only.
- Sessions are saved per account in `e2e/.auth/` and reused while they still work (sign-in is rate limited to a few a minute).
- Output: screenshots in `e2e/screens/<account>/<route>-<size>.png`, one JSON per visit in `e2e/sweep-results/`, traces in `e2e/.results/`. All gitignored.
- Known app bugs are listed in `e2e/known-issues.ts` with their number below: a matching finding is reported as an annotation and does not fail the test. Remove the entry when the bug is fixed.
- The staff half of a flow (sending a quote, putting a post up for approval, the kickoff booking link) has no screen in this app, so `e2e/support.ts` does it through the same `@brandbasket/db` helpers on the staff connection, and refuses any database but local `brandbasket_platform_v4`.

Setup note: installing `@playwright/test` gives `next` a new peer variant in pnpm, so a dev server that was running during the install serves broken module paths until it restarts. I pointed `apps/customer/node_modules/{next,geist,nuqs,@sentry/nextjs,@payloadcms/next}` back at the variants the running server had loaded. The next `pnpm install` puts the new variants back; restart the dev server once after that.

## Flow results (plan 61, section 10)

| Flow | Result | Notes |
|---|---|---|
| Sign up to paid | Fails on the real form (E2E-01), recorded as `test.fail`. Passes with a request rewrite that sends the country code under its own name | New account each run: details, code (local bypass), the five `/start` questions, GST address, Pay, fake checkout |
| Book kickoff | Pass | On the fresh account. Needs a booking link (`site_settings.setup_call_url`); the v4 seed has none, so the test adds one and removes it afterwards (E2E-36) |
| Approve preview (Patel) | Pass, back-out mode | Walks to "Yes, approve" and presses Keep reviewing. `E2E_ONE_WAY=1` approves |
| New request to quote to pay (Kulkarni) | Pass, with a workaround | New request in the dialog, staff quote through the db helper, accept shows the price. The pay page 404s with the fake provider (E2E-05), so the test pays the same charge from Plan & billing, Invoices |
| Approve post (Kulkarni) | Pass | Makes a post for approval, approves it, deletes it after |
| Change business hours | Pass | Changes Sunday, saves, reloads, puts it back |
| Download invoice | Pass | The PDF link returns `application/pdf` starting with `%PDF-` |
| Add and cancel a service | Pass on the fresh account | Add Social & Ads, pay on the fake checkout, cancel from the next date. On seeded accounts cancelling fails (E2E-11), so the Kulkarni cancel-then-keep test is skipped |
| Invite a teammate | Pass | Invites a unique address, then revokes it |
| Lapsed to reactivated (Reddy) | Pass, back-out mode | Reactivate opens the test checkout, Cancel returns. `E2E_ONE_WAY=1` pays |

Totals: 9 run and pass (one of them an expected failure for E2E-01), 1 skipped, 0 failing.

Data the flows leave behind on each run: one new sign-up business ("E2E Sample Bakery"), one paid request "E2E ...: add a Marathi version of the Services page" on Kulkarni (in progress), its invoice. Earlier debugging runs left four E2E requests on Kulkarni (three in progress and paid, one withdrawn); they show in Kulkarni's Requests screenshots.

## Sweep results

7 accounts x 33 routes x 2 sizes = 462 visits: 335 pass, 95 with a recorded issue, 32 skipped because the account has no such item (no request, report month or enquiry row). Each visit checks console errors, server error text and status, axe (serious and critical, WCAG 2.2 AA tags), sideways scroll at 390, a page title, and "undefined", "NaN", "Invalid Date" or "[object Object]" in the text. No visit had a missing title or leftover "undefined"/"NaN"/"Invalid Date" text.

Iyer (unpaid) is sent to `/start` from every route, so its column is the `/start` page each time. The Kulkarni viewer is sent Home from `/settings/team` and `/settings/delete`.

Cells: `pass`, an issue number, `skip`, or `D x / M y` when the two sizes differ.

| Route | om-sweets | patel | kulkarni | kulkarni-viewer | reddy | chatterjee | iyer |
|---|---|---|---|---|---|---|---|
| home | pass | pass | pass | pass | pass | pass | pass |
| checklist | pass | pass | pass | pass | pass | pass | pass |
| enquiries | pass | pass | D pass / M 09 | D pass / M 09 | pass | pass | pass |
| enquiries-open | skip | skip | D pass / M 09 | D pass / M 09 | skip | skip | skip |
| requests | D pass / M 02 | D pass / M not checked (server stopped)| D 02 / M pass | pass | pass | 02 | pass |
| request-detail | skip | skip | D 02,25 / M 25 | skip | skip | skip | skip |
| website | pass | pass | 08 | 08 | 08 | 08 | pass |
| website-pages | pass | pass | 08 | 08 | 08 | 08 | pass |
| website-blog | pass | pass | pass | pass | pass | pass | pass |
| website-blog-authors | pass | pass | pass | pass | pass | pass | pass |
| website-blog-categories | pass | pass | pass | pass | pass | pass | pass |
| website-domain | pass | pass | 23 | 23 | 23 | 23 | pass |
| social | pass | pass | pass | pass | pass | pass | pass |
| social-content | pass | pass | pass | pass | pass | pass | pass |
| social-ads | pass | pass | pass | pass | pass | pass | pass |
| social-accounts | pass | pass | D 23 / M pass | D 23 / M pass | pass | pass | pass |
| search | pass | pass | pass | pass | pass | pass | pass |
| reports | pass | pass | pass | pass | pass | pass | pass |
| report-month | skip | skip | pass | pass | skip | skip | skip |
| business | pass | D 02 / M pass | pass | D 02 / M pass | D 02 / M pass | D 02 / M pass | pass |
| business-brand | 08,23,24 | 08,23,24 | 08,23,24 | pass | 08,23,24 | 08,23,24 | pass |
| billing | pass | pass | pass | pass | pass | pass | pass |
| billing-invoices | pass | pass | pass | pass | pass | pass | pass |
| billing-payment | 02 | D 02 / M pass | D 02 / M pass | pass | 02 | 02 | pass |
| settings | 23 | D 02,23 / M 23 | 23 | D 02,23 / M 23 | D 02,23 / M 23 | D 02,23 / M 23 | pass |
| settings-security | D pass / M 02 | D 02 / M pass | pass | D 02 / M pass | D 02 / M pass | pass | pass |
| settings-notifications | pass | pass | pass | pass | pass | pass | pass |
| settings-team | D pass / M 02 | D 02 / M pass | D 02 / M 10 | pass | pass | pass | pass |
| settings-privacy | pass | D 02 / M pass | pass | D 02 / M pass | D 02 / M pass | D 02 / M pass | pass |
| settings-delete | pass | pass | pass | pass | pass | pass | pass |
| help | 08 | 08 | 08 | 08 | 08 | 08 | pass |
| help-contact | pass | pass | pass | pass | pass | pass | pass |
| changelog | pass | pass | pass | pass | pass | pass | pass |

## Issues, most serious first

Screenshots are under `apps/customer/e2e/screens/`. File hints are where I would look first; I did not change any app file.

### Critical

**E2E-01. Every sign-up is refused: "Choose your country code."**
`/signup`. The country-code Select sits inside the mobile number's `Field`, and Base UI gives it the field's name, so the form posts `phone=IN` and `phone=98...` and no `phoneCountry`. Should: post `phoneCountry` (plan 61, section 3: sign up keeps phone or email). Also both controls are named "Mobile number" for screen readers. Fix: give the Select its own `Field` or move it out of the shared one. `src/features/entry/components/sign-up-form.tsx` lines 189 to 201.

### High

**E2E-02. Pages with forms answer 500 under concurrent requests.**
`/settings`, `/settings/security`, `/billing/payment`, `/business`, `/settings/privacy`, `/social/content` and others. Five parallel requests: two or three come back 500 with "useToastManager must be used within <Toast.Provider>" from `ChangePasswordForm`, `ProfileForm`, `BillingDetailsForm`, `PaymentMethodRequest`, `useSectionForm`. Sequential requests pass. Seen on the dev server only; check a production build before closing. `src/ui/toast.tsx`, `src/app/layout.tsx` (ToastProvider placement).

**E2E-03. Renewal failing shows "Everything is running. Nothing needs you right now." on Home.**
`chatterjee/home-desktop.png`. Home hides the billing banner by design, but has no task for a failed renewal either, and Coming up says "Next payment ₹2,999 Sat 7 Nov". Should: a task state with Change payment method (plan 60, section 13). `src/features/home/loader.ts` and rules, `src/features/shell/rules.ts` `showsBillingBanner`.

**E2E-04. Lapsed Home says "Your Website and Social & Ads services are active."**
`reddy/home-desktop.png`. The task below says the plan has ended. Should: say the plan has ended. `src/features/home` (the greeting subtitle).

**E2E-05. Paying an accepted quote goes to a 404 locally and on staging.**
`/checkout/charges/[id]` calls `notFound()` unless the provider is Razorpay, and the request page's Pay button and `acceptQuoteAction` both link there. Should: open the fake provider's confirm page, as invoices' Pay does. `src/app/(pay)/checkout/charges/[id]/page.tsx` line 45, `src/features/requests/rules.ts` `chargePath`.

**E2E-06. The viewer sees write actions.**
`kulkarni-viewer/home-desktop.png`, `kulkarni-viewer/social-desktop.png`, `kulkarni-viewer/search-desktop.png`. "Add" on Instagram and Facebook pages, Monthly ad budget, Areas you serve, and "4 things need you" for someone who can only look. Approve is correctly hidden. `src/features/home/loader.ts` (Needs you items), `src/features/social/components/parts.tsx`, search setup card.

**E2E-07. Business profile email falls back to the signed-in person's address.**
`kulkarni-viewer/business-desktop.png` shows `viewer+kulkarni...` as the business email. `loadContact` reads `getOwnerContact(tx, customer.user.id)`, the current user, not the owner. An editor who saves the form makes their own address the business email. `src/features/business/loader.ts` lines 69 to 85.

**E2E-08. `<tr>` inside `<tr>`: hydration error and misaligned table headers.**
`/help`, `/website` (Pages panel), `/website/pages`. `TableHead` already wraps its children in a `<tr>` and the callers pass a `TableRow`. Visible in `kulkarni/website-desktop.png`: "Address, Last seen" headers squeezed left while the dates sit far right. Fix the callers (or `TableHead`): `src/features/calls/components/help-screens.tsx` 105, `src/features/website/components/pages-screen.tsx` 46, `src/features/website/components/website-screen.tsx` 177, `src/ui/table.tsx` 20.

**E2E-09. Enquiries scroll sideways at 390.**
`kulkarni/enquiries-mobile.png` is 424 px wide: the status chips (All, New, Contacted, Won, Lost) run past the panel although their row has `overflow-x-auto`, because the column holding it is not allowed to shrink. Should: no sideways page scroll at 360 (plan 60, section 15). `src/components/filter-bar.tsx` (add `min-w-0` to the flex column) or the enquiries screen.

### Medium

**E2E-10. Team table scrolls the page sideways at 390.** `kulkarni/settings-team-mobile.png`. `src/features/team/components/team-panels.tsx` (hide low-priority columns on phones).

**E2E-11. Seeded plans cannot change: "We couldn't remove that just now."** The seed writes `provider_subscription_id = seed_v4_<slug>`, which the fake provider refuses (`/^fake_sub_[0-9a-f]{24}$/`), so cancelling, adding or keeping a service fails on every seeded business. Seed fix, not an app fix: `packages/db/scripts/seed-v4-states.ts` (and the older `seed_<slug>` ids for Om Sweets, Kaveri, Rao).

**E2E-12. Home's last-30-days strip shows only Enquiries.** `kulkarni/home-desktop.png`. The mock has Enquiries, Website visits, Leads from ads and Google page one; Leads from ads (5, on Social) and searches on page one (10, on Local SEO + AEO) have data. `src/features/home/loader.ts`.

**E2E-13. A change against a period with no data.** "Enquiries 63 +63" on Home and Enquiries (the seed has no earlier month), "0 0" on Chatterjee. Should: leave the change out when the earlier period has no data, and never show a bare 0 change (plan 60, section 12). Home strip and `src/features/enquiries` metrics rules.

**E2E-14. Social & Ads has five primary buttons.** `kulkarni/social-desktop.png`: Approve all 4 and every row's Approve are filled blue. Should: one primary per state, Approve all (plan 61, sections 4 and 9); row Approve secondary. `src/features/social/components/approvals-panel.tsx` line 64.

**E2E-15. Setup asks for things the business already gave.** Kulkarni is asked for Instagram and Facebook pages and a monthly ad budget on Home and Social, while Social shows "₹1,624.30 of ₹20,000" and the seed connects accounts. Check whether the checklist reads the same sources as the panels. `src/features/social/loader.ts`, `src/features/checklist`.

**E2E-16. Dates print "Thu 24 Sept."** `kulkarni/billing-desktop.png`, `chatterjee/home-desktop.png`. Should: `Thu 24 Sep` (plan 60, section 12). en-IN's short month gives "Sept" with a full stop. `src/lib/format.ts`.

**E2E-17. Report month writes "Rs 17,387" and has no Download PDF.** `kulkarni/report-month-desktop.png`. Should: `₹17,387` and a Download PDF action (plan 61, section 4; the `/reports/[month]/pdf` route exists). Report text comes from the composed report: `src/features/reports`, `packages/db/src/queries/reports.ts` `composeReport`.

**E2E-18. Patel: "One round of changes is included." beside "1 of 2 used".** `patel/home-desktop.png`. The two lines disagree. `src/features/home` (Changes included panel).

**E2E-19. Home "What we did" lists only "Your website went live".** `kulkarni/home-desktop.png`. Published posts, the shipped request and search work exist in the seed. `src/features/home/loader.ts`.

**E2E-20. Home chart labels shrink to about 5 px at 390.** `kulkarni/home-mobile.png`. The SVG scales its text with the viewBox. `src/components/charts`.

**E2E-21. Checkout says "The OyeChats professional chatbot".** Seen in the sign-up flow's `/checkout` (What you get). Glossary: "Website chat". `src/features/checkout` (or the shared catalogue text it reads).

**E2E-22. An unpaid account cannot reach Settings or Help, and `/start` has no sign out.** Every route redirects Iyer to `/start`; the pay layout shows only "Brandbasket". Plan 61, section 3 guards `/settings`, `/help` and `/billing` as Customer. `src/lib/guards.ts`, `src/app/(pay)/layout.tsx`.

**E2E-23. Links not told apart from text (axe link-in-text-block).** `mailto:support@brandbasket.in` on `/settings` and `/website/domain`, `wa.me` on `/social/accounts`, "/requests?new=1" on `/business/brand`. Underline links in running text. `src/styles/globals.css` or the components that set `no-underline`.

**E2E-24. Brand kit upload tiles: a button inside a button, and names that do not contain the visible text (axe nested-interactive, label-content-name-mismatch).** `/business/brand`. `src/features/business/components/brand-kit.tsx`.

**E2E-26. Missing routes from the plan's route map.** Local SEO + AEO has no tabs (`/search/rankings`, `/ai-answers`, `/reviews`, `/google-profile`), and Plan & billing has no Refer a business tab (`/billing/refer`, in the mock). `kulkarni/search-desktop.png`, `kulkarni/billing-desktop.png`.

### Low

**E2E-25.** Add screenshots drop zone: accessible name does not contain the visible text (axe). `/requests/[id]`. `src/ui/file-drop.tsx`, `src/features/requests/components/screenshots.tsx` (both being edited by another task).

**E2E-27.** Request at Ready to check says "Looked after by: We will assign someone soon". `kulkarni/request-detail-desktop.png`. `src/features/requests/loader.ts`.

**E2E-28.** Withdrawn requests show "Closed", which is not one of the request statuses in plan 60, section 12. `kulkarni/requests-desktop.png`. `src/features/requests/rules.ts`.

**E2E-29.** Reports shows in the sidebar before the first report month (Om Sweets). Plan 60, section 9. `src/features/shell/rules.ts` `navModel`.

**E2E-30.** "Included edits" and "2 of 2 included edits used" where the glossary says "Small edits included this month" (the mock also says Included edits: owner's call). Home, Requests, request detail.

**E2E-31.** `/start` prints "Question 1 of 5" twice. `iyer/home-desktop.png`. `src/features/start/components/start-screen.tsx`.

**E2E-32.** The in-app 404 renders a `<main>` inside the shell's `<main>`. `src/app/not-found.tsx` (or the `(app)` not-found).

**E2E-33.** Site health says "No checks yet. Checks start once your website is live." on a live site. `kulkarni/website-desktop.png`. Being built now in `src/features/website`; recheck when that lands.

**E2E-34.** Social reports 5 leads from ads and the October report 41, but Enquiries has no ad enquiries ("63 of 63 came from your website"). Seed or merge of ad leads into enquiries.

**E2E-35.** Plan & billing lists each service at its discounted price with paise (₹2,399.20); the mock lists ₹2,999 and shows the package discount once in This month's bill. `src/features/billing/components/services-panel.tsx`.

**E2E-36.** Seed gap: no `setup_call_url` site setting, so kickoff and call booking show "We could not load the times" locally. The flow adds a local link for its run. `packages/db/scripts/seed-v4-states.ts`.

## Not covered

- Screens after the sidebar redesign: the server stopped during the final run, so screenshots were not re-taken.
- Only Kulkarni (both sizes) and the state Homes were reviewed by eye. The JSON checks cover every visit, but I did not look at every screenshot.
- Editor account: signed in and saved, not swept.
- Kaveri Dental Studio and Rao Tutorials have no logins in the logins file.
- Loading, empty, error and stale states, keyboard-only use and focus order were not exercised.
- `/website/blog/new`, blog editor, `/affiliate`, `/restore-account`, `/setup/[token]`, `/reset-password/[token]` and the old-path redirects were not visited.
- Full-page screenshots on desktop expand the shell's scrolling column; on phones the fixed tab bar is drawn where the viewport ended, mid-page. Both are capture artifacts, not app bugs. The dark "N" button bottom left is Next's dev tools.
