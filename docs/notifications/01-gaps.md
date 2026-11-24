# Notification gaps (Phase 1)

Ranked. P0 breaks a promise or loses money or data silently. P1 hurts a journey. P2 is hygiene. Evidence is in `00-inventory.md`.

## P0

| # | Gap | Why it matters |
|---|---|---|
| G1 | Kickoff popup was removed by #200 (merged as #201). Nothing at all happens when a kickoff call time passes: no in-app notification, no email, no push. The staff only sees the Today card on the next page load. | Breaks owner decision D33 and D31. The 24 hour fallback then starts builds without anyone being asked. |
| G2 | No push exists (no service worker, manifest, VAPID, subscription table, opt-in). | D33 requires push for the kickoff prompt. The one staff account has no way to be reached off screen. |
| G3 | Brevo failures are swallowed by the email transport and there is no retry worker. A failed team invite looks like success. Staff see "emailed" for a rejected preview or launch email. The sign-up reminder marks the lead reminded even when the send failed. A failed receipt is never re-sent. | Customers silently miss payment, preview and invite emails. |
| G4 | No social-auto receiver. Post failed, connection expiring, poster ready, auto approved and week lapsed reach nobody on the Brandbasket side. The customer learns only by reloading. Lapse does not stop posting. | Silent failures for the automated service. Signing and payload shapes are unverified. |
| G5 | Razorpay `payment.failed` and `invoice.paid` are handled in code but missing from the documented list of 10 webhook events to tick. | Failed payment emails and add-on upfront payments may never arrive in production. Needs a check of the live Razorpay dashboard. |
| G6 | Several timers that carry notifications are installed but not enabled, or never installed: signup-reminder (never installed, token missing from the production example), monthly-reports, site-hosting, site-health, erase. `erase` and `signup-reminder` have no failure alert. `retry-conversions` has no timer. | Reminders, reports, site-down emails and the erase promise do not run. |

## P1

| # | Gap | Why it matters |
|---|---|---|
| G7 | The customer bell has no stored rows, no live refresh, no retention, and nothing for payments, failed payments, invoices, reports, social events or kickoff reminders. Activity lines ignore preferences. | The bell cannot carry the events the matrix needs and goes stale. |
| G8 | The console has no notification centre. The Today kickoff card and Today queue row show the same call twice. The kickoff wording differs in three places. | One place to act is required. |
| G9 | Missing customer emails: kickoff booked, kickoff reminder, "we have started", approval acknowledgement, social failure or expiry, lapse, account closure with restore link, unapplied payment, cancellation confirmed. The first charge reminder template exists but nothing calls it. | Customers are not told at the moments the journey promises. |
| G10 | "Reschedule" and "They did not join" send no message to the customer. | The customer is left guessing. |
| G11 | The customer bell and Home show "Started without call confirmation", which is staff wording. | Wording needs the owner's decision (Phase 2 question). |
| G12 | Cal.com booking, move and cancel events send no alert to staff or customer. OyeChats redelivery fires the Teams enquiry card again. No replay window or event id dedupe on any inbound webhook. | Staff miss bookings made outside the app. Duplicate alerts. |
| G13 | Preferences: `new_enquiry` and `product_news` have no sender. No in-app or push channel. No mandatory flag, so a customer can switch off failed payment and approval emails. Fails open. Only the owner is checked, never other members. The label "An invoice is ready" does not match behaviour. | The settings screen promises more than it does. |
| G14 | No bounce, complaint, suppression or unsubscribe handling. | Deliverability and legal risk, and repeated sends to dead addresses. |
| G15 | Email deep links: signed-out clicks may lose their target (unverified: the guard has a return prefix list). | Friction on every email click. |
| G16 | Teams: no automatic retry, no dedupe except billing errors, no alert when no address is saved. Doc text promises error reports, retry and halted, and support requests that no code posts. | Alerts quietly missing. |
| G17 | Server and browser errors reach no Teams or email. Customer app errors go to Sentry only. | Staff learn of errors only by opening the console. |

## P2

| # | Gap |
|---|---|
| G18 | Two copies of the onboarding alert (`features/checkout/server` and `platform/lib/server`). About eight email transport factories. |
| G19 | Dormant templates `booking-code` and `listing-enquiry`. `system-error-alert` has no caller. |
| G20 | `docs/product-architecture-audit/19-end-to-end-user-journey.md` and the deep link evidence file are stale (request acknowledgement, refund email and signup reminder job exist; request links are `/requests/<id>`). |
| G21 | The preview-changes-received email has an ellipsis and no preference check. Receipt and refund correctly ignore preferences but the label implies otherwise. |
| G22 | Icons are 192 and 180 px only. No 512 px or maskable icon, no manifest. Needed for installable web push on phones. |

## Duplicates and overlaps to resolve

| Overlap | Proposal |
|---|---|
| Kickoff Today card, queue row and Calls "Just finished" | One prompt surface, with the Today row and the popup both opening it |
| Three copies of the "within 24 hours" sentence | One shared string |
| Staff activity lines and customer bell | One event list with a recipient, not a free text business wide feed |
| Team emails and Teams cards for the same event (lead, onboarding, support) | Pick the channel per event in the matrix |

## Things to verify in Phase 3 before building

1. Which Razorpay events are ticked in the live dashboard (owner action, no secrets needed).
2. social-auto's real event payloads and signature scheme (its repo, not this one).
3. Whether `/login` honours a return path.
4. Whether Cloudflare Access is live for the console, since it affects `/sw.js` and the manifest.
5. Whether the VPS timers match the repo (`brandbasket-kickoff-builds.timer` lives outside it).
