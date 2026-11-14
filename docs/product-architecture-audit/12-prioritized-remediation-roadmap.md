# Prioritized remediation roadmap (proposal)

> **Revision 2026-11-14:** the owner confirmed Social is automated through social-auto with no staff involvement, there is one admin, and Paid Ads is deferred (display only). Where this file disagrees, `18-social-automation-and-revised-scope.md` wins.


Ordering rule: launch risk first (money, data, security, paid delivery), then task completion and staff handoff, then enhancement; within a tier, unblock others first. Sizes: S under 1 day, M 1 to 3 days, L over 3 days, per engineer; they are rough and unvalidated. Nothing here starts until you approve the architecture. Each slice pairs the customer side with its staff side, per prompt 02.

Every slice follows: write the failing test first, change the minimum, run lint, typecheck, unit, integration and build per `CLAUDE.md`, then verify in a browser against the isolated test stack (`13`). No slice is done if the staff counterpart or failed payment path is missing.

## P0: launch blockers

| ID | Slice | Size | Depends on | Files (from evidence) | Acceptance (scenarios in `13`) | Rollout and rollback | Owner decision |
|---|---|---|---|---|---|---|---|
| P0-1 | Independent `ads` entitlement and correct NotBought pitch | M | D7 | `lib/guard-rules.ts`, `db/queries/service-setup.ts`, `features/billing/rules.ts`, `features/start/rules.ts`, `shell/rules.ts`, `app/(app)/ads/page.tsx`, `features/setup/rules.ts`, admin `campaign-actions.ts` | ads-only cannot open Social; social-only sees Ads NotBought with Paid Ads pitch; cancel Social from Social plus Ads closes Social at period end | one release, feature flag optional; revert is a code revert, no data migration | confirm independent lines |
| P0-2 | Align the written pricing rules and copy with the offers that are live (the owner chose to keep them) | S to M | D1 to D3 | `add-ons.ts`, `trial.ts`, `membership.ts`, `social-screens.tsx`, `start/loader.ts`, checkout screen | checkout, start, Plan and billing and marketing show the same price and offers | copy or flag change; revert is trivial; existing yearly or trial subscriptions grandfathered | owner 2026-11-14: keep the live offers; coupons still open |
| P0-3 | Ordinary first payment reconciliation | M | none | `first-payment-check.ts`, `check-first-payments` route, `loader.ts`, `deploy/vps/install.sh` | webhook dropped: payment recorded within 10 minutes, receipt sent, method stored; concurrent delivery test passes | enable timer in production after test; revert by disabling timer | none |
| P0-4 | Confirm or enable production timers (erase, hosting, first-payment, reports) or withdraw promises | S | production access | `deploy/vps/install.sh:449-455` | each timer listed active in production with a last-run time, or copy changed | operational; read-only check first | none |
| P0-5 | Refund flow | M | decision | `staff-payments.ts`, `refund-actions.ts`, payments pages | refund calls the provider (or is labelled manual), issues a credit note and notifies the customer | revert code; test mode first | refund policy |
| P0-6 | Invitee joins inviter's workspace | M | run to confirm | `listing-account.ts`, `business-invites.ts`, `access.ts` | invitee sign up lands in the inviting business with the invited role; no personal business unless asked | code revert; test data cleanup for stray businesses | none |
| P0-7 | Staff owner and queue for Social and Ads delivery | L | P0-1 | admin `today.ts`, `work-actions.ts`, client services tab, `service-setup` reads, `features/social/actions.ts` | new paid Social or Ads appears on Today with setup answers; post approval notifies staff; send for approval notifies customer | additive screens and rows; revert hides them | auto-assign policy |
| P0-8 | Protect the single staff account: prove Cloudflare Access, add a second factor and a strong password rule, confirm destructive actions (the role split is not needed with one account) | M | role decision | `website/actions.ts:54-79`, `staff` access, deployment doc | Access or equivalent is proven in front of the console, a second factor is required, cancel build asks for confirmation | config change for Access and the second factor; revert by config | D30 (protection of the single staff account) |
| P0-9 | Erasure ordering fix and tests | M | none | `account-erasure-run.ts:72,80`, erase route | restore inside the window loses nothing; route test exists | code revert; run only against test DB | none |
| P0-10 | Runtime role assertion and IDOR sample | M | test stack | `packages/db/src/scope.ts`, remaining staff-DB files | boot check refuses a non-`bb_app` customer connection; sampled queries all scoped; cross-tenant negative tests pass | startup check; revert removes it | none |

## P1: task completion, clarity and handoff

| ID | Slice | Size | Depends | Evidence |
|---|---|---|---|---|
| P1-1 | Preview email links the dashboard approval page and describes the real action | S | none | `preview-ready.ts:15-17` |
| P1-2 | Today rows for approved previews, domain moves, past due and lapsed, privacy requests, revisions with own due | M | none | `today.ts:81-164`, `projects.ts:138` |
| P1-3 | Failed-renewal self-serve payment method change and Pay now link to the pay step | L | decision G7 | `payment-emails.ts:164`, `payment-method-request.tsx` |
| P1-4 | One form action hook that catches dropped requests; route `loading.tsx` for main pages | L | none | `use-action-form.ts:20`, 21 `useActionState` files |
| P1-5 | Sign-in returns to the original deep link (generalize `next`) | M | none | `guard-rules.ts:15-21` |
| P1-6 | Navigation: Needs your OK, Website tabs from day one, Checklist and Settings tabs in command search | M | none | `shell/rules.ts`, `website-screen.tsx` |
| P1-7 | Dropped: one staff account does all work (owner, 2026-11-14) | M | P0-8 | `support-staff.ts:103`, `access.ts` |
| P1-8 | Move Social and Ads delivery out of the billing tab; retire the Ads rail item | M | P0-7 | `billing/page.tsx:53-78`, `console-rail.ts:85` |
| P1-9 | Single billing code tree | L | P0-3 tests | `platform/lib/server/*`, `features/checkout/server/*` |
| P1-10 | Decide Social engine: remove the environment switch or give the console control and visibility | M | decision | `social/page.tsx:19-26` |
| P1-11 | Tests: 16 untested admin action files, concurrent webhook delivery, admin Playwright, Playwright in CI | L | stack | `13` |
| P1-12 | Scheduled retry for failed emails; webhook replay | M | none | `deliveries.ts`, `brevo.ts:25` |
| P1-13 | Request detail: one canonical URL | S | none | `rules.ts:277` vs `request-notify.ts:35` |
| P1-14 | Invite page explains expired or used links before Join | S | none | `invite/[token]/page.tsx:20-54` |
| P1-15 | Kickoff call completion prompt: console popup and notification when the call time passes, rename "held" to "Call completed" in staff and customer wording, one place to act, labelled automatic fallback | M | none | calls/kickoff-wrap-up.tsx, clients/[businessId]/call-actions.ts, clients/[businessId]/kickoff-actions.ts, kickoff-sync.ts |

## P2: enhancements

Monitoring as a real service (screen, owner, queue); monthly Social commitments as data and the report built from them; remove retired `search` after a data check; retire dormant admin routes and directory actions; rail counts per role; staff access log completeness (16 audit actions missing from the filter); sign-up code step persisted server side; per-version preview feedback; business switcher for users in several businesses.

## Release gates

A slice ships only when its scenarios in `13` pass at 1440, 768 and 375 pixels in the isolated stack, the integration suite for touched packages passes, and the cross-app event row in `11` shows both sides. Never deploy or mutate production without explicit instruction.

## Order

P0-3 and P0-4 first (read-only checks can start at once), then P0-1 with P0-9, then P0-6, P0-10, P0-7, P0-8, P0-5, with P0-2 as soon as the owner decides.
