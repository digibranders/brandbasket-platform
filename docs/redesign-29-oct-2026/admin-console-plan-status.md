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

## Added in the second pass

| Item | What exists now |
|---|---|
| Kickoff confirmation | Switch `KICKOFF_AUTO_START` (platform env, default `on`, so nothing changes until the owner sets `off`). With `off` a build starts only when staff confirm the call. Today shows "N kickoff calls need an outcome" for calls whose build has not started. See `docs/kickoff-builds.md`. |
| Address check | A "Check the address" button on the Go live panel: DNS, private address refusal, HTTPS fetch. It is a second layer only; Mark live still needs the eight manual checks. |
| Billing and rounds | The Delivery tab shows a notice beside the build when billing is lapsed or past due, and when a build is past its included rounds. Neither changes a stage or charges anything. |
| Clients directory | Each row shows the build stage under the business name, with a Build filter next to the existing Stage filter. |
| Tests | `project-lifecycle.integration.test.ts` (full kickoff-first walk, concurrent actions, tampered business ids, resume exactness). A rehearsal applied migrations 0207 to 0210 on top of a database at 0206 with data; the preview backfill gave exactly one version 1 row. |
| Phone layout | Wide tables scroll inside their own box and header actions wrap, so no staff page I measured at 375 px scrolls sideways. |

## Still not built, and why

- **Replacing the timer for good.** The switch exists, but the default stays `on`. Setting `off` is the owner's call.
- **Automatic deployment verification.** The address check is a reachability test only. It cannot prove a deployment is the approved one, and a hostname that resolves to a mix of public and private addresses is refused. DNS rebinding between the check and the fetch is not fully closed.
- **Monthly Social and SEO commitments.** The catalogue states none as data. The only lists are checkout marketing copy, and no code enforces a limit. The owner must confirm the wording before staff tracking shows it.
- **Decisions with no recommendation in the spec:** payment lapse policy (the notice shows the state only), what counts as an extra revision round (the notice uses the existing counters), who may edit customer notes and deadlines (any staff, with the existing audit log).
- **Finance and system page restyle.** An audit found no page that turns a failed read into an empty state, so nothing was changed there. No restyle was made.
- **List pages that read customer data without writing an access log:** Today, clients, enquiries, calls, projects, requests, outbox, affiliates, coupons, ad credit. Detail pages and exports are logged. Whether list views must also be logged is a compliance decision.
- **Access log for finance.** The spec expected finance to see it; the capability table gives it to admin only.
- **Ad credit** has no role gate, so support can open it.
- **Browser E2E automation and a feature flag for the console.** There is no browser test tooling in the repo. The lifecycle test covers the state machine in the database.
- **Production data rehearsal.** No production data is reachable from here; the rehearsal used sample rows.
- **Customer review history per preview version.**

## Things a reviewer should know

- `setup_call_outcomes` notes are never written by the UI (free text could be personal data, and erasure keeps that table).
- A kickoff-first customer with no domain now gets a free address from the console, but only when `CLIENT_SITE_BASE_DOMAIN` is set for the admin app.
- The eight-column board scrolls sideways. It is not a phone layout.
- The shared dev and test databases have a broken migration history (0194). CI builds from empty and is unaffected.
