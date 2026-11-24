# R2-11 defects

Found by `apps/customer/playwright.r2.config.ts` on the Next dev server (customer 3312, console 3313) against `origin/development`. No application code was changed. Severity: High = serious accessibility failure or a journey that is wrong for the customer; Medium = layout or wording wrong; Low = observation to check. Screenshot paths are under `docs/implementation/reports/screenshots/`. "Likely file" is a pointer from reading selectors and the code layout, not a confirmed root cause.

Counts: 13 defects. High 11 (D1 to D11), Medium 1 (D12), Low 1 (D13). 41 failing test runs come from D1 to D12; D13 was seen while exploring and has no assertion yet.

## Accessibility: axe (rule `color-contrast`, impact serious, WCAG 1.4.3)

No other axe rule fired on any screen. Each row failed at every viewport listed.

| Id | App | Route | Viewports | Element (selector) | Screenshot | Likely file |
|---|---|---|---|---|---|---|
| D1 | customer | `/signup` | 1440, 768, 390 | Select placeholder text, `.truncate.data-placeholder:text-ink-muted` (the State and Country selects) | `axe-customer-w1440-signup.jpg`, `axe-customer-w390-signup.jpg` | `apps/customer/src/ui/select.tsx` (line 44, placeholder class) |
| D2 | customer | `/start` | 1440, 768, 390 | `.text-accent-gold-text` (gold text on the basket panel) | `axe-customer-w1440-start.jpg`, `axe-customer-w390-start.jpg` | token `accent-gold-text` in `apps/customer/src/styles/tokens.css`, used by the start basket component |
| D3 | customer | `/website` (all three), `/` and `/search` (768 only) | see left | `.h-[42px]` (a 42 px high control with low contrast text) | `axe-customer-w1440-website.jpg`, `axe-customer-w390-website.jpg`, `axe-customer-w768-root.jpg` | `packages/shared/src/ui/patterns/` (`next-action-card.tsx`, `approval-card.tsx` and `prompt-popup.tsx` all use `h-[42px]`) |
| D4 | console | `/payments` | 1440, 768, 390 | `.text-ink-muted.font-sans.font-medium` (summary figure labels) | `axe-console-admin-w1440-payments.jpg` | console figures component in `apps/admin/components/console/` |
| D5 | console | `/invoices` | 1440, 768, 390 | `.text-ink-muted.font-sans.font-medium` (same figure labels) | `axe-console-admin-w1440-invoices.jpg` | same as D4 |
| D6 | console | `/privacy-requests` | 1440, 768, 390 | `.text-ink-muted` | `axe-console-admin-w1440-privacy-requests.jpg` | `apps/admin/app/(protected)/privacy-requests/` |
| D7 | console | `/breaches` | 1440, 768, 390 | `.text-ink-muted` | `axe-console-admin-w1440-breaches.jpg` | `apps/admin/app/(protected)/breaches/` |
| D8 | console | `/leaving` | 1440, 768, 390 | `.text-ink-muted` | `axe-console-admin-w1440-leaving.jpg` | `apps/admin/app/(protected)/leaving/` |
| D9 | console | `/leads/new` | 1440, 768, 390 | `.text-ink-soft/70` (opacity makes the grey too light) | `axe-console-admin-w1440-leads-new.jpg` | `apps/admin/app/(protected)/leads/new/` |

D4 to D9 most likely share one cause: `ink-muted` (and `ink-soft` at 70 percent) on the console's surface colours is below 4.5:1 for small text. Fixing the token for the console (`[data-app="console"]` in `packages/shared/src/styles/theme.css`) may clear all six. `tokens.contrast.test.ts` covers customer token pairs only.

## Keyboard

| Id | Severity | Where | Viewports | Step | Evidence | Likely file |
|---|---|---|---|---|---|---|
| D10 | High | Customer New request dialog (`/requests`), customer Invite someone dialog (`/settings/team`), console refund dialog (`/clients/[id]/billing`) | 1440, 768, 390 (customer New request passed once at 768, so it is intermittent there) | Open by keyboard, press Tab: focus leaves the dialog, passes a focus guard and lands on the page behind ("Skip to content"), then comes back. Escape and focus return work. | Probe log: Tab 1 to 4 stay in the dialog (field, Editor, Cancel, Send invitation), Tab 5 is the guard, Tab 6 is `body`, Tab 7 is "Skip to content". Failing step: `focus stays in the dialog` in `a11y.spec.ts` and `admin/e2e/a11y.spec.ts`. Screenshot of the console dialog open: `console-refund-dialog-admin-w1440.jpg` | `apps/customer/src/ui/dialog.tsx` and the shared `ConfirmDialog` in `packages/shared/src/ui/patterns/confirm-dialog.tsx` (Base UI Dialog modal and focus manager settings). Re-check on a production build before fixing: the check ignores the Next dev overlay, but dev mode is the only place it was measured. |

## Journeys

| Id | Severity | Journey | Viewports | Step | Expected | Actual | Screenshot | Likely file |
|---|---|---|---|---|---|---|---|---|
| D11 | High | Social-only (doc 19 phases 6.3 and 9.2) | 1440, 768, 390 | Open `/` as a business that bought Social only | No setup call for Social, no Website service card | Home shows "Book your kickoff call" ("30 minutes on video. We go through your business and plan your social media with you.") and a Website card marked Active. In this environment the times fail to load because no booking link is set. | `fail-w1440-Home-and-social-show-setup-states-not-a-.jpg`, `fail-w390-Home-and-social-show-setup-states-not-a-.jpg` | Home next step and service cards in `apps/customer/src/features/` (home loader and kickoff card) |
| D12 | Medium | Console client workspace | 390 | Open a client from Clients | No sideways scroll | Page is 19 px wider than the viewport | `fail-console-admin-w390-a-client-workspace-opens-from-Clients-an.jpg` | `apps/admin/app/(protected)/clients/[businessId]/` layout or its tab strip |
| D13 | Low | Website kickoff state, before any booking | observed at 1440 during exploration, not asserted | Open `/website` for a paid Website business that never booked | Next step says to book the call | Said "Kickoff call booked: Thursday, 14 November at 3:30 PM", a date before the sign-up day (16 November), while Home on the same account said the times could not load. Cause not confirmed; could depend on the missing booking link. | none | `apps/customer/src/features/website/` kickoff section |

## Not defects, but things the run learned

- The sign-up form needs `ACCOUNT_CODE_SECRET` and `pnpm env:init` does not write one. Without it sign-up shows "We could not load this page". Add it to `scripts/init-local-env.ts` (outside this package's allowed files).
- The Next dev overlay adds a focus stop and an "Issue" toast on every page; the keyboard helper skips it.
- Journey scenarios not automated: payment lapse and restore, privacy and account closure, Social connect and post flows (need the social-auto service), kickoff "Call completed" popup (`test.fixme`, waits for the notifications session).
