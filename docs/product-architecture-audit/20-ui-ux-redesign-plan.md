# UI and UX redesign plan around the end to end journey

Status: PLAN for approval. Nothing here is designed or built yet. The flow it designs for is `19-end-to-end-user-journey.md`; the decisions it respects are in `14`.

## 1. The constraint that shapes the plan

Usage read on 2026-11-14 (Ultra plan): the weekly limit for all models is **95 percent used** and resets in about 15 hours (2026-11-15 00:00 UTC, 05:30 India time). This session's context is 56 percent full (about 556,000 of 1,000,000 tokens), so every extra message here is expensive. A "Fable" weekly bucket shows 0 percent, but it is not known whether work on that model also counts against the all-models limit, so do not plan around it.

What that means:
- Do no large design or build work in this session. Spend what is left on writing this plan.
- Start each phase below in a **fresh session** with a short brief (section 6). The audit docs hold the state, so nothing is lost, and each session starts with a small context.
- Plan for roughly 8 to 10 focused sessions, not one marathon.

## 2. Principles

1. **Design patterns once, then apply them.** The journey has about 60 steps but only about 12 repeating screen patterns (section 4). Design each pattern once in a static mock, then apply it to every route that uses it.
2. **No new visual style.** Reuse the existing systems: `docs/customer-app-v4/60-customer-app-v4-design-system.md` (402 lines), `apps/admin/DESIGN.md` (102 lines), `apps/customer/DESIGN.md`, the shared components in `packages/shared/src/ui` (panel, forms, icons) and the v4 mock `docs/customer-app-v4/mock/customer-app-v4-mock.html`. Project rules outrank any generic design skill. Light theme only, design tokens only, no em or en dashes in copy, new copy goes to the owner first.
3. **Mock first, code second.** Each phase produces a static HTML mock (cheap to make and to review). Code starts only after you approve the mock.
4. **Vertical slices.** Each slice pairs a customer screen with its staff counterpart and its message, so the two apps never drift apart again.
5. **Journey fixes before polish.** The P0 and P1 items in `12` change behavior (money, entitlement, workflow). Build those first where a screen depends on them; the redesign then paints a flow that actually works.

## 3. Cost control rules

| Rule | Why |
|---|---|
| Fresh session per phase, brief under 1 page | Keeps context small and cheap |
| Haiku for mechanical work: copy swaps, moving routes, updating tests, renaming, applying a finished pattern to many screens | Cheapest model for work with no design judgment |
| Sonnet for design, new logic, billing and state changes, reviews | Where mistakes are costly |
| One static mock per phase, reviewed by you before code | Avoids rebuilding screens |
| Read only the files a phase names; no whole-repo exploration | Exploration is already done in the audit |
| Prefer text and accessibility snapshots over screenshots; screenshots only at gates | Images are expensive |
| Batch independent work in parallel agents (one per route group) | Fewer round trips |
| Run lint, typecheck, tests and build once per slice, not per edit | Saves time and tokens |
| No re-auditing: trust `02`, `03`, `19` unless a file changed | Do not repeat what is written |

## 4. The patterns to design (about 12)

| # | Pattern | Used by journey phases |
|---|---|---|
| P1 | Next action card (Home: one task per service, in priority order) | 6, 10 |
| P2 | Status timeline with plain words (Website build, Social batch, payment) | 5, 7, 8 |
| P3 | Needs your OK list (preview, picture approvals, quotes), also feeds the bell | 7, 8, 11 |
| P4 | Guided setup (connect accounts, confirm website, first batch) | 6, 8 |
| P5 | Approval card (approve, ask for a change, undo) | 7, 8 |
| P6 | Request thread with quote and pay | 11 |
| P7 | Billing panel (plan, services, renewal, failed payment, add or cancel a service) | 5, 12 |
| P8 | Empty, loading and error states with a recovery action | all |
| P9 | Console Today list: one list, late first, one action per row | 6 to 13 |
| P10 | Console popup and notification prompt (the "Call completed" kickoff prompt, generalized for any "did this happen?" task) | 7, 12 |
| P11 | Console client workspace: one page with a tab per service, customer's status mirrored | 6 to 13 |
| P12 | Confirmation dialog for destructive actions (cancel build, refund, close account) | 7, 12, 13 |

Shared vocabulary decided so far: "Call completed" (not "held"); the three kickoff customer messages in D31; "we have started" message when staff begin work.

## 5. Phases

Each phase ends with a mock you approve, then the build. "Sessions" are fresh sessions.

| Phase | Covers (journey phase in `19`) | Design output | Build | Sessions | Model split |
|---|---|---|---|---|---|
| 0 Foundation | Patterns P1 to P12, vocabulary, navigation | One pattern sheet mock and a short rules page | none | 1 | Sonnet |
| 1 Entry to first task (customer) | 2 to 6: sign up, questions, basket, pay, welcome, first task | Mock of the 8 screens with the real states (waiting, failed, unpaid lock-in fixed) | Slice per screen group | 2 | Sonnet design, Haiku apply |
| 2 Console shell, Today, popup (staff) | 6, 7.1, 12 | Today list, kickoff popup, notification, client workspace tabs | Console shell and Today first | 2 | Sonnet |
| 3 Website track, both sides | 7 | `/website` states and console Website tab | Preview email link fix, approvals, status lines | 1 to 2 | Sonnet logic, Haiku copy |
| 4 Social track (social-auto) | 8 | Guided setup, approvals, reconnect notice, failure states | Receive social-auto events, notifications, lifecycle link | 2 | Sonnet |
| 5 Monthly cycle, billing, team | 10, 11, 12 | Requests, quotes, billing panel, failed payment, invitee landing | Billing panel, invite fix, reminders | 2 | Sonnet |
| 6 Account and leaving | 13 | Delete, restore, privacy, compliance in the console | Small | 1 | Haiku |

Order: 0, then 1 and 2 (they unblock everything), then 3 and 4, then 5 and 6. Paid Ads is display only and is not designed until its workflow exists.

## 6. The brief for each fresh session (copy this)

```
Project: BrandBasket platform, repo brandbasket-platform, branch development.
Task: design phase <N> of the UI redesign, then wait for my approval before any code.
Read first: docs/product-architecture-audit/19-end-to-end-user-journey.md (phases <list>),
20-ui-ux-redesign-plan.md (this plan), 14-open-questions-and-product-decisions.md (decisions),
and only the design system files named in section 2.
Rules: reuse existing tokens and components, light theme only, no em or en dashes,
new copy goes to me first, one static HTML mock per phase under docs/design/redesign/,
no application code until I approve. Use Haiku for mechanical work and Sonnet for design.
Routes in scope: <rows from 02 and 03>.
Output: the mock, a screen list with states, and open questions.
```

## 7. What to do in the next 15 hours

1. Do not start heavy work in this session.
2. Review `19` and answer the open questions in it (they decide wording in the mocks).
3. After the reset (05:30 India time), open a fresh session and paste the brief for Phase 0.
4. Before each session, check usage: if the weekly figure is above about 80 percent, run only Haiku work or wait.
