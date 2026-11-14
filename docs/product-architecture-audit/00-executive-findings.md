# BrandBasket product architecture audit: executive findings

> **Revision 2026-11-14:** the owner confirmed Social is automated through social-auto with no staff involvement, there is one admin, and Paid Ads is deferred (display only). Where this file disagrees, `18-social-automation-and-revised-scope.md` wins.


Audit date 2026-11-14. Repository `brandbasket-platform`, branch `development`, commit `c702f6c7`. Phase 1 to 4 deliverables only: no application code, schema, data, pricing or configuration was changed.

Method: four read-only specialist agents (domain, customer UX, admin operations, journey QA) each inspected source and tests; I read their reports, spot-checked the entitlement and pricing claims against source, repaired one malformed CSV row, and merged everything here. Raw working files are in `evidence/`.

> **Main journey document:** `19-end-to-end-user-journey.md` (customer app and staff console, step by step).

## 1. Evidence classification (read this first)

| Label | Meaning | Used for |
|---|---|---|
| Verified in code | Read in current source with path and line | Nearly every finding below |
| Verified in browser | Seen in a running app | Findings 1, 2, 5, 7 (support destructive controls only) and several smaller items. See `15-browser-verification-results.md` |
| Reported in historical document | Claimed by an older doc, not rechecked | Only where marked |
| Inferred | Follows from code but outcome not reproduced | Flagged per finding |
| Unknown | Needs production state, external service or a run | Timers enabled in production, Razorpay retry schedule, external social posting states, whether any `search` rows exist |

No test was run by me or the agents. Nothing in this audit claims a test passes.

## 2. The business as the code implements it

- One plan tier (`managed`, price 0). The money is the sum of per-service lines in one subscription: Managed Website, Social Media, Paid Ads at INR 2,999 (USD 59) each and Dedicated Expert Monitoring at INR 6,000 (USD 99), free only when all three plans are in the basket. GST is inside the INR price. Source: `packages/shared/src/lib/billing/add-ons.ts`.
- Website, Social and Paid Ads can each be bought alone at sign-up, added later, and cancelled one at a time (not the last). All lines renew in one payment on one date; there is no separate renewal per service.
- Exactly one management mode exists: managed (staff do the work, the customer approves or reads figures). A DIY versus Done For You choice does not exist in code.
- Local SEO is retired for sale but still lives in types, nav, reports and admin forms. The directory, clinic and free-listing code is dormant, but `businesses.kind = 'listing'` is also the live state of an unpaid sign-up, so it is not safe to delete.
- Dedicated Expert Monitoring is a label and a price rule only. It has no screen, owner, queue or entitlement.

## 3. Top 15 findings, ranked by launch risk

Confidence in brackets. Paths are relative to the repo root; line numbers are from the agents' reports and the entitlement ones were rechecked by me.

1. **Paid Ads has no entitlement key.** `paid-ads` and `social-media` both map to `social` (`packages/db/src/queries/service-setup.ts:43`, `apps/customer/src/features/shell/rules.ts:89,118`, `app/(app)/ads/page.tsx:9-10`). An ads-only customer gets every Social page and write action; a social-only customer sees Paid Ads as bought with an empty table; a visitor on `/ads` is pitched Social at Social's price; cancelling only Social from a Social plus Ads basket keeps Social open. Code comments say this was a deliberate shortcut ("no service key of its own yet"). [Verified in code, confirmed by three agents and by me]
2. **Sold terms differ from the owner's rules.** Yearly billing at 10 percent off (`add-ons.ts:134`), an INR 1 first month on Social and Ads (`packages/shared/src/lib/billing/trial.ts:20`) and "Ad money added by us each month" rows (`social-screens.tsx:117-121`) are live, against "billed monthly, no package discounts, no ad money". Referral and affiliate coupons also exist. [Verified in code; whether each is intended is an owner decision, see `14`]
3. **An ordinary first payment whose webhook is lost is recovered only if the owner reloads checkout.** The 10 minute job covers first-month-offer checkouts only (`first-payment-check.ts:38`), and its timer is installed "NOT enabled" (`deploy/vps/install.sh:453`). The page-load recovery is the newest commit and has mock-only tests. [Verified in code; production timer state Unknown]
4. **Refunds move no money.** A refund only marks a payment refunded (`staff-payments.ts:90-128`, `refund-actions.ts:10`): no provider call, no credit note, no email, no access change. [Verified in code]
5. **Invitees may never reach the inviter's workspace.** Signing up through an invite link creates a personal business (`listing-account.ts:175`) and the app shows only the oldest membership (`packages/shared/src/lib/access.ts:33-41`). [Verified in code and in browser: the invitee ends on the sign-up questions of their own business]
6. **Paid Social and Ads work has no staff owner, queue or handoff.** No auto-assignment exists anywhere; customer post approval notifies nobody (`features/social/actions.ts:27-45`); the customer's post-payment Social and Search setup answers are never read by the console; 12 request types have no owner or queue (see `04`). [Verified in code]
7. **Staff permissions are broad and access is unverified in code.** Support can cancel a build, grant free revision rounds and change domains (`apps/admin/app/(protected)/clients/[businessId]/website/actions.ts:54-79`). No code verifies Cloudflare Access; `docs/deployment/cloudflare-access.md:3` says "not done" while the admin CLAUDE.md says "behind Cloudflare Access". [Verified in code and docs; support sees Cancel build and Add a round of changes in the browser; production Access state Unknown] Update 2026-11-14: BrandBasket will use one staff account, so the role split no longer applies; the priority becomes protecting that single account (Cloudflare Access, a second factor, an offline recovery admin).
8. **Four background jobs are installed but not enabled by the installer:** erase, site hosting, first-payment check, monthly reports (`install.sh:449-455`). The console and customer copy promise account erasure and monthly reports that depend on them. [Verified in script; production Unknown]
9. **Account erasure order can lose data.** CMS content is deleted before the locked re-check (`account-erasure-run.ts:72` then `:80`), and the route has no test. [Verified in code]
10. **The preview email teaches the wrong action.** `previewReadyEmail` links only the external preview and says "Reply" (`packages/email/src/templates/preview-ready.ts:15-17`), but Approve and Ask for changes exist only in the dashboard at `/website`. A reply bypasses round counting and the approved state. [Verified link and copy; consequence is a design hypothesis]
11. **Failed-renewal recovery is a loop.** The Pay now email lands on `/billing`, which leads to a request to staff for a secure link (gate G7) instead of a self-serve card change. [Verified in code]
12. **Dropped-request handling is still open for most forms.** `useActionForm` has no catch, 21 `useActionState` files have none, only about 15 of 63 action-calling components catch, unsaved-edit warnings are `beforeunload` only, and no `loading.tsx` or Suspense exists outside `/business` and the affiliate area. 4 of 13 historical claims are fixed, 6 still open. [Verified in code]
13. **Two billing code trees.** The webhook runs on `platform/lib/server/*` while checkout runs on `features/checkout/server/*`; `checkout.ts` differs by 51 lines; three files under `platform/` have no importer. Every future billing fix risks landing in one tree only. [Verified in code]
14. **No shared auth guard and unverified RLS role.** There is no `proxy.ts` or middleware in either app although comments cite one, so every route must guard itself; `withTenantScope` only sets settings and no role assertion was found, so row level security holds only if `DATABASE_URL` logs in as `bb_app` (`scope.ts:96-106`). About 30 of 74 staff-database files were not sampled for cross-tenant access. [Verified absent; the role consequence Inferred]
15. **Two Social experiences, chosen by environment.** `SOCIAL_AUTO_URL` and `SOCIAL_AUTO_KEY` select a legacy off-system workspace; without them `/social/analytics` and `/social/review` return 404, so one account sees different tabs per deployment, and the console cannot see or control the posting service. [Verified in code; external states Unknown]

Also notable: local `.env.local` files carry a live mail key so local runs send real email (value not read or printed here); Today shows flagged payments to finance only so support is blind to a stuck first payment; 16 of 43 admin action files have no tests; automatic kickoff after 24 hours is still the default and Social-only or Ads-only customers have no kickoff concept.

## 4. Launch block list (P0)

P0 means customer money, irreversible data, security or paid delivery. Detail, sizes and acceptance tests are in `12`.

| ID | Block | Findings |
|---|---|---|
| P0-1 | Independent Paid Ads entitlement and correct NotBought pitch | 1 |
| P0-2 | Owner decision then code or copy alignment on yearly, INR 1 trial, ad money, coupons | 2 |
| P0-3 | Ordinary first payment reconciliation job, enabled and tested | 3 |
| P0-4 | Confirm or enable the four production timers, or withdraw the promises | 8 |
| P0-5 | Refund flow: real provider refund or a stated manual process, credit note, customer notice | 4 |
| P0-6 | Invitee lands in the inviter's workspace | 5 |
| P0-7 | Staff owner and queue for paid Social and Ads delivery, post approval notice, setup answers visible | 6 |
| P0-8 | Restrict destructive support actions; verify Cloudflare Access | 7 |
| P0-9 | Erasure ordering fix with a test | 9 |
| P0-10 | Verify the runtime database role and finish the cross-tenant sample | 14 |

## 5. 30 day priorities

Week 1: owner decisions D1 to D6 in `14`; confirm production timers and Cloudflare Access (read-only checks); stand up the isolated test stack from `13` and run the P0 scenarios to turn Inferred findings into Verified or dismissed. Week 2: P0-1 and P0-3 vertical slices (entitlement plus first payment). Week 3: P0-6, P0-7, P0-9. Week 4: P0-5, P0-8, then P1 navigation work only after the above pass the launch gates in `13`.

## 6. Coverage and what was not verified

| Inventory | Count | Where |
|---|---|---|
| Customer pages | 96 (about 53 real screens, 40 redirects or aliases, 3 test or dev pages, 1 dormant) plus 7 layouts | `02` |
| Customer API route handlers | 49 | evidence `api-route-inventory.csv` |
| Admin pages | 56 (about 20 core screens, redirect or utility pages, 4 dormant directory pages that return 404) | `03` |
| Admin API route handlers | 15 | evidence `api-route-inventory.csv` |
| Database enums and status columns | 62 pgEnums plus 17 text-status columns | `06` |
| State machines | about 30 (25 numbered sections with Mermaid) | `06` |
| Customer journeys | 11 (J1 to J11) | `04` |
| Staff lifecycle stages and request types | 14 stages, 23 request types | `04` |
| Email templates mapped to destinations | 31 | `04` |
| Existing tests | 976 files (829 unit, 147 integration, about 10,092 cases), 8 Playwright specs, none for admin, not in CI | `13` |
| Cross-app critical actions in the event matrix | 19 | `11` |

Not verified and not claimed: every browser-behaviour statement (mobile, focus, loading); production environment, timers, nginx and role configuration; the external social posting service states; Razorpay retry schedule and SDK timeout; about 30 staff-database files for IDOR; about 250 parity rows (sampled); which tests pass. "Every route has a row" is true; the depth of review per row varies, and the CSVs carry an evidence label per row.

## 7. Browser verification: first pass done, most still outstanding

An isolated local stack was set up (existing seed database `brandbasket_platform_v4b`, fake billing, no real mail) and one Paid Ads only customer plus a support-role staff session were driven at 1440 and 375 pixels. Result in `15-browser-verification-results.md`: findings 1 and 2 are now Verified in browser (an ads-only account opens the full Social area, is told "Your Social & Ads service is active" and offered a social kickoff call; the INR 1 first month and Yearly "Save 10%" switch are live), and staff see the purchase only as one generic "Add-on to start" row while the client page says "Nothing is waiting on us". Still outstanding: 768 pixels, keyboard and screen reader, invitee, payment recovery, refund, erasure and permission scenarios, and finance and admin role sessions. Steps for the rest are in `13`.

## 8. Where to read next

`01` services and entitlements, `04` journeys, `05` two-way blueprints, `06` state machines, `08` target architecture, `09` navigation and screen contracts, `12` roadmap, `13` tests and gates, `14` owner decisions.
