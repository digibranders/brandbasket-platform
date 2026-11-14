# Customer journeys, step by step

Labels: V = Verified in code, R = Reported in historical document, I = Inferred, H = Design hypothesis, U = Unknown. Paths relative to apps/customer/src unless stated. Back/forward, expired link, permission denial and mobile are noted per journey. Nothing here was run in a browser; behaviour is read from code.

## J1. Landing handoff to sign up

1. Marketing site links to `/signup?plan=website,growth` (also older `plan=managed`, `addons=`, ad `start` token). `readEntryRequest` parses it (features/entry/rules/account-entry.ts). `/join` and `/login?new=1|plan=` permanently redirect to /signup keeping params (app/(auth)/join/page.tsx, login/page.tsx:22-24). V.
2. /signup (app/(auth)/signup/page.tsx:34-58): already signed in goes to / (or /checkout if the link names a plan); signed in with no business sees NoBusiness. Basket priced by `loadSignUpBasket`. `start` token prefill only when the secret verifies. V.
3. Form (features/entry/components/sign-up-form.tsx): business name, name, email, country/state, phone with country code, password, terms checkbox. Turnstile checked server-side (`checkHuman`, entry/actions.ts:61). V.
- Success: details step returns an OTP step; code confirmed creates the listing account and redirects to `/start?services=...` (entry/actions.ts:98-100) or to an invite return.
- Failure: wrong code, rate limit with countdown (use-otp-retry-cooldown.ts), refused, send failed: all return `SignUpFailure` and keep the form (sign-up-form.tsx:54-58).
- Retry: "Send a new code" (cooldown), "Change email".
- Back/forward and refresh: the code step lives in `useState`, so refresh returns to details and nothing is kept server side (sign-up-form.tsx:80-103). Cost is re-typing, protected by OTP rate limits. V.
- Expired code: code works 10 minutes (copy at sign-up-form.tsx:117); a stale code returns wrong-code message. I.
- Mobile: single column; `EntryScreen` art becomes a band. I.
- Staff counterpart: admin /leads (attribution from `start` token, apps/customer/src/app/api/leads/route.ts) U for display.

## J2. Plan or basket selection, questions

1. /start (app/(pay)/start/page.tsx): `loadStart` redirects members home, sends no `?q=` to the first unanswered question or the summary, unknown `q` to the summary (features/start/loader.ts:75-95). Each answer is saved on submit (question-form.tsx) so refresh and Back resume. V.
2. Summary lets the person change services (`basket-form.tsx`) and shows the same price rows as checkout. V.
- Failure: price read failure shows aside error only (`load("start.aside")`).
- Mobile: aside stacks. I.
- Concern: first-month offer rows ("first month offer", `TRIAL_ADD_ON_IDS`) and `adCredit` line exist in this screen (start/loader.ts:4,113) while root CLAUDE.md says the only offer is free monitoring with all three. Owner decision needed (finding C3).

## J3. Checkout and payment

Entry: summary "Go to checkout", `/signup` redirect, Home "Pay", (app) layout hold, aliases `/plan`, `/onboarding/review?payment=`.

1. /checkout (app/(pay)/checkout/page.tsx, features/checkout/loader.ts:87-111):
   - paid goes Home with ?welcome=1; lapsed goes /billing; non-owner sees "Only the owner can pay" banner (no redirect, avoids a loop with the layout hold).
   - `recordFirstPaymentIfHeld` asks Razorpay about a still-open checkout first, so a payment the webhook missed is recorded and the person moves on instead of seeing Pay again (loader.ts:97, commit c702f6c7). V.
   - intake incomplete goes /start.
   - views: pay, waiting (PaymentWaiting reload), under-review, no-plan, owner-only (checkout-screen.tsx:20-48).
2. Pay (PayForm confirm dialog, then `/checkout/pay` opens Razorpay (app/(pay)/checkout/pay/page.tsx) with callback `/billing/pay/callback` and a `dismissHref`).
- Success: callback route (app/billing/pay/callback/route.ts, 303 redirect to an allow-listed destination) returns to checkout with `?payment=received|failed`; checkout `isWaitingOnPayment` (rules/membership.ts:330-333) shows PaymentWaiting until the webhook records it, then redirect to `/?welcome=1` (Home reads first payment for Tag Manager, page.tsx:30). Payment received email sent from the recording path (packages/shared/src/server/payment-emails.ts:84-105). V.
- Failed: `?payment=failed` banner "We couldn't confirm that payment... try again below" (checkout-screen.tsx:78). V.
- Pending: PaymentWaiting with delayed text and support mailto. V.
- Webhook-missed: handled by the pre-check above; an internal timer route `/api/internal/check-first-payments` exists (purpose inferred from its name, I).
- Dismissing the Razorpay window lands where a failed payment would. V.
- Back/forward: after pay, /checkout redirects Home (paid). Fake provider pages are dev only and 404 otherwise.
- Permission denial: editor/viewer see owner-only banner; Home still shows a Pay button to them (home-screen.tsx:100-110). V.
- Mobile: two column grid becomes one; Help in header is mailto only (pay layout:20). I.
- Staff: admin /payments, clients/[id]/billing, /deliveries (webhook log). V (routes exist).

## J4. Onboarding intake and kickoff

1. Home state `kickoff_unbooked` or `kickoff_booked` (features/home/rules.ts:62-77). KickoffTask offers the slot picker and Book (calls/components/kickoff-panel.tsx:24-51). Missed call line when staff marked missed (home-screen.tsx:122-124).
2. Checklist: "Setup checklist" at /checklist?item=<key>, each item saves alone in a sheet (app/(app)/checklist/page.tsx). Only reached from Home or old /onboarding aliases (no sidebar entry; finding N2).
3. After the call: staff mark held; timer `/api/internal/start-builds-after-kickoff` starts the build (24 hour fallback). Until then `kickoff_unconfirmed` claims nothing and offers Book a new time (rules.ts:82-107). V.
- Viewer or phone-only account cannot book (home-screen.tsx:119-123 text). V.
- Booking read failure: Book a call button vanishes silently (R: E2E-REVIEW-2 O-4, code `BookCallAction` returns null, home-screen.tsx:55). Still true. V.
- Staff: clients/[id] page and project tab, /calls.

## J5. Website preview, feedback, approval, launch

1. Staff send a preview from the console (apps/admin/lib/server/project-preview.ts). Customer gets `previewReadyEmail` whose only link is the external preview URL, and whose copy says "Reply and tell us what to change, or let us know if it's ready to go live" (packages/email/src/templates/preview-ready.ts:14-17, project-preview.ts:61). It does not link /website. V.
2. Customer opens /website: `view.kind === "preview"` shows "Your preview" (picture from `/website/preview-image`), "What do you think?" with Approve and go live (inline confirm, focus moves to the question) and Ask for changes (dialog), rounds line (website-screen.tsx:84-139, preview-decision.tsx). V.
- Approve: `approvePreviewAction` (requireWebsite write, role not viewer) moves status, emails the team, redirects `/website?response=approved` banner. `ProjectNotAwaitingResponseError` redirects `not-ready` notice. V (website/actions.ts:42-54).
- Ask for changes: transaction counts a round, saves a `website_change` ticket, links it, sends team alert and a "changes received" email; body text stays in the box on failure (preview-decision.tsx:58-64; actions.ts:83-136). Rounds used up swaps the dialog for an "Ask for a change" link to Requests (preview-decision.tsx:101). V.
- Double press: `feedbackKey` fresh per render makes it one ticket. V.
- Expired or already answered: `?response=not-ready` notice. V.
- Launch: staff launch emails `websiteLiveEmail` (external https hostname link). Home state `launched` for 7 days (LAUNCH_GREETING_DAYS) then `ongoing`. V.
- Mobile: Columns collapse to one column; preview picture full width. I.
- Back/forward: after redirect with `?response=` Back returns to the form view that no longer exists (project moved); page re-reads status. I.
- Hypothesis (H): approval only exists in the dashboard but the email teaches replying; a reply bypasses round counting and the approved state.

## J6. Social review and approval

1. /social (requirePaid, social service). Two implementations chosen by env: with SOCIAL_AUTO_URL/KEY the legacy page (`LegacySocialPage`) plus tabs See posts (/social/review) and Analytics; without it `SocialOverview` with ApprovalsSection (app/(app)/social/page.tsx:23-26). V.
2. Overview: "Waiting for your approval" cards, Approve, Approve all, Review post sheet, Ask for a change (features/social/components/approvals-panel.tsx:73-139). `approvePostsAction` is `requireService("social",{write:true})` (features/social/actions.ts:23-24).
3. Legacy review: keep or drop topics, edit headline, change day, draw pictures, approve (legacy-social/components/review-workspace.tsx). Errors surface in `useReviewAction` catch (use-review-action.ts:33-35). V.
- No email is sent when posts wait for approval from the templates folder (no social template exists); the `needs_approval` notification topic exists (packages/db/src/schema/notifications.ts:10). Delivery path U.
- Lapsed: reading allowed, approve refused by live guard goes /billing. V.
- Mobile: social fills width; channel column. I.
- Staff: clients/[id]/services, /ads, /ad-credit, /deliveries. U for the exact approval counterpart.

## J7. Ads requests

- Paid Ads page is read-only: spend vs budget, leads, cost per lead, campaigns table, plus "Ad money added by us each month" (features/social/components/social-screens.tsx:100-140). Only action: Ask for a change, which opens a request with `about=website` (social/components/parts.tsx:31, website/rules/paths.ts:10). Request intent is "Posts or ads" (requests/rules.ts:110), shared with Social. V.
- No self-serve campaign change, budget change or pause. Intentional or not: U.
- Staff: /ad-results, /ad-credit, /ads (dormant per CLAUDE.md in admin).

## J8. Monthly activity and reports

1. Timer sends `monthlyReportEmail` per service to the owner (packages/shared/src/server/monthly-reports.ts:236-258) with `/reports/<yyyy-mm>` and a PDF link `/reports/<month>/pdf?service=`. Skipped when the owner switched off the topic, phone-only accounts (no email), or already sent. V.
2. /reports lists sent reports; sidebar link appears only after the first sent report (rules.ts:123). Month page shows per-service blocks, a per-service error banner and PDF download (report-screen.tsx:30-39). V.
3. Home `ongoing` state: overview with metrics and recent activity (home/components/panels.tsx). U for individual panels.
- Expired or invalid: malformed `/reports/xyz` gives 404 (reports/[month]/page.tsx:12). A month with no report: empty state (reports tests). I.
- Permission: all roles read; signed out goes /login then Home (loses the report). V.

## J9. Requests, change requests, quotes, support

1. New request dialog (Ask for a change links, Requests button, search "New request", Help). Intents: Change my website, Posts or ads, Local SEO + AEO (retired), Ask a question, Send you something, Something is not working, Billing (requests/rules.ts:109-116). Service intents only if bought. V.
2. `sendRequestAction`: rate limit 5 per 10 minutes and 20 a day (website/actions.ts:56-66 same rule), submission key, team alert (requests/actions.ts:~100-110). No confirmation email to the customer is sent from this action (the supportRequestOpened template is used only when staff open a request for a client, apps/admin/lib/server/staff-opened-request.ts:81). V.
3. Staff reply/quote: email `changeRequestUpdateEmail` (kinds reply, quote, started, ready, done, closed) links `/requests?open=<id>`; the bell lists quote waiting and ready to check. V.
4. Request page: Accept quote then pay via `/checkout/charges/<id>` (Razorpay), Decline, Approve change, Reopen, Reply (next-step-panel.tsx:34-90). Closed conversation says "Start a new request" (request-detail.tsx:110). V.
- Failure: field errors and banners; a dropped request on reply/new-request forms goes to the route error boundary (see UX findings U2). 
- Permission: another business's or malformed id gives the same 404. Viewers cannot reply (U).
- Mobile: DataTable collapses; inspector sheet. I.
- Staff: admin /support, /support/[ticketId], /support/new, clients/[id]/requests. V (routes exist).

## J10. Billing, invoices, services

1. /billing (all states) shows state panel plus services panel and bill. Owner: Add service dialog opens a combined Razorpay subscription via `/billing/services/pay`, then callback with `return=billing`; Keep, Cancel a service dialog (cancelServiceAction), Options menu (billing/components/services-panel.tsx:14-231). V.
2. Failed renewal: banner "We could not take your last payment" with See billing, then "Change payment method" to /billing/payment, then Change dialog which files a billing request asking staff for a secure link (payment-method-request.tsx header; gate G7). Two screens plus a manual loop. V.
3. Payment failed email Pay now goes to `/billing` (packages/shared/src/server/payment-emails.ts:164), not the pay step. V.
4. Invoices: table and Download all `/billing/receipts` (owner only). V.
- Lapsed: Reactivate card (`reactivateAction`, `requireOwner`) opens Razorpay via `/checkout/pay` with `RETURN_TO_BILLING`; confirmation banner "Payment confirmed. Your website is back online." V.
- Back/forward: `?charge=` and `?payment=` notices persist in the URL; refresh re-shows the banner. I.
- Permission: editors and viewers read; actions refuse. V.
- Staff: /payments, /invoices, /pricing, /coupons, clients/[id]/billing and services.

## J11. Invitations

1. Owner: Settings > Team > Invite someone (invite-dialog.tsx, `createInviteAction`, features/team/actions.ts:60-90): rate limit, invite row, email via intake connection; if the email fails the invite is revoked so the address can be invited again. V.
2. Invitee: email link `/invite/<token>`. Page checks token format only (invite/[token]/page.tsx:20-26). Signed out: Sign in or Create account both carry `?next=/invite/<token>` (the only supported return, team/rules.ts:108-111). Signed in: "Join the team" with button; opening the link changes nothing so scanners cannot burn it. V.
- Expired, revoked, used, wrong address: the refusal appears only after pressing Join (`refusalMessage`, accept-invite.tsx:12-17). R: E2E-REVIEW-2 says all those states were tested. V.
- Owner side: Waiting for a reply list with Revoke; "Remove member". V.
- Mobile: dialog; two stacked buttons. I.
- Staff: clients/[id]/people.

## J12. Cancellation, closure, recovery, reactivation

1. Cancel one service: Plan & billing > Cancel a service dialog (owner, `cancelServiceAction`, live guard): keeps running to period end; "Keep" undoes. V.
2. Cancel everything: Settings > Privacy and data > Delete account (`/settings/delete`, owner): reason (required), optional comment, then DELETE and password; lists plan end date and the erase grace period (`ACCOUNT_CLOSURE_GRACE_DAYS`). There is no cancel-plan entry in Plan & billing. V.
3. After closing: signed out everywhere; every guard sends the account to /restore-account: Restore, Keep my plan (new mandate via /restore-account/keep-plan), Sign out. If nothing is done it erases after the date (timer `/api/internal/erase-closed-accounts`). V.
4. Lapsed (plan ended): banner Reactivate, Home task Reactivate, Plan & billing ReactivateCard. V.
- Email on closure: no template for closure, deletion scheduled, or cancellation confirmation exists in packages/email/src/templates. V (absence). Whether Brevo sends one elsewhere: U.
- Back/forward: closure form keeps `reason` in component state between its two steps; refresh loses it. I.
- Mobile: plain forms. I.
- Staff: /leaving, privacy-requests, clients/[id]/people.

## J13. Passwords, setup links

- Forgot password: same answer for any account (features/entry/actions.ts:107). Reset link `/reset-password/<token>` shows the form even for used or expired tokens; the failure appears after submit (page comment lines 9-12). V.
- Staff-sent setup link `/setup/<token>`: validated before the form; shows no-longer-works or rate-limit messages (app/(auth)/setup/[token]/page.tsx:17-35). V.
- Affiliate setup `/affiliate/setup/<token>`: same plus three modes. V.
