# R2-14: Merge main into development for Release 2

Branch `r2/14-merge-main`, cut from `origin/development` (2f6bd0f4), then `git merge origin/main`.

## Why it conflicted

`main` holds four squash commits that `development` lacks as commits: 7c02f21d (#185), 886c220d (#197), 465556e0 (#199) and ac218bff (#201, a duplicate of #200 already in `development`). Their content reached `development` through the individual pull requests and was then reworked by the Release 2 redesign, so git saw both sides editing the same lines.

## Result

After resolving every conflict the merged tree is identical to `origin/development`. Nothing on the main side was behaviour that `development` lacks. The merge commit only records main's history, so the release PR from `development` to `main` becomes mergeable.

Every test name added on main since the merge base was searched for in the merged tree. All are present except one, noted under `states.test.tsx`.

## Conflicted files and resolutions

Shared patterns (add/add, `packages/shared/src/ui/patterns/`). Main carries the first Release 2 version of each file. `development` has the finished one. Kept the `development` version of all nine:

- `approval-card.tsx`, `confirm-dialog.tsx`, `error-state.tsx`, `needs-your-ok-list.tsx`, `next-action-card.tsx`, `prompt-popup.tsx`: main used the raw `text-white` on dark buttons; `development` uses the `text-on-primary` token. Token version kept.
- `settings-tabs.tsx`: main has the plain tab bar. `development` adds page-link tabs with `aria-current`, a danger tone and a router link component. Kept `development`; nothing on main was lost.
- `stat-tile.tsx`: main has the bare tile. `development` adds `note`, tones and a medium size. Kept `development`.
- `patterns.test.ts`: main lacks the StatTile tone test and the SettingsTabs page-link test that `development` has. Kept `development`.

Customer app:

- `src/styles/tokens.css`: one line. Gold text is `#8A5524` on `development` (contrast fix) and `#A46C2F` on main. Kept `#8A5524`.
- `DESIGN.md`: same palette line, same value. Kept `#8A5524`.
- `billing/components/invoices-table.tsx`, `reactivate-card.tsx`, `services-panel.tsx`, `website/domain/components/connect-domain.tsx`: import line only. Main imports `useActionState`; `development` uses `useGuardedActionState` throughout the body (R2-10 forms that keep typed input). Kept the guarded hook. The ErrorState use in `connect-domain.tsx` from main merged cleanly and is present.
- `start/components/start-screen.tsx`: import line only. Main imports `PLAN_ADD_ON_IDS`; `development` imports `SOLD_PLAN_ADD_ON_IDS` (Paid Ads hidden for now, commit 2f6bd0f4). Kept `SOLD_PLAN_ADD_ON_IDS`, which the body already uses.
- `website/components/website-screen.tsx` (three hunks): main hardcodes a sample kickoff line, "Kickoff call booked: Thursday, 14 November at 3:30 PM...", as a constant and as the fallback text, and always titles the card "Kickoff call booked". `development` removed the sample date and shows the real line and title (`view.line ?? view.title`, title switches on whether a time exists). Kept `development`. The real kickoff behaviour from main (booked time window, Join kickoff call button when there is a meeting link, See your kickoff fallback) is present and its test passes.
- `website/components/states.test.tsx`: main's test "renders kickoff state with exact D31 wording and 4-stage stepper" asserts the hardcoded sample date. `development` replaced it with "renders the kickoff state with the real line, never a sample date, and the 4-stage stepper". Kept `development`. This is the only main test not carried over by name, and it is superseded on purpose. Main's other new tests in this file (Join kickoff call, preview, live, DNS error) are present.

## Checks (run in the worktree)

- `pnpm install --frozen-lockfile`: clean
- `pnpm lint`: clean
- `pnpm typecheck`: clean
- `pnpm test`: admin 2033 passed, customer 4473 passed
- `pnpm build`: both apps built
- `pnpm test:integration`: all passed (auth 26, db 2023, 4, shared 286, customer 74 tests)

Integration used its own databases `brandbasket_platform_r214`, `_r214_payload` and `_r214_test`, no `db:roles`, shared role passwords untouched, ports 3412 and 3413 (not started), and the generated env files were deleted afterwards.
