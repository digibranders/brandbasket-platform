# Design Notes: Staff Console (Release 2)

Area: Staff Console (console.brandbasket.in)  
Status: Ready for implementation review  
Date: 2026-11-14  

## 1. Overview and Core Philosophy

The BrandBasket staff console is built for a single operator managing client delivery, communication, billing oversight, and statutory compliance across Website and Social plans.

Key operational principles applied across all console screens:
1. Single queue ordered by urgency: Urgent and late tasks appear first at the top of the queue. The operator never wonders what to do next.
2. Rapid scanning density: Standard rows use a compact 44px to 48px height with Red Hat Mono for identifiers, dates, countdown timers, and currency.
3. Unified visual language: Built on the website brand tokens with a dedicated dark rail (#23242A), paper background (#F6F5F2), warm brown-black elevations, and strictly disciplined rattan gold accents.
4. Single focal element per screen: Every screen features exactly one elevated card with a 3px gold top border. Secondary panels remain resting cards with hairline borders.
5. Exact parity with product decisions: Implements kickoff call confirmation (decision D31) with a 24-hour automatic fallback notice, customer portal mirror views, and DPDP 30-day statutory timers.

## 2. Screen Architecture and Design Decisions

### 2.1 Today Queue (mock-console-today.html)
- Purpose: The primary operational screen for the staff member on shift.
- StatTiles: 4 figures set in Red Hat Mono 32px (Late, Due today, On track, Active clients).
- Single task queue: Late tasks are elevated to the focal card with a 3px rattan gold top border and priority red chips. Due today items follow in chronological order.
- Systems health block: Live status indicators for payment gateways (Razorpay, Paytm), DNS automation (Cloudflare), and messaging (WhatsApp Meta Cloud API).
- Focal element: The Late Tasks card.
- Gold usage: 3 times in desktop viewport (rail logo mark, active nav count badge, focal card top border).

### 2.2 Kickoff Call Confirmation Popup (mock-console-kickoff-popup.html)
- Purpose: Solves the prompt flow for completed kickoff calls (decision D31).
- Component architecture: Implements the shared PromptPopup pattern with 20px radius, 28px padding, and warm brown-black dialog elevation (0 24px 64px -16px rgba(42,28,16,0.28)) over a rgba(21,22,26,0.40) scrim.
- Primary action: Near-black button labelled "Call completed". Clicking it immediately starts the 48-hour first preview build countdown.
- 24-hour automatic fallback notice: Callout informing staff that if unconfirmed within 24 hours, the website build starts automatically with status "Started without call confirmation".
- Form fields: Call notes and design preferences textarea (optional), secondary buttons for "They did not join" and "Reschedule".
- Focal element: The elevated PromptPopup dialog.
- Gold usage: 3 times in desktop viewport (rail logo mark, Calls nav badge, dialog icon tile).

### 2.3 Client Workspace (mock-console-workspace.html)
- Purpose: Dedicated management view for an individual customer.
- Client header: Displays business name, primary contact details, phone, email, customer ID in Mono, and service tabs (Website, Social Media, Invoices & Billing).
- Next staff action card: The single focal element with a 3px rattan gold top edge and hero elevation. Contains direct input controls to paste preview URLs and send notification messages to the client.
- What the customer sees mirror panel: Read-only preview frame showing the customer's portal state in real time (stepper position, action card, and approval buttons). Staff always know what the client is viewing.
- Focal element: Next Staff Action Card.
- Gold usage: 3 times in desktop viewport (rail logo mark, focal card top border, service icon tile).

### 2.4 Money and Payments (mock-console-payments.html)
- Purpose: Revenue tracking, transaction auditability, and refund execution.
- StatTiles: Monthly volume in Mono (Rs 3,42,850.00), successful charges count, active refunds, and gateway uptime.
- Transactions table: Dense table with tabular Mono amounts, transaction IDs, timestamps, and status chips (Paid in sage, Refunded in sunken, Failed in red).
- Webhook stream status: Displays Razorpay and Paytm webhook endpoint health, response latency (0.4s), and recent event delivery logs.
- Refund confirmation dialog: Follows dialog elevation spec. Prominently states the clear consequence line: "Refunding Rs 2,999.00 will immediately cancel the active subscription, revoke website hosting at the end of the billing cycle, and send a credit note to info@aromacafe.in. This action cannot be undone."
- Focal element: Recent Transactions Card.
- Gold usage: 2 times in desktop viewport (rail logo mark, focal card top border).

### 2.5 Compliance and Privacy (mock-console-compliance.html)
- Purpose: Statutory compliance under the Digital Personal Data Protection (DPDP) Act and GDPR.
- StatTiles: Open privacy requests, earliest statutory deadline countdown, security incident count, and pending account closures.
- 30-day countdown timers: Formatted in Red Hat Mono (for example, "17d 08h remaining" and urgent "03d 14h remaining") tracking statutory limits from the exact submission timestamp.
- Account closures queue: Tracks legal tax retention requirements (60-day GST invoice archive rule) before final database purge.
- Incident and audit log: Read-only verification of encryption, Cloudflare Access authentication, and automated backup checks.
- Focal element: Privacy and Data Requests Table Card.
- Gold usage: 3 times in desktop viewport (rail logo mark, Compliance count badge, focal card top border).

## 3. Interactive States Covered in Mocks

Each HTML mock includes an interactive control bar with state switching buttons and viewport width toggles (1440 desktop and 390 mobile):

1. mock-console-today.html:
   - Live: Active queue with 2 late tasks, 3 due today, systems all green.
   - New: Beginning of shift with 0 late items, 2 new kickoff calls, 4 on track.
   - Empty: All tasks completed for today. Soft sage checkmark and queue clear message.
   - Error: Gateway alert banner with 3 failed Razorpay webhook retries and degraded dot.

2. mock-console-kickoff-popup.html:
   - Live: Dialog open for Sweet Crust Bakery (15 min after scheduled call time).
   - New: Fresh prompt immediately after scheduled call window.
   - Empty: Completed state. Dialog dismissed with confirmation banner and 48-hour build clock initiated.
   - Error: Server connection failure alert inside dialog.

3. mock-console-workspace.html:
   - Live: Design draft ready to send. Next action input fields active.
   - New: Post-kickoff build phase. Mirror shows "We are building your website".
   - Empty: Draft approved. Zero staff actions pending.
   - Error: Domain verification failure banner with missing A-record details.

4. mock-console-payments.html:
   - Live: Complete transactions list with successful charges.
   - New: Filtered view of initial transaction batch for the day.
   - Empty: Zero transactions matching query.
   - Error: Webhook delivery degraded warning banner.
   - Interactive Refund Modal: Clickable "Open refund dialog" and row buttons.

5. mock-console-compliance.html:
   - Live: Active privacy requests with running 30-day countdown timers.
   - New: Single new export request received today (29d 23h remaining).
   - Empty: Zero pending requests. All statutory requests fulfilled.
   - Error: Statutory deadline warning banner for requests under 72 hours remaining.

## 4. Staff Copy for Approval

### 4.1 Today Queue
- Header eyebrow: "Staff Operations"
- Header title: "Today"
- Header subtitle: "Single task queue ordered by urgency. Late items are sorted first."
- Stat labels: "Late", "Due today", "On track", "Active clients"
- Focal card header: "Late tasks" (tag: "2 urgent")
- Empty state: "All tasks completed for today. No clients are waiting on staff action. Automated social posts and monitoring runs continue in the background."
- Systems health items:
  - "Razorpay & Paytm Gateways: Webhook delivery normal (0.4s response)"
  - "Cloudflare DNS Automation: All nameserver verifications active"
  - "WhatsApp Meta Cloud API: Client message queues operational"

### 4.2 Kickoff Call Confirmation Popup
- Dialog eyebrow: "Kickoff confirmation"
- Dialog title: "Did the kickoff call with Sweet Crust Bakery happen?"
- Context line: "Scheduled for today, 14 November at 3:30 pm (15 minutes ago). Contact: Priya Sharma (+91 98765 43210)."
- Fallback note: "24-hour automatic fallback: If unconfirmed by tomorrow at 3:30 pm, the website build starts automatically with status Started without call confirmation."
- Textarea label: "Call notes and design preferences (optional)"
- Textarea placeholder: "Enter customer branding notes, color requests, or reference websites discussed on the call..."
- Primary button: "Call completed"
- Secondary buttons: "They did not join", "Reschedule", "Dismiss"
- Confirmation banner: "Kickoff call confirmed: Sweet Crust Bakery. The 48 hour website first preview clock has started. Status updated on Today queue."

### 4.3 Client Workspace
- Header badge: "Active Plan"
- Service tabs: "Website", "Social Media", "Invoices & Billing"
- Next staff action title: "Send website preview link"
- Next staff action description: "First draft ready. Add external preview link to notify customer for their review round."
- Input label: "Draft preview URL"
- Textarea label: "Message to Priya Sharma (sent via portal and WhatsApp)"
- Textarea default: "Hi Priya, your website draft is ready for review. Take a look and let us know your feedback or approve to launch."
- Primary button: "Send preview to customer"
- Mirror panel title: "What the customer sees"
- Mirror badge: "Read only mirror"
- Mirror action card title: "Review your website draft"
- Mirror action card description: "Your first website draft is ready. You have 1 round of changes included with your plan."
- DNS error banner: "Domain verification failed: sweetcrust.in. DNS records check returned NXDOMAIN for the required A-record pointing to 76.76.21.21. Client registrar has been notified."

### 4.4 Money and Payments
- Header eyebrow: "Finance and Gateways"
- Header title: "Money and transactions"
- Header subtitle: "Customer transactions, gateway webhooks, and refund management."
- Stat labels: "Monthly volume", "Successful charges", "Active refunds", "Gateway health"
- Refund dialog title: "Confirm refund of Rs 2,999.00 for Aroma Cafe"
- Consequence statement: "Refunding Rs 2,999.00 will immediately cancel the active subscription, revoke website hosting at the end of the billing cycle, and send a credit note to info@aromacafe.in. This action cannot be undone."
- Checkbox confirmation: "I acknowledge that website hosting and social services will cease immediately upon processing this refund."
- Primary destructive button: "Process refund of Rs 2,999.00"
- Secondary button: "Keep subscription active"

### 4.5 Compliance and Privacy
- Header eyebrow: "Statutory Compliance"
- Header title: "Compliance and privacy"
- Header subtitle: "DPDP statutory deadlines, erasure requests, audit logs, and account closures."
- Stat labels: "Privacy requests", "Earliest deadline", "Security incidents", "Pending closures"
- Countdown chip formats: "17d 08h remaining", "03d 14h remaining", "29d 23h remaining"
- Warning alert banner: "Statutory deadline alert: REQ-DPDP-021 has under 72 hours. Digital Personal Data Protection rules require data erasure execution within 30 days of client submission. Prompt action required."
- Retention rule label: "60-day GST invoice record retention"

## 5. Design System and Token Checklist Verification

1. Typography:
   - Red Hat Display: Used exclusively for page titles (32px), card hero titles (20px to 26px), dialog titles (20px to 22px).
   - Red Hat Text: Used for body copy, labels, helper text, and secondary navigation (13px to 15px).
   - Red Hat Mono: Used for all numbers, currency figures (for example Rs 5,898.82), dates, timestamps, countdown timers, and transaction/request IDs.

2. Palette and Tokens:
   - Paper/Ground: #F6F5F2
   - Surfaces: #FFFFFF
   - Sunken: #EEECE7
   - Lines and borders: #E3E0D9
   - Ink: #15161A
   - Text muted: #343741
   - Text faint: #5F626A
   - Rattan gold accent: #C48A47 (wash #F4E6D3, deep #8A5524, text #A46C2F)
   - Sage: #4F7A63 (wash #E5EFE8)
   - Error: #B42318 (wash #FDECEA)
   - Dark rail: #23242A

3. Radii:
   - Controls and inputs: 8px
   - Standard cards: 14px
   - Focal hero cards and dialogs: 20px
   - Status chips and pills: 9999px

4. Elevations:
   - Resting cards: 1px line border with 0 1px 0 rgba(42,28,16,0.03)
   - Hero focal cards: 1px line border with 0 1px 2px rgba(42,28,16,0.05), 0 12px 32px -12px rgba(42,28,16,0.14)
   - Dialogs: 0 24px 64px -16px rgba(42,28,16,0.28) over rgba(21,22,26,0.40) scrim

5. Accent and Focal Discipline:
   - Focal elements: Exactly one per screen.
   - Gold accent count: Counted strictly and never exceeds 3 occurrences in any viewport.
   - Zero em dashes, zero en dashes, and zero double hyphens across all copy, code, and comments.
