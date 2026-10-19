# Customer Billing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the customer dashboard's Billing page to the reference layout (plan card with price and progress bar,
payment-method card, receipts table with per-row and bulk PDF download), backed by real data.

**Architecture:** Card details come from Razorpay's own payment entity on the `subscription.charged` webhook and are
stored on the `payments` row (new nullable columns, migration 0047); the page shows the latest one. The period bar and
receipt numbering are pure functions in `@brandbasket/shared/lib/billing`. PDF receipts are built by a pure "document
model" function (tested) and rendered with `pdf-lib` in a route handler on the app host, read through row-level
security so a customer can only ever download their own.

**Tech Stack:** Next.js 16 app router (route handlers + server components, one small client component), Drizzle +
Postgres, zod, vitest, `pdf-lib` (new dependency of `@brandbasket/platform`).

**Decisions (user, 2026-09-28):** real card from Razorpay, `Edit` = email us; PDF receipt per payment, "Download all"
= one combined PDF (not a formal GST tax invoice, but it carries our GSTIN and the GST split); bar = days into the
current billing period; the "Upgrade plan" link becomes "What's included".

**Honest limits:** Razorpay's payment entity carries network, last 4, card type and issuer but *not* the expiry date,
so the card shows "Debit card · HDFC Bank" where the reference shows "Expiry 06/2024". Payments recorded before this
ships have no card details; the card then says "Paid by card through Razorpay" without the digits.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/shared/src/lib/billing/period.ts` (+ test) | `billingPeriodProgress(subscription, now)`: start, end, days elapsed/total |
| `packages/shared/src/lib/billing/receipt-title.ts` (+ test) | `receiptNumber(sequence)` "#007", `receiptTitle(sequence, date)` "Receipt #007 – Sep 2026" |
| `packages/shared/src/lib/billing/payment-method.ts` (+ test) | `describePaymentMethod(method)` → `{ brand, headline, detail }` for the card |
| `packages/db/migrations/0047_payment_method_details.sql` + journal + snapshot | nullable `method`, `card_network`, `card_last4`, `card_type`, `card_issuer`, `upi_vpa` on `payments` |
| `packages/db/src/schema/billing.ts` | the new columns + a check that `card_last4` is 4 digits |
| `packages/db/src/queries/billing.ts` | `PaymentMethodDetails` type; optional `method` on `PaymentActivation`/`UnappliedPayment`; `sequence` on `Receipt`; `findLatestPaymentMethod` |
| `packages/billing/src/razorpay-webhook.ts` (+ test) | parse `method`/`card`/`vpa` from the payment entity, tolerant (never makes a charge invalid) |
| `packages/billing/src/provider.ts`, `fake-provider.ts` | `ConfirmedPayment.method?`; fake confirms with a test Visa 4242 so dev shows a card |
| `packages/shared/src/server/billing-activation.ts` | thread `method` through both activation helpers |
| `apps/platform/lib/server/razorpay-webhook-handler.ts`, `payment-confirmation.ts` | pass the method along |
| `apps/platform/lib/billing/receipt-document.ts` (+ test) | pure `receiptDocument(...)` → lines/rows of a receipt (GST split for INR) |
| `apps/platform/lib/server/receipt-pdf.ts` (+ test) | `renderReceiptsPdf(documents)` with pdf-lib, one page per receipt, WinAnsi-safe text |
| `apps/platform/app/app-host/billing/receipts/route.ts` (+ test) | `GET /billing/receipts?ids=a,b` (no ids = all), tenant-scoped, `application/pdf` attachment |
| `apps/platform/app/app-host/(protected)/billing/page.tsx` | the new layout |
| `apps/platform/components/panel/billing/*.tsx` | `PlanSummary`, `PaymentMethodCard`, `ReceiptsTable` (client: selection) |

## Tasks

### Task 1: Period progress (pure)
- [ ] Test `packages/shared/src/lib/billing/period.test.ts`:
  - inside the commitment term (activated 1 Sep, commitment ends 1 Oct, now 11 Sep) → start 1 Sep, end 1 Oct, 10 of 30 days;
  - after the commitment (paidThroughAt 1 Nov, commitment 1 Oct, now 16 Oct) → start = addMonthsUtc(1 Nov, −1) = 1 Oct, 15 of 31;
  - never exceeds total, never negative; returns null with no `activatedAt` or no end date, or when cancelled/manual is irrelevant (caller decides).
- [ ] Implement:
```ts
export interface PeriodProgress { readonly start: Date; readonly end: Date; readonly elapsedDays: number; readonly totalDays: number }
export function billingPeriodProgress(
  subscription: Pick<Subscription, "activatedAt" | "commitmentEndsAt" | "paidThroughAt">, now: Date,
): PeriodProgress | null
```
  End = commitmentEndsAt if in the future, else paidThroughAt (same rule as the page's `nextPaymentDate`, moved here and
  exported as `nextPaymentDate`). Start = activatedAt when end is the commitment end, else `addMonthsUtc(end, -1)` but
  never earlier than activatedAt. Days are whole UTC days (`Math.round(ms / 86_400_000)`), elapsed clamped to [0,total].
- [ ] `pnpm --filter @brandbasket/shared test -- period` passes.

### Task 2: Receipt titles (pure)
- [ ] Tests: `receiptNumber(7)` → `"#007"`, `receiptNumber(1234)` → `"#1234"`, non-positive/non-integer throws
  RangeError; `receiptTitle(7, new Date("2026-09-12T10:00:00Z"))` → `"Receipt #007 – Sep 2026"` (UTC month).
- [ ] Implement in `receipt-title.ts`. Month via `Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })`.

### Task 3: Payment method columns (db)
- [ ] Migration `0047_payment_method_details.sql` (hand-written: `--> statement-breakpoint` between statements AND a
  journal entry, idx 44; snapshot via `pnpm --filter @brandbasket/db db:generate` after the schema change, then replace
  the generated SQL with ours if it differs only in naming):
```sql
ALTER TABLE "payments" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_network" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_last4" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_type" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_issuer" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "upi_vpa" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_card_last4_check" CHECK ("payments"."card_last4" is null or "payments"."card_last4" ~ '^[0-9]{4}$');
```
- [ ] Queries: `export interface PaymentMethodDetails { method: string; cardNetwork: string | null; cardLast4: string | null; cardType: string | null; cardIssuer: string | null; upiVpa: string | null }`.
  Optional `method?: PaymentMethodDetails` on `PaymentActivation` and `UnappliedPayment`, spread into the insert.
  `Receipt` gains `sequence: number` = `row_number() over (partition by business_id order by created_at, id)`
  (computed in a subquery over *all* the business's payments so numbering doesn't depend on the 50-row limit).
  `findLatestPaymentMethod(db, businessId): Promise<PaymentMethodDetails | null>` — newest captured payment with
  `method is not null`.
- [ ] Integration test in `packages/db/src/billing.integration.test.ts`: method round-trips through
  `recordPaymentAndActivate`; `findLatestPaymentMethod` returns the newest; receipts carry sequence 1..n oldest-first;
  a bad last4 is rejected by the check.

### Task 4: Parse the card from the webhook
- [ ] Tests: a charged payload with `method: "card", card: { network: "Visa", last4: "1234", type: "debit", issuer: "HDFC" }`
  yields `method: { method: "card", cardNetwork: "Visa", cardLast4: "1234", cardType: "debit", cardIssuer: "HDFC", upiVpa: null }`;
  `method: "upi", vpa: "a@okhdfc"` yields upiVpa; no method / malformed card (last4 "12ab") yields `method: null`
  and the event is still `charged` (a card we can't read must never block recording money).
- [ ] Implement: separate lenient `paymentMethodSchema.safeParse(payment.entity)` after the strict parse.

### Task 5: Thread the method through
- [ ] `ConfirmedPayment.method?: PaymentMethodDetails | null`; fake provider returns
  `{ method: "card", cardNetwork: "Visa", cardLast4: "4242", cardType: "credit", cardIssuer: null, upiVpa: null }`.
- [ ] `FirstPayment.method?` / `RenewalPayment.method?` → `recordPaymentAndActivate`.
- [ ] Webhook handler passes `event.method` to both activations and to `recordUnappliedPayment`;
  `payment-confirmation.ts` passes `confirmed.method`.
- [ ] Update the existing unit tests that assert exact call arguments.

### Task 6: Payment method description (pure)
- [ ] Tests: Visa card → `{ brand: "VISA", headline: "Visa ending in 1234", detail: "Debit card · HDFC" }`;
  RuPay/Mastercard/Amex brand labels; UPI → `{ brand: "UPI", headline: "UPI", detail: "a@okhdfc" }`; netbanking →
  "Net banking"; null → null.

### Task 7: Receipt document model (pure)
- [ ] `receiptDocument({ receipt, businessName, customerEmail, planName, taxRateBasisPoints })` →
  `{ title, number, issuedOn, status, from: string[], billedTo: string[], lines: {label, amount}[], total, note }`.
  INR with tax: lines = "Plan, net" + "GST 18%" computed backwards from the gross with the same half-up rounding as
  `chargedAmountCents` (net = round(gross × 10000 / (10000 + rate))); USD: one line. Amounts formatted
  "INR 3,538.82" / "USD 69.00" (Helvetica has no ₹ glyph). `from` = "Fynix", address lines, "GSTIN …".
  Only `captured` + applied-or-received payments get a document; refunded shows status "Refunded".
- [ ] Tests for the INR split (299900 + 53982 = 353882), USD, and title.

### Task 8: PDF renderer
- [ ] `pnpm --filter @brandbasket/platform add pdf-lib`.
- [ ] `renderReceiptsPdf(docs: readonly ReceiptDocument[]): Promise<Uint8Array>` — A4, one page per receipt,
  Helvetica/Helvetica-Bold, text passed through `winAnsiSafe()` (characters the font can't encode → "?").
- [ ] Test: output starts with `%PDF-`, `PDFDocument.load` reports N pages; a business name with Devanagari doesn't throw.

### Task 9: Download route
- [ ] `GET /billing/receipts` on the app host. `getCustomerTenant()` → 401 if null. `ids` query param: comma list of
  UUIDs (zod), max 50; absent = every downloadable receipt. Read through `withTenantScope(getAppDb(), …)` so RLS
  enforces ownership; any requested id not found → 404. Response `application/pdf`,
  `Content-Disposition: attachment; filename="fynix-receipt-007.pdf"` (single) or `fynix-receipts.pdf`,
  `Cache-Control: private, no-store`.
- [ ] Route test with mocks (401, 400 for a bad id, 404 for another business's id, 200 single + many).

### Task 10: The page
- [ ] Header: `Billing` + "Manage your plan, payment method and receipts." + rule.
- [ ] Row of two cards (`lg:grid-cols-2`):
  - **Plan**: name + pill "Monthly", one-line terms, big price (renewal charge, tax included) with "per month", the
    period bar (`role="progressbar"`, aria values) captioned "Day 10 of 30 · next payment ₹3,538.82 on 1 Oct 2026",
    footer `<details>` "What's included" listing `carePlan.includes` + changes note. Lapsed/cancelled/manual states keep
    today's messages.
  - **Payment method**: heading + hint, inner bordered row with brand chip, headline, detail, billing email (the
    signed-in user's), `Edit` button = mailto support with a prefilled subject.
- [ ] **Receipts**: heading "Billing and invoicing" → "Receipts", hint, "Download all" / "Download N selected"
  button; table (desktop) with checkbox, file icon + title, billing date, status pill, amount, plan, `Download` link;
  stacked rows under `sm`. Empty state kept. Unpaid/under-review branches unchanged.
- [ ] Browser check at 1440 and 390 with the fake provider.

### Task 11: Verify
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` (db), `pnpm build`.
