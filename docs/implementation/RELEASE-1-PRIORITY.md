# Release 1: the journey release (final scope, owner priority 2026-11-14)

This file overrides the wave order in `WORK-PACKAGES.md`. Goal: release the main user journey fixed and safe, as fast as possible. UI and redesign wait for Release 2. Release 1 keeps the existing look: reuse existing components, add no UI library.

## Packages in Release 1 (all start now, in parallel, one agent each)

Priority order if time runs short: top of the list is protected last to cut.

| # | WP | Scope |
|---|---|---|
| 1 | WP-01 | Recover every lost first payment (job and page load), record the payment method |
| 2 | WP-02 | Invitee joins the inviter's workspace; invite page explains expired, used and wrong-address before Join |
| 3 | WP-10 (small) | Unpaid customer can open Help, Settings, Sign out; sign-up panel wording follows chosen services; one reminder email after 1 day for abandoned sign-ups |
| 4 | WP-13 (small) | Preview email links to `/website`; kickoff status wording; Today rows for approved previews and domain moves |
| 5 | WP-14 | Kickoff "Call completed" prompt: console popup and notification, one place to act, 24 hour labelled fallback, new wording. Build the popup locally, no UI library |
| 6 | WP-17 (small) | Return to the original link after sign-in (safe same-origin list); request acknowledgement email; one request URL |
| 7 | WP-16 (small) | Failed-payment email links to the pay step; self-serve card change; Today rows for past due and lapsed; reminder before the first full charge after the ₹1 month |
| 8 | WP-05 | Erasure ordering fix and route test |
| 9 | WP-06 | Start-up database role check; cross-tenant tests |
| 10 | WP-03 | Cloudflare Access check behind a flag; confirm before destructive actions (small local dialog) |
| 11 | WP-04 | Refund flow. If late, ship without it and keep refunds manual |

Not in Release 1: WP-00, WP-11, WP-12, WP-15a, WP-15b, WP-15c, WP-18, WP-19, WP-20, WP-21, WP-22. Pull WP-15a in only if the owner says Social is live for paying customers.

## Rules for speed

- No waiting for waves. Launch all packages at once in separate worktrees (`../bb-wpNN`, branch `wp/NN-name`).
- Migrations: WP-04, WP-10 and WP-14 may add one. Merge those one at a time: rebase, delete your generated migration, regenerate, run `pnpm db:migrate:test` and the integration tests, then merge.
- Shared files (`features/shell/rules.ts`, `lib/guard-rules.ts`, billing and checkout, `apps/admin/lib/server/today.ts`): keep edits small, rebase often.
- One gate at the end: after everything is merged into `development`, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`. All green, then the release pull request.
- Each agent still writes `docs/implementation/reports/WP-NN.md` (changed files, tests, commands run, open questions, new copy for owner approval). No report, no merge.
- New customer or staff copy: use the wording in the spec; list it in the report.
- If a decision is open, use these defaults: lapse policy 7 days grace, hosting paused at 14 days, data kept 30 days; refunds by finance through the provider with a credit note.

## Owner actions (not for agents)

1. Enable the four production timers on the VPS (erase, site hosting, first-payment check, monthly reports) and confirm a recent run.
2. Confirm Cloudflare Access is in front of the console.
3. Approve the new copy in the reports.
4. Approve the release pull request `development` into `main` and the deploy.
