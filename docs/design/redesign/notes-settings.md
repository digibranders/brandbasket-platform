# Design notes: Settings and Account Management (D-A3)

## 1. Scope and overview
This document specifies the design architecture, tab layout, deletion policy, interactive states, and approved user copy for the business settings hub:
- Mock implementation: `docs/design/redesign/mock-settings.html`

The settings experience is built strictly to the tokens and rules of `05-PREMIUM-DESIGN-LANGUAGE.md`.

## 2. Key architectural decisions
1. Six dedicated settings categories:
   - Profile: Brand identity, public storefront details, operating hours, and tax registration.
   - Security: Multi-factor authentication, credential freshness, and active device sessions.
   - Notifications: Real-time WhatsApp lead alerts, SMS approval reminders, and weekly email digests.
   - Team: Team member directory, access scopes (Owner vs Manager), and team invitation flow.
   - Privacy: Complete business data portability (ZIP export) and sovereign Indian DPDP data retention policies.
   - Delete account: High-consequence account termination governed by the mandatory 30-day restore period rule.
2. In-page tab navigation:
   - Clean horizontal tab navigation with active accent indicators.
   - Avoids full page reloads, providing instant feedback across settings categories.
   - Danger tab for account deletion styled with soft error red to signal high consequence.
3. Focal element discipline:
   - In every tab, exactly one card is treated as the focal card with a 3px top border and elevated warm hero shadow.
   - Profile tab: Brand details focal card.
   - Security tab: Two-factor authentication focal card.
   - Notifications tab: Customer lead alerts focal card.
   - Team tab: Team members focal card.
   - Privacy tab: Data export focal card.
   - Delete account tab: Account deletion and restore period focal card with error red top edge.
4. Typography standard:
   - Headings set in Red Hat Display.
   - Explanatory body and labels set in Red Hat Text.
   - Phone numbers, email addresses, GSTIN, FSSAI numbers, IP addresses, and dates set in Red Hat Mono.
5. Punctuation standard:
   - Zero em dashes, zero en dashes, and zero double hyphens across all copy, code, and documentation.

## 3. The 30-day restore period rule and account deletion flow
Accidental or impulsive account deletion can devastatingly disrupt a local business. The account deletion flow implements rigorous safeguards:

### A. Immediate consequences upon deletion confirmation
1. Website taken offline: The custom domain `sweetcrust.in` is unmapped and the public site displays an offline status.
2. Automated social publishing paused: All scheduled Instagram and Facebook posts are halted immediately.
3. Subscription billing stopped: The recurring Growth Plan subscription of Rs 4,999 a month is cancelled so no further charges occur.

### B. The 30-day restore period
- All website codebase files, media assets, approved social copy, and historical customer enquiries are preserved in encrypted cold storage for 30 calendar days.
- If the owner changes their mind within 30 days, simply signing into the dashboard presents an instant one-click option to restore the account and resume all services without data loss.

### C. Permanent erasure after 30 days
- After 30 calendar days elapse without a restore request, automated cryptographic erasure permanently deletes all database records, image assets, and server backups. Data cannot be recovered by anyone after this point.

### D. Confirmation dialog design
- Scrim overlay in `rgba(21, 22, 26, 0.40)` with warm dialog shadow `0 24px 64px -16px rgba(42,28,16,0.28)` and 20px border radius.
- Consequence statement clearly explains the immediate pause and the 30-day restore window.
- Destructive confirmation barrier: User must type the word "DELETE" into a dedicated monospace input before the destructive "Confirm account deletion" button becomes active.

## 4. States covered in `mock-settings.html`
- Live active (`live`):
  - Fully populated profile for Sweet Crust Bakery with store address, hours, contact phone (+91 98765 43210), and corporate GSTIN.
  - Active two-factor SMS authentication on mobile.
  - Full notifications active (WhatsApp leads, SMS approvals, email digests).
  - Two active team members (Anita Deshmukh as Owner, Rohan Shinde as Manager).
- New setup (`new`):
  - Displays identity prompt banner: "Complete your business identity: Please verify your store address and phone number so our designers can build your website footer and enquiry forms accurately."
  - Team tab shows solo owner with a prompt to invite colleagues.
- Empty (`empty`):
  - Team tab reveals a peaceful empty state with a sage icon: "No colleagues invited yet. Invite your head chef or front-of-house manager to review social media posts and approve website updates with you."
- Validation error (`error`):
  - Top error alert banner: "Unable to save profile changes: Please provide a valid 10-digit Indian phone number starting with +91."
  - Contact phone input highlights with error border and contextual helper: "Please enter 10 digits without spaces or special characters."

## 5. Responsive behaviour
- Desktop (1440px):
  - Max container width 1040px.
  - Two-column input grids for phone/email, address/hours, and corporate/GSTIN pairs.
  - Horizontal tab bar with hover states.
- Mobile (390px):
  - Horizontally scrollable tab bar with smooth touch panning.
  - Single-column input stacks for effortless thumb tapping.
  - 42px touch control heights across all inputs and action buttons.
  - Dialog scales gracefully to mobile width with safe margins.

## 6. Copy submitted for owner approval
- "Settings: Manage your business profile, security credentials, notification channels, team members, and data privacy."
- "Brand details: Your public business identity shown on your website, WhatsApp widget, and social profiles."
- "Sweet Crust Bakery"
- "Artisanal sourdough and festive confections baked daily in Koregaon Park, Pune. Natural ingredients, traditional fermentation, zero preservatives."
- "Primary contact number: +91 98765 43210. Used for customer WhatsApp click to chat button."
- "Public customer email: orders@sweetcrust.in"
- "Shop 4, Silver Birch Lane, Koregaon Park, Pune 411001"
- "Operating hours: Tue to Sun, 8:00 am to 9:00 pm (Closed Mondays)"
- "Registered corporate name: Sweet Crust Foods Private Limited"
- "GSTIN (India): 27AADCS1234F1Z8"
- "FSSAI license number: 11521034000412"
- "Two-factor authentication: Protected. SMS one-time code verification active on mobile +91 98765 43210."
- "Customer lead alerts: Instant WhatsApp alerts when a customer sends a website enquiry."
- "SMS approval reminders when social posts or quotes need your OK."
- "Team members: Colleagues who can review social posts, answer customer leads, and manage support tickets."
- "No colleagues invited yet. Invite your head chef or front-of-house manager to review social media posts and approve website updates with you."
- "Export business data: Download a complete ZIP package containing your website copy, high-resolution media, approved social posts, and customer enquiries."
- "Delete BrandBasket account: Irreversible after 30 days."
- "Clear 30-day restore period policy: When you initiate account deletion, your website sweetcrust.in will be taken offline immediately, automated posting will stop immediately, and recurring billing of Rs 4,999 a month will be cancelled. We keep your backups intact for 30 calendar days. If you change your mind within 30 days, simply sign in to restore your account and resume services instantly. After 30 days, all data is erased permanently and cannot be recovered."
- "To confirm deletion, please type DELETE below:"
- "Confirm account deletion"

## 7. Design checklist verification
- Focal element: Exactly one focal card per view.
- Accent restraint: Rattan gold accent appears 3 times or fewer per viewport.
- Color tokens: Paper ground `#F6F5F2`, white surfaces `#FFFFFF`, sunken surfaces `#EEECE7`, line `#E3E0D9`, ink `#15161A`, sage `#4F7A63`, error `#B42318`.
- Warm elevations: Resting `0 1px 0 rgba(42,28,16,0.03)`, hero `0 12px 32px`, dialog `0 24px 64px`.
- Punctuation: Zero em dashes, zero en dashes, and zero double hyphens.
