# Design notes: Billing and Checkout Intake (D-A3)

## 1. Scope and overview
This document details the design decisions, component architecture, state variations, and user copy for the subscription management and checkout workflows:
- Plan and billing: `docs/design/redesign/mock-billing.html`
- Membership checkout and intake: `docs/design/redesign/mock-checkout-intake.html`

Both screens adhere strictly to the Release 2 premium design language defined in `05-PREMIUM-DESIGN-LANGUAGE.md`.

## 2. Key architectural decisions
1. Transparent Indian tax invoicing:
   - Full GST compliance for Indian small businesses. All invoice rows display the legal entity name, GSTIN (15 characters), place of supply, and separate CGST plus SGST breakdowns.
   - Prices display transparently in Indian Rupees (INR) with explicit GST notices (e.g. "Rs 4,999 per month + GST").
2. Razorpay recurring payment model:
   - Optimized for domestic payment methods including UPI AutoPay, RuPay credit cards, and major private bank credit and debit cards (HDFC, ICICI, Axis, SBI).
   - Card expiry notices and automated payment failure recovery banners to prevent unintended website downtime.
3. Focal element discipline:
   - Exactly one focal element per view. In billing, the focal card is the active Growth Plan subscription card featuring a 3px rattan gold top border and elevated warm shadow. In checkout, the business details intake card commands primary attention.
4. Typography and number formatting:
   - All monetary figures, invoice numbers, telephone numbers, and renewal dates use Red Hat Mono with tabular alignment.
   - Headings use Red Hat Display and body text uses Red Hat Text.
5. Punctuation standard:
   - Zero em dashes and zero en dashes used in copy, labels, or notes.

## 3. States covered

### A. Plan and billing (`mock-billing.html`)
- Live active (`live`):
  - Focal card: Active Growth Plan subscription at Rs 4,999 per month + GST with active green status chip, renewal date 14 December 2026, and "Change plan" action.
  - Tax invoices card: List of paid monthly invoices (INV-2026-11-042 and INV-2026-10-038) for Rs 5,898.82 with PDF download links.
  - Payment method card: Saved Mastercard ending in 4022 with expiry 08/29 and "Update payment method" button.
  - GST details card: Registered entity Sweet Crust Foods Private Limited, GSTIN 27AADCS1234F1Z8, and place of supply Maharashtra (27).
- First invoice (`new`):
  - Displays the initial subscription setup with the first generated invoice INV-2026-11-001.
- Empty (`empty`):
  - Fresh account state where subscription is active but the first automated invoice has not yet been cut. Displays peaceful empty message: "No tax invoices generated yet."
- Payment failed (`error`):
  - Persistent red alert banner at top: "Payment failed on 12 November: Your bank declined the recurring charge of Rs 4,999. Please update your payment method to avoid service interruption."
  - Direct "Update card" action button to resolve the decline before service suspension.

### B. Checkout and intake (`mock-checkout-intake.html`)
- Review order (`live`):
  - Two-column layout pairing business intake fields with an order summary card.
  - Intake inputs: Business name, City and State, Primary contact number (+91 98765 43210), and optional GSTIN.
  - Order summary: Growth Plan monthly fee Rs 4,999.00, first month Social introductory offer Rs 1.00, 18% GST (CGST + SGST) Rs 899.82, Total due today Rs 5,899.82.
  - Primary call to action: "Pay with Razorpay" near-black button.
- Intake form (`new`):
  - Focuses user attention on entering business identity details during first-time onboarding.
- Empty cart (`empty`):
  - Displays "Your basket is empty" with a secondary button to "Browse plans".
- Payment failed (`error`):
  - Displays red warning banner: "Payment declined: Please review card details or choose UPI."

## 4. Responsive behaviour
- Desktop (1440px):
  - Max container width 1120px for billing and 960px for checkout.
  - Two-column split grid (2fr content, 1fr sidebar summary).
- Mobile (390px):
  - Single column stacked layout.
  - Touch targets 42px or greater.
  - Full-width payment and intake buttons for easy single-thumb completion.

## 5. Copy submitted for owner approval
- "Plan and billing: Manage your active subscription, payment method, and GST invoices."
- "Growth Plan: Website maintenance, automated social posts, and dedicated expert support."
- "Rs 4,999 per month + GST"
- "Next renewal: 14 December 2026"
- "Payment failed on 12 November: Your bank declined the recurring charge of Rs 4,999. Please update your payment method to avoid service interruption."
- "Mastercard ending in 4022. Expires 08/29"
- "Sweet Crust Foods Private Limited. GSTIN: 27AADCS1234F1Z8. Place of supply: Maharashtra (27)"
- "Complete your subscription: Review order details and provide your business intake information."
- "First month Social offer: Rs 1.00"
- "18% GST (CGST + SGST): Rs 899.82"
- "Total due today: Rs 5,899.82"
- "Pay with Razorpay"
- "Your basket is empty. Browse plans to select a package for your business."

## 6. Design checklist verification
- Focal element: Exactly one focal card per screen.
- Accent restraint: Rattan gold accent appears 3 times or fewer per viewport.
- Color tokens: Paper ground `#F6F5F2`, white surfaces `#FFFFFF`, warm lines `#E3E0D9`, warm ink `#15161A`.
- Shadows: Warm brown-black shadows (`rgba(42,28,16, ...)`). Zero pure black shadows.
- Punctuation: Zero em dashes, zero en dashes, and zero double hyphens.
