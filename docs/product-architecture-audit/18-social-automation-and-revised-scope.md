# Social automation and the revised scope (owner direction, 2026-11-14)

This document changes parts of the earlier audit. It is based on reading the `social-auto` repository (`digibranders/social-auto`, commit `c6d0e44`, read only, cloned to a scratch folder and not kept) and the Brandbasket code that calls it. Where it conflicts with `00` to `17`, this document wins; those files carry a revision note.

## 1. What the owner said

1. Social Media Management is automated through `social.digibranders.com` (the social-auto server). Setup, account connection and management happen in the customer app.
2. There is one admin, and the admin does not interfere in Social.
3. Paid Ads is ignored for now. It is only a page for display. How it will work will be decided when it is developed.
4. Customers are messaged when staff start work (applies to Website).
5. Social and Ads have no setup call.

## 2. How social-auto actually works (verified in its code and docs)

| Piece | What it does |
|---|---|
| Content engine (`scheduler/engine`) | Reads the customer's website, writes a month of posts with AI, draws the posters |
| Publisher (`publisher`) | Posts to Instagram, Facebook, LinkedIn and Google at the scheduled time, keeps connections and renews tokens, sends push alerts, and serves the product API |
| Dashboard (`dashboard`) | Private staff web app: clients, channels, calendar, edits, connect links |
| Product API | Brandbasket's server calls it with its own key, one workspace per customer brand (`externalId` is the Brandbasket business id) |

The customer journey inside it (product API):
1. A workspace is created for the business.
2. The customer opens a connect link (valid 1 hour) and presses Allow for each network.
3. A write job reads her website and writes the posts (limits: 3 batches a day, 10 a month).
4. She keeps or drops facts and topics, asks for pictures (7 a week per channel), and approves each picture. Only approved pictures are posted.
5. Optionally she turns on automatic posting per channel with consent, so approvals happen by the system (she is told and can take a post back before it goes out).
6. She sets the weekdays each channel posts on. The publisher posts daily. She can edit, delete or send a post now before it goes out.
7. A daily job collects the networks' numbers (analytics).
8. Events (`post.published`, `post.failed`, `connection.expiring`, `poster.ready`, `poster.auto_approved`, `week.lapsed` and others) are sent to the product by signed webhook, kept 14 days and retried 6 times.

The single admin works in the social-auto dashboard and receives push alerts (failed posts, expiring connections). Nothing in the product requires a Brandbasket staff member to plan, send or publish a post.

## 3. What this changes in the audit

| Earlier finding or plan | Change |
|---|---|
| Social journey with staff planning posts, "send for approval", staff publishing (`04`, `05`, `16` stage D) | The staff-deliverables path in Brandbasket (the version shown when the two social-auto settings are blank) is the manual path and is retired as the product. The automated social-auto flow is the product |
| Finding 6: paid Social work has no staff owner or queue | Resolved by design: there is no Social staff work. The remaining need is monitoring by the one admin (see section 5) |
| Finding 15 and decision D16: two Social engines | Decided: social-auto is the engine. The code calls it "legacy-social", which is the reverse of the truth; rename |
| P0-7 (staff owner and queue for Social and Ads) | Dropped for Social. Replaced by section 5 items. Ads is deferred |
| Finding 1 and P0-1 (independent `ads` entitlement) | Deferred with Paid Ads. See section 4 for the one part that still matters |
| D23, D24 (who operates, default owner) | Closed: automation operates, the admin does not interfere, there is one admin |
| Roles proposal (builder, social and ads manager) | Not needed now: one admin. Keep the support role limits as a safety measure (see `00` finding 7) |
| E2E scenarios and test plan | Social scenarios become social-auto integration scenarios with a fake social-auto (the repo ships a fake engine for tests) |

## 4. Paid Ads, deferred

Owner update 2026-11-14: Paid Ads stays on sale as it is for now. The hide change was tried and reverted; the recommendation below is left for later.

Ignored for now, as you asked. One consequence you should decide, because customers can buy it today:

- Checkout, the pricing API and Plan and billing still sell "Paid Ads Management" at ₹2,999 a month, and the catalogue promises "Meta ads on Facebook and Instagram, AI ad copy and creative generation, campaign setup and optimisation, budget and bidding management". Nothing operates it, and a paying ads-only customer today sees the Social screens (browser-verified).
- Recommendation (decision D25): hide Paid Ads from checkout and the add-service dialog until it is built, and keep the page as an information page ("coming soon") that does not sell it. This is a small change and removes the main refund and trust risk. If you prefer to keep selling it, someone must own delivery before launch.
- The monitoring bundle rule (free with all three plans) depends on Paid Ads being sellable; if Paid Ads is hidden, decide whether monitoring is free with Website plus Social, or paused too.

## 5. New findings about the Social integration (verified in code unless marked)

| # | Finding | Evidence | Risk |
|---|---|---|---|
| S1 | Brandbasket does not receive social-auto's webhooks. The product API sends `post.failed`, `connection.expiring`, `poster.ready`, `week.lapsed` and more, but the platform has webhook routes only for Razorpay, Cal.com and OyeChats | `apps/customer/src/app/api/webhooks/` has three folders; no signature handler for `X-Social-Signature` | A customer whose Instagram connection expires or whose post fails is not told by Brandbasket. Only the single admin's push alert sees it |
| S2 | No billing lifecycle link to social-auto. The client calls workspaces, posts, jobs, schedule and brand archive, but nothing pauses or switches off a workspace when a customer's subscription lapses or the service is cancelled. social-auto's API has no billing or plan concept | `legacy-social/server/social-auto.ts` exports; `docs/product-api.md` | A lapsed or cancelled customer's automatic posting may continue, which costs AI and picture spend (verification needed: does social-auto stop on its own? Unknown) |
| S3 | The service is switched off by two environment settings, and when off the customer sees a different, manual Social screen and two tabs return 404 | `social-auto.ts` header, `next.config.ts`, browser-verified 404 | A deployment missing the settings silently sells a different product |
| S4 | The automation code lives under `legacy-social` and the manual path is the one named `social`, and the customer styling of the automated screens is off-system | code layout, `04` | Confusion for maintainers and inconsistent look; rename and restyle later |
| S5 | The platform polls social-auto on page load (10 second timeout per call) instead of using events, and a read failure shows a partial page | `TIMEOUT_MS = 10_000`, `load.ts` uses settled promises | Slow or empty Social page when the service is slow |
| S6 | Limits the customer will hit: 3 write batches a day, 10 a month, 7 pictures a week per channel, one website per workspace (a different one answers `SITE_MISMATCH`) | product API | Surface each limit as a clear message in the app |
| S7 | Marketing and checkout promise "up to 4 platforms"; the engine supports Instagram, Facebook, LinkedIn and Google | catalogue, product API | Matches; keep as the wording |
| S8 | The social-auto repo's own rule: never merge or deploy a feature that sends posts or spends money until the owner says so | its `CLAUDE.md` | Applies to any change we make that touches posting |
| S9 | Whether social-auto's production settings, timers (analytics) and Meta, LinkedIn and Google apps are configured and approved for live use is not visible from the repo | RUNBOOK says the analytics timer must be installed and enabled | Unknown; verify before launch |

## 6. The proper Social journey (replaces stage D in `16`)

| # | Customer step (customer app, `/social`) | System step (social-auto) | Admin | Message | Status and fix |
|---|---|---|---|---|---|
| D1 | Buys Social (alone or with others). Home shows "Set up Social" as the first task, no call | Workspace is created on first setup | none | receipt | Works. Add the first task on Home |
| D2 | Connects Instagram, Facebook Pages, LinkedIn and Google in the app: Allow page, return to `/social`, each network shows connected | Connect link (1 hour) and token storage | none | none | Works. Gap: show a clear failure and a retry when Allow is refused or the link expired |
| D3 | Enters or confirms their website, presses "Write my posts" | Write job runs: reading website, writing, drawing, in review; states queued, running, done, failed | none | none | Works. Gap: customer is told only by reloading; use the webhook `job.finished` and `poster.ready` |
| D4 | Keeps or drops facts and topics, asks for pictures, approves each picture; or turns on automatic posting per channel with consent | Only approved pictures go to the calendar; auto approval is recorded and announced | none | `poster.auto_approved` (so she can take it back) | Works in social-auto. Gap: Brandbasket should notify by email or in the bell |
| D5 | Chooses the weekdays per channel | Schedule applied to batches written afterwards | none | none | Works |
| D6 | Sees the calendar and posts; can edit, delete or send now before it goes out | Publisher posts daily at the set time | none | `post.published` | Works. Gap: no confirmation to the customer |
| D7 | Something fails: a post is refused or a connection expires | Push alert to the single admin; customer sees a state on the page | admin sees an alert | `post.failed`, `connection.expiring` | **Gap (S1)**: the customer is not told. Add the webhook receiver, show "reconnect Instagram" in the bell and by email |
| D8 | Reads analytics and the monthly report | Daily collection | none | monthly report | Works if the analytics timer runs (S9) |
| D9 | Cancels or lapses | Nothing tells social-auto | admin may not know | none | **Gap (S2)**: pause the workspace's posting when billing lapses or the service ends, resume on reactivation |

The admin's role in Social: watch the social-auto dashboard and push alerts. Brandbasket's console shows at most a read-only Social status per client (connected channels, last post, last failure) so the one admin can answer a support question without opening a second tool.

## 7. Revised first-week targets (replaces the Social line in `17` section 4)

| Service | First task for the customer | First task for staff | Done when |
|---|---|---|---|
| Website | Book the 30 minute kickoff and fill the checklist | Builder assigned, preview due 48 hours after the call | Preview sent |
| Social | Connect accounts, confirm the website, write the first batch, approve pictures (or choose automatic posting) | none (automated). The admin watches alerts | First post is scheduled. Proposal: within 48 hours of paying, because the customer does all of it |
| Paid Ads | Deferred | Deferred | Deferred |

## 8. Revised roadmap deltas (apply to `12`)

- P0-1 (ads entitlement) and P0-7 (staff queue for Social and Ads): replaced by P0-1b below.
- ON HOLD (owner, 2026-11-14): **P0-1b Hide Paid Ads from checkout and add-service until built** (S, small): one catalogue flag.
- **P0-7b Social lifecycle:** pause social-auto posting when a subscription lapses or the service ends, and resume on reactivation (M). Needs a social-auto API addition, so it is a change in both repos and must follow social-auto's own merge rules.
- **P1-S1 Receive social-auto webhooks** (M): signed receiver, events `post.failed`, `connection.expiring`, `poster.ready`, `poster.auto_approved`, `job.finished`, `week.lapsed`, customer bell and email, and a catch-up read by `seq` on start-up.
- **P1-S2 Retire the manual Social path** (M): remove the staff deliverables flow, the "Send for approval" action, and the staff Social tab, after confirming no live customers use it.
- **P1-S3 Verify social-auto production readiness** (S, read-only checks): the two settings, the analytics timer, Meta, LinkedIn and Google apps, alert topic, the spend limit.
- **P1-S4 Rename `legacy-social` and restyle** (M).
- All other P0 items stay (first payment recovery, timers, invitee workspace, refunds, support permissions, erasure order, role check, pricing cleanup).

## 9. Decisions

- **Decided:** social-auto is the Social engine and runs without staff; one admin; no Social setup call; messages when staff start work; Paid Ads deferred.
- **D25 (open):** hide Paid Ads from checkout now (recommended) or keep selling it.
- **D26 (open):** monitoring bundle rule if Paid Ads is hidden.
- **D27 (open):** is customer-visible "automatic posting" on by default or opt in? social-auto requires explicit consent per channel; recommend opt in.
- **D28 (open):** who handles customer questions about Social, since the admin does not interfere? Recommend the same support queue, answered by the one admin.
