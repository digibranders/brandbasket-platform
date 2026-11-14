# The best BrandBasket should have (recommended target product)

> **Revision 2026-11-14:** the owner confirmed Social is automated through social-auto with no staff involvement, there is one admin, and Paid Ads is deferred (display only). Where this file disagrees, `18-social-automation-and-revised-scope.md` wins.


Status: RECOMMENDATION for your approval. It is built from the audit evidence in `00` to `16` and from the three decisions you gave on 2026-11-14 (the owner kept the live offers: the ₹1 first month on Social and Ads, Yearly Save 10%, and monitoring free with all three plans; a 1 day reminder for abandoned sign-ups; and support sees stuck first payments). Numbers marked "proposal" are my suggestions, not facts from the code, and need your confirmation.

## 1. What BrandBasket is

A done-for-you digital presence service for local businesses in India. A business owner buys one, two or all three independent monthly services, pays one bill, and a named person at BrandBasket does the work while the owner approves and watches results in a simple dashboard.

- Managed only. The code has no DIY mode; selling one would be a different product (decision D5). Recommendation: say "we do it for you" everywhere.
- Three services, each complete on its own: Website Management, Social Media Management, Paid Ads Management, at ₹2,999 a month each, GST included (USD 59, no GST, outside India).
- Dedicated Expert Monitoring at ₹6,000 (USD 99), free when all three are bought. It is the only offer. Today it is only a label, so it must either get a real monthly deliverable or be taken off sale (decision D15).
- Offers stay as live today (the owner confirmed 2026-11-14): INR 1 first month on Social and Ads, Yearly Save 10%, and monitoring free with all three plans. No ad money and no package discounts. The written pricing rules in CLAUDE.md must be updated to match.

## 2. Seven principles

1. **Independent services.** Each service has its own entitlement, setup, work, status, report and end date. Billing stays one basket, one payment date.
2. **One owner.** Every request, payment problem, post, campaign, domain move and privacy request has a named owner or shows as Unowned on staff Today.
3. **One status per thing.** The customer and the staff see the same status words from one mapping.
4. **Every action has a visible result.** A staff button names what the customer will see and which email goes. A customer action always leaves a trace staff can act on.
5. **The customer never has to email us to move forward.** Approvals, quotes, payments and changes all happen in the dashboard.
6. **Money is exact.** A payment is recorded once, recovered if lost, refunded for real, and every charge has an invoice.
7. **Nothing is promised that no one operates.** Monitoring, monthly Social commitments, report emails and account erasure either run on a verified schedule or are not promised.

## 3. The customer experience

Home answers one question: what do I do next? In priority order: fix a payment problem, finish setup for each service, answer what is waiting, then see how things are going.

| Area | What it is | Why |
|---|---|---|
| Home | One next action, then live status per service | First value within 48 hours of paying |
| Needs your OK | Preview approval, posts awaiting approval, quotes, change checks, in one list that the bell also opens | Today these sit in three places |
| Messages | Requests, help and calls in one place, one URL per request | One place to ask, one place to read |
| Website | Overview, Pages, Blog, Domain from day one | Blog and Domain are hidden until launch today |
| Social | Accounts, posts, approvals, analytics | Own entitlement |
| Paid Ads | Access, budget, campaigns, results, ask for a change | Own entitlement and its own sales page |
| Reports | Monthly report per service, always visible once live | Link hides today until the first report |
| Account | Business profile and brand, Plan and billing, Team, Settings, Privacy and delete | Cancelling is findable |

Customer promises to keep (they already exist and work): a clear price with GST, a preview they approve before launch, an approval step for every post, monthly numbers, and a way to close their account and get their data erased.

## 4. The first week, per service

| Service | First task for the customer | First task for staff | Done when |
|---|---|---|---|
| Website | Book the 30 minute kickoff and fill the checklist | Builder assigned, preview due 48 hours after the call | Preview sent |
| Social | Connect Instagram and Facebook, answer the setup questions | Social manager assigned, first month of posts planned | First posts sent for approval (proposal: within 5 working days of setup) |
| Paid Ads | Grant ad account access, set budget, offers and area | Ads manager assigned, first campaign built | First campaign live (proposal: within 5 working days of access) |

Decided: Social and Ads have no kickoff call. Setup happens entirely in the customer app (connect accounts, answer the questions) and the customer is messaged when staff start work. Open: whether the customer or BrandBasket operates the service after setup (D23), which changes the product.

## 5. Staff operations

**Roles:** one staff account with full access does all support, finance, build and compliance work (owner, 2026-11-14). No role split.

**Console shape**
- Today: one list ordered by what is late first. Each row shows owner, due date and the customer's current status.
- Work: lanes for Website builds, Kickoffs, Social posts, Paid Ads, Monitoring and Reports, each with owner and due date.
- Clients: one workspace per customer with a tab per service they bought, so Social and Ads work leaves the "Plan and billing" tab.
- Inbox: requests, change requests with quote state, enquiries.
- Money: payments and renewals, invoices, prices, acquisition. All of it is visible to the one staff account.
- Compliance: privacy requests, breaches, access log, staff, with owners and deadlines visible on Today for admins.
- System: errors, email and webhook delivery with retry state.

**Service levels** (proposal, adjust to your capacity): enquiry 1 hour (exists), request reply soon 4 hours and late 24 hours (exists), first website preview 48 hours after the kickoff (exists), approved preview launched within 2 working days, post approved by customer published by its date, stuck first payment looked at within 1 day (exists), privacy request answered within the statutory period with an internal target of 7 days.

## 6. Billing and money

- One basket, one monthly payment, GST on every invoice (works today).
- A first payment lost by the webhook is recovered by a scheduled job within minutes and again when the customer reloads checkout (job covers ordinary charges, not only the offer checkouts).
- A renewal that fails shows a banner and an email whose Pay now link goes to the pay step, with a self-serve card change. Finance sees past due on Today.
- A lapse policy is written down (proposal: 7 days of grace, hosting paused at 14 days, data kept for 30 days, then account closure rules apply) and shown on the Money page.
- A refund calls the payment provider, issues a credit note, emails the customer, and moves access if the policy says so. Until built, label the action "record a refund made elsewhere".
- Cancelling one service keeps it working until the paid month ends, the same rule for all three.

## 7. Trust and safety

Keep what is already strong: row level security with scoped queries, separate sessions for the two apps, idempotent payment recording, the email outbox. Add: a start-up check that the customer app connects as the restricted database role, proof of Cloudflare Access for the console, tests for the 16 untested admin action files and for concurrent webhook delivery, the four jobs (erase, hosting, first-payment check, reports) enabled and monitored in production, and the erasure order fixed.

## 8. What to cut or hold

- Cut: "ad money" lines (the owner kept yearly billing and the ₹1 first month), the Local SEO service from new surfaces, the Ads rail item that holds a dormant credit report, dead console routes.
- Hold (dormant, do not build on): the directory, clinic and free-listing code. Remove only after confirming that `businesses.kind = 'listing'`, which is also the unpaid sign-up state, is no longer relied on.
- Decide before launch: the two Social engines (keep one), monitoring, referral and affiliate codes.

## 9. Minimum coherent launch scope

Launch needs the P0 items in `12`, in this order: first payment recovery and the four production jobs, independent Paid Ads entitlement, invitee workspace fix, the staff owner and queue for Social and Ads with post approval notices, support permissions and Cloudflare Access proof, refunds, erasure fix, database role check. Everything in section 3 and 5 beyond that (Needs your OK, Work lanes, role split) follows as P1.

## 10. How we will know it works

Measured from the staff console and the database once the stack is running:
- Percent of paying customers who book or complete their first task within 48 hours (target: 80 percent, proposal).
- Items on Today with no owner (target: zero at the end of every working day).
- First payments stuck for more than 1 day (target: zero).
- Failed renewals recovered within 7 days (target: 70 percent, proposal).
- Posts approved by the customer but not published by their date (target: zero).
- Customer requests answered within 24 hours (target: 95 percent).

## 11. What I need from you to lock this

1. Confirm managed-only and the wording "we do it for you" (D5).
2. Confirm the service levels in section 5 and the first-week targets in section 4.
3. Confirm the lapse policy numbers in section 6, or give yours.
4. Decide monitoring (real deliverable or off sale), referral and affiliate codes, and which Social engine stays.
5. Approve the target architecture so implementation can start with the P0 slices.
