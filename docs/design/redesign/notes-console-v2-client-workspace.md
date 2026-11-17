# Design notes: console v2, Clients and client workspace (CR-A2)

Package CR-A2 of `docs/implementation/CONSOLE-REDESIGN-PLAN.md` section 5.2. Screens S5 to S11. Branch `cr/a2-client-workspace`. Read only on application code.

Files:
- `mock-console-v2-clients.html` (S5)
- `mock-console-v2-client-workspace.html` (S6 to S11, tabs in the page)

Open either file in a browser. The sticky bar at the top is mock control, not product. Buttons switch the state; the 1440 and 390 buttons change the frame width. The layout reacts to the frame (container queries), so the 390 button and a real phone behave the same.

Status of checking: the scripts of both files were run in jsdom through every state and tab with no script errors. The layout was not looked at in a browser here (file URLs were blocked in this environment), so a visual pass at 1440 and 390 is the first review step.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Six tabs: Overview, Website, Services, Money, Requests, Account. Money keeps `/billing`, Account keeps `/people` (CD-17). | Plan section 2.2. Services moves the non-website forms out of billing. |
| 2 | Money holds money only. Payments table is first and is the one raised card. Plan lines, plan and renewal facts and billing details sit in the aside. The "Updates for the customer" form, the OyeChats form and the Numbers form are gone from it. | Walkthrough D4: the form came first and Today's Check link landed on it. |
| 3 | No Package and no Ad credit rows anywhere. Plan lines list each service with its price and a "Free" line for monitoring. | Walkthrough D11 and owner decision 2026-11-11. |
| 4 | The Overview never says "Nothing is waiting on us" unless every read succeeded and there is no exception. The "all clear" card lists what was checked. If a read fails the card says it could not check and offers Try again. | Walkthrough D5. |
| 5 | One list of exceptions per client (strip at the top of Overview). The first item, by a fixed priority, becomes the Next step card with its one verb. The strip repeats it on purpose: the strip is the full list, the card is the one action. | Plan S6. Fixes the "late kickoff but nothing waiting" case. |
| 6 | The Overview card considers every service and the money and account state, not only the website (`client-next-step.ts` must change; see section 5). | Plan S6. |
| 7 | Kickoff has one place to act: the kickoff prompt dialog. The Overview card, the Website card and the Today row only open it. The Website tab shows state only. | D31, plan S4. |
| 8 | Exceptions order: kickoff unconfirmed, preview late, preview silent, address failed, domain move, unapplied payment, failed renewal, lapse, closing, privacy request. | Customer-blocking build work first, then money, then the account. Open to the owner. |
| 9 | Website tab: stepper (Kickoff, Build, Preview, Launch, Live), one focal card per stage with one verb, the other panels below. On hold and Cancelled freeze the stepper at Build and say so in words. | Plan S7. Stage names come from `STAFF_STAGE_LABELS`. |
| 10 | Cancel build, add a free round and put on hold live in a three dot menu on the focal card, each behind a confirm. | Plan S7. Builder assignment is gone (D12). |
| 11 | Domain and hosting is a collapsed panel that opens itself when the stage is Approved, address failed, or domain move asked. | Plan S7. |
| 12 | Every action that emails the customer goes through a confirm that names the email: send preview, updated preview, resend preview, mark live, resend launch email, pause or cancel a service. Refund uses the shipped R2-09 text plus a first-person tick naming the amount. | Plan 3.2. |
| 13 | Social card on Services is hidden until N7 lands (switch in the mock bar). Staff get a read only status and a link out. Never an edit. | CD-16, D16, D23. |
| 14 | Paid Ads is the existing monthly figures form, display only. Past months are shown as placeholders. Monitoring is one line, no screen (D15 undecided). | CD-6, plan S8. |
| 15 | Legacy manual tools (campaigns, accounts, updates for the customer, report link) sit in a collapsed "Legacy" panel shown only while the client has stored data. | CD-5, CD-21. |
| 16 | The Clients list has one filter row (stage) with counts, a Columns control for Monthly and Paid through, a services column with an icon and name per chip (shape, not only colour), and a red dot with a spoken "Late" for clients with something late. Builds is a view of the same page, with all open stages visible. | Plan S5. Fixes walkthrough D20 (two clipped pill rows) and D14 (waiting builds hidden). |
| 17 | At 390 the Clients rows keep Next and Paid through by moving them into the first cell. | Walkthrough D3 said the useful columns were hidden. |
| 18 | Requests tab is the Inbox list with this client fixed, one list with a Support or Change type chip. Calls and the Activity fold are not on it: calls are the Today Calls card and the kickoff facts on Overview; history is on Overview. | Plan S10, CD-1, CD-14. |
| 19 | Secondary buttons are soft sunken fills, not outlined. | `apps/admin/DESIGN.md` (outlined secondary is not allowed). `05` says white with a border; the two differ for the console. Tell CR-A4. |
| 20 | Row actions open a side panel (quick view on Clients, request on Requests, payment check, add charge, manual payment, billing details). The Requests panel does not hold a reply box; replies stay in Inbox so the email is named before it goes. | CD-11, plan 3.2. |

Gold budget per viewport: rail mark, the 3px top edge of the one focal card, and the stepper's current step on the Website tab. Selected rows use the wash. Red only for late or failed.

No owner, assignee, role, Package or Ad credit UI exists. "Owner" in the mocks is the customer's business owner (a `ClientSummary.owner`), not a staff owner. Names are `<business>`, `<owner>`, `<subject>`; money uses the real prices from the root `CLAUDE.md` (Rs 2,999 each, monitoring free with all three, GST included). Dates and the sample id are sample values.

## 2. States covered

Clients (S5): Live, New (three rows), Empty, No match, Loading (skeleton rows), Error (Try again, digest reference). Filter and quick view work; Builds view shows six open stages.

Workspace client switch: New (just paid Website, kickoff call ended and not confirmed), Live (all four services, renewal failed, privacy request open), Live all clear, Empty (not paid), Error (panel reads fail, exceptions unreadable).

Per tab selectors: Website stage (14: waiting for kickoff, call ended and not confirmed, ready, building, building late, preview sent, preview sent and silent, changes requested, approved, approved with failed address check, live, live with domain move asked, on hold, cancelled), Money (paid, renewal failed, lapsed, payment needs a look), Account (normal, closing, privacy request open), Social (hidden or after N7).

| Tab | Empty | Error | Loading |
|---|---|---|---|
| Overview | Not paid card, intake answers, no services | Per panel ErrorState; strip and card say they could not check | Skeleton matching the layout (build task) |
| Website | "No website service" | Not shown (stage reads are part of the client read) | Skeleton |
| Services | "No services yet"; each card "Not on this plan" | Paid Ads card ErrorState with Try again | Skeleton per card |
| Money | "Nothing to pay yet" | Payments ErrorState, plan facts still shown | Skeleton table |
| Requests | "No requests from this client." | ErrorState | Skeleton rows |
| Account | "Only the owner is on this account." | People ErrorState, other panels shown | Skeleton panels |

Loading is specified, not drawn, on the workspace tabs (the Clients page draws it). Use `Skeleton` as in plan section 3.

## 3. Field to source table

Names are real fields or helpers in the current code, so every element traces to a source. [E] exists, [Q] needs a new or extended read.

| Element | Source | Tag |
|---|---|---|
| Clients rows: business, owner name, stage | `ClientSummary`, `clientRowStage`, `CLIENT_ROW_STAGE_LABELS`, `lib/client-rows.ts` | E |
| Clients: build stage line | `clientBuildStage`, `STAFF_STAGE_LABELS` | E |
| Clients: services chips | `servicesByBusiness` (add-on ids from live lines) | E |
| Clients: per service state (done, needs setup, problem) | attention map in `clients/page.tsx` plus subscription state | Q small |
| Clients: Monthly, Paid through | `ClientServices.monthlyCents`, `billing.subscription.paidThroughAt` | E |
| Clients: Next column, red dot | attention map (`needs.reason`), closure map | E |
| Clients: Builds columns | `project.status`, `project.slaDueAt`, `previewLateReason` | E |
| Clients: quick view | the same row fields | E |
| Workspace header: name, owner name, email, mobile, id | `ClientDetail.businessName`, `owner`, `displayPhoneText`, `businessId` | E |
| Header stage chip and service chips | `staffStageOf(project.status)`, add-ons from `loadClientAddOns` | E |
| Tab counts (Requests, Money mark) | open ticket count (`listSupportTicketsForStaff`), `billingNeedsAttention` | E |
| Exceptions strip rows | kickoff: `findSetupCallBooking` plus `lib/kickoff-prompt-rule.ts`; late or silent preview: `slaDueAt`, `previewSentAt`; address: `site-check.ts`; domain move: `ClientDetail.movingTo`; payment: `payments-needing-attention`; renewal and lapse: `clientPaymentState`; closing: `findOpenClosureForBusiness`; privacy: privacy request data and `deadline-clock.ts` | E for the first six and closing; Q small for privacy, joined |
| Next step card | extended `overviewNextStep` / `clientNextStep` (all services) | Q (logic) |
| Service cards on Overview | project status, add-on lines | E |
| What the customer sees | `CustomerMirrorPanel`: `CUSTOMER_STAGE_HEADLINE`, `kickoffCustomerMessage`, `billingCustomerMessage` | E |
| What happened | `listActivityForBusiness`, `ActivityList` | E |
| Owner facts, Billed in, Joined | `client.owner`, `BILLING_CURRENCY_LABELS`, `createdAt` | E |
| Kickoff facts | `findSetupCallBooking`, `findLatestKickoffOutcome` | E |
| Money facts: Payment, Billed, First payment, Paid through, First term ends | `BillingFacts` (`clientPaymentState`, `subscription`, `firstPayment`), without the Package and Ad credit rows | E |
| What they told us | `findClientIntake`, `summaryRows` | E |
| Website: stepper, card, facts | `NextStepCard`, `NEXT_STEP_HEADLINES`, `DeliveryFacts`, `roundsText`, `dueDateLabel` | E |
| Website: send preview, updated preview, resend preview | `SendPreviewForm`, `ResendPreviewEmailForm`, `project-preview.ts` | E |
| Website: launch checks (8), check address, mark live, go live anyway | `LAUNCH_CHECK_LABELS`, `listLaunchChecks`, `CheckAddressForm`, `GoLivePanel`, `project-launch.ts` | E |
| Website: resend launch email, 7 day window | `LAUNCH_RESEND_WINDOW_MS` | E |
| Website: preview versions, feedback | `listPreviewVersions`, `listFeedbackForProject` | E |
| Website: add round, hold, resume, cancel | `project-controls.tsx` (texts as shipped) | E |
| Website: domain, DNS, ownership, move, free address | `client.domain`, `DNS_STATUS_TEXT`, `MoveDomainPanel`, `FreeAddressForm`, `domain-switch.ts`, `website-moves.ts` | E |
| Website: notes, styles, links, logo and photos | `client.brief`, `client.media` | E |
| Services: Paid Ads figures | `numbers-section.tsx`, `numbers-actions.ts` (ad fields only: ad spend, ad budget, enquiries from ads) | E |
| Services: Social status (channels, last post, last failure) | social-auto events from N7 | Q, N7 |
| Services: Monitoring line | add-on lines (`expert-monitoring`) | E |
| Services: Chatbots | `ClientChatbots`, `loadClientChatbots` | E, placement open |
| Services: Legacy tools | `campaigns-section`, `accounts-section`, `updates-section` | E, CD-5 |
| Money: payments table | `ClientPayments` (When, For, Method, Amount, Status, Invoice) | E |
| Money: Check on a flagged payment | `PaymentsNeedingAttention`, `resolvePaymentAttentionAction` | E |
| Money: refund and manual refund | `refund-dialogs.tsx`, `lib/refund-preview.ts` | E |
| Money: plan lines and row actions | `ClientAddOns` (mark contacted, pause, cancel) | E |
| Money: tax invoices, billing details | `ClientTaxInvoices`, `ClientBillingDetails` | E |
| Money: extras and add charge | `ClientCharges`, `CHARGE_KIND_LABELS` | E |
| Money: record payment by bank transfer | `ManualPaymentForm`, shown when lapsed | E |
| Requests: list | `listSupportTicketsForStaff`, `SUPPORT_STATUS_LABELS`, `SUPPORT_CATEGORY_LABELS`, change requests (`requests-section.tsx`, `stateLabel`) merged with a type chip | E, one list is Q small |
| Requests: clock, Waiting on customer, Paid in progress | `support-staff.ts` queue rule, change `state` and `coverage` | E |
| Account: people table | `listBusinessMembersForStaff` | E |
| Account: rename owner | `renameOwnerAction` | E |
| Account: closure, restore, extend, close | `findOpenClosureForBusiness`, `account-actions` | E |
| Account: privacy request for this client | `/privacy-requests` data, `deadline-clock.ts` | Q small |
| Account: Setup answers (Social, Search) | post-payment setup answers, not read by the console today | Q |

## 4. Accessibility and phone

Status is never colour alone: chips carry a word and an icon; late rows carry a red dot plus a spoken "Late". Tabs, dialogs and the side panel are real roles; Escape closes the panel; dialogs are native `<dialog>`. Focus ring is the 2px ink ring. At 390 the rail becomes a menu, tables move their secondary columns into the first cell, buttons are 44px, the tab strip scrolls inside itself, and nothing scrolls the page sideways. Per CD-13 the kickoff prompt, a reply check and a payment check are the phone jobs; build, compliance and pricing are designed for desktop and only need to remain usable.

## 5. Questions for the owner

1. Exception priority (decision 8). Should a failed renewal or an unapplied payment outrank a late first preview on the Overview card?
2. The Paid Ads figures form today shares one fields list with Social (`numbers-section.tsx` "Social & Ads": ad spend, ad budget, enquiries from ads, posts published, planned, reach, followers, profile visits). The mock shows only the three ad fields. Drop the post and reach fields, or keep them? (D16 says staff do no Social work.)
3. Where does the OyeChats chatbot form live? The plan does not place it. The mock puts it on Services under a Website label.
4. The Site details fold on the Website tab (hosting, features, directory listing, tags, Google connection) is carried over as is. Directory listing and tags may be dormant. It should be reviewed with CR-13.
5. "Local SEO + AEO" figures (`search` in `numbers-section.tsx`) have no home in the mocks because no sold service matches. Retire, or keep under Monitoring?
6. Should "Extend by 30 days" on a closing account get a confirm? The mock adds one (plan S11); today it is a plain button.
7. Preview silent threshold of 5 days (CD-8) is shown on the strip and the Website card. Confirm it also appears on the client strip, not only on Today.
8. Setup answers (Social and Search) need a new read (D14b). If it is deferred, the Account tab shows only intake answers.

## 6. For the build packages

- CR-05: header, tab strip, Overview, exceptions strip, extended next step logic. CR-06: Website. CR-07: Services and Money. CR-08: Requests tab uses the Inbox component. Account is a light edit of `people/page.tsx`.
- Keep `logStaffAccess` (`client.view`, `client.people_view`) on every tab and side panel, and `?open=` on each side panel.
- Keep the redirects for `/clients/[id]/activity` and `/project` and the `NOTICE_TABS` forwarding in `lib/client-tabs.ts`.
- New patterns used here that CR-01 builds: `DataTable`, `FilterBar`, `SidePanel`, `RowActions`, `InlineEdit`, `Toast`. The mocks draw their own approximations.
