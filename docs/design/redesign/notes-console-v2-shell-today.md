# Console v2: shell and Today (CR-A1)

Mock: `mock-console-v2-shell.html`, one file holding the shell, the command bar, Today, the side panel, the bulk bar, keyboard help and the kickoff prompt as popup and as a row. One file because the shell and Today share all their CSS and state. Open it in a browser. The dark strip at the top is review controls, not console UI: width (1440 or 390), state (Live, New, Empty, Error, Loading), overlay, command bar state and popup state. Keys work too: `Cmd K`, `?`, `j` `k`, `Enter`, `e`, `x`, `/`, `Esc`.

Binds to `docs/implementation/CONSOLE-REDESIGN-PLAN.md` sections 2.1, S1, S2, S3, S4, 3.1, 3.2 and 4.2, decisions CD-1 to CD-21 at their recommended defaults. Rule applied: no data source, no element. All names are `<business>`, `<ref>` and similar; every clock and count is a sample of a named field.

## Decisions made in the mock

1. **Six item rail.** Today, Clients, Inbox, Money, Compliance, System. No Calls, Ads, Team or Settings (CD-1). No item is hidden by role (CD-4). The rail footer shows the signed in member only.
2. **Counts follow section S1.** Today (all work), Inbox (requests and enquiries, red), Money (needs a look and overdue), Compliance (red), System (failed, red). A count whose source failed is left off, as `countOrNothing` does (see the Error state). Clients has no count.
3. **Rail colour.** The rail is ink `#15161A`, not the `#23242A` of language file section 8, because the task allows ink only and `apps/admin/DESIGN.md` says the rail is ink. Selected item is a white wash with semibold text. Open question 6.
4. **Gold budget, 3 per viewport.** The rail mark, the Late card top edge, the Today count. Nothing else is gold: filter chips are ink and sunken, selected rows use the `#FBF4EA` wash plus a 3px ink marker (plan 4.2 item 10), and "Waiting" is a sunken chip, not a gold wash chip, so the budget holds with a side panel open.
5. **One focal element.** The Late group is the one raised white card with the gold edge and hero shadow. Due today and Waiting on someone sit on the page between hairlines. The aside cards are resting cards with no blur.
6. **No dark primary on the page.** "Add enquiry" in the header is a soft button, row verbs are soft buttons. The ink primary appears only in layers (side panel foot, popup, confirm dialog), so there is never more than one on screen.
7. **Kickoff row opens the popup, not the side panel.** The popup, the bell item, the Calls card "Confirm" link and the Today row all open one prompt (plan S4, D31). Every other row opens the side panel with `?open=<key>`, shown in Mono under the panel title so the URL rule is visible.
8. **Side panel is an overlay, not a second raised surface** (conflict 3 in plan 4.1). 480px from the right at 1440, full sheet at 390 with a scrim. Primary at the sticky foot; `Open client` beside it.
9. **Bulk bar replaces the filter bar** when rows are selected (plan 4.2 item 8). It offers actions only when every selected row is in the same set from 3.1: enquiries (Mark contacted with Undo, Send setup link with confirm, Export selected), requests (Close selected with Undo), failed deliveries (Resend all failed with confirm). Mixed rows say "No bulk action fits these rows together." Nothing that moves money is ever offered.
10. **Confirm and undo follow 3.2.** Mark contacted and Close selected use the 10 second toast with Undo. Anything that emails (setup link, resend) uses the `ConfirmDialog` with a consequence line and "Keep" as cancel.
11. **Command bar.** Native dialog in the build; a layer in the mock. Groups: Recent (browser only), Go to (static, six items and their tabs), Actions (static), then the six search kinds when typing. States: empty term, results, loading (three skeleton rows), no result (offers Add enquiry and New request), error (keeps Go to and Actions). Prefix hints `>` and `#` in the footer.
12. **Phone (390).** The rail becomes the phone bar (menu, mark, search, bell, account) with the drawer. Rows go to two lines with the verb on the right, 44px buttons. Checkbox, overflow menu and keyboard help are desktop only. Filter chips scroll sideways. This matches CD-13: kickoff prompt, a reply and a payment check work at 390.
13. **Groups.** Late, Due today, Waiting on someone, as in the plan. `groupTodayQueue` today returns Overdue, Due today, Waiting for someone and Google; the build renames them and folds Google into Waiting (it is a System filter row). Plan text also lists "Upcoming"; the mock leaves it out because no row kind in the sample belongs there. Open question 3.
14. **Filter bar.** Chips with counts, a text filter focused by `/`, and the active filter echoed as a removable chip. Default is All (shows the work to do). No Calls chip; kickoff sits under Builds.

## States covered

| State | What the mock shows |
|---|---|
| Live | 14 sample rows, four tiles, Calls and Systems with values, rail counts, bell badge |
| New | No clients: tiles 0, 0, 0, 0, empty card plus "Clients appear here as soon as someone signs up.", Calls "No calls today." |
| Empty | Clients exist (Active clients shows a sample number), nothing late, empty card |
| Error | Notice naming the sources that failed (Money, System), their rows and rail counts left out, other rows shown, summary does not claim "Nothing needs anyone", Systems card shows its own error |
| Loading | Skeleton rows and tile blocks shaped like the final layout, no spinner |
| Overlays | Command bar (5 states), keyboard help, kickoff popup (ask and error with notes kept), side panel, bulk bar, confirm dialog, bell menu, phone menu, toast with Undo |
| Kickoff success | After Call completed: banner "The 48 hour first preview clock has started.", row leaves Today, bell badge goes, Calls card shows it under Just finished |

## Field to source table

Fields that exist in code today cite the file. [Q] means a query the plan adds. Sample values are illustrations of the field, not data.

| On screen | Source |
|---|---|
| Greeting "Good afternoon, `<staff first name>`." | `greeting(now)` and `firstName(user.name)`, `app/(protected)/page.tsx` |
| Summary "Tuesday 17 November. 14 things need someone today, 4 are late." | `todaySummary` in `lib/today-queue.ts` (count and late count of the queue) |
| Tiles Late, Due today, On track | Group sizes of the queue: `groupTodayQueue` (overdue, dueToday, waiting) |
| Tile Active clients | Plan S3 names it "as R2-08". I found no source for it in `apps/admin` (a search for the label finds nothing). Open question 1 |
| Rail Today count | `countTodayItems`, `lib/server/rail-counts.ts` |
| Rail Inbox count | `countSupportQueues(db).needsReply` plus `countLeadsToContact` (keys `requests`, `leads`) |
| Rail Money count | `readPaymentsCount`; plan S1 adds overdue renewals [Q] |
| Rail Compliance count | Plan S1: clocks under 72 hours or overdue [Q] |
| Rail System count | `countFailedDeliveries24h` (key `deliveries`); plan S19 adds errors [Q] |
| Count left off on failure | `countOrNothing` |
| Bell, bell badge, bell item | Slot filled by N1 (stored notifications). Kickoff item from `listPendingKickoffPrompts` |
| Filter chips and counts | Plan S3 filter list; counts derived from the rows below |
| Row: Did the kickoff happen? | `kickoffsNeedingOutcome`, `lib/server/pending-kickoffs.ts`; detail "ended `<time>`" from `endsAt`; clock from `dueLabel` |
| Row: Privacy request, clock "02d 00h overdue" | `/privacy-requests` data and `deadline-clock.ts` (30 day clock) [Q] |
| Row: No reply yet: "`<subject>`" | `newTickets`: `subject`, `displayRef`, `category`; 4 hour limit `WAIT_LIMITS.request` |
| Row: Payment needs a look | Attention kind `payment`; "Raised `<date>`" from `item.at`; 1 day limit |
| Row: Website approved, verb Launch | `approvedPreviews` and `action: "Launch"` |
| Row: New enquiry, "Arrived 17 Nov at 14:10" | Attention kind `new-lead`; 1 hour limit `WAIT_LIMITS.newLead` |
| Row: Breach, "5h 12m left" | `/breaches` data, 6 hour and 72 hour clocks [Q] |
| Row: Renewal failed | `billing:past_due` rows built in `lib/server/today.ts`; lapse policy is open decision D10, so the row has no clock |
| Row: Report to review | Report drafts, `monthly-reports.ts`; window 1st to 5th or while any draft is unsent (CD-15) [Q] |
| Row: "3 emails and webhooks failed" | `failedDeliveries` (key `delivery:failed`) |
| Row: Google problem | `google` items, `lib/google-today.ts` |
| Row: Started without call confirmation | `unconfirmedStarts` (key `unconfirmed_start`) |
| Row: Account closing, "2d 04h to erase" | Closure rows with erase date [Q] |
| Row verbs Confirm, Open, Reply, Check, Launch | `actionLabel(kind)` plus `action` override. "Confirm" is new for the kickoff row (it replaces "Open" which links to `/calls`) |
| Row overflow: Open client, Copy link, Close request | Open client: route `/clients/[id]`. Close request: status only, undo exists (plan 3.2). Copy link: no data, shows the `?open=` URL; a UI action only |
| Side panel: What the customer sees | `CustomerMirrorPanel` (R2-08) |
| Side panel: Last message | Latest message for that kind (ticket, enquiry, billing line); text in the mock is placeholder |
| Side panel: The next step | Same sentence the primary button runs; staff wording to be approved (Copy gate) |
| Side panel URL `?open=<key>` | Plan section 3 "every side panel has its own URL" and the `TodayItem.key` values |
| Calls card: Today, Coming up, Just finished, Last 7 days | `groupCalls` in `lib/calls-view.ts` (today, upcoming, past) over `listSetupCallsForStaff` |
| Calls empty line | `calls/page.tsx` empty state: "No calls today. Kickoff calls booked for today appear here." |
| Systems card values | Failed deliveries `countFailedDeliveries24h`; Google problems from `google` items; new errors from `newErrors` |
| Popup question, buttons, 15 minute repeat | `lib/kickoff-prompt-rule.ts` (`KICKOFF_NOTIFICATION_REPEAT_MS`), D31 |
| Popup "booked for 11:00 and ended at 11:30" | Booking start and `endsAt` from `listKickoffBoard`; the start time is on the board row, check at build |
| Popup "1 more call is waiting" | Length of `listPendingKickoffPrompts` |
| Popup success "The 48 hour first preview clock has started" | Plan S4 success line (D31) |
| Bulk limits "25 emails and 25 alerts in the last 24 hours" | `deliveries.ts` resend limits, plan 3.1 |
| Command bar groups Recent, Go to, Actions | Plan S2. Results kinds `SEARCH_KINDS`, `lib/console-search-kinds.ts` |

## Words the owner must approve (Copy gate)

Sentences new to the console: "Nothing needs you right now" with its line; "Clients appear here as soon as someone signs up."; the Error notice; "No bulk action fits these rows together."; the popup lines; the side panel "next step" sentences; "Confirm" as the kickoff row verb; the bulk confirm lines; the toast lines. The H1 and offer line are not touched; they are website copy.

## Open questions

1. **Active clients tile.** Plan S3 lists it, but no source field is named in the code. Keep (needs a count query) or replace with a tile that has a source (for example Open requests, from `countSupportQueues`)?
2. **Row verb for kickoff.** "Confirm" opens the prompt. Is it the right word, or should the row say "Call completed" (the button inside)?
3. **Group names.** Late, Due today, Waiting on someone (as drawn) against code names Overdue, Due today, Waiting for someone, Google. Rename in code, and drop the Google group into the System filter? The plan also says "Upcoming"; no sample row needs it.
4. **Filter membership.** Reports to review sit under Customers, requests under Customers, privacy and breach and closures under Compliance, Google and failed deliveries under System. Enquiries and signed up not paid both under Enquiries. Confirm, or give Reports its own chip.
5. **Shortcut keys.** Plan names `g t`, `g c`, `g i`, `g m`. Compliance and System have none; suggest `g p` and `g s`? Not drawn until you say.
6. **Rail tone.** Ink `#15161A` (used) against `#23242A` (language file section 8). Pick one for CR-00 to write down.
7. **Notification and "Copy link".** The overflow menu has a "Copy link to this row" item that has no existing server action. It is a pure browser action; say if you would rather drop it, since it adds a control nobody asked for.
8. **Social alert and Social status.** Left out of the sample on purpose (CD-16, N7 not landed). They join the queue as System rows when N7 merges.
9. **Staff account menu.** Drawn as an icon button only. Its contents (sign out, notification opt-in from N4) are not designed here; CR-A3 System > Access covers the opt-in.
10. **Rows not in the sample.** Preview silent for 5 days (CD-8), service ending, add-on to start, sign-up not paid, app error and domain move use the same row anatomy; add them to the sample if you want to review each kind.
