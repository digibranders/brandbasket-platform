# Affiliate portal review (customer app v4)

Date: 3 Nov 2026. Scope: `/affiliate` and `/affiliate/setup/[token]` in `apps/customer` (`src/features/affiliate/**`,
`src/app/affiliate/**`), against plan 60 (sections 9, 10, 12, 13, 15), plan 61 (route row and section 9), PARITY (affiliate)
and the old app (`apps/platform/app/app-host/affiliate/**`, `lib/affiliate-dashboard.ts`, `lib/server/affiliate-*.ts`).

## Seed

`packages/db/scripts/seed-v4-states.ts` (`pnpm --filter @brandbasket/db db:seed:v4`) now also makes, through the same
query helpers the console and the payment path use:

- **Rohan Mehta**, `affiliate+seed-v4@example.test` (password in `local-test-logins.txt`). Reward 10% of each payment for
  a member's first 12 paid months.
- Codes: `MEHTA300` (₹300 off for 3 months, Live), `MEHTA-FRIENDS` (10% off every month, 1 use, Fully used),
  `MEHTA-DIWALI` (expired 20 days ago).
- Members: Sharma Dental Care (active, 6 paid months), Gupta Hardware Store (active, month 3 refunded so its earning is
  cancelled), Nair Yoga Studio (cancelled after 2 months), Bose Sweets (renewal failed, past due).
- Earnings from late May to 31 Oct, written by `activateFirstPayment` / `activateRenewalPayment`; one payout
  (`UPI 431907652218`, 17 Sep) that settled everything owed before then, with 2% TDS withheld.
- **Kavita Rao**, `affiliate+pending-seed-v4@example.test`, with an open setup link. The link's path goes in the logins
  file; a re-run keeps a link that is still open and opens a new one when it has lapsed.

Re-runs are safe (checked by running it twice). Two related seed changes: earnings take their payment's date
(`created_at`), since the seed pays past months today; and the tax-invoice check on the five state businesses is now
"at least", because the e2e flows add invoices to them and a re-run used to stop there.

## What was checked

- Dashboard and setup page walked with Playwright at 1440 and 390: screenshots read, axe (WCAG 2.2 A and AA, serious and
  critical), sideways scroll at 390, keyboard (skip link, copy button by Enter), clipboard content.
- Design system: tokens only, one primary action per state (setup: the submit button; dashboard: none, it is read only),
  tables over cards, metric strip, badges with words, money through `formatMoney`, dates through `formatDate`.
- States: per-panel error (`PanelData`), empty states in the old words, no-activity month window hidden, payouts hidden
  when there are none; loading and route error states (were missing, see below).
- Old behaviour: code status precedence (Paused, Expired, Fully used, Live), "Month n of m", money per currency
  ("₹4,200 + $12"), India-time months, member count past the old 500 cap, three setup modes, Turnstile action name and
  order (robot check before form parsing), Terms tick only for a new account, `force-dynamic` and `no-referrer`.

## Issues found and fixed

| # | Issue | Fix | Test |
|---|---|---|---|
| 1 | The affiliate frame had no skip link and its `main` could not take focus (plan 60 section 15) | Skip link and `tabIndex={-1}` on `main`, as in the app shell | e2e: Tab reaches "Skip to content", Enter moves focus to `main` |
| 2 | A customer who is also an affiliate got the stripped affiliate frame, with no way back to their workspace; a closing account was not sent to restore it (PARITY affiliate 4 and 5) | The layout renders the customer `AppShell` for a member with a workspace, redirects a closing account to `/restore-account`, and keeps the stripped frame for affiliates with no workspace (and unpaid sign-ups) | Typecheck; not walked (no seeded user is both) |
| 3 | Member total counted subscriptions, so a business whose code carried onto a reactivated or kept plan counted twice, and "paying" read an old plan | `membersOf` counts businesses, by each one's latest plan | `members.test.ts` |
| 4 | Earning dates were hidden on phones, so amounts showed with no date (plan 61 section 9: numbers carry their date) | Date and code on a line under "Month n of m", at every width; the separate Date column is gone | `affiliate-dashboard.test.tsx`, e2e |
| 5 | Month rows had no year, so a window across a year end read "Dec" for last December | Months of another year read "Dec 2025" | `dashboard.test.ts` |
| 6 | Counts were raw numbers (codes' members, monthly members and refunds) | `formatNumber` (en-IN grouping) | `affiliate-dashboard.test.tsx` |
| 7 | The monthly "Refunded" column was a count beside money columns, with no unit | Header "Refunded payments" (needs the owner's yes) | `affiliate-dashboard.test.tsx` |
| 8 | Three "Copy code" buttons with the same name in one table | Named "Copy code MEHTA300" (visible text unchanged, so no label mismatch) | unit and e2e |
| 9 | A reward of nothing read "You earn Nothing, every paid month" | `rewardLine` lower-cases the shared word mid-sentence | `dashboard.test.ts` |
| 10 | Payouts at 390 squeezed three columns | Reference hidden on phones (Date and Received stay) | e2e axe and overflow at 390 |
| 11 | No loading state (a slow read left the old page up with nothing busy) and no error boundary for the route group | `(portal)/loading.tsx` (panel skeletons), `(portal)/error.tsx` and `setup/[token]/error.tsx` (shared `RouteError`) | e2e |

Checked and fine: code status order, "Month n of m", per-currency money and the "₹0" empty figure, India-time month window,
withheld and "cancelled after a refund" rows only when present, setup modes and their labels, Terms tick unticked by
default and required only for a new account, focus moves to the field to fix (the Terms box included: Base UI passes
focus from its hidden input to the box), dead link page, Turnstile action `affiliate_setup` before parsing, axe clean at
both widths, no sideways scroll at 390.

## Tests added

- `e2e/affiliate.spec.ts`: signed-out redirect; dashboard (codes and statuses, figures, cash-out rows, six month rows,
  earnings with "Month n of 12" and dates, payout with TDS, copy by keyboard and clipboard text, skip link, axe and
  screenshots at 1440 and 390); dead setup link; new-affiliate setup link (prefilled name, unticked Terms, submitting
  without the tick shows the message, focuses the box and keeps the link open). It signs in itself and saves
  `e2e/.auth/affiliate.json`, so it does not touch `accounts.ts` or `auth.setup.ts`. A missing seed or a used setup link
  skips with the reason.
- `affiliate-setup-form.test.tsx` (new): the three modes, focus on the Terms box, switch to the existing-account step, axe.
- Added cases in `members.test.ts`, `dashboard.test.ts`, `affiliate-dashboard.test.tsx`.

Results: `pnpm --filter @brandbasket/customer typecheck` pass, `lint` pass, `test` 219 files and 2,559 tests pass;
`pnpm --filter @brandbasket/db typecheck` pass; `playwright test e2e/affiliate.spec.ts --project=desktop` 4 of 4 pass.

## Left

- **Owner question:** the setup page uses the sign-up frame, so an affiliate opening their link reads "Sign up. Book your
  call. Send your details. We build your website." beside the form. Plan 60's Entry template says "plain brand panel".
  Should the affiliate setup page get the plain brand panel instead?
- **Lead or shell owner:** a customer who is also an affiliate has no link to `/affiliate` in the v4 sidebar or account
  menu (the old rail had "Affiliate"). Plan 60 section 9 does not list one; `features/shell` is outside this task.
- Not walked in the browser: the both-roles frame (no seeded user is both), "Try this link again soon" (needs 60 lookups
  from one network), the link-existing and new-password modes, and a completed setup (it would use up the seeded link).
  All are covered by unit tests.
- The member count still re-reads the member list with a doubling limit (the documented shortcut in `rules/members.ts`).
  A count query in `packages/db` would replace it.
- At 390 the payout date wraps onto two lines ("Thu 17" / "Sep"). Readable; not changed.

## New UI words for owner approval

| Where | Words |
|---|---|
| By month table, column | `Refunded payments` (was `Refunded`) |
| Earnings table, line under "Month n of m" | `{date}, {code}`, for example `Sat 31 Oct, MEHTA300` |
| Copy button, screen reader name | `Copy code {code}`, `Copied {code}` |
| Affiliate frame | `Skip to content` (same as the app shell) |

## Screenshots

Written by the e2e run to `apps/customer/e2e/screens/affiliate/` (git-ignored): `dashboard-1440.png`, `dashboard-390.png`,
`setup-create-1440.png`, `setup-create-390.png`, `setup-dead-1440.png`, `setup-dead-390.png`.
