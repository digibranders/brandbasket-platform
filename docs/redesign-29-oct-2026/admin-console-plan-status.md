# Admin console revamp: what is built and what is not

Date: 29 October 2026. Branch: `plan-all` (on top of `development`, which already holds PR 78's content). Spec: `BrandBasket_Admin_Console_Revamp_Plan.md`.

Defaults used for the spec's product decisions: the spec's own recommendations where it gave one (D2 yes, D3 builder plus one owner using the existing assignee, D5 each revised preview is a new version, D6 no override exists, D7 manual launch evidence, D13 free address from the console, D14 resume restores the exact stage). Where the spec gave none, nothing was built.

## Built

| Spec area | What exists now |
|---|---|
| P0 kickoff-first compatibility | Status decides next steps; `onboardingSubmittedAt` is history only. Launch and preview read owner and domain before writing. Paused builds keep their customer stage. |
| P1 shared stages | `packages/shared/src/lib/project-stage.ts` (staff names), `project-customer-line.ts` (customer headlines). `submitted` reads "We are preparing your website" to the customer and "Ready to start" to staff. Resume restores the exact stage. |
| P2 Delivery tab | Tab renamed Delivery (same URL). Stage, "Customer sees" and kickoff confirmation lines. Preview history (versions, backfilled). Email failure is an outcome with a Resend email button for previews and launches. Eight manual launch checks gate Mark live. Free address button when a build has no address. |
| P3 Calls | Append-only kickoff outcomes. Wrap-up has Customer did not attend, We did not attend, Call was rescheduled. Builds the timer started are marked "started automatically". Stale copy fixed. |
| P4 board, Today, Clients | Eight board columns. Needs action, Late, On hold, All filters. Today groups by Overdue, Due today, Waiting for someone; a failed list shows a notice, never all clear; failed deliveries appear. Overview says "Start building the website" for `submitted`. |
| P5 feedback | Feedback tickets are linked to projects. The project lists them and the ticket links back. |
| P6 services | Build, hosting, token and OyeChats controls show only for clients who ever had the website. Search title is "Local SEO + AEO". |
| Tests | Unit suites for every package pass; migrations 0207 to 0210 run from empty; new integration tests pass; one full-flow walk on a seeded customer (send, approve, gate refuses, tick, live). |

## Not built, and why

- **Timer still auto-starts builds** after a kickoff ends (spec: keep until a safe replacement). The Delivery tab and Calls page flag those builds as not confirmed by staff. A "staff confirm only" rule is a separate, riskier release.
- **Deployment and DNS verification** is manual evidence only. Nothing in the repo can check a live site, and none was invented.
- **Decisions with no recommendation in the spec** (D9 payment lapse mid-build, D10 revision round counting, D12 who may edit customer notes and deadlines, D11 monthly Social and SEO commitments) are unbuilt.
- **P7 presentation sweep** of finance and system pages: only Today and Deliveries changed. No broad restyle.
- **P8 extras:** no automated browser E2E, no 390 px and keyboard accessibility pass, no feature flag, no snapshot rehearsal on production data.
- **Customer review history** per preview version (customer approving a named version) is not shown to the customer.

## Things a reviewer should know

- `setup_call_outcomes` notes are never written by the UI (free text could be personal data, and erasure keeps that table).
- A kickoff-first customer with no domain now gets a free address from the console, but only when `CLIENT_SITE_BASE_DOMAIN` is set for the admin app.
- The eight-column board scrolls sideways. It is not a phone layout.
- The shared dev and test databases have a broken migration history (0194). CI builds from empty and is unaffected.
