# Design notes: Requests and Monthly Reports (D-A3)

## 1. Scope and overview
This document details the architectural decisions, interactive states, and approved copy for the customer support and analytics interfaces:
- Work requests and quotes: `docs/design/redesign/mock-requests.html`
- Monthly performance reports: `docs/design/redesign/mock-reports.html`

Both interfaces follow the design principles of `05-PREMIUM-DESIGN-LANGUAGE.md`: one focal element per view, honest data presentation, and zero dashes.

## 2. Key architectural decisions
1. Quotes integrated directly with work requests:
   - Out-of-scope work (e.g. regional language translations, extra landing pages, custom photoshoot coordination) generates a transparent, fixed-price quote.
   - The customer can review scope details, see the exact INR price, and approve or decline in a single click.
   - Approval immediately authorizes work without prolonged email back-and-forth.
2. Honest monthly reporting without vanity charts:
   - Small business owners want clear answers: Did my website get visitors? Did customers call or message me? Did people see my social posts?
   - Instead of complex multi-line charts with meaningless axes, reports present four high-signal stat tiles in Red Hat Mono with simple deltas in sage green.
   - Each report includes a plain-language executive summary highlighting top customer behavior (e.g. top clicked menu item).
3. Focal element clarity:
   - On the Requests screen, any pending quote requiring approval is elevated as the primary focal card with a 3px rattan gold top edge.
   - On the Reports screen, the latest monthly executive summary card commands primary attention, paired with a direct "Download PDF" action.
4. Typography standard:
   - Red Hat Display for headers, Red Hat Text for contextual body, and Red Hat Mono for ticket identifiers (REQ-104), dates, visitor counts, and INR prices.

## 3. States covered

### A. Requests (`mock-requests.html`)
- Live quote (`live`):
  - Focal card: Pending quote for "Marathi translation page" at Rs 1,500. Scope: "Full page Marathi translation including custom bakery menu cards."
  - Action controls: "Decline" (secondary white button) and "Approve and pay Rs 1,500" (primary near-black button).
  - Recent requests card: Displays completed tickets REQ-104 ("Update Diwali opening hours", 2 days ago) and REQ-098 ("Add phone number to website header", 5 days ago) with sage "Completed" status chips.
- Submitted ticket (`new`):
  - Represents the state when a customer has submitted a new brief and our team is drafting the quote or working on the request.
- Empty (`empty`):
  - Peaceful empty card indicating: "No open requests at the moment. Use the New request button above to request website changes or extra social posts."
- Rejected or closed (`error`):
  - Shows ticket decline confirmation or fulfillment warning banner.

### B. Monthly reports (`mock-reports.html`)
- October report (`live`):
  - Focal card: Executive summary card with warm gold wash badge "October 2026".
  - Narrative: "Sweet Crust Bakery saw a 28% increase in organic search visits following the Diwali menu launch."
  - Four key metric tiles:
    1. Website visitors: 4,120 (+28% vs Sep)
    2. Enquiries received: 64 (+12 new calls)
    3. Social impressions: 18.4k (+15% reach)
    4. Menu clicks: 892 (Top clicked item: Mawa Cake)
  - Action button: "Download PDF" for accountant or partner sharing.
  - Past reports archive: September 2026 and August 2026 reports with instant PDF download links.
- First month (`new`):
  - Customer in their first billing month before the initial monthly cut.
  - Archive card shows informative note: "No past reports generated yet. Your first report will appear on the 1st of next month."
- Empty account (`empty`):
  - New business setup before traffic collection begins.
- Generation error (`error`):
  - Data sync warning when third-party platform analytics (e.g. Meta Graph API or Google Analytics) undergo scheduled maintenance.

## 4. Responsive behaviour
- Desktop (1440px):
  - Max container width 960px.
  - Four-column KPI grid (repeat 4, 1fr) for metrics.
- Mobile (390px):
  - KPI tiles collapse into a balanced 2 by 2 grid.
  - Full-width quote action buttons with 42px touch targets.
  - Clean vertical stacking of past report rows.

## 5. Copy submitted for owner approval
- "Requests: Support and Work Requests"
- "Quote: Marathi translation page. Rs 1,500"
- "Full page Marathi translation including custom bakery menu cards."
- "Approve and pay Rs 1,500"
- "Update Diwali opening hours. REQ-104. Completed"
- "Add phone number to website header. REQ-098. Completed"
- "No open requests at the moment."
- "Monthly Reports: Performance Overview"
- "October 2026: Executive Summary"
- "Sweet Crust Bakery saw a 28% increase in organic search visits following the Diwali menu launch."
- "Website visitors: 4,120. +28% vs Sep"
- "Enquiries received: 64. +12 new calls"
- "Social impressions: 18.4k. +15% reach"
- "Menu clicks: 892. Top: Mawa Cake"
- "September 2026 Monthly Report. Generated 01 Oct 2026. Download PDF"
- "No past reports generated yet. Your first report will appear on the 1st of next month."

## 6. Design checklist verification
- Focal element: Exactly one focal card per screen.
- Accent restraint: Rattan gold accent appears 2 times or fewer per viewport.
- Color tokens: Paper ground `#F6F5F2`, white surface cards `#FFFFFF`, lines `#E3E0D9`, sage deltas `#4F7A63`.
- Typography: Red Hat Display for titles, Red Hat Text for body, Red Hat Mono for metrics and ticket IDs.
- Punctuation: Zero em dashes, zero en dashes, and zero double hyphens.
