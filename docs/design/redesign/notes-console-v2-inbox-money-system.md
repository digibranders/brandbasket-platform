# Console v2 mocks: Inbox, Money, Compliance, System, utility (CR-A3)

Branch `cr/a3-inbox-money-system`. Plan: `docs/implementation/CONSOLE-REDESIGN-PLAN.md` sections 2, 3 (S12 to S20), 4 and 5.2. Owner approved the plan with every recommended default (CD-1 to CD-21).

Files:

| File | Screens |
|---|---|
| `mock-console-v2-inbox.html` | S12 Requests (with side panel), S13 Enquiries, S14 Reports to review, report review page |
| `mock-console-v2-money.html` | S15 Payments with the Renewals lane, S16 Invoices, S17 Plans and offers (Prices, Coupons, Affiliates) |
| `mock-console-v2-compliance-system.html` | S18 Compliance (Privacy requests, Breaches, Closures, Access log), S19 System (Health, Emails and webhooks, App errors, Settings, Access), S20 sign in, forgot, reset, invite, no access, not found, error |

How to read a mock: open the file. The dark bar on top is the harness, not the product. It picks the screen, the state (New, Live, Empty, Error, Loading) and the width (1440 or 390). The layout also responds to a real narrow window. Rows open side panels, buttons open confirm dialogs, Undo toasts work. On Requests, Send reply then confirm shows the fixed banner and thread. Mocks are static HTML with inline SVG and no images.

## What the walkthrough found, and how the mocks fix it

| Finding (R2-16) | Fix by design |
|---|---|
| D6: failed payment under Today Upcoming while Payments said All clear | Payments has a Renewals and overdue lane. The Needs a look tile counts payments and renewals together (4 = 2 payments + 2 renewals) and equals the Money count in the rail. The rule for the build: one function decides what Needs a look means, and Today, the rail and Payments all call it |
| D8: forms push overdue items below the fold | Privacy and Breaches lead with a clock strip, then tiles, then the list sorted overdue first. Logging a request or breach is a side panel opened by the one primary button. The strip shows on all four Compliance tabs |
| D10: banner stale after a reply, thread newest first | Thread is oldest first, newest message sits next to the reply box. The banner is derived from the last message: after a reply it reads "Waiting on the customer". Wording "customer sees: Sent" is gone |
| D1: owner chips and columns | No Owner column, no Mine, no Assigned to, no Take this, no role picker anywhere |
| D11: Package and Ad credit | Neither appears. Plans and offers shows the three plans, monitoring and the one offer. Acquisition (ad results) is the only ad item and it is Brandbasket's own ads |
| D17: access log unreadable | Human action names with the raw id in Mono under them, a client filter by business name, grouped action list covering every action the code writes |
| D19: invoices clipped, month shown three ways | One month control. Register scrolls inside its card and stacks on phone |
| D23: repo path shown to staff on Breaches | Removed |
| D27: grey Connect buttons with no reason | The reason is stated on the card |

## Decisions made in the mocks

1. **Gold budget.** Gold appears three times per viewport: the rail logo mark, the rail selected marker, and the selected list row marker. Primary buttons are ink. Waiting is shown with a sunken chip, not a gold wash, because lists would break the budget. Rail count badges are neutral grey, red when late or failed. See open question 6.
2. **One focal card per screen.** The table or list is the card with the hero shadow. Side panels and dialogs are overlays.
3. **One dark button per screen.** Rows use secondary buttons. The primary sits in the side panel foot (Send reply, Send setup link, Send quote) or in the header (Log a request, Export register, Resend all failed, Save INR extras).
4. **Late rule.** Red only when late. Requests: red from 24 hours, a plain "Over 4 hours" word between 4 and 24. Enquiries: red past 1 hour. Compliance clocks red only when overdue. "Under 72 hours" is a neutral bold notice, as plan S18 says.
5. **Confirm and undo follow plan 3.2.** Undo toast for status only changes: close request, enquiry status, mark contacted, hold report, privacy and breach step marks, coupon switch off. Confirm dialog for anything that emails (reply, quote, start, decline, setup link, send report, retry, resend, invite) and anything irreversible (close privacy request, close breach, delete code, remove Teams address). Money dialogs carry a first-person tick box.
6. **Refund copy is R2-09's.** Title "Confirm refund of {amount} for {business}". Consequence: the amount goes back through the payment provider, a credit note is issued, the customer is emailed, it cannot be undone. Credit note line and the email preview as shipped. The line "The plan and the website are not changed by a refund. Cancel the plan separately if the customer is leaving." is kept, so nothing claims a refund cancels hosting (R2-09 open question 1). The manual refund dialog uses the shipped consequence. Both tick sentences are new copy (the shipped sentence is no longer in the source); see the copy list.
7. **Health shows only real signals.** Failed emails, webhook failures, app errors, Google connections, missing Teams addresses. No gateway latency, no Paytm, no WhatsApp status. Social alerts (N7) and timer "last ran" (CD-20) are left out until their data exists. The System count in the rail equals the rows on Health that need a look.
8. **Error state on Health is per source.** One failed read shows "Could not read" with Try again beside the sources that did load, as plan S3 says, not a blank page.
9. **Phone.** Tables become stacked cards with labels (CD-13). Side panels become full sheets. Rail becomes the top bar with a menu button. Long work (Plans and offers, Settings) stays usable but is designed for desktop.
10. **Sign-in protection shows three real states** from `protectionLines`: protected (Live), not required (New), did not verify (Error). Second factor and recovery credential status are not shown: no data source.
11. **System > Access** keeps one staff account row and an invite for the recovery administrator only (D30). No role, no "Can" column.
12. **Plans and offers.** Services are read only (priced in code, as `ServicesCatalogue` does today). Only the extras are editable, one currency at a time so there is one primary button. The one offer is stated as an owner rule. Coupons and Affiliates are tabs of the same page.

## States per screen

| Screen | New | Live | Empty | Error | Loading |
|---|---|---|---|---|---|
| Requests | extra row, "1 new request" notice | default Needs reply queue | R2-12 empty wording | list failed, Try again, rail count left off | skeleton rows |
| Enquiries | extra row, notice | default To contact | wording plus when signed up not paid appears | same | skeleton |
| Reports | "drafts were written today" notice, extra Draft row | rows incl. Send failed with Retry | R2-12 empty wording | same | skeleton |
| Report review | same as Live | draft, Send behind confirm | no longer waiting | could not load | skeleton |
| Payments | extra Paid row | tiles, Needs a look, Renewals, table | zero tiles and month empty wording | failed read, count left off | skeleton |
| Invoices | same as Live | missing invoice, GST summary, register, reconciliation | month empty | failed read | skeleton |
| Prices, Coupons, Affiliates | same as Live | forms and tables | "No prices changed from here yet", "No coupons yet", "No affiliates yet" | saving off until loaded | skeleton |
| Privacy, Breaches | hot clock strip | overdue first | R2-09 empty wording, calm strip | failed read, clocks keep running | skeleton |
| Closures, Access log | same as Live | lists | R2-09 empty wording | failed read | skeleton |
| Health | same as Live | five sources | "Everything is working" | per-source Could not read | skeleton |
| Emails, App errors, Settings, Access | as Live | tables and forms | R2-09 wording | failed read | skeleton |
| Access (protection) | not required | verified | verified | did not verify | verified |
| Sign in and utility | signed out after 12 hours notice, reset sent | default | default | wrong password, invalid link | none |

## Field to source table

Placeholders such as `<business>`, `<requester>`, `<time>` are used wherever a value would be invented. Money figures in the mocks are arithmetic from the owner's prices (5 x 2,999; 2,999 incl 18% GST split as taxable 2,541.53 + tax 457.48 with 0.01 round off) and are illustrative only.

| Screen and element | Source | Tag |
|---|---|---|
| Requests list, queues Needs reply, Waiting on customer, Done | `support-staff.ts` queue derived from messages, `app/(protected)/support/page.tsx` | [E] |
| Type chip Support or Change, one list | support tickets plus change requests from `requests-section.tsx` | [E], merge in CR-08 |
| Categories | `SUPPORT_CATEGORIES` (`packages/shared/src/lib/support.ts`) | [E] |
| Waiting clock, Over 4 hours, Late | `reply-clock.ts`, `WAIT_LIMITS` in `today-queue.ts` | [E] |
| Chip "Paid, in progress" | change request paid and started state | [Q] small |
| Reopen and reply in one step | `updateTicket` plus reply | [A] small |
| Quote, start as included, decline | `request-actions.ts`, `request-notify.ts` | [E] |
| Attachment chip | `support-attachments` route | [E] |
| Enquiry buckets To contact, Talking, Setup link sent, Won, Lost | `ENQUIRY_BUCKET_LABELS` in `lib/enquiries.ts` | [E] |
| Enquiry columns Business, Source, Wants, Waiting | `enquiry-list.tsx` | [E] |
| Signed up, not paid row | `lead-repair.ts` and pipeline | [E] |
| Mark contacted, Send setup link in bulk | `lead-updates.ts` | [A] bulk |
| Export | `/leads/export` | [E] |
| Reports columns and states Draft, On hold, Approved not sent | `reports/page.tsx`, `REPORT_STATE_LABELS` | [E] |
| Send, Hold, Release | `reports/actions.ts` | [E] |
| Send failed with Retry | failure only logged today | [A] |
| Payments tiles Collected, Refunded, Failed, Needs a look | `payments/page.tsx` (`rupees.*`) | [E] |
| Needs a look rows | `payments-needing-attention.tsx` (`attention_reason`) | [E] |
| Renewals and overdue lane | subscriptions past_due or lapsed, as built in `lib/server/today.ts` | [Q] |
| Payments table When, Client, For, Method, Amount, Status, Invoice | `payments/page.tsx` | [E] |
| Payment panel, refund, manual refund | `refund-dialogs.tsx`, `refund-preview.ts` (`REFUND_STAYS_ACTIVE_LINE`) | [E] |
| Missing invoices, GST summary, register, reconciliation | `invoices/page.tsx`, `invoice-register-view.ts` | [E] |
| Issue invoice | `client-invoicing.tsx` | [E] |
| Services read only | `catalogueRows()` in `pricing/page.tsx` | [E] |
| Extras form, price history | `pricing-admin.ts`, `savePricesAction` | [E] |
| Offer rule | root `CLAUDE.md` owner rule 2026-11-11 | text |
| Coupons, Affiliates columns | `coupons/page.tsx`, `affiliates/page.tsx` | [E] |
| Privacy list, clocks, steps, outcomes | `privacy-requests/page.tsx`, `deadline-clock.ts` (`requestClock`), `REQUEST_OUTCOME_LABELS` | [E] |
| Breach duties and clocks | `breaches/page.tsx`, `breachClock` | [E] |
| Clock strip and Compliance rail count | min of open clocks across privacy and breaches | [Q] |
| Closures list and Restore, Extend | `leaving/page.tsx`, closure data, `client.closure_restore` and `client.closure_extend` | [E] |
| What people said | `leaving/page.tsx` | [E] |
| Access log columns | `access-log/page.tsx`, `staff-access-log` | [E] |
| Full action list in the filter | `STAFF_ACCESS_ACTIONS` plus the 16 missing values | [A] small |
| Client filter by name | business lookup | [Q] small |
| Health rows | `deliveries.ts` counts, error issues, Google status, Teams settings | [Q] |
| Emails and webhooks table, Resend all failed | `deliveries/page.tsx`, `actions.ts` (max 25 emails and 25 alerts, 24 hours) | [E] |
| App errors table | `support/errors/page.tsx` | [E] |
| Settings: setup call, rounds, Teams, Google | `settings/page.tsx` | [E] |
| Remove Teams address behind confirm | R2-09 open question 3 | [A] |
| Access: protection lines | `protection-status.ts` | [E] |
| Staff account row, recovery invite | `staff/page.tsx` reduced | [E] |
| Login, forgot, reset, invite, no access, 404, error | `app/login`, `no-access`, `not-found-view.tsx`, error digest | [E] restyle |

Deliberately absent because there is no data source: Paytm or gateway health, WhatsApp status, webhook latency, an Active refunds tile, owner or assignee, roles, Package, Ad credit, Social alerts (waits for N7), timer last ran (waits for CD-20).

## New copy for the owner to approve

1. Refund tick sentence: "I have checked that {amount} should go back to this customer."
2. Manual refund tick sentence: "I have checked that {amount} was already refunded outside BrandBasket."
3. Plans and offers offer line: "Dedicated Expert Monitoring is free when a customer has all three plans. A basket is the plans added up: there are no package discounts and no ad money."
4. Coupons header: "The owner offer rule: the only offer is Dedicated Expert Monitoring free with all three plans. Keep a coupon live only while it is needed."
5. Dialog consequence lines for reply, quote, start as included edit, decline, setup link, send report, retry send, resend, restore, extend, close privacy request, close breach, delete code, remove Teams address, issue invoice, invite.
6. Empty and error lines not taken from R2-09 or R2-12 (Requests error, Enquiries empty, Health, Closures error).
7. Utility copy: "This sign in cannot open the console", "That page does not exist" with "Back to Today" (replaces the customer wording "Back to the journey").

## Open questions

1. **Needs a look rule.** The mock counts a past due or lapsed renewal as Needs a look on Payments, in the rail and on Today. Confirm that one shared definition is wanted (the build must route all three through one function).
2. **Four tiles or three.** Plan S15 says three tiles. The code already has Collected, Refunded, Failed and Needs a look, so the mock shows four. Cut Refunded if three is firm.
3. **D10 lapse policy.** The Renewals lane shows past due and lapsed with days overdue and amount. It does not state what happens at the end of a grace period until the owner decides.
4. **Closure restore and extend.** What the dialogs may promise, and how long Extend adds, is not in the code I read. Wording is generic and the period is a placeholder.
5. **Leaving offers.** `leaving/page.tsx` shows "Stayed" with an offer percent. The owner rule says there are no package discounts. The mock shows "Stayed" only. Confirm the retention offer still exists.
6. **Waiting chip colour.** The language file and plan 4.2 say waiting is a gold wash. The mocks use sunken to hold the three gold budget. CR-A4 should settle the status vocabulary.
7. **Derived tints.** Sage wash `#E4EEE8`, error wash `#FBEAE7`, sage text `#2F5A43` are derived from the brand tints. Confirm them as tokens.
8. **Issue invoice consequence.** The line about invoice numbers running in order is my reading of tax invoicing; confirm against `client-invoicing.tsx`.
9. **Acquisition tab.** Named in the Money tabs but not mocked here (ad results already has a clean empty state).
10. **App error statuses.** Chip labels Open and Seen are placeholders; the real status set was not found in the files read.
11. **Timer state.** Reports empty state says nothing is waiting. If the monthly timer is off that is untrue; CD-20 still needs the owner's answer.
12. **Access log Person column.** Kept because the recovery administrator may be a second identity (D30). Drop it if the owner prefers.
13. **Command bar, bell, account menu** in the top bar are drawn as static slots; CR-A1 owns their design.
