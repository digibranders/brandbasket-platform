# Design notes: Website (/website)

- Area: Customer app, Website service area
- Status: Ready for implementation
- Date: 2026-11-14

## 1. States covered in mock-website.html
1. Kickoff pending (Day 0):
   - Hero card with D31 wording: "Kickoff call booked: Thursday, 14 November at 3:30 PM. We will call the primary contact number."
   - Stepper: Step 1 active (Kickoff), Step 2 (Design preview), Step 3 (Review and revisions), Step 4 (Launch).
   - "What happens on the call" 3-bullet list.
2. Design preview ready (Day 3 to 5):
   - NextActionCard focal element: "Review website draft".
   - 16:10 aspect ratio PreviewFrame previewing desktop layout with Sweet Crust Bakery draft.
   - Status: "1 round of changes included".
   - Clear action buttons: "Approve and launch" (near-black primary) and "Request changes" (secondary line button).
3. Live website:
   - Status chip "Live" with green dot.
   - Domain card: "sweetcrustbakery.in" with SSL badge and DNS status.
   - 16:10 preview frame showing published site.
   - Quick action to request updates or view monthly traffic summary.
4. Domain DNS error:
   - ErrorState alert banner with clear recovery guidance.
   - "Nameserver verification pending: update your A record to 76.76.21.21 at your registrar."

## 2. Design decisions
- Focal element: Only one per viewport (NextActionCard during preview, or PreviewFrame in live state).
- Elevation and radius: 20px radius on focal card, 14px on resting cards, 8px on buttons.
- Rattan gold accent: Used once on the focal card top border and active step indicator (strictly under 3 uses per viewport).
- Zero em or en dashes in any copy.

## 3. Open questions
- None. Kickoff wording matches product decision D31.
