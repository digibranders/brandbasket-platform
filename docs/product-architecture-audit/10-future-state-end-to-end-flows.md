# Future-state end-to-end flows (proposal)

Everything here is a PROPOSAL unless a line says "exists today". It stays inside what the code can already do plus the gaps listed in `12`. Where a flow depends on an owner decision it names the decision in `14`.

## F1. Customer: first visit to first value

1. Visit the marketing site and choose services (any one, two or all three). Exists today. The price shown is the price charged; offers shown equal offers in checkout (decision D2).
2. Sign up with email and OTP. Exists. Refresh keeps the code step (proposal: store step server side).
3. Short intake, then basket summary with the same price rows as checkout. Exists.
4. Pay. Exists. Proposal: an ordinary first payment lost by the webhook recovers within 10 minutes by job and on reload by page check.
5. Welcome Home shows one next action: book kickoff (website), connect accounts and answer setup questions (Social, Ads). Today only Website has this; Social and Ads get an equivalent first task and a staff owner assigned or shown as Unowned.
6. Staff see the new paid service on Today within minutes, with the customer's setup answers on the client page.

## F2. Website service

Kickoff booked, then held (staff mark, or automatic fallback clearly labelled), build, preview email that links the dashboard approval page (not the external site), customer approves or asks for changes there, revisions carry their own due date, approved previews appear on Today, launch checks, live email. A reply to the preview email is still handled, but it is turned into a request that counts a round.

## F3. Social service

Setup answers and account connection, staff plan a month of posts with dates, staff send for approval (customer is notified), customer approves from the notification, staff are notified of the approval and see approved posts due on the Work board, staff publish, the monthly report lists what was committed and what was published. Monthly commitments are stored as data.

## F4. Paid Ads service

Own entitlement. Setup collects ad account access and budget. Staff keep one place for campaigns and monthly numbers (Work, Paid Ads lane) with owner and due. Customer sees spend, leads, cost per lead and campaign status, and can ask for a change from the page. Creative or budget approvals are out of scope until the owner decides whether the customer approves ads (decision D8).

## F5. Ongoing monthly cycle

Renewal charge on the basket date; failure shows a banner and sends Pay now to the payment step; Today shows past due for finance; monthly report job drafts per service, staff review, report emails send; the customer opens one Reports page.

## F6. Support and change requests

One Messages place. A request has an owner or shows Unowned, a clock (soon at 4 hours, late at 24 hours exists today), a quote state, and a status the customer sees. Paid started requests have their own clock.

## F7. Cancellation and recovery

Cancel one service: confirmation states the end date, the service stays usable to that date for every service, Today shows the pending end for staff. Cancel all: account closure with 30 day lock, restore link, erase job enabled and tested, Compliance shows days left. Lapse: policy decided (what stops and when) and shown on Money. Reactivate: same checkout, receipt, services restored.

## F8. Team access

Owner invites an editor or viewer. A signed-in or new invitee joins the inviter's workspace with the chosen role (proposal fixes the oldest-membership behaviour). Expired or used links are explained before the Join button.

## F9. Staff day

Open Today: My work, Unowned, Late. Work board lanes by service. A client page per customer with service tabs and the customer's view of their own status. Every action shows what the customer will see and which email goes. Admins see privacy requests and breaches with deadlines on Today.

## What is deliberately not proposed

No new dashboards, no new CRM, no marketing pages, no new visual style, no change to prices or terms. Anything touching price or entitlement semantics waits for `14`.
