# Target notification matrix (Phase 2 proposal, awaiting owner approval)

Nothing here is built. All new wording is a draft for the owner. No dashes in any text. "Pref" is the customer preference topic that can switch the optional channels off. Channels: Bell (in-app), Email, Push (web push, opt-in), Teams (staff channel), Popup (console only).

## Principles

1. Every event has one owner of the action: the customer in the customer app, the single staff account in the console.
2. The bell becomes real stored notifications (new `notifications` table, per person, with a type, link and dedupe key), so it can carry any event and refresh without a reload.
3. Email stays the guaranteed channel. Push is a second, opt-in channel and never the only one.
4. Mandatory notices (money taken, security, account closure, legal) cannot be switched off. Everything else can, per channel.
5. A push never carries private detail. It says what happened and opens the page.
6. Retries: emails are queued and retried with backoff, a Brevo failure is a real failure, and failures show on Today.

## A. Kickoff call (decision D33)

| Event | Who | Channels | Timing | Draft copy | Pref |
|---|---|---|---|---|---|
| Kickoff booked | Customer | Email, Bell | at booking | "Your kickoff call is booked for <time>" (approved wording) | none, mandatory |
| Kickoff booked or moved or cancelled | Staff | Teams (exists), Today row | at booking, also for Cal.com bookings | existing cards | n/a |
| Kickoff soon | Customer | Email, Push, Bell | 1 hour before | "Your kickoff call starts at <time>. Join here" | new topic `calls` |
| Call time passed, no answer yet | Staff | Popup, Bell, Push, Email | at call end, repeats in the popup every 15 minutes until answered, push and email once | "Did the kickoff call with <business> happen?" | staff, always on |
| Call completed | Customer | Bell, Email | on press | "Thanks for the call. We are getting your website started" (approved) | none |
| They did not join | Customer | Email, Bell | on press | draft: "We missed each other on <time>. Pick a new time" (Home already says this) | none |
| Reschedule | Customer | Email, Bell | on press | draft: "We need a new time for your kickoff call. Pick one here" | none |
| 24 hour fallback fired | Staff | Today row, Bell | at fallback | "Started without call confirmation" (staff label, as the owner worded it) | staff |
| 24 hour fallback fired | Customer | Bell | at fallback | draft: "We started your website" (the staff label is not shown to customers) | none |

Console prompt rules: one popup, one action place. The Today card and the queue row open the same prompt. The dismissed state is stored on the server (per call), not in browser memory, so a reload does not bring it back wrongly and a second tab agrees. It handles every pending call, not only the first.

## B. Money

| Event | Who | Channels | Timing | Pref |
|---|---|---|---|---|
| Payment received | Owner | Email (receipt, exists), Bell | on record | mandatory |
| Payment failed | Owner | Email (exists), Bell, Push | on first failure | `billing`, email and push optional, bell always |
| Payment failed | Staff | Today row (exists), Teams (new, throttled) | on first failure | n/a |
| Renewal coming up | Owner | Email, Bell | 3 days before the first full price charge and each yearly renewal | `billing` |
| Plan lapsed | Owner | Email, Bell | at lapse | mandatory |
| Refund | Owner | Email (exists), Bell | on refund | mandatory |
| Unapplied payment | Owner | Email, Bell | on flag | mandatory (draft wording needed) |
| Payment needs a look | Staff | Today row (exists), Push | on flag | staff |

## C. Website

| Event | Who | Channels | Pref |
|---|---|---|---|
| Staff started the build ("we have started") | Customer | Bell, Email | none, always sent |
| Preview ready | Customer | Email (exists), Bell, Push | `needs_approval` |
| Customer sent changes | Customer | Email (exists), Bell | none |
| Customer sent changes or approved | Staff | Today row, Teams | staff |
| Approval received | Customer | Email, Bell | none |
| Website live | Owner | Email (exists), Bell, Push | none |
| Domain ready, moved | Owner | Email (exists), Bell | none |

## D. Requests and support

| Event | Who | Channels | Pref |
|---|---|---|---|
| Request received | Requester | Email (exists), Bell | `request_reply` |
| Reply, quote, ready, done | Requester | Email (exists), Bell (exists), Push | `request_reply` |
| New request or customer reply | Staff | Email (exists), Teams (new), Today row (exists), Push when late | staff |

## E. Social (new receiver for social-auto events)

| Event | Who | Channels | Pref |
|---|---|---|---|
| post.failed | Customer | Bell, Email, Push | new topic `social` |
| connection.expiring | Customer | Bell, Email, Push | `social` |
| poster.ready (needs approval) | Customer | Bell, Email, Push | `needs_approval` |
| poster.auto_approved | Customer | Bell | `social` |
| week.lapsed | Customer | Bell, Email | `social` |
| post.failed, connection.expiring | Staff | Today row | staff |

## F. Account and security

| Event | Who | Channels |
|---|---|---|
| Sign-up code, password reset, invites | Person | Email (exists), mandatory |
| Account closure and restore link | Owner | Email, Bell, mandatory |
| Monthly report ready | Owner | Email (exists), Bell, Push, pref `monthly_report` |
| Signed up, not paid | Lead | Email (job exists, not installed), then Today row after 2 days |
| Security alerts, errors | Staff | Email (exists), Push for errors, Teams `system` |

## Push design

| Item | Proposal |
|---|---|
| Mechanism | Standard web push: service worker, Web App Manifest, VAPID keys, one `push_subscriptions` table per app (user, endpoint, keys, user agent, created, last success, revoked). No third party service. |
| Opt-in | Never automatic. Customer: a toggle per topic on the existing notification settings page, plus a single prompt on the first Home visit after the first payment ("Get a notice on this device when something needs you"). Console: one switch in Settings. The browser permission is asked only after the customer presses the button. |
| iOS | Web push works only for an installed home screen app on iOS 16.4 and later, so the settings page says so. Needs a 512 px and a maskable icon. |
| Delivery rules | Short copy, no private detail, link to the page. Quiet hours 21:00 to 08:00 India time for customers, except payment failed. Collapse repeats with a tag. Remove a subscription on a 404 or 410 reply. |
| Fallback | Email and bell always carry the event, so a blocked or expired push loses nothing. |
| Dev | A fake push provider writes to the outbox view. No real push in development. |
| Console | Cloudflare Access can block `/sw.js` and the manifest. They are served from an exempt path, or Access is bypassed for those two files. |

## Webhook changes

| Item | Proposal |
|---|---|
| social-auto receiver | `POST /api/webhooks/social-auto`, signature `t=<unix>,v1=<hex>` over `<t>.<raw body>`, 5 minute window, events stored by `seq`, deduped by event id, catch up from `GET /api/v1/events?after=<seq>` on start and after a gap. Blocked on the real payload and signing details from the social-auto repo. |
| Replay window and event id table | Add to Razorpay, Cal.com and OyeChats (store event id, reject repeats). |
| OyeChats redelivery | Fire the Teams card only for a new lead. |
| Cal.com | Alert staff on any booking, move or cancel. |
| Razorpay | Owner confirms `payment.failed` and `invoice.paid` are ticked in the live dashboard. Fix the deployment doc. |
| Visibility | Console Deliveries gets a replay button for stored events with a body (store the body for 14 days, encrypted, no card data). |
| Teams | One automatic retry, dedupe key, and a "no address saved" row on Today. Post error reports to `system` or correct the destination text. |

## Email platform changes

1. Real queue: `pending`, `sent`, `failed`, `bounced`, with attempts, next attempt time and a drainer on the existing 15 minute timer. A Brevo failure raises a real error to the caller or leaves a `pending` row for retry.
2. Brevo events webhook for bounce, complaint and unsubscribe, with a suppression list.
3. `List-Unsubscribe` header on optional mail only.
4. Mandatory flag on topics, fail closed for mandatory mail, preferences for each member for member specific mail.
5. Install and enable the sign-up reminder timer, add failure alerts for erase and sign-up reminder, schedule the first charge reminder.

## Owner answers (2026-11-16)

1. Push scope: console and customer app both get web push.
2. Kickoff reminder: the popup repeats every 15 minutes until answered (state kept on the server). Push and email go once at call end, plus one push if still open after 2 hours.
3. After the 24 hour fallback the customer sees "We started your website" (draft wording, still to be approved). Staff keep "Started without call confirmation".
4. Payment failed, lapse, refund and account closure notices are mandatory. Preview ready, requests, reports, social and call reminders stay optional per channel.

Still open: approval of the full matrix above and of every draft line of copy. Read the social-auto repo (read only) for event payloads and signing before building the receiver.
