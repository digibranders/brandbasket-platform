# Two-way service blueprints

> **Revision 2026-11-14:** the owner confirmed Social is automated through social-auto with no staff involvement, there is one admin, and Paid Ads is deferred (display only). Where this file disagrees, `18-social-automation-and-revised-scope.md` wins.


Each blueprint follows one thing end to end: customer action, server, database transition, staff queue, customer-visible status, notification, failure and retry. "Today" is read from code at `c702f6c7` (Verified in code unless marked). "Gap" marks a break in the two-way chain. Proposals are in `08` and `10`. Detail behind each row is in `04` and `06`.

Event ownership rule used here: every event has exactly one owner (a role or an automatic job), one queue where it appears, one customer-visible status, and one notification. Where today has none, the cell says NONE.

## B1. Sign up to first payment (all services)

| Stage | Customer | Server and DB | Staff owner and queue | Customer sees | Notification | Failure and retry |
|---|---|---|---|---|---|---|
| Visit and sign up | `/signup?plan=...`, OTP | account and `businesses.kind = listing` | lead via `/api/leads` if from the site form; none otherwise | `/start` questions | OTP email | wrong code, rate limit countdown, retype after refresh |
| Intake and basket | `/start` answers, basket | `client_intakes` | read-only on client Overview | summary with prices | none | answers saved per submit |
| Pay | `/checkout`, Razorpay | `subscriptions` incomplete, `bundled_add_ons` pending | none | pay or waiting view | payment received email | provider call outside a transaction, orphan cancelled on failure |
| Payment recorded | webhook or confirm page | `payments` idempotent, subscription active, lines active, tax invoice in same transaction | none | Home with welcome | receipt | webhook missed: GAP, only reload of checkout recovers (offer checkouts also by a timer that may not be enabled) |
| Flagged payment | none | stored unapplied with reason | finance only (Today "Payment needs a look") | possibly stuck on waiting | none | GAP: support blind, refund is manual |
| Unpaid sign-up | none | state `account_created` | Today "Signed up, not paid" after 2 days, no owner | `/checkout` | none | GAP: no owner and no reminder email found |

## B2. Website build (Managed Website)

| Stage | Customer | Server and DB | Staff owner and queue | Customer sees | Notification | Failure and retry |
|---|---|---|---|---|---|---|
| Kickoff booking | books via Cal.com on Home | booking row | `/calls` and Today after the call ends | "Kickoff booked" | none | read failure silently hides the button (still open) |
| Kickoff outcome | none | staff mark held, or timer after 24h when `KICKOFF_AUTO_START` (default on) | `/calls`, Today "Did the kickoff happen?" | "We are getting your website started" | none | GAP: staff cannot tell if a call happened vs auto start |
| Build | none | project onboarding, submitted, building | builder optional, Board lanes, Today only with `slaDueAt` | headline per status | none | none |
| Send preview | none | status preview | Board column only, no follow-up clock | "Your preview is ready" | preview ready email: GAP links external preview and says Reply | customer replies by email, bypassing approval and round count |
| Feedback | Ask for changes dialog | transaction counts a round, ticket, team alert | Requests, 4 hour and 24 hour clocks | changes received email, status revisions | yes | draft text kept on failure; duplicate prevented by key |
| Revision | none | status revisions | Today uses the FIRST preview promise, reads falsely late | "We are making your changes" | updated preview email | GAP: no own due date |
| Approve | Approve and go live | status approved | NONE in Today or rail; Board column only | "You approved the preview" | team email | GAP: approved customers can sit unseen |
| Launch | none | eight checks then Mark live | support | "Your website is live" | live email, resend 7 days | hosting pause timer may not be enabled |

## B3. Social Media Management

| Stage | Customer | Server and DB | Staff owner and queue | Customer sees | Notification | Failure and retry |
|---|---|---|---|---|---|---|
| Add plan and setup answers | `service_setup` form | `service_setup` row | GAP: console never reads it; only Today "Add-on to start" row, "mark contacted" has no customer effect | nothing | none | none |
| Connect accounts | connect flow | `connected_accounts` | no queue | status badge | none | needs_attention has no owner |
| Plan posts | none | deliverable planned with `dueOn` | no owner, no list of posts due | nothing | none | dated posts unqueued |
| Send for approval | none | status awaiting_approval | staff action | card on `/social` with Approve | NONE | customer must open the page |
| Approve or ask for change | Approve, Approve all, Ask for change (a request) | status approved | NONE | "Approved" | NONE to staff | GAP: no staff notice or queue |
| Publish | none | status published by staff | no list of approved posts | activity line | none | monthly commitments not data |
| Alternate path | legacy posting service | external system | console cannot see it | different tabs per deployment | unknown | external states Unknown |

## B4. Paid Ads Management (today rides on the Social key)

| Stage | Customer | Server and DB | Staff owner and queue | Customer sees | Notification | Failure and retry |
|---|---|---|---|---|---|---|
| Buy | basket or add service | `bundled_add_ons` `paid-ads` | same as Social | `/ads` bought, or Social pitch if not bought | none | ads-only customer also opens Social |
| Setup | shares Social asks | shared with Social | none | checklist mixes Social and ads asks | none | no ad account access state machine |
| Campaigns and numbers | none, read only | staff enter `ad_campaign_snapshots`, `monthly_snapshots` as service social | no queue, inside "Plan and billing" tab | spend, leads, cost per lead | none | no approvals, spend check or creative review |
| Change request | Ask for a change | request with `about=website` | Requests | request thread | reply email | mislabeled intent shared with Social |

## B5. Requests, change requests and quotes

| Stage | Customer | Server and DB | Staff owner and queue | Customer sees | Notification | Failure and retry |
|---|---|---|---|---|---|---|
| New request | New request dialog | ticket, rate limit 5 per 10 minutes | Requests, assignee manual | thread | team alert, no customer confirmation email | dropped request goes to the error boundary |
| Staff reply or quote | Accept quote and pay | change request state, charge | ticket assignee; quote state not in queue rule | stepper and email per move | yes | paid started request can look "waiting on client" |
| Domain move | submit move | `movingTo` | NONE (client pages only) | email on switch | email | GAP |

## B6. Renewal, lapse, cancel, reactivate

| Stage | Customer | Server and DB | Staff owner and queue | Customer sees | Notification | Failure and retry |
|---|---|---|---|---|---|---|
| Renewal fails | none | status re-read from Razorpay, `past_due` | notice on client page only; NO Today row, NO queue | banner "could not take payment" | failed payment email, Pay now goes to `/billing` | loop to a staff request (G7) |
| Lapse | none | lapsed, read access kept | none; payment lapse policy undefined, hosting pause timer maybe off | Reactivate card | email | policy decision open |
| Cancel one service | Cancel dialog | `end_requested_at`; billed to period end | no queue | scheduled end shown | none | nav drops the service at once, guards follow the paid month: inconsistent |
| Close account | delete flow | closure, locked 30 days | Compliance "being erased" | restore link | email | erase timer may not be enabled; erasure ordering risk |
| Reactivate | owner action | new checkout | none | confirmation banner | receipt | trial not offered |

## B7. Invitations and roles

| Stage | Customer | Server and DB | Staff | Customer sees | Notification | Failure and retry |
|---|---|---|---|---|---|---|
| Invite | owner sends | invite row | none | Waiting for a reply list | invite email, revoked if send fails | none |
| Accept | invitee opens link | format check only | none | expired or used shows only after Join | none | signed-out email links lose their target on login |
| Sign up via invite | invitee creates account | personal business created | none | oldest membership shown | none | GAP (finding 5): may never see inviter's workspace |

## Handoff gaps summary

Chains with a broken second side, in launch order: Social post approval (no staff notice), Social and Ads setup answers (not read), Ads operations (no owner or queue), approved website preview (no queue), domain move (no queue), past due and lapsed billing (no queue), flagged first payment (support blind), refund (no provider call), webhook-missed first payment (timer). Each maps to a P0 or P1 item in `12`.
