# Notes: Home and Needs your OK (D-A1)

## 1. Overview
The Home screen serves as the primary dashboard for BrandBasket customers. It follows the core principle: **one focal point per screen**. The next action the customer must take is highlighted in the focal card, rendered with a 20px border radius, a 3px rattan gold top border, a 40px icon tile with a warm gold wash, and an elevated warm shadow.

## 2. States covered
- **New customer (`new`)**:
  - Focal action: Website kickoff call booking with date and time selectors.
  - Secondary service card: Social media connection setup listing channels (Instagram, Facebook Pages, LinkedIn and Google) with soft buttons.
  - Needs your OK section: Empty state displaying a sage checkmark and informing the customer that previews, pictures, and quotes will appear here.
- **Live customer (`live`)**:
  - Website status card: Displays active live status, domain link, and October report ready.
  - Social media status card: Displays running status, 5 posts scheduled for the week, and Instagram reconnect status.
  - Latest report summary: Key metrics in tabular Red Hat Mono figures (412 visits, 18 posts, 9 enquiries, 6 calls).
  - Needs your OK section: Displays 3 actionable items (Website preview with 1 round of changes left, 3 pictures for next week, and a quote for Marathi page at Rs 1,500).
- **Empty state (`empty`)**:
  - Displayed for new listings or accounts before services are selected.
  - Focal call to action: "Add services to your plan".
  - Needs your OK indicates no pending items.
- **Error state (`error`)**:
  - Displays a top warning alert strip for expired network credentials.
  - Focal card switches to error recovery: "Reconnect Instagram to resume posting".
  - Status indicator turns red with a recovery action button.

## 3. Responsive behaviour
- **Desktop (1440px)**: 248px left navigation sidebar, 64px top bar with business switcher and search, 2-column grid (content 8 cols, Needs your OK 4 cols). Max content width 1240px.
- **Mobile (390px)**: Sidebar hidden, top bar compressed to 56px, single column stacked layout, fixed bottom tab bar (Home, Enquiries, Services, Requests, More) with 48px touch targets and safe-area padding.

## 4. Design rules check
- **Focal elements**: Exactly one focal element per state.
- **Gold count**: Rattan gold accent appears 3 times or fewer per viewport (nav indicator, focal top edge, next step badge).
- **Shadows**: Warm brown-black shadows (`rgba(42,28,16, ...)`). No cold or pure black shadows.
- **Gradients and stock art**: Zero gradients, zero stock photos, zero illustrations.
- **Punctuation**: Zero em dashes or en dashes used anywhere in copy or code.

## 5. New customer wording submitted for owner approval
- "Book your kickoff call: 30 minutes on video. We go through your bakery and plan your website with you."
- "Times in India"
- "Waiting for your kickoff call"
- "Set up Social: connect your accounts. Connect once and we write and post for you. About 5 minutes, no call needed."
- "Waiting for your accounts"
- "Nothing needs your OK right now. Previews, post pictures and quotes appear here and in the bell."
- "We have started on your Social: 5 posts scheduled this week"
- "Instagram needs you: Reconnect Instagram"
- "Website preview: 1 round of changes left"
- "3 pictures for next week"
- "Quote: Marathi page, Rs 1,500"
- "Reconnect Instagram to resume posting: Your Instagram login token expired. We cannot publish scheduled posts until you sign in again."
- "Paused until reconnected"
