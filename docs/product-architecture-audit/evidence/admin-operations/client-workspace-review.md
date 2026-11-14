# Per-client workspace review (`apps/admin/app/(protected)/clients/[businessId]/*`)

Labels: Verified in code | Reported in historical document | Inferred | Unknown. Paths relative to `brandbasket-platform/`.

## 1. Frame

| Part | What it does | Evidence |
|---|---|---|
| Layout | Reads the client once, shows avatar, name, owner, plan tier, website stage, billing currency, service tags (website, social, ads, monitoring from live bundled add-ons), a "Leaving, erased on" pill, and a five-step website `StageTrack`. Refuses unknown ids with `notFound`. Verified in code | `clients/[businessId]/layout.tsx:27-59` |
| Stage track | `clientStage(client)` only knows website build states (lead, setup, building, preview, live, paused). A customer with Social and no website shows "setup". Verified in code | `lib/pipeline.ts:7-49` |
| Tabs | Five: Overview, Website, Plan and billing, Messages, People. No tab is capability-gated; money is gated inside the Plan and billing tab. Verified in code | `lib/client-tabs.ts:15-21` |
| Access log | Every tab logs `client.view` (People logs `client.people_view`) with the tab name. Verified in code | `lib/server/client-page.ts:25-34` |
| Notice forwarding | Old links with a notice query are forwarded to the owning tab (`NOTICE_TABS`). Verified in code | `lib/client-tabs.ts:51-85` |

## 2. Tabs

### Overview `/clients/{id}`
Next step card (website only), What happened (6 recent activity lines), Owner facts, Kickoff call booking facts, Money (finance and admin only), What they told us (pre-payment intake), Setup answers (legacy website checklist n of m).
Duplicates: Activity is a longer fold on Messages; kickoff facts repeat on Website and Calls; Money repeats part of Plan and billing. Verified in code (`page.tsx:59-171`).
Missing: owner of the client, per-service state, the post-payment Social and Search setup answers (not read anywhere in the console), due dates.

### Website `/clients/{id}/website`
Largest tab (323 lines plus about 15 action groups). Notices; billing and rounds warnings; Next step card with Start building, Send preview or Mark live; delivery facts; Move-to-own-domain panel; Preview versions; Customer feedback; More controls fold (launch email resend, builder, extra round, launch day, cancel, website build section: start, hold, resume, preview picture); Domain; Notes for the builder; Logo and photos with uploader; Kickoff call; Site details fold (website URL, hosting, API token, analytics keys, features, business details, opening hours, offers, Google card).
Customer counterpart: `/website`, `/project`, `/todo`, `/domain` in the customer app.
Problems:
* Builder assignment, extra round and Cancel are inside a fold that is closed unless on hold or a move notice is showing (`website/page.tsx:112-113,201-211`). The owner is not visible on the card.
* Billing "needs attention" is a text banner that does not change any state (`website/page.tsx:133-137`, `billing-attention.ts:5-14`).
* Customer feedback is listed by round and linked to the ticket; preview versions have no feedback link (`project-preview-versions.ts:53-61`). Verified in code.
* Domain handling appears in three places: the Move section, the Domain section and Site details > Their website/hosting.

### Plan and billing `/clients/{id}/billing`
Sections in order: Posts, pages and reports; Monthly numbers; Ad campaigns; Connected accounts; Updates for the customer; Add-ons; Chatbots (only if the website was bought); Billing (finance and admin: payments, charges, refunds, invoices, billing details).
This is the real Social and Ads workspace and it is named Plan and billing. Support staff see and use everything except the last block (`billing/page.tsx:53-77`).
Customer counterparts: `/social`, `/ads`, `/reports`, `/billing`, `/billing/invoices`, `/oyechats`.
Problems:
* Service delivery (posts, ads, numbers, accounts) and billing share a tab and a URL fragment scheme (`?work=`, `?numbers=`, `?campaigns=`, `?accounts=`, `?updates=`, `?addOns=`).
* Social and Ads are one service (`SERVICE_OF_ADD_ON` maps both to `social`), so Ads cannot be listed, owned or reported on its own (`service-setup.ts:30-31`). The Posts section title is "Social & Ads" for both.
* Local SEO + AEO (`search`) branches in the work, numbers and report code are unreachable: `SERVICE_OF_ADD_ON` maps only `social-media` and `paid-ads`, so `listBoughtServices` never returns `search` (`service-setup.ts:29-30`, `work-section.tsx:23`). Dead code, not live forms. Verified in code.
* No assignee on any item. No count of posts due this week or approved and unpublished.
* A second report path: the "report link" saved here (`monthly_reports`, `deliverables.ts:77-96`) and the drafted reports under `/reports` (`reports` tables), unrelated rows with the same customer-facing idea.

### Messages `/clients/{id}/requests`
Change requests (quote, start included, start free, send for checking, done, decline), Calls (team calls held, summary), Requests table (25 newest tickets), Activity fold (200 lines).
Customer counterparts: `/requests`, `/requests/{id}`, `/requests/calls`.
Problems: change requests are only visible here; the global `/support` shows the underlying tickets without the quote or state (`support/page.tsx:97-121`). A paid, started request is "waiting on client" in the global queue (`reply-clock.ts:23-29`). Two lists of the same tickets (here and in `/support`). Verified in code.

### People `/clients/{id}/people`
Members, rename owner, Leaving (restore or extend, admin only). Duplicates `/leaving`, Compliance "Accounts being erased" and the Clients "Leaving" stage. Verified in code (`people/page.tsx`).

### Redirect-only pages
`/project` redirects to Website, `/services` redirects to Plan and billing (this is `LegacyServicesPage`, `services/page.tsx:5-14`), `/activity` redirects to Messages#activity. They exist for emailed or bookmarked links; none holds logic. Verified in code. Safe to remove once no outbound message links them (Unknown whether any email template does; `rg` for the paths in `packages/email` was not run).

## 3. Duplication with global lists

| Global screen | Client duplicate | Overlap |
|---|---|---|
| `/projects` Board | Website tab Next step card | same stage and due data |
| `/calls` | Website Kickoff call; Messages Calls | same "mark held" action in three places (`kickoff-actions.ts` x2, `calls/kickoff-actions.ts`) |
| `/support` | Messages Requests table | same tickets, different filters |
| `/reports` | Plan and billing report link | two report systems |
| `/payments`, `/invoices` | Billing section | register versus per-client |
| `/leaving`, `/access-log` Compliance | People Leaving | closures |
| Settings Google states | Website > Site details Google card | account versus per-client |
| Today add-on rows | Plan and billing Add-ons | queue versus action |

## 4. Dormant and unimplemented inside the workspace

| Item | Class | Evidence |
|---|---|---|
| Listing section, listing tags, verified and trusted marks | Dormant, page section hidden by `sellsDirectory`, but its reads (`readDirectoryStatuses`, `findPlaces`, `findListingPlacement`) still run on every Site details render | `website/site-details.tsx:54-93,145` |
| Features: time zone and modules (appointments) | Dormant business modules; actions `setModuleAction`, `setTimeZoneAction` live | `clients/[businessId]/actions.ts:376-449` |
| Opening hours, What they offer, Business details | Directory/profile data shown to staff; Brandbasket customers' customer app does not appear to edit offers (Unknown) | `site-details.tsx:170-204` |
| Chatbots (OyeChats) | Live but only for website customers | `billing/page.tsx:69-76` |
| Monitoring | Tag only, no work screen | `service-tags.tsx:9` |
| Search (Local SEO + AEO) work | Dormant and unreachable (service not sold, never returned as bought) | `service-setup.ts:29-30` |
| Free-listing accounts | Dormant | `CLAUDE.md` "Dormant code" |

## 5. What a service-specific per-client workspace should contain

Header: client name, plan, billing state chip (paid, past due, lapsed), one named owner per service, next customer-visible event, open Today items for this client.

| Tab or card | Contents | Owner and state fields needed | Why (evidence) |
|---|---|---|---|
| Overview | One card per service bought: Website, Social, Paid Ads, Monitoring. Each card: owner, state, next action, due, "customer currently sees" line, last staff action | `service_owner`, per-service state, `next_due_at` | Today only models website (`client-next-step.ts`) |
| Website | Build project (stages, preview versions with feedback, launch checks), Domain and hosting, Site details, Kickoff | builder (visible), preview-awaiting clock | `website/page.tsx` already has most |
| Social | Setup answers from the customer (new read of `service_setup`), accounts, content calendar of posts with due dates, approval inbox, published list, numbers, report | owner, post due queue, approval wait clock | unread `service_setup`; `work-section.tsx` |
| Paid Ads | Setup answers, ad accounts, campaigns, creative approvals (needs new data), spend notes, results, report | owner, campaign state | `campaigns-section.tsx`; no state machine today |
| Monitoring | Weekly check list and issues found across website, social, ads | owner, last check date | UNIMPLEMENTED: tag only |
| Billing | Plan, add-ons, payments, charges, invoices, refunds; lapse state with policy | finance only | `billing-section.tsx` |
| Messages | Tickets and change requests in one list with state and owner; calls; activity | ticket owner | `requests/page.tsx` |
| Account | People, owner name, closure, privacy | admin actions | `people/page.tsx` |

Every action on any tab should end with a "Customer sees" line and a link to the customer screen, as the Website tab already does for stages (`delivery-tab.tsx`). Social and Billing actions have no such line today.
