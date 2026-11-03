# Customer app v4: second test pass

Run on Tue 3 Nov 2026 against the local dev server (http://localhost:3197, database `brandbasket_platform_v4`, fake billing provider, `EMAIL_CODE_BYPASS` on). Scope: the "Not covered" list of `E2E-REVIEW.md` (the first pass; its 36 issues were already fixed). The affiliate portal was reviewed by another agent and is not covered here. Nothing is committed.

## What was covered

| Area | How | Where |
|---|---|---|
| Error and empty state of every panel | Vitest: each screen rendered with one failed `Loaded` at a time (its own "We could not load ..." alert, the other panels still there) and with every list empty (an empty sentence, never "No data", "undefined" or "NaN") | 15 `states.test.tsx` files under `src/features/*/` (99 tests) |
| Empty, loading and browser-side error states in the running app | Playwright: empty lists on Om Sweets; the Business profile skeleton and "old page stays" on a slow navigation; a failed upload; a save that never gets an answer | `e2e/states.spec.ts` |
| `loading.tsx` and skeletons per route | Read the route tree | Finding O-1 |
| Keyboard | Tab order and visible focus on sign in, sign up, forgot password, `/start`, checkout (a new sign-up), Home, Requests, Enquiries, Plan & billing, Team, Business profile and Blog; no focus traps on pages; skip link; sheets and dialogs opened with Enter, focus kept inside, Escape closes and focus returns (Requests and Enquiries sheets, New request, Book a call, Cancel a service, Invite someone); Ctrl K and Cmd K search; account menu, service options menu, notifications | `e2e/keyboard.spec.ts` |
| Blog editor (Kulkarni, 1440 and 390) | New post, the allowance line, unsaved changes warning, Save draft, the post checklist, cover upload with its description, Publish, Unpublish, Duplicate, Delete, empty title, viewer refused | `e2e/blog-editor.spec.ts` |
| Reset, setup and invite links, safe `next` | Reset token valid, expired and used; setup token valid, expired and made up; invitation accepted with the right address, refused for a wrong address, expired, revoked and used, signed out, malformed; `next` honoured only for an invitation page | `e2e/links.spec.ts` |
| Old addresses | Every old path of `PARITY.md` Part 2 and `src/app/old-paths.test.ts` (65 paths and query variants) followed hop by hop over HTTP, signed in as the Kulkarni owner and signed out: first hop permanent, target, final page and status, no loop | `e2e/links.spec.ts` |
| Production-like checks | 27 workspace routes: no console errors, no failed requests; sidebar links do not move and no layout shift is recorded inside the sidebar while navigating through all of it | `e2e/states.spec.ts` |

Screenshots read by eye: the failed save banner, the failed upload row, the route error screen (before fix R2-04), the blog editor at 390 after Publish (before fix R2-05), the date input focus ring, the sign-up form and the empty blog list at 390.

## How to run

```bash
cd apps/customer
pnpm e2e e2e/states.spec.ts e2e/keyboard.spec.ts e2e/links.spec.ts e2e/blog-editor.spec.ts --project=desktop
pnpm test        # includes the new states.test.tsx files
```

- Same setup as the first pass: dev server on 3197, the v4 seed, logins read from `local-test-logins.txt` at run time.
- Tokens and invitations are written straight into the local v4 database through `support.ts` (which refuses any other database) and removed afterwards. Blog posts made by the editor test are deleted before it ends.
- Data left per run: one new sign-up business ("E2E Sample Bakery", from the checkout keyboard test, as the sign-up flow already does). The valid reset link sets Om Sweets' password to the one it already has, signs in again and saves the session, because a reset signs the account out everywhere.
- Rate limits: `links.spec.ts` clears this machine's counters for reset links, setup link lookups and the viewer's invitation accepts before it runs, so it can be rerun. The data export (`/settings/privacy/export`) is limited to a few an hour; after a run or two it answers 429, which the test accepts.
- The dev server sometimes answers 500 under parallel first compiles (D-01). The specs tell that message apart, retry it or record it as an annotation, and fail on anything else.

## Results

Final run: 56 tests in the four new specs, 56 pass (plus the 8 sign-in setups). Unit tests: 221 files, 2595 tests pass. `typecheck` and `lint` clean.

| Spec | Tests | Pass | Notes |
|---|---|---|---|
| `states.spec.ts` | 10 | 10 | 2 dev-server races recorded as annotations (D-01) |
| `keyboard.spec.ts` | 24 | 24 | Failed before fix R2-03 (search) and R2-02 (focus after errors) |
| `links.spec.ts` | 17 | 17 | Failed before fix R2-01 (20 temporary redirects) |
| `blog-editor.spec.ts` | 5 | 5 | Failed at 390 before fix R2-05 |
| `flows.spec.ts` (touched) | 1 rerun | 1 | The E2E-01 test was still marked as an expected failure; E2E-01 is fixed, so it now passes as a normal test |

Old addresses, signed in: every path ends where `PARITY.md` says, with one permanent hop, except where noted under "Left as designed". Signed out: every path ends on its public page, on sign in, on a 404, or (file and download routes) on a bare 401. No loops, no 500s.

## Issues found and fixed

**R2-01. Old addresses answered with a temporary redirect (307).** High. `PARITY.md` Part 2: every redirect must be permanent. 16 of the tested old URLs sent a 307: `/details`, `/oyechats`, `/website/enquiries` (with and without `?page=`), `/website/enquiries/leads`, `/website/enquiries/name`, nine `/content/*` paths, and `/login?new=1` or `?plan=` to `/signup`. The same was true of the untested `/content/authors/[id]`, `/content/categories/[id]` and `/content/blog/[id]/preview`. Fix: `permanentRedirect` in the 17 route files under `src/app/(app)/{details,oyechats,website/enquiries,content}` and in the sign-up branch of `src/app/(auth)/login/page.tsx` (the signed-in hop stays temporary). Tests: `src/app/old-paths.test.ts` now also asserts that 28 moved paths use `permanentRedirect` and never `redirect`; `src/app/(app)/enquiries/redirects.test.ts` updated; `links.spec.ts`.

**R2-02. Focus did not move to the first error after a refused submit.** Medium. Plan 60, section 14. Seen on Invite someone and Business profile: focus stayed on the Save button. Fix: `src/ui/field.tsx`. When a field's error appears after it mounted, the field holding the form's first invalid control takes focus, unless focus already sits on an invalid control. Every form built on `Field` gets it. Tests: 3 in `src/ui/form-controls.test.tsx`. Sign-in is left as it is on purpose: it never says which field was wrong, and its one banner is announced (`role="alert"`).

**R2-03. Cmd K or Ctrl K opened search with focus on the Close button.** Medium. Typing went nowhere until a Tab. Fix: `Dialog` in `src/ui/dialog.tsx` takes an optional `initialFocus` ref (passed to Base UI's popup); `src/features/shell/components/command-search.tsx` passes the search box. Tests: `src/features/shell/components/shell.test.tsx` (fails without the fix), `keyboard.spec.ts`.

**R2-04. A save that got no answer took down the Business profile and lost the typed change.** Medium. Plan 60, section 13 ("one failed panel does not take down the page"). With the request dropped, the route's error screen replaced the page. Fix: `src/features/business/components/use-section-form.ts` catches it and shows "We could not save that. Try again." (existing copy) above the form; the change stays. Tests: `business.test.tsx`, `states.spec.ts`. The same gap elsewhere is O-2.

**R2-05. A post published a moment ago read "Scheduled, Goes live" for up to 30 seconds.** Low. Seen at 390. The editor's clock ticks every 30 seconds and was behind the server's publish time. Fix: `src/features/blog/components/post-editor.tsx` floors its clock at the post's last save time. Tests: new `post-editor.test.tsx` (fails without the fix), `blog-editor.spec.ts`.

**R2-06. Author and category editors lost the "leave with unsaved changes" warning.** Low. Parity: the old `author-editor.tsx:177` and `category-editor.tsx:98` had it; the v4 post editor kept it, the other two did not. Fix: `beforeunload` while dirty in `useSaveForm`, `src/features/blog/components/taxonomy-editors.tsx`. Test: new `taxonomy-editors.test.tsx`.

**R2-07. Plan & billing showed nothing when the payment result could not be read.** Medium. A customer back from paying with `?charge=` saw no result and no error. Fix: `src/features/billing/components/billing-screens.tsx` shows `PanelError` for the notices, and the services panel stays. Test: `src/features/billing/states.test.tsx`. New copy: see O-7.

## Left with the owner or the lead

**O-1. Only Business profile has a loading skeleton.** Plan 60, section 13 wants a skeleton shaped like the content under the real header on every data screen. Only `src/app/(app)/business/loading.tsx` exists; there is no `Suspense` anywhere, and `DataTableLoading` and `MetricStripLoading` are unused. Today a client navigation keeps the old page on screen until the new one is ready (tested), and a first load waits for all loaders. Question: add a `loading.tsx` per route, or accept this for launch?

**O-2. A dropped request on most other forms shows the route's error screen and loses what was typed.** 33 client components call server actions; 3 of them handle a request that never gets an answer. R2-04 fixes the Business profile only. Proposal: one small helper next to `src/lib/action-result.ts` that turns a rejected action call into an `ActionResult` failure, then use it at each call site. It touches most features, so it needs your go-ahead.

**O-3. Unsaved changes are lost on an in-app link.** The post editor and SaveBar forms warn only on reload or closing the tab (`beforeunload`), not when a sidebar link is clicked. The old app behaved the same. A confirm on in-app navigation is new UI, so the owner should decide.

**O-4. Home's Book a call button disappears without a word when the booking details fail to load.** `BookCallAction` returns null. Fixing it needs the loader to split what needs no I/O (`canBook`, options) from the booking link.

**O-5. Help & calls shows two identical error banners when its one read fails** (Upcoming and Past calls). It follows the rule (no panel hidden) but reads twice.

**O-6. Panels left out when empty.** The Website Pages panel and tab when the sync found no pages, Social Ads Campaigns with no campaigns, Team "Waiting for a reply" with no invitations, and Enquiries by day drawn as a flat line with no sentence when every day is zero. Plan 60, section 13 ("Partial") allows leaving out a panel that is not yet relevant; owner's call for each.

**O-7. New copy for the copy table:** "We could not load the result of your payment." (the rest is the shared `PanelError` wording). The Business profile save message in R2-04 reuses existing copy.

**D-01. Dev server only: 500s under parallel first compiles.** Turbopack answers "Module ... was instantiated because it was required from module ..." for a request that arrives while another compiles the same route (seen on `/requests`, `/reports`, `/business`, `/website/blog/new`, `/website/blog/authors/new`). It never reproduced with sequential or repeated parallel requests to warm routes. This is the same message `E2E-REVIEW.md` recorded under E2E-02. Check on a production build before treating either as closed.

## Left as designed (no change)

- `/billing/pay` goes to `/checkout/pay`, which answers 404 with the fake provider: that page opens Razorpay's window only. The fake provider has its own confirm pages.
- `/requests?open=<id>` opens the request's sheet over the list (the sheet's own address) instead of redirecting to `/requests/<id>`, as `PARITY.md` suggested. The request opens either way.
- Signed out, the file and download routes (`/media/*`, `/deliverable-images/*`, `/settings/privacy/export`) answer a bare 401 instead of a sign-in page, as their guards intend.
- Dialogs other than search open with focus on their Close button, the first control. That is allowed for dialogs; New request and Invite someone could start on their first field if the owner prefers.
- Kulkarni's business address fields are empty in the seed.

## Not covered

- The affiliate portal (another agent).
- Keyboard use at 390 (only the blog editor ran at both sizes); a screen reader and a real phone (plan 61, section 10, item 4).
- A production build: D-01 and E2E-02 need one.
- Accepting a setup link (it creates an account and a business); the valid link's page is checked, the form is not sent.
