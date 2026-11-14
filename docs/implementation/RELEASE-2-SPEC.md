# Release 2 spec: redesign of the customer app and staff console

Status: DRAFT for owner review. Start only after Release 1 (PR #183, development into main) is merged and deployed. Journey source of truth: `docs/product-architecture-audit/19-end-to-end-user-journey.md` and `21`. Decisions: `14`. Visual inspiration: ChatGPT-generated images in `docs/design/redesign/` (inspiration only, never exact). Reviewed mock: `docs/design/redesign/mock-home.html`.

## 1. Goals

1. Every screen in the journey has one clear job, one main action and a plain status.
2. The customer always sees what to do next, what needs their OK, and what BrandBasket is doing.
3. The console is built for one person: one list, late first, one action per row.
4. The two apps use the same BrandBasket brand as the website.
5. No behaviour change in billing, access or data. Release 2 changes structure, wording and look, on top of Release 1 logic.

## 2. Brand decision (needs owner confirmation first)

The website brand is warm: ink `#15161A`, rattan gold `#C48A47` (text `#A46C2F`, wash `#F4E6D3`, deep `#8A5524`), paper `#F6F5F2`, sunken `#EEECE7`, line `#E3E0D9`, sage `#4F7A63`, error `#B42318`, with Red Hat Display, Text and Mono. The customer app today uses blue `#1E65E3` and Geist. Release 2 moves the customer app to the website brand: near-black primary buttons, gold as the accent, no blue. The console already uses the warm palette.

Implementation: change the token values in `apps/customer/src/styles/tokens.css` (and the Tailwind aliases) rather than touching components, so one change re-themes the app. Update `apps/customer/DESIGN.md` and `docs/customer-app-v4/60-customer-app-v4-design-system.md` in the same change, and run `tokens.contrast.test.ts`. Light theme only. Contrast must stay AA: gold text on white uses `#A46C2F` or darker, never `#C48A47`.

## 3. Principles for every screen

- One main action. The primary button is near-black; everything else is secondary.
- Gold is the accent, used for the selected nav item, the "Next step" label, step numbers, progress fills, counts. Not for large areas.
- Plain words from the journey doc. Sentence case. No em or en dashes. New copy is approved by the owner before it ships.
- Every list has a real empty state, a loading skeleton, an error with a recovery action, and a permission state (viewer: "Ask your owner to do this").
- Existing components first (`@/ui`, `packages/shared/src/ui`). Icons only through `<Icon name="..." />`. No new libraries.
- Phone first: 390 wide works, 44px controls, bottom tab bar as today.

## 4. Information architecture (customer app)

Keep the sidebar labels: Home, Enquiries, Requests, Services (Website, Social media, Paid Ads), Business (Reports, Business profile), Plan & billing, Settings, Help & calls. New in Release 2: a **"Needs your OK"** list that collects preview approvals, post pictures and quotes, reachable from Home and the bell. It is a section on Home plus the bell dropdown, not a new sidebar item.

## 5. Screen specs (customer app)

| Screen | Release 2 change |
|---|---|
| Home | One "Next step" card per service in priority order, status lines, "Needs your OK" list, latest report for live customers. See the mock |
| Website | State header with timeline (booked, building, preview, live). Kickoff wording from D31. Preview with Approve and go live. Tabs Overview, Pages, Blog, Domain visible from day one with explanations before launch |
| Social | Guided setup list, then calendar, approvals strip, per-channel automatic posting with consent, banner for Reconnect Instagram, failure notices. Brand and layout moved onto the design system |
| Paid Ads | Information page with "Coming soon" and Add to plan |
| Requests | List with status chips; request page with thread, quote card, stepper. One canonical URL |
| Plan & billing | Services, next payment, invoices, failed payment banner with Pay now, lapsed state with Reactivate, cancel confirmation |
| Sign up, intake, checkout | Panel follows the chosen service; unpaid customer can reach Help and Settings; offer rows clear |
| Settings family | One tabbed pattern: Profile, Security, Notifications, Team, Privacy, Delete |
| Account pages | Sign in, forgot and reset password, invite (states shown before Join), setup link, restore |
| Reports, Business, Enquiries, Help | Same list, detail and empty patterns |

## 6. Console specs

| Screen | Release 2 change |
|---|---|
| Today | One list, late first, one action per row, rows for every journey exception; four figures; systems block |
| Kickoff popup | Release 1 builds the logic. Release 2 restyles it and adds the generalised prompt component |
| Client workspace | Header with services, tabs per service, "What the customer sees" panel, next step, timeline. Website pipeline hidden when no website |
| Rail | Today, Clients, Inbox, Calls, Money, Compliance, System. Remove the dormant Ads item and retired routes |
| Money, Compliance, System | List and detail pattern, refund dialog, privacy and breach timers on Today |

## 7. Shared patterns to build once

`NextActionCard`, `StatusTimeline`, `NeedsYourOkList`, `ApprovalCard`, `ConfirmDialog`, `PromptPopup`, `EmptyState`, `ErrorState`, `StatusBadge`, `SettingsTabs`. Each has unit tests (render, props, keyboard), lives in `packages/shared/src/ui/patterns/`, and has an entry in `/design-system`.

## 8. Work packages

| WP | Scope | Depends on |
|---|---|---|
| R2-00 | Brand tokens swap, fonts (Red Hat), DESIGN.md updates, contrast test | owner approval of section 2 |
| R2-01 | Shared patterns (section 7) | R2-00 |
| R2-02 | Home, Needs your OK and the bell | R2-01 |
| R2-03 | Website screens | R2-01 |
| R2-04 | Social screens, rename `legacy-social` | R2-01, social events from Release 1c |
| R2-05 | Plan & billing, checkout, sign up, intake | R2-01 |
| R2-06 | Requests, Reports, Business, Enquiries, Help | R2-01 |
| R2-07 | Settings family and account pages | R2-01 |
| R2-08 | Console shell, Today, workspace, rail cleanup | R2-01 |
| R2-09 | Console Money, Compliance, System | R2-08 |
| R2-10 | Forms never lose work, loading and error states across both apps | R2-01 |
| R2-11 | Playwright journeys at 1440, 768 and 390 pixels, accessibility sweep with axe, keyboard pass | all |

Order: R2-00 and R2-01 first and alone. Then R2-02 to R2-08 in parallel (separate worktrees). Then R2-09 to R2-11.

## 9. Acceptance for every package

- Matches the approved mock for its screen, using tokens and components, not copied image styles.
- All states present: loading, empty, error, permission, success.
- No behaviour change: existing unit and integration tests pass untouched, plus new tests for the new components.
- AA contrast, visible focus, keyboard operable, reduced motion respected.
- Journey check: the screen matches its row in `19`.
- Report in `docs/implementation/reports/R2-NN.md` with screenshots at 1440 and 390, commands run and results, new copy for owner approval.
- `pnpm lint`, `typecheck`, `test`, `build` green (and `test:integration` where the data layer is touched).

## 10. Risks

- Re-theming touches every screen: do R2-00 on its own and verify visually before parallel work.
- `steve` is changing Social screens: agree areas before R2-04.
- Generated images contain wrong wording and spacing: use them for ideas only.
- Release 1 must be in `main` first, so Release 2 builds on its logic.

## 11. Owner decisions needed

1. Approve the brand change in section 2.
2. Approve the Home mock, then the other screen mocks one by one.
3. Confirm the Release 2 order, and whether Social events (WP-15a, 15b) ship before R2-04.
