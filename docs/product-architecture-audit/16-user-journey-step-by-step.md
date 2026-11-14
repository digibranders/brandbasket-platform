# The user journey, step by step, in both apps

> **Revision 2026-11-14:** the owner confirmed Social is automated through social-auto with no staff involvement, there is one admin, and Paid Ads is deferred (display only). Where this file disagrees, `18-social-automation-and-revised-scope.md` wins.


Scope of this document: journey only (what each person does, sees and is told at each step, in the customer app and the staff console). UI polish is out of scope and deferred.

How to read it. Every step has the customer side and the staff side, the state that changes, the message sent, what the product does today, and what it should do. Status labels:

- **Works**: the step exists and both sides are connected.
- **Gap**: it exists but one side, a state, an owner or a message is missing or wrong.
- **Not built**: nothing implements it.
- **Decision**: the owner must decide first (see `14`).

Evidence labels: **B** verified in the browser (see `15`), **C** verified in code, **I** inferred. Refs like `P0-3` point to `12`. "Today" in the staff column means the console's Today queue. Customer-app paths are `app.brandbasket.in`, staff paths are `console.brandbasket.in`.

## The journey on one page

| Stage | Customer outcome | Staff outcome | Status |
|---|---|---|---|
| A. Choose, sign up, pay | Account exists, first payment done | Paid customer visible, payment correct | Mostly works, payment recovery and offers need decisions |
| B. Activation | Knows the single next thing to do per service | New paid service has an owner and a task | Gap for Social and Ads |
| C. Website | Kickoff, preview, approve, live | Builder owns each stage and sees what needs them | Works with queue and email gaps |
| D. Social | Connects accounts, approves posts, sees results | Someone plans, sends, publishes and is told of approvals | Gap: no owner, no queue, no approval notice |
| E. Paid Ads | Grants access, sees spend and leads, asks for changes | Someone sets up, runs and reports campaigns | Gap: no entitlement of its own, no workflow |
| F. Ongoing month | Renewal, report, requests, team | Report review, request replies, quote work | Works in parts, timers unverified |
| G. Billing exceptions | Fails, lapses, cancels, returns | Finance sees it, policy decided | Gap: no queue, no policy, refund moves no money |
| H. Support and compliance | Asks, requests data deletion | Owned, timed, closed | Gap: privacy and breaches not on Today |

---

## A. Choose services, sign up and pay

| # | Customer step (customer app) | Staff and system step (console) | State | Message sent | Today | Proper behaviour |
|---|---|---|---|---|---|---|
| A1 | On the marketing site picks one, two or all three services; the link carries the choice (`/signup?plan=website,social,ads`) | If the site's enquiry form is used, `/api/leads` creates an enquiry that appears in Enquiries and on Today ("New enquiry", 1 hour limit) | none, or lead `new` | none | **Works** (C). Site content is in another repo, not audited | Unchanged. The owner decides whether the "usually" prices shown on the site match the app (D3) |
| A2 | `/signup` shows the form: business name, name, email, country, state, mobile, password, terms | none | none | none | **Gap (B)**: the side panel lists website steps ("We build your website. You review it. It goes live.") even for a Paid Ads or Social link, and the invite sign-up shows the same panel; mobile number must be unique per account | The panel and the heading follow the chosen services |
| A3 | Asks for a 6-digit email code, valid 10 minutes, 10 code requests per hour per network | none | account created, business `kind = listing` (the unpaid state) | sign-up code email | **Works (B)**. Gap: the code step lives in browser memory, a refresh restarts the form | Keep the limits; keep the step server side |
| A4 | `/start` asks 3 to 5 short questions (3 for Paid Ads alone, 5 for Website). Each answer is saved. "Skip for now" jumps to checkout | Client page "What they told us" shows the answers, read-only | `client_intakes` rows | none | **Works (B)**. Gap (B): an unpaid sign-up is sent to `/start` from every page, including Home, Settings, Billing and Help, so they cannot reach Help or fix their details | Allow Help, Settings and Sign out while unpaid |
| A5 | Summary shows the basket and total with GST. "Change services" returns to the choice | none | basket in the URL | none | **Gap (B)** Decision D1, D2: a ₹1 first month (Social, Ads) and a "Yearly, Save 10%" switch are shown | OWNER 2026-11-14: keep the live offers (INR 1 first month on Social and Ads, Yearly Save 10%, monitoring free with all three plans); update the written pricing rules to match |
| A6 | `/checkout` asks for billing details (GSTIN optional, address), then Pay opens the confirm dialog, then Razorpay | none until paid | `subscriptions` incomplete, lines pending | none | **Works (B, fake provider)** | Unchanged |
| A7a | Payment succeeds: lands on Home with the welcome message | Payments shows it, tax invoice issued in the same transaction, onboarding project created only if a website line exists | subscription `active`, lines `active`, `kind` becomes website | payment received email with receipt | **Works (B)**. Gap: the business becomes `kind = website` even for an ads-only buyer; no project exists, which is correct, but the staff client page still draws the website pipeline (B) | Staff client page shows the services the customer actually bought |
| A7b | Payment pending: "waiting" screen with a reload | none | subscription still `incomplete` | none | **Works** (C) | Same |
| A7c | Payment fails or the window is dismissed: "We could not confirm that payment, try again" | none | none | none | **Works** (C) | Same |
| A7d | Payment taken but the webhook never arrives: customer stays on waiting; only reloading checkout recovers it | Finance sees "Payment needs a look" if flagged; support sees nothing; the 10-minute job covers offer checkouts only and its timer is not enabled by the installer | stays `incomplete` | none until recorded | **Gap (C)** P0-3 | A job recovers every first payment within minutes; support sees stuck payments too (decided 2026-11-14) |
| A7e | Payment lands on a cancelled or replaced subscription: customer paid, gets nothing | Stored as an unapplied payment with a reason, finance refunds by hand | `attention_reason` set | none | **Gap (C)**: no customer message, no deadline, refund moves no money | Finance queue with deadline, real refund, customer notice (P0-5) |
| A8 | Customer abandons before paying | Today shows "Signed up, not paid" after 2 days, no owner | `account_created` | none | **Gap (C)** | DECIDED: one reminder email after 1 day and an owner on the Today row |

## B. Activation: the first task per service

| # | Customer step | Staff and system step | State | Message | Today | Proper behaviour |
|---|---|---|---|---|---|---|
| B1 | Home shows one next action. Website: book a kickoff call. Social or Ads: today the same kickoff card appears, worded for Social | Today shows one generic "Add-on to start: Paid Ads Management" row, due next day, no owner (B) | none | none | **Gap (B)** | DECIDED (D14b): no kickoff call for Social or Ads. Each service has its own guided setup inside the app: connect accounts, answer setup questions, set budget. Staff get a task showing the answers |
| B2 | Setup questions per service (`service_setup`) are answered in the customer app | Console never reads them (C) | `service_setup` | none | **Gap (C)** P0-7 | Answers appear on the client's service tab and on the staff task |
| B3 | none | Someone is assigned. No auto-assignment exists; only leads, builds, tickets and errors have owners | owner set manually | none | **Gap (C)** Decision D12 | Every paid service starts as an owned task, or visibly Unowned on Today |
| B4 | Customer sees what happens next and who is handling it | Staff action "mark contacted" clears the row but the customer sees nothing change | contacted flag | none | **Gap (C)** | DECIDED: marking a task started sends the customer a "we have started" message and shows it on Home |

## C. Website Management (the longest journey)

| # | Customer step | Staff and system step | State | Message | Today | Proper behaviour |
|---|---|---|---|---|---|---|
| C1 | Books a 30 minute kickoff call on Home (Cal.com), picks day and time | `/calls` shows the booking; client Website tab shows "Kickoff call" | booking row, project `onboarding` | Cal.com confirmation | **Works (C)**. Gap: if the booking read fails the button silently disappears | Show an error and a fallback link |
| C2 | Home shows "Kickoff booked" with countdown | Today "Did the kickoff happen?" after the call ends | none | none | **Works** | Same |
| C3 | After the call: "We're confirming your call" | Staff mark Call completed (with notes), mark no-show, or reschedule. If nobody acts, a timer starts the build after 24 hours when `KICKOFF_AUTO_START` is on (default) | project `submitted`; first preview due 48 hours later | none | **Gap (C)**: staff cannot tell a call marked Call completed from an automatic start. Social-only and Ads-only customers have no kickoff concept at all. Timer unit enabled only when the release folder exists | Label automatic starts, notify the builder, define what a kickoff means for Social and Ads (D14). Decided D31: popup in the console and a notification, one place to act, labelled 24 hour fallback |
| C4 | Home: "We are preparing your website" | Builder assigned (optional), Board column "Ready to start", Start building | `building` | none | **Gap (C)**: Today lists it only if a due date exists | Builder and due date always set |
| C5 | Home: "We are building your website" | Builder sends the preview from the console | `preview` | preview ready email | **Gap (C)**: the email links the external preview and says "Reply", but approval exists only in the dashboard at `/website`; a reply bypasses the round count | Email links `/website` where Approve and Ask for changes live (P1-1); a reply becomes a request |
| C6 | `/website`: sees the preview, "Approve and go live" or "Ask for changes" (dialog). Editors may approve, viewers cannot | Approve: team email, Board column "Approved". Changes: a ticket and a round are counted, team alerted, customer gets "changes received". The support role sees "Add a round of changes", "Cancel this build", "Cancel build" and "Put on hold" on this client's Website tab (B) | `approved` or `revisions` | team email; changes-received email | **Gap (C)**: an approved preview has no Today row (sits unseen); a revision uses the first preview's due date so it reads late | Approved previews and revisions appear on Today with their own due date; owner decides who may approve (D9) |
| C7 | "We are making your changes" | Builder sends an updated preview (same step as C5) | `revisions` then `preview` | updated preview email | **Works**, with the C5 and C6 gaps | Same |
| C8 | Home: "You approved the preview" | Eight launch checks, optional address check, Mark live | `live` | live email (resend 7 days) | **Works (C)**. Hosting pause timer for lapsed customers is installed, not enabled | Confirm the timer or the policy (P0-4, D10) |
| C9 | "Your website is live" for 7 days, then ongoing Home; Blog, Pages, Domain tabs appear only once live | Hosting and health checks run on timers | none | none | **Gap (C)**: Blog and Domain have no navigation before launch | Show the tabs from day one with an explanation |
| C10 | Customer asks to move to their own domain (`/website/domain`) | Only client pages show it, no Today row, no owner | `movingTo` | email when switched | **Gap (C)** | Domain moves are a task with an owner |
| C11 | Customer edits pages or blog posts, or asks for changes ("Ask for a change") | Requests queue, change request and quote flow (see F3) | ticket or request states | emails per move | **Works** | Same |

## D. Social Media Management (automated by social-auto)

Decided by the owner: automated, set up and managed by the customer in the app, no staff work, one admin who does not interfere. Full evidence and gaps are in `18`. The proper journey:

| # | Customer step (customer app, `/social`) | System step | Admin | Message | Status and fix |
|---|---|---|---|---|---|
| D1 | Buys Social. Home shows "Set up Social", no call | Workspace is created on first setup | none | receipt | Works. Add the first task on Home |
| D2 | Connects Instagram, Facebook Pages, LinkedIn and Google in the app | Connect link, Allow, return to `/social` | none | none | Works. Gap: clear failure and retry |
| D3 | Confirms their website, presses "Write my posts" | Write job: reading, writing, drawing, in review | none | none | Works. Gap: customer is told only by reloading |
| D4 | Keeps or drops facts and topics, approves pictures, or turns on automatic posting per channel | Only approved pictures are posted | none | auto-approval notice | Works in social-auto. Gap: Brandbasket does not notify |
| D5 | Chooses weekdays per channel | Applied to later batches | none | none | Works |
| D6 | Sees the calendar; can edit, delete or send now before it goes out | Publisher posts daily | none | post published | Works. Gap: no confirmation |
| D7 | A post fails or a connection expires | Push alert to the single admin | alert only | `post.failed`, `connection.expiring` | **Gap**: the customer is not told; Brandbasket receives no social-auto webhooks (S1) |
| D8 | Reads analytics and the monthly report | Daily collection | none | monthly report | Works if the analytics timer runs (S9) |
| D9 | Cancels or lapses | Nothing tells social-auto to stop | none | none | **Gap (S2)**: pause posting on lapse or end, resume on reactivation |

## E. Paid Ads Management (deferred by the owner)

Ignored for now; it is a display page. Open decision D25: hide Paid Ads from checkout until it is built (recommended), because customers can buy it today and nothing operates it. The earlier steps E1 to E7 are withdrawn.

## F. The ongoing month

| # | Customer step | Staff and system step | State | Message | Today | Proper behaviour |
|---|---|---|---|---|---|---|
| F1 | Monthly renewal charges the basket on one date | Webhook records payment and invoice | payment recorded, `paid_through_at` moves | receipt | **Works (C)** | Same |
| F2 | Monthly report email and `/reports` per service | Report job drafts, staff review and approve | report states | monthly report email | **Gap (C)**: timer installed, not enabled | P0-4 |
| F3a | New request or "Ask for a change" | Request appears in Requests; assignee set manually; clocks 4 hours (soon) and 24 hours (late) | ticket open | team alert; no confirmation email to the customer | **Gap (C)**: customer gets no acknowledgement; one request has two URLs (sheet and page) | Customer acknowledgement; one canonical URL |
| F3b | Staff quote the change; customer sees "Accept quote" | Staff reply with a quote | change request `quote` | quote email | **Works (C)** | Same |
| F3c | Customer accepts and pays | Charge recorded, request `in_progress` | `in_progress` | emails per move | **Gap (C)**: the request can look "waiting on client" in the queue after the quote was paid | Paid started requests have their own clock |
| F3d | Staff finish; customer approves the change or reopens | Ticket closes | `done` or `closed` | emails | **Works** | Same |
| F4 | Owner invites an editor or viewer from Settings, Team (rate limited, role chosen) | none | invite row | invite email | **Works (B)** for sending. The invitee path is verified below | Invitee joins the inviter's workspace |
| F4b | Invitee opens the link while signed out and sees "You have been invited"; "Create an account" carries the invite through sign-up | none | none | none | **Gap (B)**: the page checks only that the token looks valid, so an expired, used or wrong-address invite is refused only after pressing Join (B: an obviously fake token shows the same page). **Verified failure (B, DB)**: an invitee who creates an account through the link gets a personal business first, then joins the inviter's business as editor; the app opens the oldest membership, so pressing "Join the dashboard" lands them on the sign-up questions (`/start`) of their own unpaid business, not the inviter's dashboard | Explain the problem before Join; land in the inviter's workspace (P0-6) |
| F5 | Bell and email links open the right page | none | none | all | **Gap (B)**: a signed-out email click always ends on `/login`, then Home; the target is lost (B, verified for requests, reports, billing, website, ads and checkout) | Return to the original link after sign-in (P1-5) |

## G. Billing exceptions and leaving

| # | Customer step | Staff and system step | State | Message | Today | Proper behaviour |
|---|---|---|---|---|---|---|
| G1 | Renewal fails: banner "We could not take your last payment" and a failed-payment email with Pay now, which goes to `/billing` | Only a notice on the client page; no Today row | `past_due` (status re-read from Razorpay) | failed payment email | **Gap (C)**: recovery needs a request to staff for a secure link instead of a card change | Self-serve payment method change; finance queue (P1-3) |
| G2 | Billing period lapses: read access stays, writes go to Billing | Nothing on Today; hosting pause timer maybe off; policy undefined | `lapsed` | email | **Gap (C)** Decision D10 | Written policy, visible on Money |
| G3 | Owner reactivates from Billing; pays | Payment recorded | `active` | receipt | **Works (C)** | Same |
| G4 | Adds a service from Plan & billing (combined subscription, billing date moves) | Today "Add-on to start" row | new line | receipt | **Gap**: see B1 | Same as B |
| G5 | Cancels one service: it runs to the end of the paid month | No queue; row shows pending end | `end_requested_at` | none | **Gap (C)**: nav drops the service at once while guards follow the paid month | One rule for every service |
| G6 | Closes the account: locked 30 days with a restore link | Compliance "being erased" | closure | email | **Works (C)** | Same |
| G7 | Erasure after 30 days | Erase timer is installed, not enabled; run order deletes CMS content before the locked re-check | erased | none | **Gap (C)** P0-4, P0-9 | Enable, fix the order, test |
| G8 | Refund | Finance marks a payment refunded; nothing is sent to the provider, no credit note, no customer email | `refunded` flag | none | **Gap (C)** P0-5, Decision D11 | Real refund, credit note, notice |

## H. Support and compliance

| # | Customer step | Staff and system step | State | Message | Today | Proper behaviour |
|---|---|---|---|---|---|---|
| H1 | Help and calls; request form | Requests queue | ticket | reply email | **Works (C)** | Owner and clock on every ticket |
| H2 | Privacy request | Console Compliance only, admin role, no owner, not on Today | open, closed | confirmation email unknown | **Gap (C)** | Owner, deadline, Today row for admins |
| H3 | none | Breach register with 6 and 72 hour display deadlines | duties | none | **Gap (C)** | Alert and owner |

---

## Rules every step must follow

1. **One owner per work item.** A paid service, a request, a post, a domain move, a payment problem and a privacy request each has an owner or shows as Unowned on Today.
2. **One status vocabulary.** Customer wording and staff wording come from one mapping per service so the two screens never disagree (the website mapping already does this; Social, Ads, billing and requests do not).
3. **Every staff action states its customer effect.** The button says what the customer will see and which email goes. Actions with no truthful outcome today: send for approval, mark contacted, cancel build, add charge, refund, hold report, privacy request close.
4. **Every customer action has a staff trace.** Post approval, domain move, ad access granted, setup answers saved and cancel service each create a visible event for staff.
5. **Services are independent.** Website, Social and Ads each have their own setup, delivery and end date. Billing stays one basket and one payment date.

## What was verified where

Browser (B): sign-up, email code, intake, checkout, fake payment, ads-only Home and `/social` access, the Today row, the client page and the "Plan and billing" tab, signed-out deep links, unpaid sign-up lock-in, invite landing page, 404 states for the posting-service tabs. Code (C): everything else. Not yet run: webhook-missed recovery, refunds, erasure, preview and approval, Social approval, failed renewal, lapse and reactivation, and the editor and viewer permission checks beyond the invite landing; scenario scripts for each are in `13`.
