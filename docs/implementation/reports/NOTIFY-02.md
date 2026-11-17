# NOTIFY-02: Kickoff (decision D33)

Stacked on N1 (`claude/notify-01-foundation-324d17`, PR 214). Not merged.

## What changed

**Server-driven popup.** `KickoffPromptPopup` is mounted again in the console layout. It lists every unanswered call (not only the first). Whether it opens comes from `kickoff_prompt_state`: a call is due when its popup was never shown or was last shown 15 minutes ago (`isKickoffPromptDue` in `packages/db/src/queries/kickoff-prompts.ts`). Opening it calls `markKickoffPromptsShownAction`, which stamps `last_popup_shown_at`. The layout refreshes every 60 seconds, so a repeat, an answer in another tab and a reload all agree. Closing the popup leaves the small corner notice until the server says "due" again. The old browser-memory rule (`kickoff-prompt-rule.ts`) is deleted.

**Answers.** Call completed stamps `answered_at`. They did not join and Reschedule delete the booking, which cascades the state row. All three also revalidate the layout so the popup updates at once.

**Today.** The queue row "Did the kickoff happen?" is gone. The Today card is the one place Today asks, and it reads the same server list as the popup. Calls "Just finished" is unchanged.

**One sentence.** `apps/admin/lib/kickoff-copy.ts` holds the "within 24 hours" sentence. The popup, the Today card (both through the shared `KickoffAnswer` component) and `KickoffCallSection` use it. The Call section's wording changed to match the other two.

**Clock notices** (15 minute sweep, `start-builds-after-kickoff`, new `kickoff-notices.ts`):
- Call ended: staff bell, push, email through `notify()`, once per call and end time. `first_notified_at` is stamped after a clean send.
- New event `kickoff.ended.reminder` (staff, push only): one push when the call is still unanswered 2 hours after it ended. `reminder_pushed_at` is stamped.
- One hour before: customer `kickoff.soon`, once per call and start time.

**Customer notices.**
- Booked: `calls.ts` after the booking, to the person who booked, once per business and start time. Cal.com created bookings are left to N6.
- Completed, They did not join, Reschedule: from the staff actions (`kickoff-notices.ts` in the admin app). Team no-show is worded as Reschedule. They did not join is skipped when the booking had no time.
- Fallback start: customer bell "We started your website" and the customer activity line now reads the same. Staff keep "Started without call confirmation" (bell and the Today row).
- Reschedule clears prompt state (N1 open question 7): `moveSetupCallBooking` (Cal.com move) clears it inline; a customer rebooking calls `clearKickoffPromptStateForBusiness` with the staff connection, because the booking runs under the customer role, which has no access to the table. Notice dedupe keys also include the call time, so a moved call notices again.

**Other.** `notify()` now has a per-app wrapper (`apps/customer/src/platform/lib/server/notifier.ts`, `apps/admin/lib/server/notifier.ts`) built lazily from `createDefaultNotifier`. `listKickoffsToStart` also returns `businessName`. Shared helper `kickoff-time.ts` words times in India time ("Tue 17 Nov, 2:30 pm IST", "2:30 pm IST").

## Checks

| Check | Result |
|---|---|
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | pass (admin 2040, customer 4493 at last full run, plus shared) |
| `pnpm build` | pass (needs the shell environment from AGENT-RULES section 4; without it the admin build stops on its env check) |
| `pnpm test:integration` | the one-command run was killed by the machine, so it was run per package (db, then shared) against my own database `brandbasket_platform_n2_test`; db 120 files passed and 1 hook timeout in `migrator.integration.test.ts` under load, which passed on its own rerun (4 tests); shared 22 files, 291 tests passed |

The new integration file is `packages/db/src/kickoff-prompts.integration.test.ts` (8 tests, passing).

To run tests I created empty, git-ignored `apps/customer/.env.local` and `apps/admin/.env.local` in this worktree, because the test loader refuses to start without the file. Real values came from the shell only; nothing was written to them.

## New or changed strings

| Where | Text |
|---|---|
| Popup, Today card, Kickoff call section | "Call confirmation readies the website build. If not confirmed within 24 hours of scheduled completion, the build starts automatically." (Call section was "If nobody confirms the call within 24 hours, the build starts automatically.") |
| Popup corner notice, several calls | "N kickoff calls are waiting for your answer" (new; one call keeps "Did the kickoff call with <business> happen?") |
| Staff push, 2 hour reminder (draft) | "A kickoff call is still waiting for your answer" |
| Customer, booked | "Your kickoff call is booked for <day, time IST>" (approved) |
| Customer, one hour before | "Your kickoff call starts at <time IST>" (registry wording, draft) |
| Customer, completed | "Thanks for the call. We are getting your website started" (approved) |
| Customer, did not join | "We missed each other on <day, time IST>. Pick a new time" (draft) |
| Customer, reschedule | "We need a new time for your kickoff call. Pick one here" (draft) |
| Customer, fallback start | "We started your website", in the bell and in "What we did" (draft; the activity line used to read "Started without call confirmation") |
| Staff, call ended | bell and email "Did the kickoff call with <business> happen?", push "Did the kickoff call happen?" |

## Open questions

1. Owner: approve the draft lines above, mainly the 2 hour reminder push and the fallback line.
2. Times in notices are fixed to India time with "IST" because the line is stored once. Customers abroad (USD plans) see IST. Acceptable?
3. If an email or push fails after the ledger row is written, a repeat is deduped and does not retry (N1 open question 5; N3 fixes email). For the call-ended notice a failure leaves `first_notified_at` empty, but the retry then finds a duplicate and sends nothing.
4. The popup opens when the server says due and is stamped as shown at once. If the stamp request fails the popup still shows, but may not repeat on time.
5. Today's card does not open the popup; it is the same prompt inline. Say if you wanted a link instead.
