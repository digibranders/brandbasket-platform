# Historical claims recheck

Commit c702f6c7 (development), 2026-11-14. Sources rechecked: `docs/customer-app-v4/E2E-REVIEW-2.md` (written 2026-11-03) and `docs/customer-app-v4/FINAL-PARITY-AUDIT.md` (2026-11-03, code `f4248a6f`). Method: read the current source and tests at the paths cited. Nothing was executed. "Fixed" means the code now does what the document asked; it does not mean the tests pass (not run).

Status words: Fixed | Still open | Partly | Superseded | Not re-verified. Labels: Verified in code | Reported in historical document | Inferred | Unknown.

Context that changes how to read both documents (Verified in code): `apps/platform` was deleted in commit 90d76d5f. `apps/` now holds only `admin` and `customer`. Every sentence in the parity audit that says a route "stays on platform" (`/api/site`, `/api/t`, `/api/leads`, `/api/pricing`, webhooks, jobs, `/content-media`) is superseded: those routes now live in `apps/customer/src/app/api/*` and `app/content-media` (`CLAUDE.md`, `apps/customer/CLAUDE.md`). The nginx split files named in the audit no longer exist as such; `deploy/vps/nginx/` holds `sites-brandbasket`, `sites-brandbasket-http`, `snippets-brandbasket-proxy.conf` and `brandbasket-next.conf.example`.

## 1. E2E-REVIEW-2.md

| Claim | Status | Evidence now |
|---|---|---|
| R2-01 Old addresses answered 307, fixed with `permanentRedirect` in 17 route files and the sign-up branch of login | Fixed | 39 route files under `apps/customer/src/app` call `permanentRedirect`; `app/(app)/details/page.tsx:7`; `app/(auth)/login/page.tsx:21` (`permanentRedirect(signUp)`), signed-in hop stays `redirect` at `:23` as stated; `app/old-paths.test.ts:170-176` asserts `permanentRedirect` and no `redirect` for the moved paths. A grep for plain `redirect(` in `(app)/details`, `oyechats`, `website/enquiries`, `content` found none. |
| R2-02 Focus moves to first invalid control after a refused submit (`ui/field.tsx`) | Fixed | `ui/field.tsx:33-42` (querySelector `[aria-invalid="true"]`, `first.focus()`, not when focus already on an invalid control); tests in `ui/form-controls.test.tsx` |
| R2-03 Cmd or Ctrl K opens search with focus on the input; `Dialog` takes `initialFocus` | Fixed | `ui/dialog.tsx:22,33`; `features/shell/components/command-search.tsx:57` |
| R2-04 A dropped save on Business profile shows "We could not save that. Try again." and keeps the change | Fixed | `features/business/components/use-section-form.ts:9` (`SAVE_FAILED`); test `business.test.tsx` present |
| R2-05 Post published a moment ago no longer reads "Scheduled" (clock floored at last save) | Fixed | `features/blog/components/post-editor.tsx:84-86` (`Math.max(useNow(), post.updatedAt)`); `post-editor.test.tsx` exists |
| R2-06 Author and category editors warn on unsaved changes | Fixed | `features/blog/components/taxonomy-editors.tsx:52-53` (`beforeunload`); `taxonomy-editors.test.tsx` exists |
| R2-07 Plan & billing shows an error when the payment result cannot be read | Fixed | `features/billing/components/billing-screens.tsx:160` (`PanelError ... what="the result of your payment"`); `features/billing/states.test.tsx:54` |
| O-1 Only Business profile has a loading skeleton | Still open, slightly changed | `find app -name loading.tsx`: `app/(app)/business/loading.tsx` and `app/affiliate/(portal)/loading.tsx`; no `Suspense` in `app`, `features`, `components`, `ui` |
| O-2 A dropped request on most forms shows the route error screen and loses typed text (33 client components, 3 handle it) | Still open (count Unknown) | No shared helper in `lib/action-result.ts`; now 58 client files reference actions and 25 contain `catch`; different counting method from the document, so the ratio is not comparable |
| O-3 Unsaved changes lost on in-app link | Still open | `beforeunload` only in `post-editor.tsx:190-191` and `taxonomy-editors.tsx:52-53`; no router interception |
| O-4 Home "Book a call" disappears silently when booking details fail | Still open | `features/home/components/home-screen.tsx:55` returns `null` when `!panels.booking.ok` |
| O-5 Help and calls shows two identical error banners | Not re-verified | |
| O-6 Panels left out when empty (Pages, Campaigns, Team waiting, Enquiries by day) | Not re-verified; owner decisions | |
| O-7 New copy "We could not load the result of your payment." | Fixed in code, copy approval Unknown | `states.test.tsx:54` asserts it; whether the owner approved is not recorded |
| D-01 Dev server 500 under parallel first compiles; needs a production build to close | Unknown | Not re-tested; no production build run here |
| "Left as designed": `/billing/pay` goes to `/checkout/pay` which 404s with the fake provider | Verified | fake provider has `/billing/confirm` pages (`fake-provider.ts:34-48`) |
| "Left as designed": dialogs other than search open with focus on Close | Not re-verified (still the default in `ui/dialog.tsx`) | affects screen reader and keyboard tests (scenarios section 10) |
| Test totals: 56 of 56 new spec tests pass; 221 unit files, 2595 tests | Reported in historical document, stale | Now 365 customer unit test files and 829 across the repo. Not re-run. |
| Spec still contains the E2E-01 workaround | Verified, stale | `e2e/flows.spec.ts:50-56` rewrites the sign-up POST body although the form now posts `phoneCountry` (`features/entry/components/sign-up-form.tsx:109`); the first test titled "E2E-01, fixed" (`:43-46`) only waits for the code field. Remove the rewrite and assert the full path |
| Not covered: 390 keyboard, screen reader, real phone, production build, accepting a setup link | Still open | scenarios sections 1, 8, 10 |

## 2. FINAL-PARITY-AUDIT.md section 3 (ranked gaps)

| Gap | Document said | Status | Evidence now |
|---|---|---|---|
| G-1 Quote "Accept and pay" dead-ends on Razorpay | `acceptQuoteAction` returned the pay path only | Fixed | `features/requests/actions.ts:173-189` now calls `startCustomerChargePayment` and returns the fake `redirect` url or the charge page for `razorpay`. The pay page still redirects to `/billing` if the order is missing (`app/(pay)/checkout/charges/[id]/page.tsx:57`), now guarded by the action creating it first. Razorpay path has no integration test with the action (`charges-razorpay-orders.integration.test.ts` covers the order); scenario K-04 |
| G-2 Email logo 404 | file only in `apps/platform/public/email` | Fixed | `apps/customer/public/email/email-logo.png` exists; `src/app/email-assets.test.ts` asserts it for `emailLogoUrl()`. Live URL not re-checked (no network) |
| G-3 No error visibility beyond Sentry | browser capture, native inbox, system-error email, Teams billing alerts not wired | Partly | Wired now: `instrumentation-client.ts:17` (`installBrowserErrorCapture("platform", ...)`) and `instrumentation.ts:10-11` (`startBillingErrorAlerts`). Still Sentry only: `lib/report.ts:11-17` (`reportError`), `instrumentation.ts:15-21` (`onRequestError`); no native inbox row, no system-error email. `NEXT_PUBLIC_SENTRY_DSN` is in `deploy/build.env.example:12` as a comment; whether the GitHub build sets it is Unknown |
| G-4 GA4 and Meta keys missing from customer env templates | none in `.env*.example` | Fixed in templates | `apps/customer/.env.example:121-128`, `.env.production.example:167-168`. VPS file Unknown |
| G-5 Start-up checks are four variables | only `serverEnv()` | Still open at runtime; mitigated at deploy | `apps/customer/src/lib/env.ts:7-14` (4 variables); `instrumentation.ts:6-9` does not call `assertRuntimeEnvironment` (only admin does, `apps/admin/instrumentation.ts:6-8`). Deploy runs `pnpm env:check` and `check_customer_env` (`deploy/vps/brandbasket-platform-release:157-176`), which only checks file present, bypass and fake-billing absent, secret length |
| G-6a `listing` accounts now get the full dashboard | guards have no `kind` check | Still open | `lib/guards.ts` (154 lines) has no `kind` test. Data check `select count(*) from businesses where kind='listing'` is not run (and sign-ups are created as kind `listing` first, `listing-account.ts:175`, so the count is not a defect signal by itself) |
| G-6b Paid-before-cutover customers have no "Send" path, `onboardingSubmittedAt` never set | | Still open | `features/checklist/actions.ts:44-48` ("There is no send step"); only reader is `calls.ts:97`, `timeline.ts:100` |
| G-6c Setup redemption no longer creates the Payload tenant | | Still open | `features/entry/server/setup.ts:207` "shortcut" comment |
| G-7 Owner-only billing (pay, codes, billing details, reactivate, service changes, closure, receipts) | | Still open, by design | `receipts/route.ts:9` (`requireOwner`); `features/checkout/actions.ts`, `billing/actions.ts` use `requireOwner` |
| G-8 Affiliate who is also a customer loses the rail link | | Still open | `grep -ril affiliate features/shell` finds nothing |
| G-9 Teams cards dropped for new request and reply | | Still open | `features/requests` has no Teams reference; Teams only in `features/website/alerts.ts` and `platform/lib/server/teams*.ts` |
| G-10 Terms and Privacy links missing on checkout | | Still open (Inferred from absence) | `app/(pay)/layout.tsx` carries Help (mailto) and Sign out; no `terms` or `privacy` href in `features/checkout/components` |
| G-11 `/robots.txt` and `/.well-known/security.txt` 404 | | Fixed | `app/robots.ts` (`disallow: "/"`); `app/.well-known/security.txt/route.ts`; `icon.png` exists in `app/` too |
| G-12 Smaller losses | list of eight | See rows below | |
| G-12a `?page=N` dropped in enquiries redirects | | Still open | `features/enquiries/components/enquiries-screen.tsx` reads `tab` only (`:122`); the page has no `page` param |
| G-12b Website page shows only newest preview version | | Partly | `features/website/loader.ts:121-125` now loads the version list, but `components/website-screen.tsx:100` uses `versions[0]` only |
| G-12c "Your changes", "Recent changes", "Change it yourself" cards dropped | | Still open | no such card text under `features/website` |
| G-12d Per-lead message count and last activity gone | | Not re-verified | |
| G-12e Blog has no sidebar link | | Still open (Inferred) | no `/website/blog` in `features/shell`; reachable as a Website tab |
| G-12f `/support-attachments` signed out redirects, closing account reads screenshots | | Still open | `app/support-attachments/[attachmentId]/route.ts:8-12` uses `requireSignedIn` |
| G-12g `/icon.png` 404 | | Fixed | `app/icon.png` present |
| G-12h `/invite/<token>` and `/affiliate/setup/<token>` can reach GTM and Clarity after consent | | Still open | `features/consent/consent.ts:61` `SECRET_PATHS` lists reset-password, setup, billing and checkout confirm only |
| G-12i nginx brute-force zone misses `/signup`, `/setup`, `/invite`, `/affiliate/setup` | | Still open | `deploy/vps/nginx/sites-brandbasket:77` regex `(login|join|forgot-password|reset-password|restore-account)` |
| G-12j `claim` and `notice` params | | Still open, by design | parity rows L-022, L-045, L-046 |
| G-12k Deep links lost at sign-in (both apps) | | Still open | `rules/account-entry.ts:34-40` only honours invite pages |

## 3. Appendix rows with a verdict other than KEPT or MOVED (each row below was checked in current source or is marked Not re-verified)

| Row | Document verdict | Status now | Evidence |
|---|---|---|---|
| R-019, M-026 receipts owner-only, signed-out redirect not 401 | PARTIAL | Still open | `app/billing/receipts/route.ts:2,9` |
| R-037, R-038, R-040 `?page=` lost | PARTIAL | Still open | G-12a |
| R-051, M-062, F-101 affiliate dual role | PARTIAL / MISSING | Still open | G-8 |
| R-056, R-057, F-037, F-038, I-028, I-029, I-100, L-052, M-070 dormant directory and listing pictures | DROPPED | Superseded by the stated decision (plan 61:116) | routes absent; dormant tables still tested (24 db integration files) |
| R-071 host gate dropped | DROPPED | Still true, low risk | `app/layout.tsx`, no host check |
| R-075, I-034, L-060 robots | MISSING | Fixed | G-11 |
| R-076, I-035, L-061 security.txt | MISSING | Fixed | G-11 |
| R-080, I-032, L-017 email logo | MISSING | Fixed | G-2 |
| M-020 | MISSING path | Fixed | G-1 |
| M-022 unapplied payment reasons | PARTIAL | Not re-verified | `features/checkout/server/payment-confirmation.ts:103` |
| M-023, F-025 Send step | DROPPED/PARTIAL | Still open | G-6b |
| M-040 role narrowing on money | PARTIAL | Still open, by design | G-7 |
| M-041 settings behind unpaid hold | PARTIAL | Still open | `app/(app)/layout.tsx:16` redirects every `(app)` route, settings included, to `/checkout` for an awaiting-first-payment account |
| M-051, I-089 Teams billing alerts | MISSING | Fixed | `instrumentation.ts:10-11` |
| M-052, F-094, F-095, F-096, I-087, L-089, L-091 native error inbox and system-error email | PARTIAL / MISSING | Still open | `lib/report.ts`, `instrumentation.ts:15-21`; boundary `app/route-error.tsx:17-25` not re-read |
| I-088, L-088 browser capture | MISSING | Fixed | `instrumentation-client.ts:17` |
| M-053, I-052, I-061, I-090, L-090 boot checks | PARTIAL | Still open | G-5 |
| M-059, L-002 Payload tenant at setup | PARTIAL | Still open | G-6c |
| M-069 legal links at payment | DROPPED | Still open | G-10 |
| F-006 feedback error handling | PARTIAL | Not re-verified | `features/website/actions.ts:120-127` maps three error types; others report and show `FAILED_MESSAGE` |
| F-008, F-009, F-010, F-011 website history cards | PARTIAL / DROPPED | Still open | G-12b, G-12c |
| F-034 closure clash list | PARTIAL | Not re-verified | |
| F-039 `kind=listing` no gate | DROPPED | Still open | G-6a |
| F-042, F-045 Teams cards on requests | PARTIAL | Still open | G-9 |
| F-052 attachments | PARTIAL | Still open | G-12f |
| F-059, F-061 booking link and booking code email | DROPPED | Not re-verified; no cited decision | |
| F-065 per-lead counts | PARTIAL | Not re-verified | |
| F-067 enquiry data writers | UNVERIFIED | Superseded | writers now in `apps/customer/src/app/api/site/events/route.ts`, `api/webhooks/oyechats/route.ts` (each has a route test) |
| F-086 Blog sidebar link | MISSING | Still open | G-12e |
| I-027 error reports route | PARTIAL | Still open (no route test: `app/api/error-reports` has none) | |
| I-066 old-only env vars | DROPPED | Not re-verified | |
| I-068 Sentry env | | Unknown | G-3 |
| I-093 split regex completeness | PARTIAL | Superseded | platform app removed, routes served by customer |
| I-101, I-102 add-ons confirm and advertise | DROPPED | Verified still no page | `fake-provider.ts` constant `FAKE_ADD_ON_CONFIRM_PATH="/add-ons/confirm"` has `app/add-ons` redirect only |
| L-022, L-045, L-046 | DROPPED | Still true | |
| L-062 `/icon.png` | PARTIAL | Fixed | `app/icon.png` |
| L-063 Cal.com or Calendly | UNVERIFIED | Unknown | no external call made |
| L-070 referral from URL | UNVERIFIED | Not re-verified | |
| L-075 consent on secret paths | PARTIAL | Still open | G-12h |
| L-079, L-080 GA4 and Meta | PARTIAL | Template fixed, VPS Unknown | G-4 |
| L-098 live nginx | UNVERIFIED | Unknown | needs SSH, not done |

## 4. KEPT and MOVED rows (about 250)

Not individually re-read. Method checks that support them (Verified): `app/old-paths.test.ts` asserts route files exist and that 28 moved paths use `permanentRedirect`; `E2E-REVIEW-2.md` Reported following 65 old paths over HTTP (not re-run). The document itself warns that `old-paths.test.ts` "only proves a route file exists" and never checks redirect targets or query strings (`FINAL-PARITY-AUDIT.md:21`); the current test file adds the permanence assertion but still no target assertion (Verified, lines 170-176). Sampled and found consistent: R-012 (`/billing/pay` permanent to `/checkout/pay`), R-019 owner guard, R-020 (`/services` to `/billing` with query), R-025 and R-026 (checklist redirects), R-075.

## 5. New contradictions found while rechecking

- Root `CLAUDE.md` says the customer app serves `/api/*` and the jobs; `README.md` still lists `apps/customer` as "dashboard, public APIs, webhooks, timer jobs" (consistent) but `docs/customer-app-v4/*` and the playbook still name `apps/platform` (stale).
- `apps/customer/src/features/checkout/server/first-payment-lookup.ts` comment (and `checkout.ts` copy) says "apps/platform records it within minutes". No platform app exists; only the first-month offer checkouts are recorded by timer (coverage map F-3).
- Root workspace `CLAUDE.md` lists the dashboard at `app.brandbasket.localhost:3198`; repo `CLAUDE.md` and `package.json` use `localhost:3197`; `apps/admin/.env.local` uses `:3198` (environment doc section 2).
- Pricing: workspace `CLAUDE.md` (2026-11-11) says no package discounts and no ad money; code agrees on discounts (`PACKAGE_OFFERS` empty, `packages.ts:32`) but `adCreditCentsFor` and `adCreditCentsAtCheckout` and the whole `ad-credit` console section (admin `app/(protected)/ad-credit`, `ad-credit-due.integration.test.ts`) are still present. With `offerFor(services)` returning nothing the credit evaluates to 0; confirm no code path still grants credit (Inferred). The "billed monthly" line also coexists with a 10% annual interval (`add-ons.ts:123`). Both are owner decisions to confirm.
