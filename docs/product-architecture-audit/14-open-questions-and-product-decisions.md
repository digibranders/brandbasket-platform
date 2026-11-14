# Open questions and product decisions for the owner

Only genuine decisions that code or evidence cannot settle. Each has a recommended default and the consequence of each choice. Nothing here has been decided or implemented.

| ID | Decision | Evidence | Recommended default | Consequence |
|---|---|---|---|---|
| D1 | Yearly billing at 10 percent off | Live: add-ons.ts, checkout billing=yearly. CLAUDE.md says billed monthly | **OWNER 2026-11-14: keep as is.** An earlier note to remove it was reversed. CLAUDE.md still says monthly only, so update CLAUDE.md or the copy so the written rules match what is live | No code change |
| D2 | INR 1 or USD 1 first month on Social and Ads | trial.ts | **OWNER 2026-11-14: keep as is.** An earlier note to remove it was reversed. CLAUDE.md says the only offer is monitoring free with all three plans, so update CLAUDE.md so the written rules match what is live. Referral and affiliate codes still need a ruling | No code change. The first-payment reconciliation job stays needed for these checkouts |
| D3 | Strike-through "usually" prices (INR 4,999 and USD 79) | Absent in this repo (CLAUDE.md says present); may live in the website repo | Check the website repo; keep one pricing source | Mismatch between site and app prices |
| D4 | Is there ad money, "added by us each month"? | Rows still render for old subscriptions; owner rule says none | Hide the row unless a stored credit exists, then retire | Old customers with a stored credit may lose a displayed line |
| D5 | Is DIY versus Done For You a real product choice? | No code models it; only managed exists | Declare managed the only mode and remove DIY language from marketing, or specify DIY as a separate scope | A real DIY mode is a new product (self-serve tools, separate pricing) |
| D6 | The "up to INR 10,000 of budget" Paid Ads line and "up to 4 platforms" Social line | Catalogue copy; nothing enforces them (`add-ons.ts:58-79`) | Keep as promise, enforce or measure in the monthly report | Unenforced promises are a refund risk |
| D7 | Are Website, Social and Paid Ads fully independent entitlements? | One `social` key serves two products | Yes, separate `ads` key | Ads-only customers lose Social access; cancelling one keeps the others | **Deferred with Paid Ads.**
| D8 | Do customers approve ad campaigns or creatives? | No approval flow exists for ads | No for launch; staff run ads and report numbers | A real approval flow adds states, notifications and a staff queue | **Deferred: Paid Ads is out of scope for now.**
| D9 | Do editors approve go live? | Editors may approve a preview (`website-screen.tsx:126`) | Owner only for go live, editors comment | Slower approvals but fewer accidents |
| D10 | Payment lapse policy: what stops, when, and what is retained | "Display only, never moves a stage" (`billing-attention.ts:5-14`); hosting pause timer may be off | Grace period then pause hosting, keep data, allow reactivation | Without a policy staff improvise and customers get unequal treatment |
| D11 | Is an ordinary refund automatic, manual or not offered? | Refund only marks rows (`refund-actions.ts:10`) | Provider refund by finance with a credit note and customer email | Chargebacks and GST credit note requirements |
| D12 | Assignment policy | No auto-assignment exists | **CLOSED 2026-11-14: one staff account does everything, so there is nothing to assign** | Remove owner and Unowned from the plan |
| D13 | Role split | Support can cancel builds and change domains | **CLOSED 2026-11-14: one staff account with full access, no role split** | Protect the account instead (see D30) |
| D14 | Automatic kickoff after 24 hours (default on) | `kickoff-sync.ts:13-15` | Keep but label it clearly and notify the builder | Without a label staff cannot trust "held" |
| D14b | Setup for Social and Ads | Website has a kickoff call; Social and Ads have none | **DECIDED 2026-11-14: no call. Setup happens in the customer app: the customer connects their accounts and answers the setup questions.** The customer also gets a message when staff start work | Needs a guided in-app setup per service, account connection that reports success or failure, and a staff task that shows the answers |
| D15 | What does Dedicated Expert Monitoring actually deliver? | A label and price rule only; no screen or queue | Define a monthly deliverable and owner, or remove from sale until built | Selling an undefined service is a refund risk |
| D16 | Which Social engine is the product? | Environment switch, two UIs | **DECIDED 2026-11-14: social-auto (automated). The manual staff path is retired** | Remove the staff deliverables flow after confirming no live customers use it |
| D17 | Is Local SEO fully retired? | Not sold; still in types, reports, admin forms | Retire after a production data check | Old customers may still hold it |
| D18 | Self-serve payment method change instead of a staff request (G7) | Requests a secure link from staff | Build self-serve | Reduces failed renewals and staff load |
| D19 | Is the Cloudflare Access protection in place for the console? | Docs conflict; no code verifies it | Verify and add a JWT or header check | Console exposure if Access is absent |
| D20 | Monthly Social post commitments: how many and enforced? | Not stored as data | Store the commitment per plan | Reports and refunds depend on it |
| D21 | Reminder for unpaid sign-ups | Today row after 2 days, no email | **DECIDED 2026-11-14: one reminder email after 1 day and an owner on the Today row** | Needs an email template and a job |
| D22 | Multi-business users: need a business switcher? | Oldest membership wins | Add after the invite fix | Invitees with their own business need it |

Technical questions that are not decisions (production timer state, Razorpay retry schedule, external social posting states, whether any `search` rows exist) are in `00` section 1 as Unknown and need read-only production checks you authorize.
| D23 | Who operates Social after setup? | Owner direction | **CLOSED 2026-11-14: automation operates; the customer sets up and manages in the app** | See `18` |
| D24 | Default staff owner for Social purchases | Owner direction | **CLOSED 2026-11-14: none. There is one admin and no Social staff work** | See `18` |
| D25 | Hide Paid Ads from checkout until it is built? | Sold today at INR 2,999; nothing operates it | **OWNER 2026-11-14: leave as is for now.** The hide change was reverted | Paid Ads stays on sale and an ads-only customer still gets the Social screens (finding 1 in 00) until the owner decides |
| D26 | Monitoring bundle rule if Paid Ads is hidden | Free only with all three plans | OPEN | Decide free with Website plus Social, or pause monitoring |
| D27 | Automatic posting default | social-auto needs explicit per channel consent | OPEN. Recommend opt in | Default on is not allowed by its consent rule |
| D28 | Who answers customer questions about Social | One admin, no Social interference | OPEN. Recommend the same support queue | Questions still arrive |
| D29 | Staff console host name | The owner first wrote admin.brandbasket.in | **CLOSED 2026-11-14: the host is console.brandbasket.in, no rename** | None |
| D30 | Protection of the single staff account | No code verifies Cloudflare Access; no second factor | OPEN. Recommend Cloudflare Access plus a second factor and an offline recovery admin | One account holds all customer data and money actions |
| D31 | Kickoff call confirmation | Staff mark a call "held" in four places; the name is unclear | **DECIDED 2026-11-14: keep staff confirmation, rename it "Call completed", show it as a console popup and a notification, one place to act, 24 hour automatic fallback labelled "Started without call confirmation"** | Needs a console popup and notification, new wording for staff and customer, removal of the duplicate buttons |
| D32 | Customer app brand: move to the website brand (near-black primary, rattan gold accent, Red Hat fonts) from blue and Geist | tokens.css uses blue 1E65E3 and Geist today | OPEN. Recommended yes. Gate for R2-00 | Re-themes every customer screen; one token change plus docs |
