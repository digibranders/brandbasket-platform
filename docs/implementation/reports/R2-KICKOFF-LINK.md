# Work package report: Kickoff Call Meeting Joining Link and Streamlined Staff UX

* Package: R2-KICKOFF-LINK
* Branch: `r2/kickoff-meeting-link`
* Base: `origin/development`
* Date: 2026-11-14

## 1. What changed for the customer or the team

Added direct kickoff call video meeting joining links and clear timing windows across both apps (Customer App and Staff Console), and streamlined kickoff call UX across the Staff Console into its two most convenient, logical locations while eliminating intrusive modal popups and profile clutter.

Key improvements implemented:

1. Shared link resolution and timing helpers:
   * Created and exported `kickoffMeetingLink(inviteeUri, fallbackUrl)` in `@brandbasket/shared/lib/setup-call-link`. Cal.com booking URIs formatted as `https://api.cal.com/v2/bookings/:uid` or `https://cal.com/v2/bookings/:uid` are converted to the actual meeting video URL `https://app.cal.com/video/:uid`. Direct video conference links (Google Meet, Cal.com Video, Zoom, Microsoft Teams, Whereby) are preserved directly. If `inviteeUri` is unavailable or invalid, the fallback booking/meeting URL configured in site settings is used.
   * Created and exported `formatTimingWindow(startsAt, endsAt, timeZone)` in `@brandbasket/shared/lib/setup-call-link`, formatting exact time windows such as `Tuesday, 3 November 2026, 3:30 PM to 4:00 PM IST`.
   * Comprehensive unit test suite with 33 tests verifying all URL patterns, fallback precedence, malformed input handling, and timing formatting across date boundaries and time zones.

2. Customer App KickoffPanel:
   * Updated `KickoffPanel` (`apps/customer/src/features/calls/components/kickoff-panel.tsx`) when a call is booked to display the exact start time to end time window (for example: `Your kickoff call is booked for Tue 3 Nov, 11:00 to 11:30`).
   * When a meeting URL is present, renders a prominent "Join meeting" button targeting `_blank` with `rel="noopener noreferrer"` via `NextActionCard` primary action.
   * Provides secondary actions for "Add to calendar" and "Change time" without visual clutter.
   * When no meeting link is present, keeps "Add to calendar" as the primary action and retains the calendar invite message.

3. Customer App Home screen:
   * Updated `HomeScreen` (`apps/customer/src/features/home/components/home-screen.tsx`) and home loader (`apps/customer/src/features/home/loader.ts`) to resolve `inviteeUri` from the booked kickoff and pass the resolved meeting URL to `KickoffPanel`.

4. Customer App WebsiteScreen:
   * Updated `WebsiteScreen` (`apps/customer/src/features/website/components/website-screen.tsx`) during the kickoff stage to display the exact call timing window (start time to end time) and a direct "Join kickoff call" button or link (`target="_blank" rel="noopener noreferrer"`) pointing to the resolved meeting URL.
   * Threaded `startsAt`, `endsAt`, and `meetingUrl` through website progress rules (`rules/progress.ts`, `rules/screen.ts`, `loader.ts`).

5. Streamlined Client Profile in Staff Console:
   * Removed redundant `<Section title="Kickoff call">` from Client Overview (`apps/admin/app/(protected)/clients/[businessId]/page.tsx`). The kickoff state is already live and interactive in the Customer Mirror panel on this page.
   * In `apps/admin/components/console/kickoff-call-section.tsx` (rendered under `/clients/[businessId]/website`): made this the single, official, and convenient home for kickoff call on the client profile (directly under Step 1 of the four-stage website pipeline stepper).
   * Displayed the timing window (via `formatTimingWindow(booking.startsAt, booking.endsAt)`).
   * Added a prominent, styled "Join meeting" button or link (`target="_blank" rel="noopener noreferrer"`) when a meeting link is available via `kickoffMeetingLink(booking.inviteeUri)`.
   * Updated unit tests in `apps/admin/components/console/kickoff-call-section.test.ts` and `apps/admin/app/(protected)/clients/[businessId]/page.test.ts` to assert the timing window, join link, and removal of duplicate sections.

6. Eliminated Intrusive Global Modal Popup:
   * Removed `<KickoffPromptPopup pendingKickoffs={pendingKickoffs} />` and pending kickoff queries from `apps/admin/app/(protected)/layout.tsx` so staff are never interrupted across random console pages with a blocking modal dialog.
   * Kickoff actions remain cleanly and conveniently housed in:
     * Today screen (`/`): `TodayKickoffPrompt` card and `NeedsSomeone` queue item.
     * Calls board (`/calls`).
     * Website tab (`/clients/[businessId]/website`): `KickoffCallSection`.

7. Staff Console Customer Mirror Panel:
   * Updated `CustomerMirrorPanel` (`apps/admin/components/console/customer-mirror-panel.tsx` and re-export `apps/admin/src/features/clients/components/customer-mirror-panel.tsx`) to show the timing window and an external "Join meeting" link when a kickoff call is booked and not yet held.

## 2. Files changed

* `packages/shared/src/lib/setup-call-link.ts`:
  * Implemented `kickoffMeetingLink` and `formatTimingWindow`.
* `packages/shared/src/lib/setup-call-link.test.ts`:
  * 33 unit tests for link resolution, fallback handling, edge cases, and timing window formatting.
* `packages/shared/src/ui/patterns/next-action-card.tsx`:
  * Added optional `target` and `rel` support to `primaryAction`.
* `apps/customer/src/features/calls/components/kickoff-panel.tsx`:
  * Added `meetingUrl` prop support, exact timing display, prominent "Join meeting" button, and secondary calendar actions.
* `apps/customer/src/features/calls/components/kickoff-panel.test.tsx`:
  * Unit tests for unbooked, booked without meeting link, and booked with meeting link states.
* `apps/customer/src/features/home/loader.ts`:
  * Added `inviteeUri` to kickoff query response.
* `apps/customer/src/features/home/components/home-screen.tsx`:
  * Resolved meeting URL via `kickoffMeetingLink` and passed to `KickoffPanel`.
* `apps/customer/src/features/website/rules/progress.ts`:
  * Added `startsAt`, `endsAt`, and `meetingUrl` to `ProgressInput` and `ProgressView`.
* `apps/customer/src/features/website/rules/screen.ts`:
  * Threaded `startsAt`, `endsAt`, and `meetingUrl` through `websiteProgress`.
* `apps/customer/src/features/website/loader.ts`:
  * Loaded kickoff booking details and fallback settings URL to supply call timing and meeting URL.
* `apps/customer/src/features/website/components/website-screen.tsx`:
  * Rendered exact call timing and "Join kickoff call" button when in kickoff stage.
* `apps/customer/src/features/website/components/states.test.tsx`:
  * Added test for kickoff stage call timing and join button.
* `apps/admin/app/(protected)/layout.tsx`:
  * Removed global `KickoffPromptPopup` and pending kickoff lookup to prevent disruptive modal popups across console routes.
* `apps/admin/app/(protected)/clients/[businessId]/page.tsx`:
  * Removed redundant "Kickoff call" section, keeping client overview clean while kickoff status is displayed in CustomerMirrorPanel.
* `apps/admin/app/(protected)/clients/[businessId]/page.test.ts`:
  * Updated overview page tests to verify removal of redundant section and presence of CustomerMirrorPanel kickoff status.
* `apps/admin/components/console/kickoff-call-section.tsx`:
  * Added timing window display and prominent "Join meeting" button or link via `kickoffMeetingLink`.
* `apps/admin/components/console/kickoff-call-section.test.ts`:
  * Added test coverage for timing window and "Join meeting" link in `KickoffCallSection`.
* `apps/admin/components/console/customer-mirror-panel.tsx`:
  * Displayed timing window and "Join meeting" link when call is booked.
* `apps/admin/components/console/customer-mirror-panel.test.ts`:
  * Added test coverage for timing and join link in mirror panel.
* `apps/admin/src/features/clients/components/customer-mirror-panel.tsx`:
  * Created feature re-export module.
* `docs/implementation/reports/R2-KICKOFF-LINK.md`:
  * This implementation report.

## 3. Verification commands and results

* `pnpm lint`: Passed cleanly across `@brandbasket/admin` and `@brandbasket/customer` (0 errors).
* `pnpm typecheck`: Passed cleanly across all 8 workspace projects (0 errors).
* `pnpm test`: 390 test files passed, 4434 tests passed (0 failures).
* `pnpm build`: Built both apps cleanly with production assets using CI placeholders (0 errors).

## 4. Open questions

* None. The video meeting URL transforms match Cal.com format (`app.cal.com/video/:uid`) with direct link fallbacks, and staff console UX is streamlined into the Today queue, Calls board, and Client website pipeline tab.

## 5. New customer or staff copy for approval

Customer-facing copy:
1. "Join meeting" (primary action button in KickoffPanel when meeting URL is present)
2. "Join kickoff call" (primary action button in WebsiteScreen when meeting URL is present)
3. "Video call. Join with the button below, or use the link in your calendar invite." (KickoffPanel helper copy when meeting URL is present)
4. "Video call. Join with the button above or from your calendar invite." (WebsiteScreen helper copy when meeting URL is present)
5. Exact timing windows, for example: "Your kickoff call is booked for Tue 3 Nov, 11:00 to 11:30"

Staff-facing copy:
1. "Timing window" label in kickoff call section and client mirror panel
2. "Join meeting" button or link in kickoff call section and customer mirror panel
