# GST Tax Invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Status

Tasks 1 to 18A are built and committed on `development`, and the automated checks of Task 19 (Task 19a) have passed.
For every built task **the code in the repo is the source of truth**: the snippets below were refreshed from it on
2026-10-09 (commit `34a3502`), and where a snippet and the file disagree, the file wins. What
is left of Task 19 is the manual walk-through, the CA's answers to the gates and the release, which are the owner's. Each
task builds, typechecks and passes its tests on its own commit.

| Task | What | Status | Commits |
|---|---|---|---|
| 1 | GST state codes | Done | `dd4864e`, hardened in `0747b77` |
| 2 | GSTIN validation | Done | `dd4864e`, `0747b77`, `9d9d75c`, `e1118a1` |
| 3 | The tax split | Done | `dd4864e`, `0747b77`, `b29ea67`, `e1118a1` |
| 4 | Invoice numbers and the financial year | Done | `dd4864e`, `0747b77`, `e1118a1` |
| 5 | Amount in words | Done | `dd4864e`, `0747b77`, `e1118a1` |
| 6 | The invoice builder | Done | `886ddd4`, `b29ea67`, `392031d`, `e1118a1`, SAC in `34a3502` |
| 7 | Tables (0119) and guards (0120, 0121) | Done | `c7814c3`, `f498abb`, `392031d` |
| 8 | Grants and row-level security (0122) | Done | `23bc4d0` |
| 9 | Queries and erasure | Done | `7d2c223`, `4bf4ae9`, `c74bb48`, `bbdb22b`, `31878af` |
| 10 | Supplier details | Done | `238b58b` |
| 11 | Issue an invoice for a recorded payment | Done | `7c94569`, `1d31b73`, `9d9d75c`, `286484e`, `31878af`, `e1118a1` |
| 12 | Wire invoices into every payment path | Done | `f1abe6b` |
| 12A | Payment date on the invoice, and when invoicing started (0123) | Done | `2a5273a` |
| 13 | Billing details form parsing | Done | `6c269ad`, `1a72a6a` |
| 14 | Save action, card and prompt | Done | `d84cb84`, `aa8431a`, `1a72a6a` |
| 14A | Payment method section on Billing | Done | `be0d36b`, `1a72a6a` |
| 15 | Fonts and the logo | Done | `2862191` |
| 16 | The renderer | Done | `6b242fc` |
| 17 | Customers download invoices from Billing | Done | `32462d9`, `9cad364` |
| 18 | Staff: billing details, invoices, issue a missing one | Done | `0b7a8dd`, `0462760`, `8ea0299` |
| 18A | Invoice register for the CA, and missing invoices | Done | `43a31e4`, `0462760`, `8ea0299` |
| 19 | Verify and ship | Automated checks done (19a); walk-through, gates and release are the owner's | `8ea0299` verified |

Task 19a verified on 2026-10-09 at `8ea0299`: lint, typecheck and unit tests pass for every package (about 4,300 unit
tests); integration passes against a fresh database (db 48 files and 1,046 tests, auth 3 and 24, shared 5 and 88);
migrations 0119 to 0123 apply from zero and `drizzle-kit check` reports no drift; both production builds pass and the
invoice fonts sit only in the server bundle of the one route that renders an invoice in each app (never in a client
chunk, and no client chunk holds pdf-lib); no added line has a dash or a banned word. Still open: the manual walk-through
in the list below, the CA's Gates 1 to 5 and 7, Razorpay's answer to Gate 6, and the migration number clash.

Order of work: 12, 12A, 13, 14, 14A, 15, 16, 17, 18, 18A, 19. Task 16 needs 12A (the `paidOn` column) and 15. Task 17
needs 16. Task 18 needs 12A, 13 and 16. Task 18A needs 12A and 18.

## Changelog

- **2026-10-09, final review before Tasks 12 to 19.** Folded the earlier "Changed" notes into the task bodies and
  refreshed every finished task's code from the repo. Main corrections to the remaining tasks: Task 12 lists every
  payment path, adds the Razorpay `current_start` parse with its tests, puts the invoice last in each payment
  transaction, and fixes the tests the new arguments would break. New Task 12A stores the day a payment was made
  (`paid_on`), because a missing invoice staff issue later is dated the day of issue and must not print that day as the
  payment date, and records when invoicing started, so payments from before launch are never listed as missing
  (Gate 4). Tasks 13 and 14 follow the house form pattern (`usePanelForm`, one error at a time, typed values kept), accept
  every printable ASCII character, and let an account that is still buying its membership save details. Task 16 is
  rewritten from a prototype that was compiled and rendered against the four approved samples (wrapping, page overflow,
  unprintable characters, "Sep" dates, column positions). Tasks 17, 18 and 18A use the real route, action and notice
  patterns, validate ids, protect the CSV against spreadsheet formulas, and give staff one place to see missing
  invoices. SAC is 998361 (owner decision; Gate 1 now only asks the CA to confirm it).
- **After review of Tasks 10 and 11.** The plan `InvoiceSource` carries `monthly` and `retentionDiscountCents`; staff
  issue a missing invoice dated the day they issue it (`issueTaxInvoice(tx, payment, source, { issuedAt })`).
- **After review of Tasks 6 and 7.** The invoice keeps no recipient email or phone (erasure could not clear them from an
  insert-only row); guards migrations 0120 and 0121 come before the grants, which are 0122.

**Goal:** Every captured INR payment that buys something gets a GST tax invoice: an immutable record with a gapless number
(`FF/26-27/000001`), the customer's billing details, place of supply, CGST + SGST or IGST worked out per line, and a PDF in
the approved design that customers download from Billing and staff download from the client page.

**Architecture:** Pure GST rules live in `@firstfold/billing` (state codes, GSTIN check, tax split, invoice numbering,
amount in words, the invoice builder). The database has `billing_profiles` (what the customer tells us),
`tax_invoice_series` (one counter row per prefix and financial year) and `tax_invoices` (a frozen snapshot of everything
printed). An invoice is issued inside the same transaction that records the payment, in a savepoint and as the last step,
so a fault in invoicing never loses a payment or blocks access: it is logged and staff issue the missing invoice. The
PDF is drawn with pdf-lib in `@firstfold/shared`, with Hanken Grotesk embedded from a generated module and the rupee sign
drawn as a vector path, because Hanken Grotesk has no rupee glyph.

**Tech Stack:** TypeScript, Next.js 16 route handlers and server actions, Drizzle on PostgreSQL 16 with row-level
security, Vitest, pdf-lib 1.17.1 with @pdf-lib/fontkit 1.1.1.

**Design spec:** `docs/superpowers/specs/2026-10-09-gst-tax-invoices-design.md`.

**Approved design:** the invoice artifact https://claude.ai/artifact/7UogCdVqQ7z3UwqPUvsbBa, its template source
`../invoice-design/invoice-template.html`, and the CA pack `../Firstfold-invoice-samples.pdf` (cover plus four samples).
The PDF must match them. The samples and the artifact still print the old placeholder SAC; regenerate them with 998361 before the CA
review.

**Commits:** one local commit per task on `development`, with the message given in the task's Commit step (plain
English, sentence case, no prefix, no dashes). Never push from a task; Task 19 covers the release.

**Commands:** unit tests `pnpm --filter <pkg> exec vitest run <file>`; package integration tests
`pnpm --filter <pkg> exec vitest run --config vitest.integration.config.ts <file>` (after `pnpm db:migrate:test`); all
integration tests `pnpm test:integration`; all checks `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

---

## Decisions

These are settled. Do not reopen them in review without new facts.

| # | Decision | Why |
|---|---|---|
| D1 | Invoices only for INR payments that were applied: captured, `paid_at` set, and no `attention_reason` or one not in `UNAPPLIED_PAYMENT_REASONS` (a reason raised after the money applied, such as `submission_failed`, still gets an invoice). `isInvoiceablePayment` in `@firstfold/db` is the one definition, with `paymentWasApplied` as its SQL twin. USD keeps today's receipt. | Firstfold sells in India only. GST does not apply to the dollar plans (`NO_TAX`). Unapplied money is refunded or applied by staff first. |
| D2 | An invoice is a snapshot. Nothing on it is recomputed after issue. | Rule 46 content must not drift when a plan, coupon, address or our own details change later. |
| D3 | Numbers are `FF/<yy-yy>/<6 digits>`, one series per financial year (April to March, IST), from a counter row updated in the issuing transaction. Not a Postgres sequence. | GST needs a consecutive series of at most 16 characters per financial year. Sequences skip on rollback; a row counter under a row lock does not. |
| D4 | Tax is worked out per line on the taxable value. Same state: CGST and SGST are each `round(taxable × rate / 2)`. Other state: IGST is `round(taxable × rate)`. Any difference from what was charged, at most 1 paisa per line, prints as a Round off row. | CGST must equal SGST. Razorpay charges `chargedAmountCents` (one rounding of 18%), which can differ from two roundings of 9% by a paisa. |
| D5 | Place of supply: the GSTIN's state when the customer gave a GSTIN, else the billing address state, else the onboarding address state, else Maharashtra (our location). The basis is stored. | Section 12(2) IGST Act: registered recipient's location, else the address on record, else the supplier's location. |
| D6 | Billing details are asked for, not required. Pay pages prompt for them; Billing has the form. Saved details apply to invoices issued after saving. | Blocking payment on paperwork costs conversions, and D5 gives a lawful invoice without them (but see Gate 7). |
| D7 | Invoicing runs in a savepoint, as the last step of the payment transaction. A failure is logged as `tax-invoice-failed` and the payment still commits. A lost database connection is rethrown, because the payment cannot commit either. | Money and access must never depend on a PDF field. Staff can issue the invoice later; the issue is idempotent per payment. |
| D8 | PDF with pdf-lib, not headless Chromium. | Production units run sandboxed (`RestrictNamespaces`, `MemoryMax=1500M`, no writable HOME) and nginx blocks headless Chrome. pdf-lib is already in use and needs no new infrastructure. |
| D9 | Fonts and the rupee path ship as a generated TypeScript module (about 230 KB of base64, server only). | Works the same in both apps, in Vitest and in a Next server bundle, with no runtime file reads or file tracing. Only the two routes that render invoices import it. |
| D10 | PDFs are rendered on request from the snapshot, never stored. | The snapshot is the record (Rule 56, kept 72 months in Postgres). Nothing new to back up or secure. The public R2 bucket must not hold invoices. |
| D11 | Credit notes, e-invoicing (IRN/QR), export invoices and emailing invoices are out of scope. | No refunds exist in code, turnover is below the e-invoice threshold, customers are India only, and there is no email provider yet. |
| D12 | The customer's legal name is self-declared, printable ASCII only, checked against nothing. Typographic punctuation is first converted to plain ASCII (`normaliseInvoiceText`: middle dot or bullet to a comma, curly quotes to straight, dashes to a hyphen, ellipsis, Unicode spaces and zero-width characters), in the issuer for every text on the invoice and in the billing details form, so a curly apostrophe or an upgrade charge's middle dot never holds an invoice. A name or address that still has other characters (for example a business name from onboarding in Hindi, with no billing details given) is never printed as "?": the issuer refuses it, the payment stays without an invoice, staff see it under "Missing invoices", and the customer is asked for billing details. Once they save English details, staff issue it (D16). | A GSTIN lookup needs a paid GSP API. GST legal names are in Latin script on the GST portal, so English is the right requirement. PDF-lib could not shape Hindi when tried (garbled glyphs); other scripts would need a different PDF engine, which is a follow-up if customers ask. |
| D13 | Billing shows how the customer pays. Changing the card is done with support for now: staff send a Razorpay link. | Razorpay's subscription update API documents plan, quantity and dates, not the payment method. Confirm the supported route with Razorpay support (Gate 6) before building a self-serve button. |
| D14 | Staff can correct a customer's billing details; changes apply only to invoices issued afterwards. | Customers phone in with a wrong GSTIN. Issued invoices are never edited (D2). |
| D15 | Staff get a monthly invoice register with B2B and B2C totals and a CSV export, and one list of payments missing an invoice. | The CA files GSTR-1 and GSTR-3B monthly from exactly these figures, and a failed invoice must not hide in a log. |
| D16 | An invoice stores two dates: `issued_on` (decides the number's financial year) and `paid_on`. They are the same day for an invoice issued with its payment. A missing invoice staff issue later is dated the day it is issued and prints the real payment date. | An invoice is never backdated, and the payment date printed must be true. |
| D17 | Invoicing starts when migration 0123 runs (its `tax_invoicing_start` row). Payments recorded before keep their receipts and are never listed as missing (Gate 4). | Launch must not ask staff to invoice months of past payments into the new series. |
| D18 | No runtime feature flag. Release is held on `development` until Gates 1 to 5 are answered; once on `main`, every invoiceable payment gets an invoice. | An invoice is a legal record that cannot be withdrawn. Turning invoicing off after launch would leave supplies uninvoiced, which is worse than not launching. |

## Gates before merge to `main` (owner and CA)

The code ships with the defaults in brackets. Change the named constant if the CA says otherwise.

1. **SAC**: decided by the owner, `998361` (`FIRSTFOLD_SAC` in `packages/billing/src/tax-invoice.ts`). Confirm with the
   CA that it matches the services billed (website subscription, extras, promotions and ad spots).
2. **Rounding** [to the paisa, Round off only for the 1 paisa CGST/SGST case]: no code change if confirmed.
3. **First number** [`FF/26-27/000001`]: if the CA wants to continue a manual series, a follow-up migration seeds the
   counter: `INSERT INTO "tax_invoice_series" ("prefix", "financial_year", "next_serial") VALUES ('FF', '26-27', N);`.
4. **Past payments** [keep their receipts, no backfill; D17]: a backfill is a separate plan if the CA asks for one.
5. **Declaration and signature** [as in the template]: `DECLARATION_LINES` in `packages/shared/src/server/tax-invoice-pdf.ts`.
   Ask whether "computer generated, does not need a signature" meets Rule 46(q) for an invoice that is not an
   e-invoice, or whether a digital signature or the authorised signatory's name is needed.
6. **Changing the card** (owner, with Razorpay support): ask how a customer switches the card or UPI on a live
   subscription for this account (API, hosted link, or Dashboard only). Until then D13 stands.
7. **Unregistered customer, ₹50,000 or more** [no extra check]: Rule 46(e) asks for the recipient's name, address and
   state with its code when an unregistered customer's taxable value is ₹50,000 or more. Plans are below that today, but
   a custom charge could exceed it with no address on record. Ask whether the invoice must then be held until an address
   is given; if yes, a follow-up adds that refusal to `issueTaxInvoice` (it then fails into the missing list, D7).

---

## File map

| File | Change | Task |
|---|---|---|
| `packages/billing/src/gst-states.ts`, `gstin.ts`, `gst.ts`, `invoice-number.ts`, `amount-in-words.ts`, `billing-range-error.ts`, `tax-invoice.ts` | GST rules and the invoice builder | 1 to 6 (done) |
| `packages/billing/package.json`, `src/index.ts` | Subpath exports for the browser-safe modules | 6 (done) |
| `packages/billing/src/razorpay-webhook.ts` | `currentStart` on the `charged` event | 12 |
| `packages/db/src/schema/tax-invoices.ts` | Tables; `paid_on` and `tax_invoicing_start` | 7 (done), 12A |
| `packages/db/migrations/0119` to `0122` | Tables, guards, grants | 7, 8 (done) |
| `packages/db/migrations/0123_tax_invoice_paid_on.sql` | `paid_on`, `tax_invoicing_start`, its grant | 12A |
| `packages/db/src/queries/tax-invoices.ts` | Counter, insert, reads, billing profile, payment inputs; later the start cutoff, by-id read, register reads | 9 (done), 12A, 18, 18A |
| `packages/db/src/queries/charges.ts` | `findChargeByPaymentId` | 18 |
| `packages/db/src/queries/billing.ts` | `findCurrentPaymentMethod`; `Receipt` gains its invoice | 14A, 17 |
| `packages/db/src/queries/account-erasure.ts`, `docs/account-erasure.md` | Erasure deletes `billing_profiles`, keeps `tax_invoices` | 9 (done) |
| `packages/shared/src/lib/site-config.ts` | Supplier legal name, trade name, CIN, state | 10 (done) |
| `packages/shared/src/server/tax-invoicing.ts` | Issue an invoice for a recorded payment | 11 (done), 12A |
| `packages/shared/src/lib/billing/payment-method.ts` | "Visa credit card ending 4366", for the invoice and Billing | 11 (done) |
| `packages/shared/src/server/billing-log.ts`, `error-log-info.ts` | Invoice events, safe error fields | 11 (done) |
| `packages/shared/src/server/billing-activation.ts` | Invoice first, renewal and reactivation payments | 12 |
| `packages/shared/src/server/charge-payments.ts` | New. Record a charge payment and issue its invoice | 12 |
| `apps/platform/lib/server/razorpay-webhook-handler.ts` | Pass the renewal's invoiced price and cycle start | 12 |
| `apps/platform/lib/server/charges.ts`, `apps/admin/lib/server/charges-admin.ts` | Use `recordChargePaymentWithInvoice` | 12 |
| `packages/shared/src/lib/billing/billing-details-form.ts` | New. Form parsing and validation, both apps | 13 |
| `apps/platform/app/app-host/(protected)/billing/actions.ts` | `saveBillingDetailsAction` | 14 |
| `apps/platform/lib/server/billing-details.ts` | New. What the card and prompt need | 14 |
| `apps/platform/components/panel/billing/billing-details.tsx`, `billing-details-prompt.tsx` | New. Card, form and prompt | 14 |
| `apps/platform/app/app-host/(protected)/billing/page.tsx` | Payment method and Billing details on every branch | 14, 14A |
| `apps/platform/app/app-host/(protected)/onboarding/review/page.tsx`, `upgrade/page.tsx`, `components/panel/membership/membership-page.tsx` | The prompt, or the inline form | 14 |
| `apps/platform/components/panel/billing/payment-method.tsx` | New. Payment method section | 14A |
| `packages/shared/assets/invoice-fonts/*` | Hanken Grotesk 400/600/700, Noto Sans 600, OFL licences | 15 |
| `packages/shared/scripts/embed-invoice-fonts.mjs`, `src/server/tax-invoice-fonts.generated.ts` | Font module | 15 |
| `packages/shared/src/server/tax-invoice-wordmark.ts` | Logo paths | 15 |
| `packages/shared/src/server/tax-invoice-pdf.ts` | The renderer | 16 |
| `apps/platform/lib/billing/receipt-rows.ts`, `apps/platform/lib/server/billing.ts`, `apps/platform/app/app-host/billing/receipts/route.ts` | Invoices for invoiced payments, receipts for the rest | 17 |
| `packages/shared/src/server/tax-invoice-reissue.ts` | New. Rebuild a missing invoice's source | 18 |
| `apps/admin/lib/server/invoices-admin.ts`, `apps/admin/lib/invoice-notices.ts`, `apps/admin/lib/billing-details-form-state.ts`, `apps/admin/components/billing-details-form.tsx` | New. Staff issue and edit | 18 |
| `apps/admin/app/(protected)/clients/[businessId]/invoice-actions.ts`, `page.tsx` | Actions and the two sections | 18 |
| `apps/admin/app/(protected)/invoices/[invoiceId]/route.ts` | New. Staff PDF download | 18 |
| `packages/shared/src/lib/billing/invoice-register.ts` | New. Register rows, totals, month range and CSV, pure | 18A |
| `apps/admin/app/(protected)/invoices/page.tsx`, `invoices/export/route.ts`, `apps/admin/components/console/dock.tsx` | Register page, CSV, dock entry | 18A |

---
## Phase 1: GST rules (pure, `@firstfold/billing`)

### Task 1: GST state codes

> **Done in `dd4864e`, `0747b77`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Create `packages/billing/src/gst-states.ts`; Test `packages/billing/src/gst-states.test.ts`

- [x] **Step 1: Write the test**

```ts
import { INDIA_STATES } from "@firstfold/db/india-states";
import { describe, expect, it } from "vitest";
import { gstStateCodeOf, stateCodeOfGstCode, UnknownStateError } from "./gst-states";

describe("GST state codes", () => {
  it("gives every state and union territory on the platform its GST code, with no code used twice", () => {
    const codes = INDIA_STATES.map((state) => gstStateCodeOf(state.code));
    expect(codes).toHaveLength(36);
    expect(new Set(codes).size).toBe(36);
  });

  it("maps the codes Firstfold deals with most", () => {
    expect(gstStateCodeOf("mh")).toBe("27");
    expect(gstStateCodeOf("ka")).toBe("29");
    expect(gstStateCodeOf("dh")).toBe("26");
    expect(gstStateCodeOf("la")).toBe("38");
  });

  it("goes back from a GST code to the platform's state code", () => {
    expect(stateCodeOfGstCode("27")).toBe("mh");
    expect(stateCodeOfGstCode("07")).toBe("dl");
  });

  it("knows nothing of codes that are not a state: 96 (other country), 97 (other territory), 99", () => {
    expect(stateCodeOfGstCode("96")).toBeNull();
    expect(stateCodeOfGstCode("97")).toBeNull();
    expect(stateCodeOfGstCode("99")).toBeNull();
  });

  it("knows nothing of codes that are not a state: 25 was retired", () => {
    expect(stateCodeOfGstCode("25")).toBeNull();
  });

  it("refuses a state code it does not know", () => {
    expect(() => gstStateCodeOf("xx")).toThrow(UnknownStateError);
  });

  it("does not mistake names on the object prototype for state codes", () => {
    expect(() => gstStateCodeOf("constructor")).toThrow(UnknownStateError);
    expect(() => gstStateCodeOf("toString")).toThrow(UnknownStateError);
    expect(() => gstStateCodeOf("__proto__")).toThrow(UnknownStateError);
  });
});
```

- [x] **Step 2: Run** `pnpm --filter @firstfold/billing exec vitest run src/gst-states.test.ts`. Expected: FAIL, module not found.

- [x] **Step 3: Implement**

```ts
/**
 * GST's two-digit state codes (the first two characters of every GSTIN and the "Place of supply" code on an invoice),
 * keyed by the ISO 3166-2:IN code the rest of the platform uses (packages/db/src/india-states.ts). Daman and Diu merged
 * into Dadra and Nagar Haveli in 2020 and took code 26; 25 is retired. Pure and browser-safe.
 */

// A Map, not a plain object, so a name like "constructor" or "__proto__" is simply not found.
const GST_CODE_BY_STATE: ReadonlyMap<string, string> = new Map([
  ["jk", "01"], ["hp", "02"], ["pb", "03"], ["ch", "04"], ["uk", "05"], ["hr", "06"], ["dl", "07"], ["rj", "08"],
  ["up", "09"], ["br", "10"], ["sk", "11"], ["ar", "12"], ["nl", "13"], ["mn", "14"], ["mz", "15"], ["tr", "16"],
  ["ml", "17"], ["as", "18"], ["wb", "19"], ["jh", "20"], ["od", "21"], ["cg", "22"], ["mp", "23"], ["gj", "24"],
  ["dh", "26"], ["mh", "27"], ["ka", "29"], ["ga", "30"], ["ld", "31"], ["kl", "32"], ["tn", "33"], ["py", "34"],
  ["an", "35"], ["tg", "36"], ["ap", "37"], ["la", "38"],
]);

const STATE_BY_GST_CODE: ReadonlyMap<string, string> = new Map(
  [...GST_CODE_BY_STATE].map(([state, gst]) => [gst, state]),
);

/** Thrown for a state code that is not an Indian state or union territory, so a typo never reaches an invoice. */
export class UnknownStateError extends Error {
  constructor(stateCode: string) {
    super(`No GST state code for state "${stateCode}"`);
    this.name = "UnknownStateError";
  }
}

/** "mh" -> "27". Throws for a code that is not an Indian state or union territory. */
export function gstStateCodeOf(stateCode: string): string {
  const gst = GST_CODE_BY_STATE.get(stateCode);
  if (gst === undefined) throw new UnknownStateError(stateCode);
  return gst;
}

/** "27" -> "mh", or null for a code that is not a state (96, 97 and anything unassigned). */
export function stateCodeOfGstCode(gstCode: string): string | null {
  return STATE_BY_GST_CODE.get(gstCode) ?? null;
}
```

- [x] **Step 4: Run** the same command. Expected: PASS.

### Task 2: GSTIN validation

> **Done in `dd4864e`, `0747b77`, `9d9d75c`, `e1118a1`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Create `packages/billing/src/gstin.ts`; Test `packages/billing/src/gstin.test.ts`

- [x] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { gstinCheckCharacter, InvalidGstinError, isValidGstin, normaliseGstin, stateCodeOfGstin } from "./gstin";

describe("GSTIN", () => {
  it("accepts real GSTINs", () => {
    expect(isValidGstin("27AAICD9268J1Z0")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
  });

  it("refuses a body that is not 14 GSTIN characters, without echoing the characters", () => {
    expect(() => gstinCheckCharacter("27AAICD9268J1")).toThrow(BillingRangeError);
    const lowerCase = "27aaicd9268j1z";
    expect(() => gstinCheckCharacter(lowerCase)).toThrow(BillingRangeError);
    expect(() => gstinCheckCharacter(lowerCase)).toThrow(expect.objectContaining({ message: expect.not.stringContaining("aaicd") }));
  });

  it("works out the check character", () => {
    expect(gstinCheckCharacter("27AAICD9268J1Z")).toBe("0");
    expect(gstinCheckCharacter("29AAPFU0939F1Z")).toBe("R");
  });

  it("refuses a wrong check character, a bad shape and a state code that is not a state", () => {
    expect(isValidGstin("29AAPFU0939F1ZV")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("27aapfu0939f1zv")).toBe(false);
    const body = "97AAPFU0939F1Z";
    expect(isValidGstin(body + gstinCheckCharacter(body))).toBe(false);
  });

  it("normalises what people type: spaces out, upper case", () => {
    expect(normaliseGstin(" 27aapfu 0939f1zv ")).toBe("27AAPFU0939F1ZV");
  });

  it("names the state a GSTIN is registered in", () => {
    expect(stateCodeOfGstin("27AAPFU0939F1ZV")).toBe("mh");
    expect(() => stateCodeOfGstin("29AAPFU0939F1ZV")).toThrow(InvalidGstinError);
  });

  it("keeps the GSTIN out of its error, so logging the error never logs a customer's GSTIN", () => {
    expect(() => stateCodeOfGstin("29AAPFU0939F1ZV")).toThrow(/^Not a valid GSTIN$/);
  });
});
```

- [x] **Step 2: Run** `pnpm --filter @firstfold/billing exec vitest run src/gstin.test.ts`. Expected: FAIL, module not found.

- [x] **Step 3: Implement**

```ts
import { BillingRangeError } from "./billing-range-error";
import { stateCodeOfGstCode } from "./gst-states";

/**
 * A GSTIN is 15 characters: state code (2 digits), PAN (10), entity number (1), "Z", check character. The check
 * character is the GSTN's mod-36 Luhn variant over the first 14. Pure and browser-safe, so the billing details form
 * can check a GSTIN as it is typed and the server checks it again before saving.
 */

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const RADIX = ALPHABET.length;

/**
 * Thrown when a GSTIN is asked to name its state but is malformed or fails its check character. Never quotes the
 * GSTIN: the error reaches logs, and a customer's GSTIN does not belong there.
 */
export class InvalidGstinError extends Error {
  constructor() {
    super("Not a valid GSTIN");
    this.name = "InvalidGstinError";
  }
}

/** Strips spaces and upper-cases what a person typed, so a pasted GSTIN is judged on its characters alone. */
export function normaliseGstin(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/** The 15th character for the first 14. */
export function gstinCheckCharacter(first14: string): string {
  if (first14.length !== 14) throw new BillingRangeError(`Expected 14 characters, received ${first14.length}`);
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const value = ALPHABET.indexOf(first14.charAt(index));
    if (value < 0) throw new BillingRangeError("A GSTIN holds only digits and upper-case letters");
    const product = value * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / RADIX) + (product % RADIX);
  }
  return ALPHABET.charAt((RADIX - (sum % RADIX)) % RADIX);
}

/**
 * True for a well-formed GSTIN with the right check character, registered in an Indian state or union territory.
 * Expects input already passed through normaliseGstin: lower case or spaces make it false.
 */
export function isValidGstin(gstin: string): boolean {
  if (!GSTIN_PATTERN.test(gstin)) return false;
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin.charAt(14)) return false;
  return stateCodeOfGstCode(gstin.slice(0, 2)) !== null;
}

/** The platform state code ("mh") a valid GSTIN is registered in. */
export function stateCodeOfGstin(gstin: string): string {
  const state = isValidGstin(gstin) ? stateCodeOfGstCode(gstin.slice(0, 2)) : null;
  if (state === null) throw new InvalidGstinError();
  return state;
}
```

- [x] **Step 4: Run** the same command. Expected: PASS.

### Task 3: The tax split

> **Done in `dd4864e`, `0747b77`, `b29ea67`, `e1118a1`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Create `packages/billing/src/gst.ts`; Test `packages/billing/src/gst.test.ts`

- [x] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { splitGst, supplyTypeOf } from "./gst";
import { UnknownStateError } from "./gst-states";
import { GST_BASIS_POINTS } from "./tax";

describe("splitGst", () => {
  it("splits 18% into equal CGST and SGST within a state: ₹5,599.20 gives ₹503.93 each", () => {
    expect(splitGst(559_920, GST_BASIS_POINTS, "intra_state")).toEqual({
      cgstCents: 50_393,
      sgstCents: 50_393,
      igstCents: 0,
      taxCents: 100_786,
    });
  });

  it("charges IGST across states, rounded once", () => {
    expect(splitGst(559_920, GST_BASIS_POINTS, "inter_state")).toEqual({
      cgstCents: 0,
      sgstCents: 0,
      igstCents: 100_786,
      taxCents: 100_786,
    });
  });

  it("rounds each half on its own, so CGST always equals SGST even when that loses a paisa", () => {
    // 9% of 25 paise is 2.25: each half rounds to 2, total 4. One rounding of 18% would give 5.
    expect(splitGst(25, GST_BASIS_POINTS, "intra_state")).toEqual({
      cgstCents: 2,
      sgstCents: 2,
      igstCents: 0,
      taxCents: 4,
    });
    expect(splitGst(25, GST_BASIS_POINTS, "inter_state").taxCents).toBe(5);
  });

  it("has nothing to split at a zero rate", () => {
    expect(splitGst(10_000, 0, "intra_state").taxCents).toBe(0);
  });

  it("refuses a rate that cannot be halved into whole basis points within a state", () => {
    expect(() => splitGst(10_000, 1_801, "intra_state")).toThrow(RangeError);
    expect(() => splitGst(10_000, 1_801, "intra_state")).toThrow(BillingRangeError);
  });

  it("refuses a taxable value that is not a whole, non-negative number of paise", () => {
    expect(() => splitGst(Number.NaN, GST_BASIS_POINTS, "intra_state")).toThrow(RangeError);
    expect(() => splitGst(-1, GST_BASIS_POINTS, "intra_state")).toThrow(RangeError);
    expect(() => splitGst(10.5, GST_BASIS_POINTS, "inter_state")).toThrow(RangeError);
  });

  it("refuses a rate that is not a whole number of basis points between 0 and 10000", () => {
    expect(() => splitGst(10_000, 10_001, "inter_state")).toThrow(RangeError);
    expect(() => splitGst(10_000, -1, "inter_state")).toThrow(RangeError);
    expect(() => splitGst(10_000, Number.NaN, "inter_state")).toThrow(RangeError);
    expect(() => splitGst(10_000, 1_800.5, "inter_state")).toThrow(RangeError);
  });
});

describe("supplyTypeOf", () => {
  it("is intra-state when the place of supply is our own state", () => {
    expect(supplyTypeOf("mh", "mh")).toBe("intra_state");
    expect(supplyTypeOf("mh", "ka")).toBe("inter_state");
  });

  it("throws for a state code it does not know, rather than quietly choosing IGST", () => {
    expect(() => supplyTypeOf("mh", "MH")).toThrow(UnknownStateError);
    expect(() => supplyTypeOf("mh", "xx")).toThrow(UnknownStateError);
    expect(() => supplyTypeOf("xx", "mh")).toThrow(UnknownStateError);
  });
});
```

- [x] **Step 2: Run** `pnpm --filter @firstfold/billing exec vitest run src/gst.test.ts`. Expected: FAIL, module not found.

- [x] **Step 3: Implement**

```ts
/**
 * GST on one invoice line. Within our own state the rate splits into CGST and SGST, each rounded on its own so the two
 * are always equal; across states it is one IGST figure. Rounding is half up, as in tax.ts. Pure and browser-safe.
 */
import type { TaxInvoiceSupplyType } from "@firstfold/db";
import { BillingRangeError } from "./billing-range-error";
import { gstStateCodeOf } from "./gst-states";

/** Whether a sale stays inside our own state (CGST and SGST) or crosses a state line (IGST). The invoice table's own type. */
export type SupplyType = TaxInvoiceSupplyType;

/** The tax on one line, in paise. Either CGST and SGST are set (equal) or IGST is, and taxCents is the total. */
export interface GstAmounts {
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly taxCents: number;
}

const BASIS_POINTS = 10_000;
const HALF = BASIS_POINTS / 2;

function taxAt(taxableCents: number, rateBasisPoints: number): number {
  return Math.floor((taxableCents * rateBasisPoints + HALF) / BASIS_POINTS);
}

/**
 * Compares the two states by their GST codes. Throws UnknownStateError for a code that is not a state (including a
 * wrongly cased one), so a typo can never quietly turn a local sale into an IGST one.
 */
export function supplyTypeOf(supplierStateCode: string, placeOfSupplyStateCode: string): SupplyType {
  return gstStateCodeOf(supplierStateCode) === gstStateCodeOf(placeOfSupplyStateCode) ? "intra_state" : "inter_state";
}

/**
 * The GST on a taxable value in paise at a rate in basis points (1800 = 18%). Within a state each half is rounded on
 * its own, so a rate that cannot be halved into whole basis points is refused. Throws BillingRangeError for bad input.
 */
export function splitGst(taxableCents: number, rateBasisPoints: number, supplyType: SupplyType): GstAmounts {
  if (!Number.isSafeInteger(taxableCents) || taxableCents < 0) {
    throw new BillingRangeError(`A taxable value must be whole and non-negative, received ${taxableCents}`);
  }
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > BASIS_POINTS) {
    throw new BillingRangeError(`Not a tax rate: ${rateBasisPoints}`);
  }
  if (supplyType === "inter_state") {
    const igstCents = taxAt(taxableCents, rateBasisPoints);
    return { cgstCents: 0, sgstCents: 0, igstCents, taxCents: igstCents };
  }
  if (rateBasisPoints % 2 !== 0) {
    throw new BillingRangeError(`A rate of ${rateBasisPoints} basis points cannot split into CGST and SGST`);
  }
  const half = taxAt(taxableCents, rateBasisPoints / 2);
  return { cgstCents: half, sgstCents: half, igstCents: 0, taxCents: half * 2 };
}
```

- [x] **Step 4: Run** the same command. Expected: PASS.

### Task 4: Invoice numbers and the financial year

> **Done in `dd4864e`, `0747b77`, `e1118a1`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Create `packages/billing/src/invoice-number.ts`; Test `packages/billing/src/invoice-number.test.ts`

- [x] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { financialYearOf, formatInvoiceNumber, indianDate, INVOICE_PREFIX } from "./invoice-number";

describe("financialYearOf", () => {
  it("turns at midnight on 1 April in India, not in UTC", () => {
    expect(financialYearOf(new Date("2026-03-31T18:29:59Z"))).toBe("25-26");
    expect(financialYearOf(new Date("2026-03-31T18:30:00Z"))).toBe("26-27");
  });

  it("writes the century turn as 99-00", () => {
    expect(financialYearOf(new Date("2099-06-01T00:00:00Z"))).toBe("99-00");
  });
});

describe("indianDate", () => {
  it("is the calendar date in India", () => {
    expect(indianDate(new Date("2026-10-08T19:00:00Z"))).toBe("2026-10-09");
  });
});

describe("formatInvoiceNumber", () => {
  it("is prefix, financial year and a six digit serial, within GST's 16 characters", () => {
    const number = formatInvoiceNumber(INVOICE_PREFIX, "26-27", 147);
    expect(number).toBe("FF/26-27/000147");
    expect(number.length).toBeLessThanOrEqual(16);
  });

  it("refuses a serial outside 1 to 999999", () => {
    expect(() => formatInvoiceNumber(INVOICE_PREFIX, "26-27", 0)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(INVOICE_PREFIX, "26-27", 1_000_000)).toThrow(RangeError);
  });

  it("refuses a financial year that is not written 26-27", () => {
    expect(() => formatInvoiceNumber(INVOICE_PREFIX, "", 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(INVOICE_PREFIX, "26/27", 1)).toThrow(RangeError);
  });

  it("refuses a prefix that is empty, lower case or holds a slash", () => {
    expect(() => formatInvoiceNumber("", "26-27", 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("ff", "26-27", 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("F/F", "26-27", 1)).toThrow(RangeError);
  });

  it("throws a BillingRangeError that does not echo what it was given", () => {
    const attempts = [() => formatInvoiceNumber("Asha Rao", "26-27", 1), () => formatInvoiceNumber(INVOICE_PREFIX, "Asha Rao", 1)];
    for (const attempt of attempts) {
      expect(attempt).toThrow(BillingRangeError);
      expect(attempt).toThrow(expect.objectContaining({ message: expect.not.stringContaining("Asha") }));
    }
  });
});
```

- [x] **Step 2: Run** `pnpm --filter @firstfold/billing exec vitest run src/invoice-number.test.ts`. Expected: FAIL, module not found.

- [x] **Step 3: Implement**

```ts
import { BillingRangeError } from "./billing-range-error";

/**
 * Tax invoice numbers: "FF/26-27/000147". One consecutive series per financial year (1 April to 31 March, in India),
 * at most 16 characters, as GST requires. The serial itself comes from the tax_invoice_series counter.
 */

/** The letters every Firstfold tax invoice number starts with. */
export const INVOICE_PREFIX = "FF";
/** The largest serial that fits the six digits of the number format. */
export const MAX_INVOICE_SERIAL = 999_999;
const MAX_INVOICE_NUMBER_LENGTH = 16;
const FINANCIAL_YEAR_PATTERN = /^\d{2}-\d{2}$/;
const PREFIX_PATTERN = /^[A-Z0-9]+$/;

const IST_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function istParts(instant: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(IST_PARTS.formatToParts(instant).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** The calendar date in India, "2026-10-09". */
export function indianDate(instant: Date): string {
  const { year, month, day } = istParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "26-27" for any instant from 1 April 2026 to 31 March 2027, in India. */
export function financialYearOf(instant: Date): string {
  const { year, month } = istParts(instant);
  const start = month >= 4 ? year : year - 1;
  const two = (value: number): string => String(value % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

/**
 * "FF/26-27/000147" from its three parts. Throws BillingRangeError for a prefix that is not upper-case letters and digits, a
 * financial year not written "26-27", a serial outside 1 to 999999, or a result longer than GST's 16 characters.
 */
export function formatInvoiceNumber(prefix: string, financialYear: string, serial: number): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new BillingRangeError(`An invoice prefix must be upper-case letters and digits`);
  }
  if (!FINANCIAL_YEAR_PATTERN.test(financialYear)) {
    throw new BillingRangeError(`A financial year must be written like 26-27`);
  }
  if (!Number.isSafeInteger(serial) || serial < 1 || serial > MAX_INVOICE_SERIAL) {
    throw new BillingRangeError(`An invoice serial must be 1 to ${MAX_INVOICE_SERIAL}, received ${serial}`);
  }
  const number = `${prefix}/${financialYear}/${String(serial).padStart(6, "0")}`;
  if (number.length > MAX_INVOICE_NUMBER_LENGTH) throw new BillingRangeError(`An invoice number can be at most ${MAX_INVOICE_NUMBER_LENGTH} characters`);
  return number;
}
```

- [x] **Step 4: Run** the same command. Expected: PASS.

### Task 5: Amount in words

> **Done in `dd4864e`, `0747b77`, `e1118a1`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Create `packages/billing/src/amount-in-words.ts`; Test `packages/billing/src/amount-in-words.test.ts`, `packages/billing/src/billing-range-error.ts` (added in `e1118a1`: a RangeError whose message holds numbers and fixed words only, so billing logs may print it)

- [x] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { amountInWords } from "./amount-in-words";
import { BillingRangeError } from "./billing-range-error";

describe("amountInWords", () => {
  it("writes rupees and paise the Indian way", () => {
    expect(amountInWords(660_706)).toBe("Indian Rupees Six Thousand Six Hundred Seven and Six Paise Only");
    expect(amountInWords(943_646)).toBe("Indian Rupees Nine Thousand Four Hundred Thirty Six and Forty Six Paise Only");
  });

  it("uses lakh and crore", () => {
    expect(amountInWords(12_34_56_789_00)).toBe(
      "Indian Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only",
    );
  });

  it("keeps counting crores past 99 crore", () => {
    // 12,345,678,901 rupees: 1,234 crore, 56 lakh, 78 thousand, 901.
    expect(amountInWords(1_234_56_78_901_00)).toBe(
      "Indian Rupees One Thousand Two Hundred Thirty Four Crore Fifty Six Lakh Seventy Eight Thousand Nine Hundred One Only",
    );
  });

  it("says zero rupees when there are only paise", () => {
    expect(amountInWords(50)).toBe("Indian Rupees Zero and Fifty Paise Only");
  });

  it("refuses an amount that is not a whole, non-negative number of paise", () => {
    expect(() => amountInWords(Number.NaN)).toThrow(RangeError);
    expect(() => amountInWords(-1)).toThrow(RangeError);
    expect(() => amountInWords(100.5)).toThrow(RangeError);
    expect(() => amountInWords(-1)).toThrow(BillingRangeError);
  });

  it("leaves out paise when there are none, and says zero", () => {
    expect(amountInWords(100)).toBe("Indian Rupees One Only");
    expect(amountInWords(0)).toBe("Indian Rupees Zero Only");
  });
});
```

- [x] **Step 2: Run** `pnpm --filter @firstfold/billing exec vitest run src/amount-in-words.test.ts`. Expected: FAIL, module not found.

- [x] **Step 3: Implement**

```ts
import { BillingRangeError } from "./billing-range-error";

/** Spells an invoice total in words, as Rule 46 invoices print it. Indian grouping: crore, lakh, thousand. */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const ones = n % 10;
  return `${TENS[Math.floor(n / 10)] ?? ""}${ones ? ` ${ONES[ones] ?? ""}` : ""}`;
}

function below1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds ? `${ONES[hundreds] ?? ""} Hundred` : "";
  return [head, rest ? below100(rest) : ""].filter(Boolean).join(" ");
}

function rupeeWords(rupees: number): string {
  if (rupees === 0) return "Zero";
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1_000);
  const rest = rupees % 1_000;
  return [
    crore ? `${rupeeWords(crore)} Crore` : "",
    lakh ? `${below100(lakh)} Lakh` : "",
    thousand ? `${below100(thousand)} Thousand` : "",
    rest ? below1000(rest) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * "Indian Rupees Six Thousand Six Hundred Seven and Six Paise Only", from whole paise. Crores keep counting past 99,
 * so a very large total reads "One Thousand Two Hundred Thirty Four Crore". Throws BillingRangeError for anything that is
 * not a whole, non-negative number of paise.
 */
export function amountInWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new BillingRangeError(`Not an amount in paise: ${paise}`);
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `Indian Rupees ${rupeeWords(rupees)}${rest ? ` and ${below100(rest)} Paise` : ""} Only`;
}
```

`packages/billing/src/billing-range-error.ts`:

```ts
/**
 * A RangeError from the invoice maths: an amount, count, rate or date that cannot be invoiced. Its messages hold
 * numbers and fixed wording only, never text a person typed, so billing logs may print them (see describeError in
 * @firstfold/shared). A subclass, so code that catches RangeError still catches it.
 */
export class BillingRangeError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "BillingRangeError";
  }
}
```

- [x] **Step 4: Run** the same command. Expected: PASS.

### Task 6: The invoice builder

> **Done in `886ddd4`, `b29ea67`, `392031d`, `e1118a1`, `34a3502`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Create `packages/billing/src/tax-invoice.ts`; Test `packages/billing/src/tax-invoice.test.ts`; Modify
`packages/billing/package.json`, `packages/billing/src/index.ts`

The record types it returns (`TaxInvoiceLineRecord`, `TaxInvoicePartyRecord`, `PlaceOfSupplyBasis`, `TaxInvoiceSupplyType`)
are defined with the schema in Task 7 (type-only imports from `@firstfold/db`). `RecipientInput` has no email or phone:
an invoice row is insert only, so contact details frozen into it could never be erased.

- [x] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { UnknownStateError } from "./gst-states";
import { InvalidGstinError } from "./gstin";
import { chargedAmountCents, GST_BASIS_POINTS } from "./tax";
import { buildTaxInvoice, FIRSTFOLD_SAC, InvoiceAmountMismatchError, placeOfSupply, type InvoiceLineInput } from "./tax-invoice";

const plan = (overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput => ({
  description: "Firstfold Premium plan",
  detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
  note: null,
  sac: FIRSTFOLD_SAC,
  quantity: 1,
  unitAmountCents: 699_900,
  discountAmountCents: 0,
  taxRateBasisPoints: GST_BASIS_POINTS,
  ...overrides,
});
const recipient = { legalName: "QA Premium Business", gstin: null, addressLines: ["Mumbai 400080"], stateCode: null };

describe("buildTaxInvoice", () => {
  it("bills a Maharashtra GSTIN with a coupon as CGST + SGST, matching what was charged", () => {
    const invoice = buildTaxInvoice({
      supplierStateCode: "mh",
      recipient: { ...recipient, gstin: "27AAPFU0939F1ZV" },
      lines: [plan({ discountAmountCents: 139_980, note: "Coupon GAURAV applied" })],
      amountChargedCents: chargedAmountCents(699_900, 139_980, GST_BASIS_POINTS),
    });
    expect(invoice).toMatchObject({
      placeOfSupplyStateCode: "mh",
      placeOfSupplyBasis: "gstin",
      supplyType: "intra_state",
      taxableCents: 559_920,
      cgstCents: 50_393,
      sgstCents: 50_393,
      igstCents: 0,
      roundOffCents: 0,
      totalCents: 660_706,
    });
    expect(invoice.lines[0]).toMatchObject({ grossAmountCents: 699_900, taxableCents: 559_920, taxCents: 100_786 });
  });

  it("bills an unregistered Karnataka customer with two lines as IGST", () => {
    const seats = plan({ description: "Extra team seats", quantity: 2, unitAmountCents: 49_900 });
    const charged = chargedAmountCents(699_900, 0, GST_BASIS_POINTS) + chargedAmountCents(99_800, 0, GST_BASIS_POINTS);
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines: [plan(), seats], amountChargedCents: charged });
    expect(invoice).toMatchObject({ placeOfSupplyBasis: "billing_address", supplyType: "inter_state", igstCents: 143_946, totalCents: 943_646, roundOffCents: 0 });
  });

  it("takes the place of supply from the GSTIN over the address", () => {
    const invoice = buildTaxInvoice({
      supplierStateCode: "mh",
      recipient: { ...recipient, gstin: "27AAPFU0939F1ZV", stateCode: "ka" },
      lines: [plan()],
      amountChargedCents: chargedAmountCents(699_900, 0, GST_BASIS_POINTS),
    });
    expect(invoice.supplyType).toBe("intra_state");
  });

  it("falls back to our own state when we know nothing of the customer's", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: chargedAmountCents(699_900, 0, GST_BASIS_POINTS) });
    expect(invoice).toMatchObject({ placeOfSupplyStateCode: "mh", placeOfSupplyBasis: "supplier_location" });
  });

  it("prints the paisa CGST + SGST lose against one rounding of 18% as a round-off", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ unitAmountCents: 25 })], amountChargedCents: 30 });
    expect(invoice).toMatchObject({ cgstCents: 2, sgstCents: 2, roundOffCents: 1, totalCents: 30 });
  });

  it("refuses figures that do not explain what was charged", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: 826_000 })).toThrow(InvoiceAmountMismatchError);
  });

  it("refuses a GSTIN that fails its check", () => {
    expect(() =>
      buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: "29AAPFU0939F1ZV" }, lines: [plan()], amountChargedCents: 825_882 }),
    ).toThrow(InvalidGstinError);
  });

  it("refuses a billing address state that is not a known state code", () => {
    expect(() =>
      buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "xx" }, lines: [plan()], amountChargedCents: 825_882 }),
    ).toThrow(UnknownStateError);
  });

  it("refuses an unknown or upper-case address state even when a GSTIN decides the place of supply", () => {
    const charged = chargedAmountCents(699_900, 0, GST_BASIS_POINTS);
    for (const stateCode of ["xx", "KA"]) {
      expect(() =>
        buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: "27AAPFU0939F1ZV", stateCode }, lines: [plan()], amountChargedCents: charged }),
      ).toThrow(UnknownStateError);
    }
  });

  it("refuses an empty invoice and more lines than one page holds", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [], amountChargedCents: 0 })).toThrow(RangeError);
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [], amountChargedCents: 0 })).toThrow(BillingRangeError);
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: Array.from({ length: 9 }, () => plan()), amountChargedCents: 1 })).toThrow(RangeError);
  });

  it("prints a negative round-off when the charge is a paisa under the two halves", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ unitAmountCents: 50 })], amountChargedCents: 59 });
    expect(invoice).toMatchObject({ cgstCents: 5, sgstCents: 5, roundOffCents: -1, totalCents: 59 });
  });

  it("accepts a round-off of one paisa per line and no more", () => {
    const lines = [plan({ unitAmountCents: 100 }), plan({ unitAmountCents: 100 })];
    const issue = (amountChargedCents: number) => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines, amountChargedCents });
    expect(issue(238).roundOffCents).toBe(2);
    expect(issue(234).roundOffCents).toBe(-2);
    expect(() => issue(239)).toThrow(InvoiceAmountMismatchError);
    expect(() => issue(233)).toThrow(InvoiceAmountMismatchError);
  });

  it("adds up lines at different rates exactly", () => {
    const lines = [plan({ unitAmountCents: 10_000 }), plan({ unitAmountCents: 10_000, taxRateBasisPoints: 500 }), plan({ unitAmountCents: 10_000, taxRateBasisPoints: 0 })];
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines, amountChargedCents: 32_300 });
    expect(invoice).toMatchObject({ taxableCents: 30_000, cgstCents: 1_150, sgstCents: 1_150, igstCents: 0, roundOffCents: 0, totalCents: 32_300 });
    expect(invoice.lines.map((line) => line.taxCents)).toEqual([1_800, 500, 0]);
  });

  it("refuses a rate that cannot split into CGST and SGST within the state, but allows it as IGST", () => {
    const odd = [plan({ unitAmountCents: 10_000, taxRateBasisPoints: 1_801 })];
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: odd, amountChargedCents: 11_801 })).toThrow(RangeError);
    const interState = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines: odd, amountChargedCents: 11_801 });
    expect(interState.igstCents).toBe(1_801);
  });

  it("refuses a quantity that is not a whole number from 1", () => {
    for (const quantity of [0, 1.5]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ quantity })], amountChargedCents: 825_882 })).toThrow(RangeError);
    }
  });

  it("refuses a discount that leaves nothing to invoice", () => {
    for (const discountAmountCents of [699_900, 700_000, -1]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ discountAmountCents })], amountChargedCents: 825_882 })).toThrow(RangeError);
    }
  });

  it("refuses an amount charged that is not a positive whole number of paise", () => {
    for (const amountChargedCents of [Number.NaN, 0, -1, 118.5, Number.POSITIVE_INFINITY]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents })).toThrow(RangeError);
    }
  });

  it("stores the GSTIN in its normal form", () => {
    const invoice = buildTaxInvoice({
      supplierStateCode: "mh",
      recipient: { ...recipient, gstin: " 27aapfu0939f1zv " },
      lines: [plan()],
      amountChargedCents: 825_882,
    });
    expect(invoice.recipient.gstin).toBe("27AAPFU0939F1ZV");
    expect(invoice.placeOfSupplyBasis).toBe("gstin");
  });

  it("keeps the recipient's own address state apart from the place of supply", () => {
    const charged = chargedAmountCents(699_900, 0, GST_BASIS_POINTS);
    const byGstin = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: "27AAPFU0939F1ZV", stateCode: "ka" }, lines: [plan()], amountChargedCents: charged });
    expect(byGstin).toMatchObject({ placeOfSupplyStateCode: "mh", placeOfSupplyBasis: "gstin" });
    expect(byGstin.recipient.stateCode).toBe("ka");
    const byAddress = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines: [plan()], amountChargedCents: charged });
    expect(byAddress).toMatchObject({ placeOfSupplyStateCode: "ka", placeOfSupplyBasis: "billing_address" });
    expect(byAddress.recipient.stateCode).toBe("ka");
    const bySupplier = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: charged });
    expect(bySupplier.placeOfSupplyBasis).toBe("supplier_location");
    expect(bySupplier.recipient.stateCode).toBeNull();
  });

  it("leaves contact details off the recipient record", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: 825_882 });
    expect(invoice.recipient).toMatchObject({ email: null, phone: null, tradeName: null, cin: null });
  });

  it("copies only the known fields of a line into the record", () => {
    const withExtras = { ...plan(), internalId: "plan_123" };
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [withExtras], amountChargedCents: 825_882 });
    expect(Object.keys(invoice.lines[0] ?? {}).sort()).toEqual(
      [
        "cgstCents", "description", "detail", "discountAmountCents", "grossAmountCents", "igstCents", "note", "quantity",
        "sac", "sgstCents", "taxCents", "taxRateBasisPoints", "taxableCents", "unitAmountCents",
      ].sort(),
    );
  });

  it("refuses a supplier state that is not a lower-case state code", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "MH", recipient, lines: [plan()], amountChargedCents: 825_882 })).toThrow(UnknownStateError);
  });

  it("expects a GSTIN already in normal form when asked for the place of supply directly", () => {
    expect(placeOfSupply("mh", { ...recipient, gstin: "27AAPFU0939F1ZV" })).toEqual({ stateCode: "mh", basis: "gstin" });
    expect(() => placeOfSupply("mh", { ...recipient, gstin: "27aapfu0939f1zv" })).toThrow(InvalidGstinError);
  });
});
```

- [x] **Step 2: Run** `pnpm --filter @firstfold/billing exec vitest run src/tax-invoice.test.ts`. Expected: FAIL.

- [x] **Step 3: Implement**

```ts
import type { PlaceOfSupplyBasis, TaxInvoiceLineRecord, TaxInvoicePartyRecord } from "@firstfold/db";
import { BillingRangeError } from "./billing-range-error";
import { gstStateCodeOf } from "./gst-states";
import { splitGst, supplyTypeOf, type SupplyType } from "./gst";
import { normaliseGstin, stateCodeOfGstin } from "./gstin";

/** SAC for the managed website subscription and its extras. The owner confirmed 998361. */
export const FIRSTFOLD_SAC = "998361";
/** One A4 page holds this many lines in the approved layout; every real invoice today has one. */
export const MAX_INVOICE_LINES = 8;

export interface InvoiceLineInput {
  readonly description: string;
  readonly detail: string | null;
  readonly note: string | null;
  readonly sac: string;
  readonly quantity: number;
  readonly unitAmountCents: number;
  readonly discountAmountCents: number;
  readonly taxRateBasisPoints: number;
}

export interface RecipientInput {
  readonly legalName: string;
  readonly gstin: string | null;
  readonly addressLines: readonly string[];
  /**
   * The state of the address on record, as a platform state code: the billing details, or else the onboarding business
   * address. Null when neither is known. It is kept on the invoice as the address's own state, which can differ from
   * the place of supply when a GSTIN decides that. Contact details are not part of it: an invoice is insert only, so
   * an email or phone frozen into it could never be erased. They are read from the billing details when needed.
   */
  readonly stateCode: string | null;
}

export interface TaxInvoiceDraft {
  readonly recipient: TaxInvoicePartyRecord;
  readonly placeOfSupplyStateCode: string;
  readonly placeOfSupplyBasis: PlaceOfSupplyBasis;
  readonly supplyType: SupplyType;
  readonly lines: readonly TaxInvoiceLineRecord[];
  readonly taxableCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly roundOffCents: number;
  readonly totalCents: number;
}

export class InvoiceAmountMismatchError extends Error {
  constructor(computedCents: number, chargedCents: number) {
    super(`Invoice lines come to ${computedCents} but ${chargedCents} was charged`);
    this.name = "InvoiceAmountMismatchError";
  }
}

/**
 * Section 12(2) IGST Act: a registered recipient's state, else the address on record, else our own location. The
 * basis `billing_address` means the address on record: the billing details, or else the onboarding business address.
 * A GSTIN must already be in normal form (see normaliseGstin); anything else is refused as invalid.
 */
export function placeOfSupply(supplierStateCode: string, recipient: RecipientInput): { stateCode: string; basis: PlaceOfSupplyBasis } {
  if (recipient.gstin !== null) return { stateCode: stateCodeOfGstin(recipient.gstin), basis: "gstin" };
  if (recipient.stateCode !== null) return { stateCode: recipient.stateCode, basis: "billing_address" };
  return { stateCode: supplierStateCode, basis: "supplier_location" };
}

function lineRecord(line: InvoiceLineInput, supplyType: SupplyType): TaxInvoiceLineRecord {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new BillingRangeError(`A quantity must be a whole number from 1, received ${line.quantity}`);
  const grossAmountCents = line.unitAmountCents * line.quantity;
  const taxableCents = grossAmountCents - line.discountAmountCents;
  if (line.discountAmountCents < 0 || taxableCents <= 0) throw new BillingRangeError(`A discount of ${line.discountAmountCents} leaves nothing to invoice on ${grossAmountCents}`);
  const gst = splitGst(taxableCents, line.taxRateBasisPoints, supplyType);
  return {
    description: line.description,
    detail: line.detail,
    note: line.note,
    sac: line.sac,
    quantity: line.quantity,
    unitAmountCents: line.unitAmountCents,
    grossAmountCents,
    discountAmountCents: line.discountAmountCents,
    taxableCents,
    taxRateBasisPoints: line.taxRateBasisPoints,
    cgstCents: gst.cgstCents,
    sgstCents: gst.sgstCents,
    igstCents: gst.igstCents,
    taxCents: gst.taxCents,
  };
}

/**
 * Everything printed on an invoice except the parties' fixed details and the number, from what was sold and what was
 * charged. The charged amount is the authority: the lines must come within one paisa per line of it (D4), and that
 * paisa prints as a round-off. Anything further off means the lines do not describe the payment, and nothing is issued.
 */
export function buildTaxInvoice(input: {
  readonly supplierStateCode: string;
  readonly recipient: RecipientInput;
  readonly lines: readonly InvoiceLineInput[];
  readonly amountChargedCents: number;
}): TaxInvoiceDraft {
  if (!Number.isSafeInteger(input.amountChargedCents) || input.amountChargedCents <= 0) {
    throw new BillingRangeError(`An amount charged must be a positive whole number of paise, received ${input.amountChargedCents}`);
  }
  if (input.lines.length === 0 || input.lines.length > MAX_INVOICE_LINES) {
    throw new BillingRangeError(`An invoice has 1 to ${MAX_INVOICE_LINES} lines, received ${input.lines.length}`);
  }
  // The address state is stored whatever decides the place of supply, so an unknown or upper-case one never reaches the row.
  if (input.recipient.stateCode !== null) gstStateCodeOf(input.recipient.stateCode);
  const gstin = input.recipient.gstin === null ? null : normaliseGstin(input.recipient.gstin);
  const place = placeOfSupply(input.supplierStateCode, { ...input.recipient, gstin });
  const supplyType = supplyTypeOf(input.supplierStateCode, place.stateCode);
  const lines = input.lines.map((line) => lineRecord(line, supplyType));
  const sum = (pick: (line: TaxInvoiceLineRecord) => number) => lines.reduce((total, line) => total + pick(line), 0);
  const taxableCents = sum((line) => line.taxableCents);
  const cgstCents = sum((line) => line.cgstCents);
  const sgstCents = sum((line) => line.sgstCents);
  const igstCents = sum((line) => line.igstCents);
  const computed = taxableCents + cgstCents + sgstCents + igstCents;
  const roundOffCents = input.amountChargedCents - computed;
  if (!(Math.abs(roundOffCents) <= lines.length)) throw new InvoiceAmountMismatchError(computed, input.amountChargedCents);
  return {
    recipient: {
      legalName: input.recipient.legalName,
      tradeName: null,
      gstin,
      cin: null,
      addressLines: [...input.recipient.addressLines],
      stateCode: input.recipient.stateCode,
      email: null,
      phone: null,
    },
    placeOfSupplyStateCode: place.stateCode,
    placeOfSupplyBasis: place.basis,
    supplyType,
    lines,
    taxableCents,
    cgstCents,
    sgstCents,
    igstCents,
    roundOffCents,
    totalCents: input.amountChargedCents,
  };
}
```

- [x] **Step 4: Export the browser-safe modules.** In `packages/billing/package.json`:

```json
"exports": {
    ".": "./src/index.ts",
    "./referral": "./src/referral.ts",
    "./tax": "./src/tax.ts",
    "./gst": "./src/gst.ts",
    "./gst-states": "./src/gst-states.ts",
    "./gstin": "./src/gstin.ts",
    "./invoice-number": "./src/invoice-number.ts",
    "./amount-in-words": "./src/amount-in-words.ts",
    "./billing-range-error": "./src/billing-range-error.ts",
    "./tax-invoice": "./src/tax-invoice.ts"
  }
```

  and in `packages/billing/src/index.ts`:

```ts
export { BillingRangeError } from "./billing-range-error";
export { amountInWords } from "./amount-in-words";
export { splitGst, supplyTypeOf, type GstAmounts, type SupplyType } from "./gst";
export { gstStateCodeOf, stateCodeOfGstCode, UnknownStateError } from "./gst-states";
export { gstinCheckCharacter, InvalidGstinError, isValidGstin, normaliseGstin, stateCodeOfGstin } from "./gstin";
export { financialYearOf, formatInvoiceNumber, indianDate, INVOICE_PREFIX, MAX_INVOICE_SERIAL } from "./invoice-number";
export {
  buildTaxInvoice,
  FIRSTFOLD_SAC,
  InvoiceAmountMismatchError,
  MAX_INVOICE_LINES,
  placeOfSupply,
  type InvoiceLineInput,
  type RecipientInput,
  type TaxInvoiceDraft,
} from "./tax-invoice";
```

- [x] **Step 5: Run** `pnpm --filter @firstfold/billing test && pnpm --filter @firstfold/billing typecheck`. Expected: PASS.

- [x] **Step 6: Commit** "Build a GST tax invoice from what was sold and what was charged"

---

## Phase 2: Database

### Task 7: Tables

> **Done in `c7814c3`, `f498abb`, `392031d`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Create `packages/db/src/schema/tax-invoices.ts`; Modify `packages/db/src/schema/index.ts`; Generate
`packages/db/migrations/0119_tax_invoices.sql`, `0120_tax_invoice_guards.sql`, `0121_tax_invoice_recipient_guards.sql`

- [x] **Step 1: Write the schema** (`packages/db/src/schema/tax-invoices.ts`, as built; Task 12A adds `paidOn` and
  `taxInvoicingStart`):

```ts
import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { payments } from "./billing";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/** How the place of supply was decided (Section 12(2) IGST Act), kept so the invoice explains itself. */
export type PlaceOfSupplyBasis = "gstin" | "billing_address" | "supplier_location";

/** Whether a sale stayed inside the supplier's state (CGST and SGST) or crossed a state line (IGST). */
export type TaxInvoiceSupplyType = "intra_state" | "inter_state";

/** One party as printed. Frozen on the invoice: later edits to either party's details never reach an issued invoice. */
export interface TaxInvoicePartyRecord {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly gstin: string | null;
  readonly cin: string | null;
  readonly addressLines: readonly string[];
  /**
   * Platform state code ("mh") of this party's own address. For the recipient it can differ from the place of supply
   * (a GSTIN decides that), and it is null when no address state is known.
   */
  readonly stateCode: string | null;
  /** Always null on the recipient: contact details are not frozen into an insert-only row (erasure could not clear them). */
  readonly email: string | null;
  readonly phone: string | null;
}

/** One line as printed. Every amount is integer paise. */
export interface TaxInvoiceLineRecord {
  readonly description: string;
  readonly detail: string | null;
  readonly note: string | null;
  readonly sac: string;
  readonly quantity: number;
  readonly unitAmountCents: number;
  readonly grossAmountCents: number;
  readonly discountAmountCents: number;
  readonly taxableCents: number;
  readonly taxRateBasisPoints: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly taxCents: number;
}

/**
 * What a customer tells us for their tax invoices. Optional: an invoice without it is still lawful (D5). The customer
 * writes it through the app connection, bound by row-level security, like the business profile.
 */
export const billingProfiles = pgTable(
  "billing_profiles",
  {
    businessId: uuid("business_id").primaryKey().references(() => businesses.id),
    legalName: text("legal_name").notNull(),
    gstin: text("gstin"),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    postalCode: text("postal_code").notNull(),
    stateCode: text("state_code").notNull(),
    /** Who gets invoices and billing questions. Null means the account's own email. */
    email: text("email"),
    /** E.164, for billing questions. Null means the account's own number. */
    phone: text("phone"),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("billing_profiles_email_check", sql`${table.email} is null or (length(${table.email}) <= 254 and ${table.email} like '%_@_%')`),
    check("billing_profiles_phone_check", sql`${table.phone} is null or ${table.phone} ~ '^[+][1-9][0-9]{6,14}$'`),
    check("billing_profiles_legal_name_check", sql`length(btrim(${table.legalName})) between 1 and 200`),
    check("billing_profiles_gstin_check", sql`${table.gstin} is null or ${table.gstin} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
    check("billing_profiles_address_line1_check", sql`length(btrim(${table.addressLine1})) between 1 and 200`),
    check("billing_profiles_city_check", sql`length(btrim(${table.city})) between 1 and 100`),
    check("billing_profiles_postal_code_check", sql`${table.postalCode} ~ '^[1-9][0-9]{5}$'`),
    check("billing_profiles_state_code_check", sql`${table.stateCode} ~ '^[a-z]{2}$'`),
  ],
);

/**
 * The next serial for each invoice series. Taken with one upsert inside the issuing transaction, so the row stays
 * locked until that transaction ends and a rolled-back invoice gives its number back (D3).
 */
export const taxInvoiceSeries = pgTable(
  "tax_invoice_series",
  {
    prefix: text("prefix").notNull(),
    financialYear: text("financial_year").notNull(),
    nextSerial: integer("next_serial").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.prefix, table.financialYear] }),
    check("tax_invoice_series_next_serial_check", sql`${table.nextSerial} between 1 and 1000000`),
    check("tax_invoice_series_financial_year_check", sql`${table.financialYear} ~ '^[0-9]{2}-[0-9]{2}$'`),
  ],
);

/**
 * An issued tax invoice. Insert only: no role may update or delete one (the grants migration). Invoices are for INR payments only (D1),
 * so every `*_cents` column is INR paise.
 */
export const taxInvoices = pgTable(
  "tax_invoices",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    paymentId: uuid("payment_id").notNull().references(() => payments.id),
    /** The series this invoice belongs to ("FF"). Upper-case letters and digits only. */
    prefix: text("prefix").notNull(),
    /** The Indian financial year (April to March) of `issuedOn`, as two-digit years: "26-27". */
    financialYear: text("financial_year").notNull(),
    /** Position in the series for that financial year, from 1 with no gaps (D3). */
    serial: integer("serial").notNull(),
    /** What is printed and quoted to the customer: prefix, financial year and the serial padded to six digits. */
    number: text("number").notNull(),
    /** The Indian calendar date (IST) of the payment, which decides the financial year. */
    issuedOn: date("issued_on", { mode: "string" }).notNull(),
    supplier: jsonb("supplier").$type<TaxInvoicePartyRecord>().notNull(),
    recipient: jsonb("recipient").$type<TaxInvoicePartyRecord>().notNull(),
    placeOfSupplyStateCode: text("place_of_supply_state_code").notNull(),
    placeOfSupplyBasis: text("place_of_supply_basis").$type<PlaceOfSupplyBasis>().notNull(),
    supplyType: text("supply_type").$type<TaxInvoiceSupplyType>().notNull(),
    lines: jsonb("lines").$type<readonly TaxInvoiceLineRecord[]>().notNull(),
    taxableCents: integer("taxable_cents").notNull(),
    cgstCents: integer("cgst_cents").notNull(),
    sgstCents: integer("sgst_cents").notNull(),
    igstCents: integer("igst_cents").notNull(),
    roundOffCents: integer("round_off_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    /** How the customer paid, in words, as printed: "Visa credit card ending 4366". */
    paymentLabel: text("payment_label").notNull(),
    /** The provider's id for the payment, as printed, so the invoice can be matched to the provider's records. */
    paymentReference: text("payment_reference").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("tax_invoices_payment_id_idx").on(table.paymentId),
    uniqueIndex("tax_invoices_number_idx").on(table.number),
    uniqueIndex("tax_invoices_series_serial_idx").on(table.prefix, table.financialYear, table.serial),
    index("tax_invoices_business_id_idx").on(table.businessId, table.issuedOn),
    check("tax_invoices_basis_check", sql`${table.placeOfSupplyBasis} in ('gstin', 'billing_address', 'supplier_location')`),
    check(
      "tax_invoices_tax_check",
      sql`case ${table.supplyType}
        when 'intra_state' then ${table.igstCents} = 0 and ${table.cgstCents} = ${table.sgstCents}
        when 'inter_state' then ${table.cgstCents} = 0 and ${table.sgstCents} = 0
        else false end`,
    ),
    // The 1 to 8 lines bound is MAX_INVOICE_LINES in packages/billing/src/tax-invoice.ts (and the round-off limit below
    // follows the line count). Change them together.
    check(
      "tax_invoices_json_shape_check",
      sql`case when jsonb_typeof(${table.lines}) = 'array' then jsonb_array_length(${table.lines}) between 1 and 8 else false end
        and jsonb_typeof(${table.supplier}) = 'object' and jsonb_typeof(${table.recipient}) = 'object'`,
    ),
    check(
      "tax_invoices_number_check",
      sql`${table.serial} between 1 and 999999 and ${table.financialYear} ~ '^[0-9]{2}-[0-9]{2}$' and ${table.prefix} ~ '^[A-Z0-9]+$'
        and length(${table.number}) <= 16
        and ${table.number} = ${table.prefix} || '/' || ${table.financialYear} || '/' || lpad(${table.serial}::text, 6, '0')`,
    ),
    check(
      "tax_invoices_financial_year_check",
      sql`${table.financialYear} = lpad((((extract(year from ${table.issuedOn}) - (case when extract(month from ${table.issuedOn}) < 4 then 1 else 0 end)) % 100)::int)::text, 2, '0')
        || '-' || lpad((((extract(year from ${table.issuedOn}) - (case when extract(month from ${table.issuedOn}) < 4 then 1 else 0 end) + 1) % 100)::int)::text, 2, '0')`,
    ),
    check(
      "tax_invoices_place_of_supply_check",
      sql`${table.placeOfSupplyStateCode} ~ '^[a-z]{2}$'
        and coalesce(${table.supplier}->>'stateCode' ~ '^[a-z]{2}$', false)
        and (${table.supplyType} = 'intra_state') = (${table.placeOfSupplyStateCode} = ${table.supplier}->>'stateCode')
        and (${table.placeOfSupplyBasis} <> 'gstin' or ${table.recipient}->>'gstin' is not null)
        and (${table.placeOfSupplyBasis} <> 'supplier_location' or ${table.placeOfSupplyStateCode} = ${table.supplier}->>'stateCode')
        and (${table.recipient}->>'gstin' is null or ${table.recipient}->>'gstin' ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')`,
    ),
    // Every expression here is a boolean that is never NULL: a check passes on NULL, and an absent jsonb key gives NULL
    // from ->>, so the one comparison against a key is wrapped in coalesce.
    check(
      "tax_invoices_recipient_check",
      sql`(${table.recipient}->>'stateCode' is null or ${table.recipient}->>'stateCode' ~ '^[a-z]{2}$')
        and ${table.recipient}->>'email' is null and ${table.recipient}->>'phone' is null
        and (${table.placeOfSupplyBasis} <> 'billing_address'
          or (coalesce(${table.placeOfSupplyStateCode} = ${table.recipient}->>'stateCode', false) and ${table.recipient}->>'gstin' is null))
        and (${table.placeOfSupplyBasis} <> 'supplier_location'
          or (${table.recipient}->>'gstin' is null and ${table.recipient}->>'stateCode' is null))`,
    ),
    check(
      "tax_invoices_total_check",
      sql`${table.taxableCents} > 0 and ${table.cgstCents} >= 0 and ${table.igstCents} >= 0 and ${table.totalCents} > 0
        and ${table.totalCents} = ${table.taxableCents} + ${table.cgstCents} + ${table.sgstCents} + ${table.igstCents} + ${table.roundOffCents}
        and case when jsonb_typeof(${table.lines}) = 'array' then abs(${table.roundOffCents}) <= jsonb_array_length(${table.lines}) else false end`,
    ),
    check(
      "tax_invoices_payment_check",
      sql`length(btrim(${table.paymentLabel})) > 0 and length(btrim(${table.paymentReference})) > 0`,
    ),
  ],
);

export type BillingProfile = typeof billingProfiles.$inferSelect;
export type TaxInvoice = typeof taxInvoices.$inferSelect;
```

- [x] **Step 2: Export it.** `export * from "./tax-invoices";` in `packages/db/src/schema/index.ts`, in alphabetical
  position. `pnpm --filter @firstfold/db typecheck`: PASS.

- [x] **Step 3: Generate** `pnpm --filter @firstfold/db exec drizzle-kit generate --name tax_invoices` (journal idx 117),
  then `--name tax_invoice_guards` (idx 118) and `--name tax_invoice_recipient_guards` (idx 119) as the checks were
  added. Each was read end to end; none touches another table. The guards as generated:

`0120_tax_invoice_guards.sql`:

```sql
-- Guards for tax invoices (0119). An invoice is a legal record that nobody edits, so the database refuses one whose number
-- does not match its series, whose financial year does not match its date, whose tax type does not match its place of
-- supply, or whose figures do not add up. The checks repeat what the issuing code does on purpose. Also bounds the
-- billing address text. The total check is replaced to add a positive total and the round-off limit.

ALTER TABLE "tax_invoices" DROP CONSTRAINT "tax_invoices_total_check";--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_address_line1_check" CHECK (length(btrim("billing_profiles"."address_line1")) between 1 and 200);--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_city_check" CHECK (length(btrim("billing_profiles"."city")) between 1 and 100);--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_json_shape_check" CHECK (case when jsonb_typeof("tax_invoices"."lines") = 'array' then jsonb_array_length("tax_invoices"."lines") between 1 and 8 else false end
        and jsonb_typeof("tax_invoices"."supplier") = 'object' and jsonb_typeof("tax_invoices"."recipient") = 'object');--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_number_check" CHECK ("tax_invoices"."serial" between 1 and 999999 and "tax_invoices"."financial_year" ~ '^[0-9]{2}-[0-9]{2}$' and "tax_invoices"."prefix" ~ '^[A-Z0-9]+$'
        and "tax_invoices"."number" = "tax_invoices"."prefix" || '/' || "tax_invoices"."financial_year" || '/' || lpad("tax_invoices"."serial"::text, 6, '0'));--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_financial_year_check" CHECK ("tax_invoices"."financial_year" = lpad((((extract(year from "tax_invoices"."issued_on") - (case when extract(month from "tax_invoices"."issued_on") < 4 then 1 else 0 end)) % 100)::int)::text, 2, '0')
        || '-' || lpad((((extract(year from "tax_invoices"."issued_on") - (case when extract(month from "tax_invoices"."issued_on") < 4 then 1 else 0 end) + 1) % 100)::int)::text, 2, '0'));--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_place_of_supply_check" CHECK ("tax_invoices"."place_of_supply_state_code" ~ '^[a-z]{2}$'
        and coalesce("tax_invoices"."supplier"->>'stateCode' ~ '^[a-z]{2}$', false)
        and ("tax_invoices"."supply_type" = 'intra_state') = ("tax_invoices"."place_of_supply_state_code" = "tax_invoices"."supplier"->>'stateCode')
        and ("tax_invoices"."place_of_supply_basis" <> 'gstin' or "tax_invoices"."recipient"->>'gstin' is not null)
        and ("tax_invoices"."place_of_supply_basis" <> 'supplier_location' or "tax_invoices"."place_of_supply_state_code" = "tax_invoices"."supplier"->>'stateCode')
        and ("tax_invoices"."recipient"->>'gstin' is null or "tax_invoices"."recipient"->>'gstin' ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'));--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_payment_check" CHECK (length(btrim("tax_invoices"."payment_label")) > 0 and length(btrim("tax_invoices"."payment_reference")) > 0);--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_total_check" CHECK ("tax_invoices"."taxable_cents" > 0 and "tax_invoices"."cgst_cents" >= 0 and "tax_invoices"."igst_cents" >= 0 and "tax_invoices"."total_cents" > 0
        and "tax_invoices"."total_cents" = "tax_invoices"."taxable_cents" + "tax_invoices"."cgst_cents" + "tax_invoices"."sgst_cents" + "tax_invoices"."igst_cents" + "tax_invoices"."round_off_cents"
        and case when jsonb_typeof("tax_invoices"."lines") = 'array' then abs("tax_invoices"."round_off_cents") <= jsonb_array_length("tax_invoices"."lines") else false end);
```

`0121_tax_invoice_recipient_guards.sql`:

```sql
-- Further guards for tax invoices (0119, 0120). The recipient snapshot must carry a lower-case state code or none, and no
-- email or phone, and the place of supply must agree with how it was decided: a billing-address basis needs the
-- address's own state and no GSTIN, a supplier-location basis needs neither. The number is also held to the 16
-- characters GST allows. The number check is replaced to add that limit. The table is empty everywhere, so no row can
-- fail the new checks.

ALTER TABLE "tax_invoices" DROP CONSTRAINT "tax_invoices_number_check";--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_recipient_check" CHECK (("tax_invoices"."recipient"->>'stateCode' is null or "tax_invoices"."recipient"->>'stateCode' ~ '^[a-z]{2}$')
        and "tax_invoices"."recipient"->>'email' is null and "tax_invoices"."recipient"->>'phone' is null
        and ("tax_invoices"."place_of_supply_basis" <> 'billing_address'
          or (coalesce("tax_invoices"."place_of_supply_state_code" = "tax_invoices"."recipient"->>'stateCode', false) and "tax_invoices"."recipient"->>'gstin' is null))
        and ("tax_invoices"."place_of_supply_basis" <> 'supplier_location'
          or ("tax_invoices"."recipient"->>'gstin' is null and "tax_invoices"."recipient"->>'stateCode' is null)));--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_number_check" CHECK ("tax_invoices"."serial" between 1 and 999999 and "tax_invoices"."financial_year" ~ '^[0-9]{2}-[0-9]{2}$' and "tax_invoices"."prefix" ~ '^[A-Z0-9]+$'
        and length("tax_invoices"."number") <= 16
        and "tax_invoices"."number" = "tax_invoices"."prefix" || '/' || "tax_invoices"."financial_year" || '/' || lpad("tax_invoices"."serial"::text, 6, '0'));
```

- [x] **Step 4: Commit** "Add tables for billing details, invoice series and tax invoices" (then the guards commits).

### Task 8: Grants and row-level security

> **Done in `23bc4d0`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Generate `packages/db/migrations/0122_tax_invoices_grants.sql` (journal idx 120)

- [x] **Step 1: Generate an empty custom migration** `pnpm --filter @firstfold/db exec drizzle-kit generate --custom --name tax_invoices_grants`
  and replace its body with:

```sql
-- Grants and row-level security for tax invoicing (0119 to 0121). Customers read and write their own billing details
-- through the app connection, as with business_profiles (0014); staff may also delete them, which account erasure
-- needs (0097). Customers read their own invoices and write none: invoices are issued by the payment paths on the
-- staff connection. Nobody may update or delete an invoice, staff included: an issued invoice is corrected by a credit
-- note, never edited, and it is a financial record that erasure leaves whole. The series counter is staff only.
-- webfold_public gets nothing.

GRANT SELECT, INSERT, UPDATE ON billing_profiles TO webfold_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON billing_profiles TO webfold_staff;
--> statement-breakpoint

ALTER TABLE billing_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY billing_profiles_tenant_all ON billing_profiles FOR ALL TO webfold_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY billing_profiles_staff_all ON billing_profiles FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT ON tax_invoices TO webfold_app;
--> statement-breakpoint

GRANT SELECT, INSERT ON tax_invoices TO webfold_staff;
--> statement-breakpoint

ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tax_invoices_tenant_select ON tax_invoices FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY tax_invoices_staff_select ON tax_invoices FOR SELECT TO webfold_staff USING (true);
--> statement-breakpoint

CREATE POLICY tax_invoices_staff_insert ON tax_invoices FOR INSERT TO webfold_staff WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON tax_invoice_series TO webfold_staff;
--> statement-breakpoint

ALTER TABLE tax_invoice_series ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tax_invoice_series_staff_all ON tax_invoice_series FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
```

- [x] **Step 2: Run** `pnpm db:migrate && pnpm db:migrate:test`. Expected: applies 0119 to 0122 with no error.

- [x] **Step 3: Commit** "Let customers keep their billing details and read their invoices; nobody can edit an invoice"

### Task 9: Queries

> **Done in `7d2c223`, `4bf4ae9`, `c74bb48`, `bbdb22b`, `31878af`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Create `packages/db/src/queries/tax-invoices.ts`; Modify `packages/db/src/queries/index.ts`,
`packages/db/src/index.ts`, `packages/db/src/queries/account-erasure.ts`, `docs/account-erasure.md`; Test
`packages/db/src/tax-invoices.integration.test.ts`, `packages/db/src/account-erasure.integration.test.ts`

- [x] **Step 1: Write the integration test** `packages/db/src/tax-invoices.integration.test.ts` (575 lines in the repo;
  read it there). It seeds two businesses with the helpers in `packages/db/src/testing` and covers:

  - invoice numbers
    - numbers invoices 1, 2, 3 within a financial year and starts again at 1 in the next
    - gives a number back when the transaction that took it rolls back
    - makes a second issuer wait for the first one's transaction, so numbers never repeat
    - refuses to run past the last serial a number can hold
    - keeps the counter away from customers
  - storing an invoice
    - stores an invoice and reads it back by payment
    - issues at most one invoice per payment
    - never reuses a number or a serial
    - accepts the other shapes of a valid invoice
    - refuses CGST and SGST that differ, and a total that does not add up
    - refuses a number that does not match its series and serial
    - refuses a number longer than the 16 characters GST allows, even when it matches its series
    - refuses a financial year that does not match the date of issue
    - refuses intra-state tax for a place of supply other than the supplier's state, and the reverse
    - refuses a recipient that carries an email or a phone
    - refuses a recipient state that is not a lower-case code
    - refuses a billing-address basis that does not match the recipient's address, or that carries a GSTIN
    - refuses a supplier-location basis that has a GSTIN or an address state
    - refuses an invoice with no lines, a bad payment label, or a GSTIN that is not a GSTIN
  - who can see and change invoices
    - lets a customer read its own invoices and no one else's
    - lets nobody edit, delete or write an invoice through the customer connection
    - lets no one edit or delete an invoice, staff included
    - lists the invoices for chosen payments, oldest first, and only for the asking business
  - payments without an invoice
    - lists captured INR payments with no invoice and attention-free, oldest first
    - lists a payment that applied even though staff were asked to look at it, but not one that bought nothing
    - applies the same rule in TypeScript as in SQL
    - describes how a payment was made
  - billing details
    - keeps a customer's billing details to its own business
    - replaces the details on a second save
    - replaces every detail on save, so nothing from an earlier save survives
    - will not compile a save that leaves a detail out, which is how an old one used to survive
    - refuses to save details for another business
    - does not let a customer delete its billing details
    - refuses details the database cannot print on an invoice
    - falls back on the business name and onboarding address when no billing details exist
    - trims the fallback address and treats blank parts as missing
    - locks a payment for its invoice, and refuses one that does not exist
    - reads a referral code's text and discount for the invoice note

- [x] **Step 2: Run** `pnpm --filter @firstfold/db exec vitest run --config vitest.integration.config.ts src/tax-invoices.integration.test.ts`.
  Expected: FAIL, functions not found.

- [x] **Step 3: Implement** `packages/db/src/queries/tax-invoices.ts`:

```ts
import { and, asc, desc, eq, inArray, isNotNull, notExists, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  billingProfiles,
  businessProfiles,
  businesses,
  payments,
  referralCodes,
  taxInvoiceSeries,
  taxInvoices,
  type BillingProfile,
  type ReferralValueKind,
  type TaxInvoice,
} from "../schema";
import { isUnappliedReason, PAYMENT_COLUMNS, paymentWasApplied, type Payment } from "./billing";

type Runner = Database | ScopedTransaction;

/**
 * The next serial in a series, taken atomically. The upsert holds the series row until the caller's transaction ends,
 * so two invoices can never share a number and a rolled-back one gives its number back. It takes a transaction, never
 * the bare connection, because a number taken outside the issuing transaction could be lost. The series row stays
 * locked until the payment transaction commits, so callers allocate last and commit promptly. Staff connection only.
 */
export async function allocateInvoiceSerial(db: ScopedTransaction, prefix: string, financialYear: string): Promise<number> {
  const rows = await db
    .insert(taxInvoiceSeries)
    .values({ prefix, financialYear, nextSerial: 2 })
    .onConflictDoUpdate({
      target: [taxInvoiceSeries.prefix, taxInvoiceSeries.financialYear],
      set: { nextSerial: sql`${taxInvoiceSeries.nextSerial} + 1` },
    })
    .returning({ serial: sql<number>`${taxInvoiceSeries.nextSerial} - 1`.mapWith(Number) });
  const serial = rows[0]?.serial;
  if (serial === undefined) throw new Error(`No serial returned for series ${prefix} ${financialYear}`);
  return serial;
}

export type NewTaxInvoice = Omit<typeof taxInvoices.$inferInsert, "id" | "createdAt">;

/** Staff connection only. Fails on a second invoice for the same payment (tax_invoices_payment_id_idx). */
export async function insertTaxInvoice(db: Runner, invoice: NewTaxInvoice): Promise<TaxInvoice> {
  const rows = await db.insert(taxInvoices).values(invoice).returning();
  const row = rows[0];
  if (row === undefined) throw new Error(`Tax invoice ${invoice.number} was not inserted`);
  return row;
}

/**
 * Holds the payment row until the caller's transaction ends, so two issuers for one payment run one after the other
 * and the second finds the first one's invoice. Taken before the series row, always in that order. Staff connection.
 */
export async function lockPaymentForInvoice(db: ScopedTransaction, paymentId: string): Promise<void> {
  const rows = await db.select({ id: payments.id }).from(payments).where(eq(payments.id, paymentId)).for("update");
  if (rows.length === 0) throw new Error(`Payment ${paymentId} not found`);
}

/** The invoice issued for a payment, or null. Staff connection. */
export async function findTaxInvoiceByPaymentId(db: Runner, paymentId: string): Promise<TaxInvoice | null> {
  const rows = await db.select().from(taxInvoices).where(eq(taxInvoices.paymentId, paymentId)).limit(1);
  return rows[0] ?? null;
}

/** One invoice of one business. Works through row-level security. */
export async function findTaxInvoiceForBusiness(db: Runner, businessId: string, invoiceId: string): Promise<TaxInvoice | null> {
  const rows = await db
    .select()
    .from(taxInvoices)
    .where(and(eq(taxInvoices.id, invoiceId), eq(taxInvoices.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Newest first. Works through row-level security. */
export async function listTaxInvoicesForBusiness(db: Runner, businessId: string): Promise<TaxInvoice[]> {
  return db
    .select()
    .from(taxInvoices)
    .where(eq(taxInvoices.businessId, businessId))
    .orderBy(desc(taxInvoices.issuedOn), desc(taxInvoices.serial));
}

/** The invoices for some of a business's payments, oldest first. Works through row-level security. */
export async function listTaxInvoicesForPayments(db: Runner, businessId: string, paymentIds: readonly string[]): Promise<TaxInvoice[]> {
  if (paymentIds.length === 0) return [];
  return db
    .select()
    .from(taxInvoices)
    .where(and(eq(taxInvoices.businessId, businessId), inArray(taxInvoices.paymentId, [...paymentIds])))
    .orderBy(asc(taxInvoices.financialYear), asc(taxInvoices.serial));
}

/**
 * Whether a payment bought something, and so gets a tax invoice (D1): a captured INR payment with a date, unless it
 * is one of the UNAPPLIED_PAYMENT_REASONS (the money arrived but bought nothing). A reason raised after the payment
 * applied (a failed submission, a provider still to be told) does not stop its invoice. This is the TypeScript twin of
 * the SQL built from `paymentWasApplied` in queries/billing.ts; change them together.
 */
export function isInvoiceablePayment(payment: Pick<Payment, "currency" | "status" | "attentionReason" | "paidAt">): boolean {
  return payment.currency === "INR" && payment.status === "captured" && payment.paidAt !== null && !isUnappliedReason(payment.attentionReason);
}

/** Invoiceable payments (see isInvoiceablePayment) with no invoice: what staff see as "Invoice missing". Staff connection. */
export async function listPaymentsWithoutTaxInvoice(db: Runner, businessId: string): Promise<Payment[]> {
  return db
    .select(PAYMENT_COLUMNS)
    .from(payments)
    .where(
      and(
        eq(payments.businessId, businessId),
        eq(payments.currency, "INR"),
        eq(payments.status, "captured"),
        isNotNull(payments.paidAt),
        paymentWasApplied(),
        notExists(db.select({ one: sql`1` }).from(taxInvoices).where(eq(taxInvoices.paymentId, payments.id))),
      ),
    )
    .orderBy(asc(payments.paidAt));
}

/** A business's billing details, or null. Works through row-level security. */
export async function findBillingProfile(db: Runner, businessId: string): Promise<BillingProfile | null> {
  const rows = await db.select().from(billingProfiles).where(eq(billingProfiles.businessId, businessId)).limit(1);
  return rows[0] ?? null;
}

/** Every column, optional ones as null: a save replaces the whole row, so nothing from an earlier save can survive it. */
export type BillingProfileInput = Omit<BillingProfile, "updatedAt">;

/** Inserts or replaces the business's billing details. Works through row-level security. */
export async function saveBillingProfile(db: Runner, input: BillingProfileInput): Promise<BillingProfile> {
  const { businessId, ...details } = input;
  const rows = await db
    .insert(billingProfiles)
    .values(input)
    .onConflictDoUpdate({ target: billingProfiles.businessId, set: { ...details, updatedAt: new Date() } })
    .returning();
  const row = rows[0];
  if (row === undefined) throw new Error(`Billing details for ${businessId} were not saved`);
  return row;
}

export interface InvoiceFallbackRecipient {
  readonly name: string;
  readonly addressLines: string[];
  readonly region: string | null;
  readonly postalCode: string | null;
}

/** What an invoice falls back on without billing details: the business name and its onboarding address. */
export async function findInvoiceFallbackRecipient(db: Runner, businessId: string): Promise<InvoiceFallbackRecipient> {
  const rows = await db
    .select({
      name: businesses.name,
      line1: businessProfiles.addressLine1,
      line2: businessProfiles.addressLine2,
      city: businessProfiles.city,
      region: businessProfiles.region,
      postalCode: businessProfiles.postalCode,
    })
    .from(businesses)
    .leftJoin(businessProfiles, eq(businessProfiles.businessId, businesses.id))
    .where(eq(businesses.id, businessId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new Error(`Business ${businessId} not found`);
  const kept = (part: string | null): string | null => {
    const text = part?.trim() ?? "";
    return text === "" ? null : text;
  };
  const cityLine = [kept(row.city), kept(row.postalCode)].filter((part): part is string => part !== null).join(" ");
  const addressLines = [kept(row.line1), kept(row.line2), kept(cityLine)].filter((part): part is string => part !== null);
  return { name: row.name, addressLines, region: kept(row.region), postalCode: kept(row.postalCode) };
}

/** What the invoice line's note says about a coupon: its text, and its share when it takes a percentage off. */
export interface ReferralCodeForInvoice {
  readonly code: string;
  /** Null for an affiliate code that gives no discount. */
  readonly discountKind: ReferralValueKind | null;
  /** Set when `discountKind` is "percent": 2000 is 20%. */
  readonly discountPercentBasisPoints: number | null;
}

/** A coupon or affiliate code as the invoice line's note names it, or null. Staff connection. */
export async function findReferralCodeForInvoice(db: Runner, referralCodeId: string): Promise<ReferralCodeForInvoice | null> {
  const rows = await db
    .select({
      code: referralCodes.code,
      discountKind: referralCodes.discountKind,
      discountPercentBasisPoints: referralCodes.discountPercentBasisPoints,
    })
    .from(referralCodes)
    .where(eq(referralCodes.id, referralCodeId))
    .limit(1);
  return rows[0] ?? null;
}

/** How a payment was made, as the invoice's Payment block needs it. */
export interface PaymentForInvoice {
  readonly provider: Payment["provider"];
  readonly providerPaymentId: string;
  readonly method: string | null;
  readonly cardNetwork: string | null;
  readonly cardType: string | null;
  readonly cardLast4: string | null;
  readonly upiVpa: string | null;
  readonly manualReference: string | null;
}

/** How a payment was made, for the invoice's Payment block. Staff connection. */
export async function findPaymentForInvoice(db: Runner, paymentId: string): Promise<PaymentForInvoice> {
  const rows = await db
    .select({
      provider: payments.provider,
      providerPaymentId: payments.providerPaymentId,
      method: payments.method,
      cardNetwork: payments.cardNetwork,
      cardType: payments.cardType,
      cardLast4: payments.cardLast4,
      upiVpa: payments.upiVpa,
      manualReference: payments.manualReference,
    })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new Error(`Payment ${paymentId} not found`);
  return row;
}
```

  `export * from "./tax-invoices";` in `packages/db/src/queries/index.ts`, and in `packages/db/src/index.ts`, next to the
  `./queries/charges` block:

```ts
export {
  allocateInvoiceSerial,
  findBillingProfile,
  findInvoiceFallbackRecipient,
  findPaymentForInvoice,
  findReferralCodeForInvoice,
  findTaxInvoiceByPaymentId,
  findTaxInvoiceForBusiness,
  insertTaxInvoice,
  isInvoiceablePayment,
  listPaymentsWithoutTaxInvoice,
  listTaxInvoicesForBusiness,
  listTaxInvoicesForPayments,
  lockPaymentForInvoice,
  saveBillingProfile,
  type BillingProfileInput,
  type InvoiceFallbackRecipient,
  type NewTaxInvoice,
  type PaymentForInvoice,
  type ReferralCodeForInvoice,
} from "./queries/tax-invoices";
```

- [x] **Step 4: Run** the integration test again. Expected: PASS. Then `pnpm --filter @firstfold/db typecheck`.

- [x] **Step 5: Erasure.** In `eraseClosedAccount` (`packages/db/src/queries/account-erasure.ts`), after the
  `businessProfiles` delete:

```ts
    // What they told us for invoices goes. The invoices themselves stay: they are financial records (tax_invoices).
    await tx.delete(billingProfiles).where(eq(billingProfiles.businessId, businessId));
```

  `billing_profiles` is in the erasure test's list of emptied tables, `tax_invoices` and `tax_invoice_series` in the
  kept list, and `docs/account-erasure.md` has a "Billing details and tax invoices" paragraph.

- [x] **Step 6: Run** `pnpm test:integration`. Expected: PASS.

- [x] **Step 7: Commit** "Number invoices without gaps, store them, and keep billing details per business"

---

## Phase 3: Issue an invoice with every payment

### Task 10: Supplier details

> **Done in `238b58b`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Modify `packages/shared/src/lib/site-config.ts`, `apps/platform/lib/billing/receipt-document.ts` (receipts
print the legal name and CIN); Test `packages/shared/src/lib/site-config.test.ts`

- [x] **Step 1:** `BusinessDetails` and `businessDetails`:

```ts
/**
 * Registered business facts. Static, not environment-driven: these identify the legal entity, and they are printed as
 * the supplier on every tax invoice.
 */
export interface BusinessDetails {
  /** The company that supplies the service and holds the GSTIN. */
  readonly legalName: string;
  /** The name customers know. Printed under the legal name: "Trading as Firstfold". */
  readonly tradeName: string;
  /** Corporate Identity Number, from the certificate of incorporation. */
  readonly cin: string;
  /** Registered office, one line per entry. */
  readonly address: readonly string[];
  /**
   * Platform state code (lower case, "mh") of the registered office. Decides CGST and SGST against IGST, and must be
   * the state the GSTIN is registered in (site-config.test.ts holds the two together).
   */
  readonly stateCode: string;
  readonly gstNumber: string;
  /** Display form, e.g. "+91 789 789 6607". */
  readonly phone: string;
  /** tel: form, digits and a leading plus only. */
  readonly phoneHref: string;
  readonly email: string;
  readonly website: string;
}

export const businessDetails: BusinessDetails = {
  legalName: "Digibranders Private Limited",
  tradeName: "Firstfold",
  cin: "U72900MH2021PTC372344",
  address: [
    "Office No. 2617, 26th Floor, Solus Building,",
    "Hiranandani Estate, Ghodbunder Road,",
    "Thane West, Maharashtra 400607, India",
  ],
  stateCode: "mh",
  gstNumber: "27AAICD9268J1Z0",
  phone: "+91 789 789 6607",
  phoneHref: "+917897896607",
  email: "support@firstfold.io",
  website: "https://firstfold.io",
};
```

- [x] **Step 2:** `packages/shared/src/lib/site-config.test.ts` holds the GSTIN and the state code together:

```ts
import { isValidGstin, stateCodeOfGstin } from "@firstfold/billing/gstin";
import { describe, expect, it } from "vitest";
import { businessDetails } from "./site-config";

describe("businessDetails", () => {
  it("carries a valid GSTIN registered in the state it names, so CGST and SGST are never decided against the wrong one", () => {
    expect(isValidGstin(businessDetails.gstNumber)).toBe(true);
    expect(stateCodeOfGstin(businessDetails.gstNumber)).toBe(businessDetails.stateCode);
  });

  it("names the company, its CIN and an address that fits the invoice's supplier block", () => {
    expect(businessDetails.legalName).toBe("Digibranders Private Limited");
    expect(businessDetails.cin).toMatch(/^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/);
    expect(businessDetails.address).toHaveLength(3);
  });
});
```

- [x] **Step 3: Commit** "Name the company behind Firstfold with its CIN on everything we bill"

### Task 11: Issue an invoice for a recorded payment

> **Done in `7c94569`, `1d31b73`, `9d9d75c`, `286484e`, `31878af`, `e1118a1`: the code in the repo is the source of truth.** The snippets below were refreshed from it.

**Files:** Create `packages/shared/src/server/tax-invoicing.ts`, `packages/shared/src/lib/billing/payment-method.ts`;
Modify `packages/shared/src/server/billing-log.ts`, `packages/shared/src/server/error-log-info.ts`; Test
`packages/shared/src/server/tax-invoicing.test.ts`, `packages/shared/src/lib/billing/payment-method.test.ts`,
`packages/shared/src/tax-invoicing.integration.test.ts`

What it settled, which later tasks rely on:

- `issueTaxInvoice(tx, payment, source, options?)` returns `{ invoice, issued } | null` (null when the payment gets no
  invoice, D1). It locks the payment row (`lockPaymentForInvoice`), returns an existing invoice with `issued: false`,
  and takes the serial last. `options.issuedAt` dates a later issue; payment paths pass nothing.
- `issueTaxInvoiceSafely(tx, payment, source, options?)` returns `TaxInvoice | null`, runs in a savepoint, logs
  `tax-invoice-issued` (new invoices only) or `tax-invoice-failed`, and rethrows only a lost connection.
- `InvoiceSource` for a plan carries `plan`, `netAmountCents`, `discountAmountCents` (everything taken off),
  `retentionDiscountCents` (the stay offer's part of it), `monthly`, `periodStart` and `periodEnd`; for a charge,
  `chargeId`.
- `describeError` (billing-log.ts) logs a message only for `UnknownStateError`, `InvoiceAmountMismatchError`,
  `InvalidGstinError` and `BillingRangeError`; anything else logs its name, Postgres code, constraint and provider
  code only, because Drizzle errors quote query parameters (names, GSTINs, addresses).

- [x] **Step 1: Add log events** `tax-invoice-issued` and `tax-invoice-failed` to `BillingLogEvent` in `billing-log.ts`.

- [x] **Step 2: Write the unit tests.** `packages/shared/src/lib/billing/payment-method.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { paymentLabel, type PaymentMethodFacts } from "./payment-method";

const base: PaymentMethodFacts = {
  provider: "razorpay",
  method: null,
  cardNetwork: null,
  cardType: null,
  cardLast4: null,
  upiVpa: null,
  manualReference: null,
};

describe("paymentLabel", () => {
  it("names a card by network, type and last four", () => {
    expect(paymentLabel({ ...base, method: "card", cardNetwork: "Visa", cardType: "credit", cardLast4: "4366" })).toBe(
      "Visa credit card ending 4366",
    );
  });

  it("leaves out a card network or type the provider did not know", () => {
    expect(paymentLabel({ ...base, method: "card", cardNetwork: "Unknown", cardType: "debit", cardLast4: "0153" })).toBe(
      "Debit card ending 0153",
    );
    expect(paymentLabel({ ...base, method: "card", cardNetwork: "RuPay", cardType: "unknown", cardLast4: "0153" })).toBe(
      "RuPay card ending 0153",
    );
    expect(paymentLabel({ ...base, method: "card", cardLast4: "0153" })).toBe("Card ending 0153");
  });

  it("names UPI by its address, and a bank transfer by its reference", () => {
    expect(paymentLabel({ ...base, method: "upi", upiVpa: "qa@okhdfc" })).toBe("UPI qa@okhdfc");
    expect(paymentLabel({ ...base, provider: "manual", manualReference: "NEFT 0921" })).toBe(
      "Bank transfer, reference NEFT 0921",
    );
  });

  it("falls back to the method the provider reported, or to an online payment when it reported none", () => {
    expect(paymentLabel({ ...base, method: "netbanking" })).toBe("Netbanking");
    expect(paymentLabel({ ...base, method: "card" })).toBe("Card");
    expect(paymentLabel({ ...base, method: "upi" })).toBe("UPI");
    expect(paymentLabel(base)).toBe("Online payment");
  });
});
```

  `packages/shared/src/server/tax-invoicing.test.ts` (in the repo) covers:

  - servicePeriod
    - reads as the days paid for, in India, ending the day before the next period starts
    - writes September as Sep, the way every other date on the invoice is written
    - counts days in India, not UTC
    - refuses a period that ends before it starts
  - planLineDescription
    - names the plan once, with Firstfold in front and plan at the end
  - planLineDetail
    - calls a monthly payment a monthly subscription, as the approved template does
    - still says monthly when the provider's cycle is a few seconds off a calendar month
    - calls any other period a subscription
  - planLineNote
    - gives a percent coupon its share when that is what it took off
    - leaves the share off when the frozen discount is not that share of this price
    - names an amount coupon only, since the discount column shows what it took off
    - names a stay offer, and the coupon only for the part of the discount that is the coupon's
    - says nothing for an affiliate code that gives no discount, or for no discount at all
    - refuses a stay offer larger than the whole discount
  - issueTaxInvoiceSafely
    - lets a lost connection through, since the payment's own transaction cannot commit either
    - logs any other failure and returns null

- [x] **Step 3: Run** `pnpm --filter @firstfold/shared exec vitest run src/server/tax-invoicing.test.ts src/lib/billing/payment-method.test.ts`.
  Expected: FAIL.

- [x] **Step 4: Implement** `packages/shared/src/lib/billing/payment-method.ts`:

```ts
/**
 * How a payment was made, as fields on the payments row. Only what a merchant is shown: the card network, type and last
 * four digits, or the UPI address, never a full card number.
 */
export interface PaymentMethodFacts {
  readonly provider: string;
  /** The provider's method: "card", "upi", "netbanking", "wallet", or a newer one. Null when it did not say. */
  readonly method: string | null;
  readonly cardNetwork: string | null;
  readonly cardType: string | null;
  readonly cardLast4: string | null;
  readonly upiVpa: string | null;
  readonly manualReference: string | null;
}

/** Razorpay reports a network or card type it could not tell as "unknown", which reads badly on an invoice. */
function known(value: string | null): string | null {
  const text = value?.trim() ?? "";
  return text === "" || text.toLowerCase() === "unknown" ? null : text;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Visa credit card ending 4366", "UPI qa@okhdfc", "Bank transfer, reference NEFT 0921". Printed on the tax invoice and
 * on the Billing page's Payment method section, so both say the same words. Pure and browser-safe.
 */
export function paymentLabel(payment: PaymentMethodFacts): string {
  if (payment.provider === "manual") return `Bank transfer, reference ${payment.manualReference ?? "not given"}`;
  if (payment.method === "card" && payment.cardLast4 !== null) {
    const words = [known(payment.cardNetwork), known(payment.cardType), "card ending", payment.cardLast4];
    return capitalised(words.filter((word): word is string => word !== null).join(" "));
  }
  if (payment.method === "upi") return payment.upiVpa === null ? "UPI" : `UPI ${payment.upiVpa}`;
  if (payment.method === null) return "Online payment";
  return capitalised(payment.method);
}
```

  and `packages/shared/src/server/tax-invoicing.ts` (Task 12A adds `paidOn` to the insert):

```ts
import "server-only";
import {
  BillingRangeError,
  buildTaxInvoice,
  discountCentsFor,
  FIRSTFOLD_SAC,
  financialYearOf,
  formatInvoiceNumber,
  indianDate,
  INVOICE_PREFIX,
  type InvoiceLineInput,
  type RecipientInput,
} from "@firstfold/billing";
import {
  allocateInvoiceSerial,
  findBillingProfile,
  findChargeForBusiness,
  findInvoiceFallbackRecipient,
  findPaymentForInvoice,
  findReferralCodeForInvoice,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  insertTaxInvoice,
  isInvoiceablePayment,
  lockPaymentForInvoice,
  type Payment,
  type Plan,
  type ReferralCodeForInvoice,
  type ScopedTransaction,
  type TaxInvoice,
  type TaxInvoicePartyRecord,
} from "@firstfold/db";
import { stateCodeOfIndiaPostName } from "@firstfold/db/india-states";
import { paymentLabel } from "../lib/billing/payment-method";
import { planLabel } from "../lib/billing/receipt-title";
import { businessDetails } from "../lib/site-config";
import { describeError, logBillingEvent } from "./billing-log";
import { isConnectionFailure } from "./error-log-info";

/**
 * What a payment bought, as the code that recorded it knows it. The caller passes what the payment was charged for,
 * not what the subscription says today, since a stay offer or a price can change after a payment.
 */
export type InvoiceSource =
  | {
      readonly kind: "plan";
      readonly plan: Plan;
      /** The price before discount: the plan's initial or recurring amount, whichever this payment was charged at. */
      readonly netAmountCents: number;
      /** Everything taken off this payment: the referral code's share plus any stay offer. */
      readonly discountAmountCents: number;
      /** The stay offer's part of `discountAmountCents` (the subscription's retention_discount_cents), or 0. */
      readonly retentionDiscountCents: number;
      /**
       * Whether this payment bought one month: a first payment on a plan whose initial term is one month, and every
       * renewal and restart. Decided by the caller from the plan, never from the period's length, because a provider's
       * cycle is rarely an exact calendar month to the second.
       */
      readonly monthly: boolean;
      /**
       * The first instant paid for. A provider renewal passes the provider's own cycle start, so the printed period
       * matches the provider's.
       */
      readonly periodStart: Date;
      /** The first instant of the next period. The printed period ends the day before, in India. */
      readonly periodEnd: Date;
    }
  | { readonly kind: "charge"; readonly chargeId: string };

/** Us, as printed on every invoice. The database refuses an invoice whose supplier has no lower-case state code. */
const SUPPLIER: TaxInvoicePartyRecord = {
  legalName: businessDetails.legalName,
  tradeName: businessDetails.tradeName,
  gstin: businessDetails.gstNumber,
  cin: businessDetails.cin,
  addressLines: [...businessDetails.address],
  stateCode: businessDetails.stateCode,
  email: businessDetails.email,
  phone: businessDetails.phone,
};

const DAY_MS = 24 * 60 * 60 * 1000;
// en-US parts, put together by hand: en-GB writes September as "Sept", and every other date on the invoice says "Sep".
const IST_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function istDay(instant: Date): { readonly dayMonth: string; readonly year: string } {
  const parts = Object.fromEntries(IST_DATE_PARTS.formatToParts(instant).map((part) => [part.type, part.value]));
  return { dayMonth: `${parts.day ?? ""} ${parts.month ?? ""}`, year: parts.year ?? "" };
}

/** "09 Oct to 08 Nov 2026": from the day paid to the day before the next period starts, in India. */
export function servicePeriod(start: Date, endExclusive: Date): string {
  if (!(endExclusive.getTime() > start.getTime())) {
    throw new BillingRangeError(`A service period must end after it starts, received ${start.toISOString()} to ${endExclusive.toISOString()}`);
  }
  const first = istDay(start);
  const last = istDay(new Date(endExclusive.getTime() - DAY_MS));
  const from = first.year === last.year ? first.dayMonth : `${first.dayMonth} ${first.year}`;
  return `${from} to ${last.dayMonth} ${last.year}`;
}

/** "Firstfold Premium plan", whether the plan is named "Firstfold Premium" (as sold) or plain "Premium". */
export function planLineDescription(planName: string): string {
  const label = planLabel(planName);
  return /^firstfold\b/i.test(label) ? label : `Firstfold ${label}`;
}

/**
 * "Monthly subscription, 09 Oct to 08 Nov 2026" for a monthly payment (the approved template's words), and
 * "Subscription, ..." for any other, such as a first payment that covers three months. The same for a first payment,
 * a renewal and a restart: the period says what was paid for.
 */
export function planLineDetail(monthly: boolean, periodStart: Date, periodEnd: Date): string {
  return `${monthly ? "Monthly subscription" : "Subscription"}, ${servicePeriod(periodStart, periodEnd)}`;
}

/** 2000 basis points as "20", 1250 as "12.5", in whole numbers so no float is ever printed. */
function percentOf(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const hundredths = basisPoints % 100;
  if (hundredths === 0) return String(whole);
  return `${whole}.${String(hundredths).padStart(2, "0").replace(/0$/, "")}`;
}

/** What a plan line's note is worked out from. */
export interface PlanLineNoteInput {
  /** The subscription's referral code, or null when it has none. */
  readonly coupon: ReferralCodeForInvoice | null;
  readonly netAmountCents: number;
  readonly discountAmountCents: number;
  readonly retentionDiscountCents: number;
}

/**
 * What the discount on a plan line was, in words, or null for none: "Coupon GAURAV applied, 20% off. Stay offer
 * applied". The coupon is named only for the part of the discount that is its own (the whole less any stay offer),
 * and its share is printed only when it is exactly what that share of this price comes to, so the note never
 * contradicts the discount column. An amount coupon is named without a figure: the discount column shows it.
 */
export function planLineNote(input: PlanLineNoteInput): string | null {
  if (input.retentionDiscountCents < 0 || input.retentionDiscountCents > input.discountAmountCents) {
    throw new BillingRangeError(`A stay offer of ${input.retentionDiscountCents} cannot be part of a discount of ${input.discountAmountCents}`);
  }
  const couponCents = input.discountAmountCents - input.retentionDiscountCents;
  const notes: string[] = [];
  const coupon = input.coupon;
  if (coupon !== null && coupon.discountKind !== null && couponCents > 0) {
    const basisPoints = coupon.discountPercentBasisPoints;
    const share =
      coupon.discountKind === "percent" &&
      basisPoints !== null &&
      discountCentsFor({ kind: "percent", basisPoints }, input.netAmountCents) === couponCents
        ? `, ${percentOf(basisPoints)}% off`
        : "";
    notes.push(`Coupon ${coupon.code} applied${share}`);
  }
  if (input.retentionDiscountCents > 0) notes.push("Stay offer applied");
  return notes.length === 0 ? null : notes.join(". ");
}

function nonBlank(text: string | null): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Who the invoice is to: the billing details when the customer gave them, else the business name and its onboarding
 * address. Contact details stay out (see RecipientInput). An onboarding region we cannot place leaves the state unknown,
 * and the place of supply falls back to our own location (D5).
 */
async function recipientFor(tx: ScopedTransaction, businessId: string): Promise<RecipientInput> {
  const profile = await findBillingProfile(tx, businessId);
  if (profile !== null) {
    const cityLine = `${profile.city.trim()} ${profile.postalCode.trim()}`;
    return {
      legalName: profile.legalName.trim(),
      gstin: profile.gstin,
      addressLines: [profile.addressLine1, profile.addressLine2, cityLine]
        .map(nonBlank)
        .filter((line): line is string => line !== null),
      stateCode: profile.stateCode,
    };
  }
  const fallback = await findInvoiceFallbackRecipient(tx, businessId);
  return {
    legalName: fallback.name,
    gstin: null,
    addressLines: fallback.addressLines,
    stateCode: fallback.region === null ? null : stateCodeOfIndiaPostName(fallback.region),
  };
}

async function linesFor(tx: ScopedTransaction, payment: Payment, source: InvoiceSource): Promise<InvoiceLineInput[]> {
  if (source.kind === "charge") {
    const charge = await findChargeForBusiness(tx, payment.businessId, source.chargeId);
    if (charge === null) throw new Error(`Charge ${source.chargeId} not found for payment ${payment.id}`);
    // The payment path marks the charge paid in the same transaction, before the invoice; anything else is a mix-up.
    if (charge.status !== "paid" || charge.paymentId !== payment.id || charge.currency !== "INR") {
      throw new Error(`Charge ${charge.id} was not paid by payment ${payment.id} in rupees`);
    }
    // The description as staff wrote it: the invoice has its own quantity and rate columns.
    return [
      {
        description: charge.description,
        detail: null,
        note: null,
        sac: FIRSTFOLD_SAC,
        quantity: charge.quantity,
        unitAmountCents: charge.unitAmountCents,
        discountAmountCents: 0,
        taxRateBasisPoints: charge.taxRateBasisPoints,
      },
    ];
  }
  const subscription = payment.subscriptionId === null ? null : await findSubscriptionById(tx, payment.subscriptionId);
  const referralCodeId = subscription?.referralCodeId ?? null;
  const couponCents = source.discountAmountCents - source.retentionDiscountCents;
  const coupon = couponCents > 0 && referralCodeId !== null ? await findReferralCodeForInvoice(tx, referralCodeId) : null;
  return [
    {
      description: planLineDescription(source.plan.name),
      detail: planLineDetail(source.monthly, source.periodStart, source.periodEnd),
      note: planLineNote({
        coupon,
        netAmountCents: source.netAmountCents,
        discountAmountCents: source.discountAmountCents,
        retentionDiscountCents: source.retentionDiscountCents,
      }),
      sac: FIRSTFOLD_SAC,
      quantity: 1,
      unitAmountCents: source.netAmountCents,
      discountAmountCents: source.discountAmountCents,
      taxRateBasisPoints: source.plan.taxRateBasisPoints,
    },
  ];
}

/** An invoice for a payment, and whether this call issued it (false when it had been issued before). */
export interface IssuedTaxInvoice {
  readonly invoice: TaxInvoice;
  readonly issued: boolean;
}

export interface IssueOptions {
  /**
   * When the invoice is issued, which dates it and decides its financial year. Payment paths pass nothing: the invoice
   * is issued the moment the payment is recorded, so it defaults to the payment's own time. A missing invoice issued
   * later by staff passes the actual time of issue, because an invoice is dated when it is issued, never backdated.
   */
  readonly issuedAt?: Date;
}

/**
 * Issues the tax invoice for a payment just recorded, in the caller's transaction. Idempotent per payment: a second
 * call returns the invoice already issued, with `issued` false, and takes no number. Returns null for a payment that
 * gets no invoice (isInvoiceablePayment, D1). Throws on anything it cannot explain, such as lines that do not add up
 * to what was charged; payment paths call issueTaxInvoiceSafely instead.
 *
 * Locks are taken in one order, the payment row and then the series row, so a second issuer for the same payment
 * waits and then finds the first one's invoice. The serial is taken last, because it holds the series row locked
 * until the caller commits.
 */
export async function issueTaxInvoice(
  tx: ScopedTransaction,
  payment: Payment,
  source: InvoiceSource,
  options: IssueOptions = {},
): Promise<IssuedTaxInvoice | null> {
  const paidAt = payment.paidAt;
  if (!isInvoiceablePayment(payment) || paidAt === null) return null;
  const issuedAt = options.issuedAt ?? paidAt;
  if (issuedAt.getTime() < paidAt.getTime()) {
    throw new BillingRangeError(`An invoice cannot be dated ${issuedAt.toISOString()}, before its payment at ${paidAt.toISOString()}`);
  }
  await lockPaymentForInvoice(tx, payment.id);
  const existing = await findTaxInvoiceByPaymentId(tx, payment.id);
  if (existing !== null) return { invoice: existing, issued: false };

  const draft = buildTaxInvoice({
    supplierStateCode: businessDetails.stateCode,
    recipient: await recipientFor(tx, payment.businessId),
    lines: await linesFor(tx, payment, source),
    amountChargedCents: payment.amountCents,
  });
  const method = await findPaymentForInvoice(tx, payment.id);
  const financialYear = financialYearOf(issuedAt);
  const serial = await allocateInvoiceSerial(tx, INVOICE_PREFIX, financialYear);
  const invoice = await insertTaxInvoice(tx, {
    businessId: payment.businessId,
    paymentId: payment.id,
    prefix: INVOICE_PREFIX,
    financialYear,
    serial,
    number: formatInvoiceNumber(INVOICE_PREFIX, financialYear, serial),
    issuedOn: indianDate(issuedAt),
    supplier: SUPPLIER,
    recipient: draft.recipient,
    placeOfSupplyStateCode: draft.placeOfSupplyStateCode,
    placeOfSupplyBasis: draft.placeOfSupplyBasis,
    supplyType: draft.supplyType,
    lines: draft.lines,
    taxableCents: draft.taxableCents,
    cgstCents: draft.cgstCents,
    sgstCents: draft.sgstCents,
    igstCents: draft.igstCents,
    roundOffCents: draft.roundOffCents,
    totalCents: draft.totalCents,
    paymentLabel: paymentLabel(method),
    paymentReference: method.providerPaymentId,
  });
  return { invoice, issued: true };
}

/**
 * issueTaxInvoice in a savepoint (D7): a failure rolls back the invoice and its serial only, is logged as
 * `tax-invoice-failed`, and returns null, so the payment the caller recorded still commits. Staff issue the missing
 * invoice from the client page. Returns the payment's invoice whether issued now or before; only a new one is logged
 * as `tax-invoice-issued`. A lost database connection is not an invoicing fault: the payment's own transaction cannot
 * commit either, so it is rethrown for the payment path to handle as it handles any other.
 */
export async function issueTaxInvoiceSafely(
  tx: ScopedTransaction,
  payment: Payment,
  source: InvoiceSource,
  options: IssueOptions = {},
): Promise<TaxInvoice | null> {
  const fields = {
    businessId: payment.businessId,
    paymentId: payment.id,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
  };
  try {
    const result = await tx.transaction((savepoint) => issueTaxInvoice(savepoint, payment, source, options));
    if (result === null) return null;
    if (result.issued) logBillingEvent("info", "tax-invoice-issued", { ...fields, invoiceNumber: result.invoice.number });
    return result.invoice;
  } catch (error) {
    if (isConnectionFailure(error)) throw error;
    logBillingEvent("error", "tax-invoice-failed", { ...fields, ...describeError(error) });
    return null;
  }
}
```

- [x] **Step 5: Integration test** `packages/shared/src/tax-invoicing.integration.test.ts` (in the repo) covers:

  - issueTaxInvoice
    - invoices a discounted plan payment to a Maharashtra customer with CGST and SGST that add up to what was charged
    - returns the invoice already issued when asked again, takes no new number and logs the issue once
    - makes a second issuer for the same payment wait, then hands it the first one's invoice
    - dates a later issue on the day it is issued, in that day's financial year, never the payment's
    - refuses to backdate an invoice to before the payment
    - refuses a charge that this payment did not pay
    - names an amount coupon without a share
    - names a stay offer beside the coupon, and the coupon by its own share of the discount
    - says nothing about an affiliate's code that gives no discount
    - issues nothing for a dollar payment, or for money that bought nothing
    - invoices a paid extra by its description, quantity and rate, to the onboarding address when there are no billing details
    - falls back to our own state when nothing says where the customer is
  - issueTaxInvoiceSafely
    - logs a refused invoice and returns null, and the payment recorded beside it still commits
    - gives back a number taken before the insert failed, so the series keeps no gap

- [x] **Step 6: Run** the unit tests, `pnpm --filter @firstfold/shared exec vitest run --config vitest.integration.config.ts src/tax-invoicing.integration.test.ts`
  and `pnpm --filter @firstfold/shared typecheck`. Expected: PASS.

- [x] **Step 7: Commit** "Issue a tax invoice for a recorded payment, without ever losing the payment over it"

### Task 12: Wire invoices into every payment path

**Files:** Modify `packages/billing/src/razorpay-webhook.ts`, `packages/billing/src/razorpay-webhook.test.ts`,
`packages/shared/src/server/billing-activation.ts`, `packages/shared/src/server/billing-activation.test.ts`,
`apps/platform/lib/server/razorpay-webhook-handler.ts`, `apps/platform/lib/server/razorpay-webhook-handler.test.ts`,
`apps/platform/lib/server/charges.ts`, `apps/platform/lib/server/charges.test.ts`, `apps/admin/lib/server/charges-admin.ts`,
`apps/admin/lib/server/charges-admin.test.ts`, `apps/admin/lib/server/billing-admin.test.ts`,
`packages/shared/src/referral-checkout.integration.test.ts`, `packages/shared/src/plan-upgrade.integration.test.ts`;
Create `packages/shared/src/server/charge-payments.ts`, `packages/shared/src/server/charge-payments.test.ts`,
`packages/shared/src/payment-invoicing.integration.test.ts`

Every way money is recorded, and where its invoice is issued. Each payment is invoiced exactly once: every path takes
`lockBusinessForBilling` first, so when a webhook and the customer's return race for the same first payment, the second
finds it `alreadyRecorded` and issues nothing (and `issueTaxInvoice` is idempotent per payment anyway).

| Path | Records with | File | Invoice issued by |
|---|---|---|---|
| Razorpay `subscription.charged`, first charge | `activateFirstPayment` | `apps/platform/lib/server/razorpay-webhook-handler.ts` | `activateFirstPayment` |
| Razorpay `subscription.charged`, renewal | `activateRenewalPayment` | same | `activateRenewalPayment` (needs `invoicedPrice`, `periodStart`) |
| Razorpay `subscription.charged`, restart after lapse | `activateReactivationPayment` | same | `activateReactivationPayment` |
| Customer returns from checkout (Razorpay handler or the fake provider) | `activateFirstPayment` / `activateReactivationPayment` | `apps/platform/lib/server/payment-confirmation.ts` (`confirmFirstPayment`) | the activation; this file does not change |
| Staff record a bank transfer for a plan | `activateFirstPayment` / `activateReactivationPayment` | `apps/admin/lib/server/billing-admin.ts` (`recordManualFirstPayment`) | the activation; this file does not change |
| Razorpay `order.paid` or the fake provider, for a charge | `recordVerifiedChargePayment` | `apps/platform/lib/server/charges.ts` | `recordChargePaymentWithInvoice` |
| Staff mark a charge paid by bank transfer | `markClientChargePaid` | `apps/admin/lib/server/charges-admin.ts` | `recordChargePaymentWithInvoice` |
| Money that bought nothing | `recordUnappliedPayment` | webhook, confirmation | none (D1) |

The invoice is the **last write that takes a lock outside the business's own rows**: `allocateInvoiceSerial` holds the one
series row for the year until the payment transaction commits, so every invoiceable payment in the country queues behind
it. Taking it last keeps that wait short and means no lock on another business's rows is taken after it, so two payment
transactions cannot deadlock on it. (`completePlanUpgradeAtRenewal` and `sendAfterPayment` still run after it, but they
touch only the business's own rows, which no other payment transaction can hold under the billing lock.)

- [ ] **Step 1: Razorpay's cycle start, test first.** In `packages/billing/src/razorpay-webhook.test.ts`, add
  `currentStart: new Date(1_700_000_000 * 1000),` to the `toEqual` object of "parses a subscription.charged event with its
  payment and subscription entities", and add:

```ts
  it("reads the start of the cycle a charge paid for, and records the charge without it when Razorpay sends none", () => {
    const charged = (subscription: Record<string, unknown>): string =>
      JSON.stringify({
        event: "subscription.charged",
        payload: {
          subscription: { entity: { id: "sub_abc", current_end: 1_702_678_400, ...subscription } },
          payment: { entity: { id: "pay_abc", amount: 7_500, currency: "USD", status: "captured", created_at: 1_700_000_500 } },
        },
      });
    expect(parseRazorpayWebhookEvent(charged({ current_start: 1_700_000_000 }))).toMatchObject({ kind: "charged", currentStart: new Date(1_700_000_000 * 1000) });
    expect(parseRazorpayWebhookEvent(charged({}))).toMatchObject({ kind: "charged", currentStart: null });
    expect(parseRazorpayWebhookEvent(charged({ current_start: null }))).toMatchObject({ kind: "charged", currentStart: null });
    expect(parseRazorpayWebhookEvent(charged({ current_start: "soon" }))).toMatchObject({ kind: "charged", currentStart: null, paymentId: "pay_abc" });
  });
```

  Run `pnpm --filter @firstfold/billing exec vitest run src/razorpay-webhook.test.ts`. Expected: FAIL (`currentStart` is
  missing).

- [ ] **Step 2: Parse it.** In `packages/billing/src/razorpay-webhook.ts`, the subscription entity of `chargedSchema`
  becomes:

```ts
      entity: z.object({
        id: z.string().min(1),
        // The first instant of the cycle this charge paid for, printed on its tax invoice. Lenient on purpose: only the
        // invoice reads it, and a charge must never go unrecorded over it. Missing, null or odd means null.
        current_start: z.number().int().positive().nullish().catch(null),
        current_end: z.number().int().positive(),
      }),
```

  In the `charged` member of `RazorpayWebhookEvent`, after `subscriptionId`:

```ts
      /** The start of the billing period this charge paid for, as Razorpay computed it, or null when it did not say. */
      readonly currentStart: Date | null;
```

  and in the object `parseRazorpayWebhookEvent` returns for `subscription.charged`, after `subscriptionId`:

```ts
      currentStart: typeof subscription.entity.current_start === "number" ? new Date(subscription.entity.current_start * 1000) : null,
```

  Run the test again. Expected: PASS. `pnpm --filter @firstfold/billing typecheck`: PASS.

- [ ] **Step 3: Activation tests first.** In `packages/shared/src/server/billing-activation.test.ts`:
  - after the `./affiliate-accrual` mock add
    `vi.mock("./tax-invoicing", () => ({ issueTaxInvoiceSafely: vi.fn() }));` and import `issueTaxInvoiceSafely` from
    `"./tax-invoicing"` beside the other imports;
  - in both existing `activateRenewalPayment` calls add, after `paidThroughAt,`:

```ts
      periodStart: paidAt,
      invoicedPrice: { plan: { id: "plan_1" } as never, netAmountCents: 7_500, discountAmountCents: 0, retentionDiscountCents: 0 },
```

  - add these tests at the end of the file:

```ts
describe("the tax invoice", () => {
  const paidAt = new Date("2026-10-14T12:00:00.000Z");
  const paidThroughAt = new Date("2026-11-14T12:00:00.000Z");
  const plan = { id: "plan_1", initialTermMonths: 1, initialAmountCents: 699_900, recurringAmountCents: 699_900, taxRateBasisPoints: 1_800, currency: "INR" } as never;
  const renewal = {
    businessId: "biz_1",
    subscriptionId: "sub_1",
    commitmentEndsAt: paidAt,
    provider: "razorpay",
    providerPaymentId: "pay_1",
    amountCents: 660_706,
    currency: "INR",
    paidAt,
    paidThroughAt,
    periodStart: new Date("2026-10-14T00:00:00.000Z"),
    invoicedPrice: { plan, netAmountCents: 699_900, discountAmountCents: 139_980, retentionDiscountCents: 0 },
  } as const;

  beforeEach(() => {
    vi.mocked(issueTaxInvoiceSafely).mockClear();
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
  });

  it("is issued for a renewal at the price the caller verified, for the provider's own cycle", async () => {
    const tx = {} as never;
    await activateRenewalPayment(tx, renewal);
    expect(issueTaxInvoiceSafely).toHaveBeenCalledWith(tx, { id: "payment_1" }, {
      kind: "plan",
      plan,
      netAmountCents: 699_900,
      discountAmountCents: 139_980,
      retentionDiscountCents: 0,
      monthly: true,
      periodStart: new Date("2026-10-14T00:00:00.000Z"),
      periodEnd: paidThroughAt,
    });
  });

  it("is not issued again for a payment recorded before", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValueOnce({ alreadyRecorded: true, payment: { id: "payment_1" } } as never);
    await activateRenewalPayment({} as never, renewal);
    expect(issueTaxInvoiceSafely).not.toHaveBeenCalled();
  });

  it("is issued last for a first payment, for the plan's own term", async () => {
    await activateFirstPayment({} as never, {
      businessId: "biz_1",
      subscriptionId: "sub_1",
      plan,
      provider: "razorpay",
      providerPaymentId: "pay_3",
      paidAt,
      discountAmountCents: 139_980,
    });
    expect(vi.mocked(issueTaxInvoiceSafely).mock.calls[0]?.[2]).toEqual({
      kind: "plan",
      plan,
      netAmountCents: 699_900,
      discountAmountCents: 139_980,
      retentionDiscountCents: 0,
      monthly: true,
      periodStart: paidAt,
      periodEnd: new Date("2026-11-14T12:00:00.000Z"),
    });
    const invoiced = vi.mocked(issueTaxInvoiceSafely).mock.invocationCallOrder[0] ?? 0;
    const opened = vi.mocked(openMembershipForListingBusiness).mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY;
    expect(invoiced).toBeGreaterThan(opened);
  });

  it("is issued for a restart at the plan's monthly price with no discount", async () => {
    await activateReactivationPayment({} as never, { businessId: "biz_1", subscriptionId: "sub_1", plan, provider: "razorpay", providerPaymentId: "pay_2", paidAt, paidThroughAt });
    expect(vi.mocked(issueTaxInvoiceSafely).mock.calls[0]?.[2]).toEqual({
      kind: "plan", plan, netAmountCents: 699_900, discountAmountCents: 0, retentionDiscountCents: 0, monthly: true, periodStart: paidAt, periodEnd: paidThroughAt,
    });
  });
});
```

  Add `beforeEach` to the file's `vitest` import. Run `pnpm --filter @firstfold/shared exec vitest run src/server/billing-activation.test.ts`. Expected: FAIL
  (the activation never calls `issueTaxInvoiceSafely`, and the new fields do not compile).

- [ ] **Step 4: Issue the invoices in `packages/shared/src/server/billing-activation.ts`.** Add
  `import { issueTaxInvoiceSafely } from "./tax-invoicing";`. In `activateFirstPayment`, replace the last two lines with:

```ts
  const openedMembership = await openMembershipForListingBusiness(tx, payment.businessId);
  // The last write that takes a lock outside this business's own rows: the invoice's serial holds the year's series row
  // until this transaction commits. Callers still run completePlanUpgradeAtRenewal and sendAfterPayment after it, but those
  // touch only this business's rows, which no other payment transaction can hold under the billing lock.
  await issueTaxInvoiceSafely(tx, activation.payment, {
    kind: "plan",
    plan: payment.plan,
    netAmountCents: payment.plan.initialAmountCents,
    discountAmountCents: payment.discountAmountCents ?? 0,
    // A stay offer is only ever added to a live subscription, never to its first payment.
    retentionDiscountCents: 0,
    monthly: payment.plan.initialTermMonths === 1,
    periodStart: payment.paidAt,
    periodEnd: termEnd,
  });
  return { ...activation, openedMembership };
```

  Add above `RenewalPayment`:

```ts
/** What a renewal was charged at, exactly as the caller's amount check accepted it, for its tax invoice. */
export interface RenewalInvoicedPrice {
  readonly plan: Plan;
  /** The plan's recurring price before any discount. */
  readonly netAmountCents: number;
  /** Everything taken off: the referral code's share plus any stay offer. */
  readonly discountAmountCents: number;
  /** The stay offer's part of `discountAmountCents`, or 0. */
  readonly retentionDiscountCents: number;
}
```

  and to `RenewalPayment`, after `paidThroughAt`:

```ts
  /** The first instant this charge paid for: the provider's own cycle start (Razorpay's `current_start`), or `paidAt`. */
  readonly periodStart: Date;
  readonly invoicedPrice: RenewalInvoicedPrice;
```

  In `activateRenewalPayment`, the `if (!activation.alreadyRecorded)` block becomes:

```ts
  if (!activation.alreadyRecorded) {
    await accrueAffiliateEarning(tx, { paymentId: activation.payment.id, subscriptionId: payment.subscriptionId, kind: "renewal" });
    await issueTaxInvoiceSafely(tx, activation.payment, {
      kind: "plan",
      ...payment.invoicedPrice,
      monthly: true,
      periodStart: payment.periodStart,
      periodEnd: payment.paidThroughAt,
    });
  }
```

  `activateReactivationPayment` keeps its activation and issues before returning:

```ts
export async function activateReactivationPayment(tx: ScopedTransaction, payment: ReactivationPayment): Promise<RecordedActivation> {
  const activation = await recordPaymentAndActivate(tx, {
    businessId: payment.businessId,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    kind: "reactivation",
    amountCents: chargedAmountCents(payment.plan.recurringAmountCents, 0, payment.plan.taxRateBasisPoints),
    currency: payment.plan.currency,
    paidAt: payment.paidAt,
    paidThroughAt: payment.paidThroughAt,
    commitmentEndsAt: payment.paidThroughAt,
    currentPeriodEnd: payment.paidThroughAt,
    ...(payment.manual === undefined ? {} : { manual: payment.manual }),
    ...(payment.method === undefined ? {} : { method: payment.method }),
  });
  if (!activation.alreadyRecorded) {
    await issueTaxInvoiceSafely(tx, activation.payment, {
      kind: "plan",
      plan: payment.plan,
      netAmountCents: payment.plan.recurringAmountCents,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      monthly: true,
      periodStart: payment.paidAt,
      periodEnd: payment.paidThroughAt,
    });
  }
  return activation;
}
```

  Add one sentence to each function's doc comment: "Issues the payment's tax invoice last, in a savepoint (D7)."
  Run the Step 3 test. Expected: PASS.

- [ ] **Step 5: The webhook, test first.** In `apps/platform/lib/server/razorpay-webhook-handler.test.ts`, add
  `currentStart: null,` to every `kind: "charged"` event literal (the `CHARGED` constant and each inline event: about ten,
  `rg -n 'kind: "charged"' apps/platform/lib/server/razorpay-webhook-handler.test.ts` lists them), and add
  `retentionDiscountCents: 0,` to every mocked subscription that has `discountAmountCents`. Then add:

```ts
  it("passes the renewal's price, stay offer and Razorpay's cycle start on, for its invoice", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_1",
      businessId: "biz_1",
      planId: "plan_1",
      commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
      discountAmountCents: 1_500,
      retentionDiscountCents: 1_500,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

    await handleRazorpayWebhookEvent({
      kind: "charged",
      method: VISA,
      subscriptionId: "sub_rzp_1",
      currentStart: new Date("2026-10-14T00:00:00.000Z"),
      currentEnd: new Date("2026-11-14T00:00:00.000Z"),
      paidAt: new Date("2026-10-14T12:00:00.000Z"),
      paymentId: "pay_renewal_stay",
      amountCents: 6_000,
      currency: "USD",
    });

    expect(activateRenewalPayment).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        periodStart: new Date("2026-10-14T00:00:00.000Z"),
        invoicedPrice: { plan: PLAN, netAmountCents: 7_500, discountAmountCents: 1_500, retentionDiscountCents: 1_500 },
      }),
    );
  });

  it("invoices a renewal at the new plan's price by that plan, and falls back on the payment time without a cycle start", async () => {
    const PREMIUM = { ...PLAN, id: "plan_2", recurringAmountCents: 9_900, initialAmountCents: 9_900 };
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_1",
      businessId: "biz_1",
      planId: "plan_1",
      commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: "plan_2",
      pendingDiscountAmountCents: 0,
    } as never);
    vi.mocked(findPlanById).mockResolvedValueOnce(PLAN as never).mockResolvedValueOnce(PREMIUM as never);
    const paidAt = new Date("2026-10-14T12:00:00.000Z");

    await handleRazorpayWebhookEvent({
      kind: "charged",
      method: VISA,
      subscriptionId: "sub_rzp_1",
      currentStart: null,
      currentEnd: new Date("2026-11-14T00:00:00.000Z"),
      paidAt,
      paymentId: "pay_renewal_premium",
      amountCents: 9_900,
      currency: "USD",
    });

    expect(activateRenewalPayment).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        periodStart: paidAt,
        invoicedPrice: { plan: PREMIUM, netAmountCents: 9_900, discountAmountCents: 0, retentionDiscountCents: 0 },
      }),
    );
  });
```

  Run `pnpm --filter @firstfold/platform exec vitest run lib/server/razorpay-webhook-handler.test.ts`. Expected: FAIL.

- [ ] **Step 6: The webhook passes the price.** In `apps/platform/lib/server/razorpay-webhook-handler.ts`, in the
  renewal `else` branch, after the `commitmentEndsAt === null` check and before `activateRenewalPayment`:

```ts
        // What the amount check above accepted, so the invoice explains the charge by construction: the new plan for the
        // renewal that completes a paid move up, else the subscription's own plan with its frozen discount and stay offer.
        const invoicedPrice =
          renewalAtNewPrice && pendingPlan !== null
            ? { plan: pendingPlan, netAmountCents: pendingPlan.recurringAmountCents, discountAmountCents: subscription.pendingDiscountAmountCents, retentionDiscountCents: 0 }
            : plan !== null && plan !== undefined
              ? {
                  plan,
                  netAmountCents: plan.recurringAmountCents,
                  discountAmountCents: subscription.discountAmountCents,
                  retentionDiscountCents: subscription.retentionDiscountCents,
                }
              : null;
        // Unreachable: the amount check above refused a renewal with no plan at either price.
        if (invoicedPrice === null) throw new Error(`Subscription ${subscription.id} renewed with no plan to invoice`);
```

  and in the `activateRenewalPayment(tx, { ... })` call add, after `paidThroughAt: event.currentEnd,`:

```ts
          // Razorpay's own cycle start, so the invoice's period matches Razorpay's; the payment time when it sent none.
          periodStart: event.currentStart ?? event.paidAt,
          invoicedPrice,
```

  A stay offer never moves to the new plan (`subscriptions_pending_discount_check` allows a pending discount only from a
  referral code), so its retention part is 0. Run the Step 5 test. Expected: PASS.

- [ ] **Step 7: Charges, test first.** Create `packages/shared/src/server/charge-payments.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/db", () => ({ recordChargePayment: vi.fn() }));
vi.mock("./tax-invoicing", () => ({ issueTaxInvoiceSafely: vi.fn() }));

import { recordChargePayment } from "@firstfold/db";
import { recordChargePaymentWithInvoice } from "./charge-payments";
import { issueTaxInvoiceSafely } from "./tax-invoicing";

const tx = { name: "staff-tx" } as never;
const PAYMENT = { id: "payment_1" } as never;
const INPUT = {
  chargeId: "charge_1",
  businessId: "biz_1",
  provider: "manual",
  providerPaymentId: "manual_charge_1",
  amountCents: 336_300,
  currency: "INR",
  paidAt: new Date("2026-10-09T09:00:00.000Z"),
  now: new Date("2026-10-09T09:00:00.000Z"),
  manual: { recordedByStaffId: "staff_1", reference: "NEFT 0921", receivedOn: "2026-10-09" },
} as const;

afterEach(() => {
  vi.clearAllMocks();
});

describe("recordChargePaymentWithInvoice", () => {
  it("records the payment, then invoices the charge it settled", async () => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome: "paid", alreadyRecorded: false });
    expect(await recordChargePaymentWithInvoice(tx, INPUT)).toEqual({ payment: PAYMENT, outcome: "paid", alreadyRecorded: false });
    expect(recordChargePayment).toHaveBeenCalledWith(tx, INPUT);
    expect(issueTaxInvoiceSafely).toHaveBeenCalledWith(tx, PAYMENT, { kind: "charge", chargeId: "charge_1" });
  });

  it.each(["not-open", "amount-mismatch", "upgrade-not-applied"] as const)("invoices nothing for money that did not settle the charge (%s)", async (outcome) => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome, alreadyRecorded: false });
    await recordChargePaymentWithInvoice(tx, INPUT);
    expect(issueTaxInvoiceSafely).not.toHaveBeenCalled();
  });

  it("invoices nothing again for a payment recorded before", async () => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome: "paid", alreadyRecorded: true });
    await recordChargePaymentWithInvoice(tx, INPUT);
    expect(issueTaxInvoiceSafely).not.toHaveBeenCalled();
  });
});
```

  Run `pnpm --filter @firstfold/shared exec vitest run src/server/charge-payments.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 8: Create `packages/shared/src/server/charge-payments.ts`:**

```ts
import "server-only";
import { recordChargePayment, type ChargePayment, type RecordedChargePayment, type ScopedTransaction } from "@firstfold/db";
import { issueTaxInvoiceSafely } from "./tax-invoicing";

/**
 * recordChargePayment, then the tax invoice for a charge it settled, last and in a savepoint (D7). Every charge payment
 * path goes through this, on the staff connection, under the business's billing lock. A payment that did not settle its
 * charge (a duplicate, a wrong amount, a stale move up) bought nothing and gets no invoice (D1).
 */
export async function recordChargePaymentWithInvoice(tx: ScopedTransaction, input: ChargePayment): Promise<RecordedChargePayment> {
  const recorded = await recordChargePayment(tx, input);
  if (recorded.outcome === "paid" && !recorded.alreadyRecorded) {
    await issueTaxInvoiceSafely(tx, recorded.payment, { kind: "charge", chargeId: input.chargeId });
  }
  return recorded;
}
```

  Run the Step 7 test. Expected: PASS.

- [ ] **Step 9: Use it in both apps.** In `apps/platform/lib/server/charges.ts` remove `recordChargePayment` from the
  `@firstfold/db` import, add `import { recordChargePaymentWithInvoice } from "@firstfold/shared/server/charge-payments";`
  and call `recordChargePaymentWithInvoice(tx, { ... })` in `recordVerifiedChargePayment` (same arguments). Do the same in
  `apps/admin/lib/server/charges-admin.ts` (`markClientChargePaid`). In `apps/platform/lib/server/charges.test.ts` and
  `apps/admin/lib/server/charges-admin.test.ts`: remove `recordChargePayment` from the `@firstfold/db` mock and import, add
  `vi.mock("@firstfold/shared/server/charge-payments", () => ({ recordChargePaymentWithInvoice: vi.fn() }));` with
  `import { recordChargePaymentWithInvoice } from "@firstfold/shared/server/charge-payments";`, and rename every other
  `recordChargePayment` in those two files to `recordChargePaymentWithInvoice` (the arguments are the same).

  `apps/admin/lib/server/billing-admin.test.ts` runs the real `activateFirstPayment` against a mocked database, and one of
  its tests reads the first `console.error` line; without a mock the invoice's own failure would be that line. Add, beside
  its other mocks: `vi.mock("@firstfold/shared/server/tax-invoicing", () => ({ issueTaxInvoiceSafely: vi.fn(async () => null) }));`.

- [ ] **Step 10: Existing integration callers of `activateRenewalPayment`.** In
  `packages/shared/src/referral-checkout.integration.test.ts` (`payRenewal`) add, after `paidThroughAt`:

```ts
      periodStart: addMonths(NOW, 1),
      invoicedPrice: {
        plan,
        netAmountCents: plan.recurringAmountCents,
        discountAmountCents: subscription.discountAmountCents,
        retentionDiscountCents: subscription.retentionDiscountCents,
      },
```

  In `packages/shared/src/plan-upgrade.integration.test.ts` (the renewal at Premium's price, `amountCents: 825_882`) add,
  after `paidThroughAt: NEXT_PERIOD_END,`:

```ts
        periodStart: PERIOD_END,
        invoicedPrice: { plan: premium, netAmountCents: premium.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 },
```

  (`premium` is the Premium plan that test already reads; use its variable name if it differs.)

- [ ] **Step 11: The end-to-end test.** Create `packages/shared/src/payment-invoicing.integration.test.ts`:

```ts
import { chargedAmountCents } from "@firstfold/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  billingProfiles,
  businesses,
  findActivePlan,
  findLatestSubscriptionForBusiness,
  findPaymentByProviderId,
  findTaxInvoiceByPaymentId,
  insertCharge,
  openCheckoutSubscription,
  users,
  type Plan,
  type Subscription,
} from "@firstfold/db";
import { openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@firstfold/db/testing";
import { chargeAmountCents } from "./lib/billing/charges";
import { activateFirstPayment, activateReactivationPayment, activateRenewalPayment } from "./server/billing-activation";
import { recordChargePaymentWithInvoice } from "./server/charge-payments";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/** Every payment path, against a real database: each invoiceable payment gets exactly one invoice, and nothing else does. */

const STAFF_USER = "staff-invoices";
const PAID_AT = new Date("2026-10-09T09:00:00.000Z");
const NEXT_MONTH = new Date("2026-11-09T09:00:00.000Z");
const MONTH_AFTER = new Date("2026-12-09T09:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let premium: Plan;

async function addBusiness(currency: "INR" | "USD", slug: string): Promise<string> {
  const rows = await dbs.owner.db.insert(businesses).values({ slug, name: "QA Premium Business", currency }).returning({ id: businesses.id });
  return rows[0]?.id ?? "";
}

async function saveMaharashtraDetails(gstin: string): Promise<void> {
  await dbs.owner.db.insert(billingProfiles).values({
    businessId,
    legalName: "QA Premium Business LLP",
    gstin,
    addressLine1: "Shop 4, Gokul Arcade",
    addressLine2: null,
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
    email: null,
    phone: null,
  });
}

function openSubscription(forBusiness: string, plan: Plan): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId: forBusiness,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"d".repeat(24)}`,
    referralCodeId: null,
    discountAmountCents: 0,
    replacing: null,
    now: PAID_AT,
  });
}

function payFirst(subscription: Subscription, plan: Plan, providerPaymentId = "fake_pay_first") {
  return dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, { businessId: subscription.businessId, subscriptionId: subscription.id, plan, provider: "fake", providerPaymentId, paidAt: PAID_AT }),
  );
}

/** The next serial the counter would hand out for 26-27, or null when no invoice has taken one. */
async function nextSerial(): Promise<number | null> {
  const rows = await querySql<{ next_serial: number }>(dbs.owner, "select next_serial from tax_invoice_series where prefix = 'FF' and financial_year = '26-27'");
  return rows[0]?.next_serial ?? null;
}

async function invoiceCount(): Promise<number> {
  const rows = await querySql<{ count: string }>(dbs.owner, "select count(*) as count from tax_invoices");
  return Number(rows[0]?.count ?? 0);
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  const plan = await findActivePlan(dbs.staff.db, "INR", "premium");
  if (plan === null) throw new Error("No active INR Premium plan was seeded");
  premium = plan;
  await dbs.owner.db.insert(users).values({ id: STAFF_USER, name: "Superadmin", email: "admin@example.test", emailVerified: true });
  businessId = await addBusiness("INR", "qa-premium");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("invoicing every payment path", () => {
  it("invoices a first payment, first in the year, with CGST and SGST that add up to the payment", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    const activation = await payFirst(await openSubscription(businessId, premium), premium);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice).toMatchObject({
      number: "FF/26-27/000001",
      issuedOn: "2026-10-09",
      supplyType: "intra_state",
      placeOfSupplyBasis: "gstin",
      totalCents: activation.payment.amountCents,
    });
    expect(invoice?.cgstCents).toBe(invoice?.sgstCents);
    expect(invoice?.lines[0]).toMatchObject({ quantity: 1, unitAmountCents: premium.initialAmountCents, discountAmountCents: 0 });
  });

  it("issues nothing more when the same payment is delivered again, and takes no number", async () => {
    const subscription = await openSubscription(businessId, premium);
    await payFirst(subscription, premium);
    const again = await payFirst(subscription, premium);

    expect(again.alreadyRecorded).toBe(true);
    expect(await invoiceCount()).toBe(1);
    expect(await nextSerial()).toBe(2);
  });

  it("invoices a renewal for the provider's cycle at the verified price, next in the series", async () => {
    await payFirst(await openSubscription(businessId, premium), premium);
    const subscription = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    const commitmentEndsAt = subscription?.commitmentEndsAt ?? null;
    if (subscription === null || commitmentEndsAt === null) throw new Error("The first payment did not open the subscription");

    const renewal = await dbs.staff.db.transaction((tx) =>
      activateRenewalPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        commitmentEndsAt,
        provider: "fake",
        providerPaymentId: "fake_pay_renewal",
        amountCents: chargedAmountCents(premium.recurringAmountCents, 0, premium.taxRateBasisPoints),
        currency: "INR",
        paidAt: NEXT_MONTH,
        paidThroughAt: MONTH_AFTER,
        periodStart: NEXT_MONTH,
        invoicedPrice: { plan: premium, netAmountCents: premium.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 },
      }),
    );

    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id)).toMatchObject({
      number: "FF/26-27/000002",
      lines: [expect.objectContaining({ detail: "Monthly subscription, 09 Nov to 08 Dec 2026" })],
    });
  });

  it("invoices a restart at the plan's monthly price with no discount", async () => {
    const subscription = await openSubscription(businessId, premium);
    const activation = await dbs.staff.db.transaction((tx) =>
      activateReactivationPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        plan: premium,
        provider: "fake",
        providerPaymentId: "fake_pay_restart",
        paidAt: PAID_AT,
        paidThroughAt: NEXT_MONTH,
      }),
    );

    expect((await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id))?.lines[0]).toMatchObject({
      unitAmountCents: premium.recurringAmountCents,
      discountAmountCents: 0,
    });
  });

  it("invoices a paid extra by its description and quantity when staff record a bank transfer", async () => {
    const charge = await insertCharge(dbs.staff.db, {
      businessId,
      kind: "change_hours",
      description: "Extra change hours",
      quantity: 2,
      unitAmountCents: 142_500,
      taxRateBasisPoints: premium.taxRateBasisPoints,
      amountCents: chargeAmountCents(142_500, 2, premium.taxRateBasisPoints),
      currency: "INR",
      createdByStaffId: STAFF_USER,
    });

    const recorded = await dbs.staff.db.transaction((tx) =>
      recordChargePaymentWithInvoice(tx, {
        chargeId: charge.id,
        businessId,
        provider: "manual",
        providerPaymentId: "manual_charge_1",
        amountCents: charge.amountCents,
        currency: "INR",
        paidAt: PAID_AT,
        now: PAID_AT,
        manual: { recordedByStaffId: STAFF_USER, reference: "NEFT 0921", receivedOn: "2026-10-09" },
      }),
    );

    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, recorded.payment.id)).toMatchObject({
      paymentLabel: "Bank transfer, reference NEFT 0921",
      lines: [expect.objectContaining({ description: "Extra change hours", quantity: 2, unitAmountCents: 142_500 })],
    });
  });

  it("issues nothing for a dollar payment", async () => {
    const usd = await findActivePlan(dbs.staff.db, "USD", "premium");
    if (usd === null) throw new Error("No active USD Premium plan was seeded");
    const dollarBusiness = await addBusiness("USD", "qa-dollar");

    await payFirst(await openSubscription(dollarBusiness, usd), usd, "fake_pay_usd");

    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("records and activates a payment whose invoice cannot be issued, logs it, and spends no number", async () => {
    // Right shape, wrong check character: the database takes it, the invoice builder refuses it.
    await saveMaharashtraDetails("27AAPFU0939F1ZA");

    const activation = await payFirst(await openSubscription(businessId, premium), premium);

    expect(await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_first")).not.toBeNull();
    expect((await findLatestSubscriptionForBusiness(dbs.staff.db, businessId))?.activatedAt).not.toBeNull();
    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id)).toBeNull();
    expect(await nextSerial()).toBeNull();
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toMatch(/tax-invoice-failed .*InvalidGstinError/);
  });
});
```

- [ ] **Step 12: Run** `pnpm --filter @firstfold/billing test && pnpm --filter @firstfold/shared test && pnpm --filter @firstfold/platform test && pnpm --filter @firstfold/admin test`,
  then `pnpm test:integration`, then `pnpm typecheck` and `pnpm lint`. Expected: all PASS.

- [ ] **Step 13: Commit** "Issue a tax invoice with every first payment, renewal, reactivation and paid extra"

### Task 12A: Payment date on the invoice, and when invoicing started

**Files:** Modify `packages/db/src/schema/tax-invoices.ts`, `packages/db/src/queries/tax-invoices.ts`,
`packages/db/src/index.ts`, `packages/shared/src/server/tax-invoicing.ts`; Generate
`packages/db/migrations/0123_tax_invoice_paid_on.sql` (journal idx 121); Test
`packages/db/src/tax-invoices.integration.test.ts`, `packages/shared/src/tax-invoicing.integration.test.ts`

Two facts the snapshot lacks. (1) The day the payment was made: a missing invoice staff issue later is dated the day of
issue (D16), so printing `issued_on` as "paid on" would be false. (2) When invoicing started: without it, the client page
would list every INR payment since launch as "Invoice missing" (D17, Gate 4). `tax_invoices` is empty in production
(0119 to 0122 have not shipped), and the migration fills `paid_on` from the payment for any local rows.

- [ ] **Step 1: Tests first.** In `packages/db/src/tax-invoices.integration.test.ts`: add `paidOn: "2026-10-09",` to
  `sampleInvoice` after `issuedOn`; import `taxInvoicingStart` from `"./schema"` (or from `"@firstfold/db"`, matching the
  file's imports); and add:

```ts
describe("dates and the invoicing start", () => {
  it("refuses an invoice whose payment date is after its own date", async () => {
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, paidOn: "2026-10-10" })))).toMatch(/tax_invoices_paid_on_check/);
  });

  it("does not list payments recorded before invoicing started as missing an invoice", async () => {
    const before = await seedPayment(businessA, "pay_fake_before", { createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const after = await seedPayment(businessA, "pay_fake_after", { createdAt: new Date("2026-07-01T00:00:00.000Z") });
    await dbs.owner.db.insert(taxInvoicingStart).values({ startedAt: new Date("2026-06-01T00:00:00.000Z") });

    const missing = (await listPaymentsWithoutTaxInvoice(dbs.staff.db, businessA)).map((row) => row.id);
    expect(missing).toContain(after);
    expect(missing).not.toContain(before);
  });
});
```

  (`seedPayment`, `paymentA`, `businessA` and `captureErrorText` are the file's existing helpers.) In
  `packages/shared/src/tax-invoicing.integration.test.ts`, extend "dates a later issue on the day it is issued, in that
  day's financial year, never the payment's" with `paidOn: "2027-03-31"` in its `toMatchObject`, and the first test's
  expectation with `issuedOn: "2026-10-09", paidOn: "2026-10-09"`. Run both files. Expected: FAIL.

- [ ] **Step 2: Schema.** In `packages/db/src/schema/tax-invoices.ts` add `boolean` and `timestamp` to the
  `drizzle-orm/pg-core` import; in `taxInvoices` after `issuedOn`:

```ts
    /**
     * The Indian calendar date the payment was made, printed in the Payment block. The same as `issuedOn` for an invoice
     * issued with its payment; earlier for one staff issued later, which is dated the day it is issued (D16).
     */
    paidOn: date("paid_on", { mode: "string" }).notNull(),
```

  in its checks:

```ts
    check("tax_invoices_paid_on_check", sql`${table.paidOn} <= ${table.issuedOn}`),
```

  and a new table at the end, before the type exports:

```ts
/**
 * When this database started issuing tax invoices: one row, written by migration 0123 as it runs, which is the release
 * that turns invoicing on. Payments recorded before it keep their receipts (D17, Gate 4), so staff are never asked to
 * invoice them. With no row (a test database after a reset) no payment is left out.
 */
export const taxInvoicingStart = pgTable(
  "tax_invoicing_start",
  {
    id: boolean("id").primaryKey().default(true),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("tax_invoicing_start_single_row_check", sql`${table.id}`)],
);
```

- [ ] **Step 3: Generate** `pnpm --filter @firstfold/db exec drizzle-kit generate --name tax_invoice_paid_on`, then edit the
  generated `0123_tax_invoice_paid_on.sql` (before committing; never after) so the column is filled before it is made
  required, and append the start row and its grant. The finished file:

```sql
-- The day each invoiced payment was made (D16), and when this database started issuing invoices (D17). tax_invoices is
-- empty in production; any local rows take their payment's Indian date.
CREATE TABLE "tax_invoicing_start" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_invoicing_start_single_row_check" CHECK ("tax_invoicing_start"."id")
);
--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "paid_on" date;--> statement-breakpoint
UPDATE "tax_invoices" SET "paid_on" = ("payments"."paid_at" AT TIME ZONE 'Asia/Kolkata')::date FROM "payments" WHERE "payments"."id" = "tax_invoices"."payment_id";--> statement-breakpoint
UPDATE "tax_invoices" SET "paid_on" = "issued_on" WHERE "paid_on" IS NULL OR "paid_on" > "issued_on";--> statement-breakpoint
ALTER TABLE "tax_invoices" ALTER COLUMN "paid_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_paid_on_check" CHECK ("tax_invoices"."paid_on" <= "tax_invoices"."issued_on");--> statement-breakpoint
INSERT INTO "tax_invoicing_start" DEFAULT VALUES;--> statement-breakpoint
GRANT SELECT ON tax_invoicing_start TO webfold_staff;--> statement-breakpoint
ALTER TABLE tax_invoicing_start ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tax_invoicing_start_staff_select ON tax_invoicing_start FOR SELECT TO webfold_staff USING (true);
```

  Keep drizzle-kit's own statement order if it differs, as long as the column is filled before `SET NOT NULL`. Run
  `pnpm db:migrate && pnpm db:migrate:test`. Expected: 0123 applies; `pnpm --filter @firstfold/db exec drizzle-kit check`
  reports no drift.

- [ ] **Step 4: Queries.** In `packages/db/src/queries/tax-invoices.ts` import `taxInvoicingStart` from `"../schema"` and
  replace `listPaymentsWithoutTaxInvoice` with a shared condition and the function built on it:

```ts
/**
 * The SQL twin of "invoiceable and has no invoice yet" (isInvoiceablePayment, D1), for payments recorded since invoicing
 * started (D17). A database with no start row leaves nothing out.
 */
function missingTaxInvoice(db: Runner): SQL {
  return and(
    eq(payments.currency, "INR"),
    eq(payments.status, "captured"),
    isNotNull(payments.paidAt),
    paymentWasApplied(),
    sql`${payments.createdAt} >= coalesce((select ${taxInvoicingStart.startedAt} from ${taxInvoicingStart} limit 1), '-infinity'::timestamptz)`,
    notExists(db.select({ one: sql`1` }).from(taxInvoices).where(eq(taxInvoices.paymentId, payments.id))),
  ) as SQL;
}

/** Invoiceable payments of one business with no invoice: what staff see as "Invoice missing". Staff connection. */
export async function listPaymentsWithoutTaxInvoice(db: Runner, businessId: string): Promise<Payment[]> {
  return db
    .select(PAYMENT_COLUMNS)
    .from(payments)
    .where(and(eq(payments.businessId, businessId), missingTaxInvoice(db)))
    .orderBy(asc(payments.paidAt));
}
```

  (`and()` returns `SQL | undefined`; with these arguments it is always defined, hence the cast. `SQL` is already
  imported as a type.)

- [ ] **Step 5: Issue with the payment date.** In `issueTaxInvoice` (`packages/shared/src/server/tax-invoicing.ts`) add
  `paidOn: indianDate(paidAt),` after `issuedOn: indianDate(issuedAt),`. Fix any other `NewTaxInvoice` literal the
  typecheck reports (test fixtures only).

- [ ] **Step 6: Refuse what the invoice cannot print (D12).** Add the pure helper
  `packages/shared/src/lib/billing/invoice-text.ts`:

```ts
/** Printable ASCII: every character Hanken Grotesk can draw on the invoice and every billing-details field accepts. */
export function isPrintableOnInvoice(text: string): boolean {
  return /^[\x20-\x7E]*$/.test(text);
}
```

  with a unit test (`invoice-text.test.ts`): "Sharma & Rao, #12 (3rd Cross)" is printable; a Devanagari name, an emoji and a
  tab are not. In `issueTaxInvoice` (`packages/shared/src/server/tax-invoicing.ts`), after the recipient and lines are
  built and before the serial is allocated, throw a `BillingRangeError` with the fixed message "An invoice name or address
  has characters the invoice cannot print" (no input in the message) when the recipient's legal name, any address line,
  or any line description, detail or note fails the check. Add integration tests in
  `packages/shared/src/tax-invoicing.integration.test.ts`: a business whose onboarding name is in Devanagari and who has
  no billing details gets no invoice from `issueTaxInvoiceSafely` (returns null, logs `tax-invoice-failed`, takes no
  serial, the payment still commits) and shows in `listPaymentsWithoutTaxInvoice`; after a billing profile with an
  English name is saved, `issueTaxInvoice` with `{ issuedAt }` later succeeds and keeps the payment's own `paidOn`.

- [ ] **Step 7: Run** both integration files from Step 1, `pnpm test:integration`, and `pnpm typecheck`. Expected: PASS.

- [ ] **Step 8: Commit** "Keep the day each invoiced payment was made, and leave payments from before invoicing alone"

---

## Phase 4: Billing details

### Task 13: Form parsing

**Files:** Create `packages/shared/src/lib/billing/billing-details-form.ts`; Test `packages/shared/src/lib/billing/billing-details-form.test.ts`

It lives in shared, not the platform app, because staff edit billing details too (Task 18). Every text field accepts
printable ASCII only (space to `~`), which is exactly what the embed script in Task 15 proves the invoice font can draw,
so an address like "#12, 3rd Cross" is accepted and nothing saved can print as "?".

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { firstBillingDetailsProblem, parseBillingDetails } from "./billing-details-form";

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  const defaults = {
    legalName: "QA Premium Business",
    gstin: "",
    addressLine1: "Shop 4, Gokul Arcade",
    addressLine2: "",
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
    email: "",
    phoneCountry: "IN",
    phone: "",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...fields })) data.set(key, value);
  return data;
};

describe("parseBillingDetails", () => {
  it("accepts details without a GSTIN", () => {
    expect(parseBillingDetails(form({}))).toMatchObject({ ok: true, details: { gstin: null, addressLine2: null, stateCode: "mh" } });
  });

  it("accepts the punctuation Indian addresses use", () => {
    expect(parseBillingDetails(form({ addressLine1: "#12, 3rd Cross: Near St. Mary's [Gate 2]" }))).toMatchObject({ ok: true });
  });

  it("normalises a GSTIN and requires its state to match the address state", () => {
    expect(parseBillingDetails(form({ gstin: "27aapfu 0939f1zv" }))).toMatchObject({ ok: true, details: { gstin: "27AAPFU0939F1ZV" } });
    expect(parseBillingDetails(form({ gstin: "27AAPFU0939F1ZV", stateCode: "ka" }))).toEqual({
      ok: false,
      errors: { stateCode: "This GSTIN is registered in Maharashtra. Choose Maharashtra, or check the GSTIN." },
    });
  });

  it("explains a GSTIN that fails its check", () => {
    expect(parseBillingDetails(form({ gstin: "29AAPFU0939F1ZV" }))).toEqual({
      ok: false,
      errors: { gstin: "This GSTIN is not valid. Check it against your GST registration certificate." },
    });
  });

  it("asks for the name in English letters, as on the GST registration", () => {
    expect(parseBillingDetails(form({ legalName: "क्यूए प्रीमियम" }))).toMatchObject({
      ok: false,
      errors: { legalName: "Enter the name as on your GST registration, in English letters." },
    });
  });

  it("keeps an optional billing email and phone, the phone as E.164", () => {
    expect(parseBillingDetails(form({}))).toMatchObject({ ok: true, details: { email: null, phone: null } });
    expect(parseBillingDetails(form({ email: "Accounts@QAPremium.in", phone: "98200 12345" }))).toMatchObject({
      ok: true,
      details: { email: "accounts@qapremium.in", phone: "+919820012345" },
    });
    expect(parseBillingDetails(form({ email: "accounts@" }))).toMatchObject({ ok: false, errors: { email: "Enter a valid email address." } });
    expect(parseBillingDetails(form({ phone: "12345" }))).toMatchObject({ ok: false, errors: { phone: expect.any(String) } });
  });

  it("refuses a pincode that is not six digits and a state it does not know", () => {
    expect(parseBillingDetails(form({ postalCode: "40008" }))).toMatchObject({ ok: false, errors: { postalCode: "Enter a 6 digit pincode." } });
    expect(parseBillingDetails(form({ stateCode: "xx" }))).toMatchObject({ ok: false, errors: { stateCode: "Choose your state." } });
  });
});

describe("firstBillingDetailsProblem", () => {
  it("names the first problem in the order the form shows its fields", () => {
    expect(firstBillingDetailsProblem({ city: "Enter the city, in English letters.", legalName: "Enter the name to bill, as on your GST registration." })).toEqual({
      field: "legalName",
      message: "Enter the name to bill, as on your GST registration.",
    });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @firstfold/shared exec vitest run src/lib/billing/billing-details-form.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { isValidGstin, normaliseGstin, stateCodeOfGstin } from "@firstfold/billing/gstin";
import { isIndiaStateCode, stateName } from "../directory/india-states";
import { optionalEmail } from "../validation/contact";
import { parsePhoneEntry } from "../validation/phone";

/**
 * The billing details form, shared by the customer's Billing page and the staff client page: what each field may hold
 * and the words for each refusal. Pure and browser-safe. The database checks the same limits again (0119, 0120).
 */

export interface BillingDetails {
  readonly legalName: string;
  readonly gstin: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly postalCode: string;
  readonly stateCode: string;
  /** Null when left blank: invoices and billing questions go to the account's own email and number. */
  readonly email: string | null;
  readonly phone: string | null;
}

/** The form's fields in the order it shows them, so the first problem is the one nearest the top. */
export const BILLING_DETAILS_FIELDS = [
  "legalName",
  "gstin",
  "addressLine1",
  "addressLine2",
  "city",
  "postalCode",
  "stateCode",
  "email",
  "phoneCountry",
  "phone",
] as const;

export type BillingDetailsField = (typeof BILLING_DETAILS_FIELDS)[number];
export type BillingDetailsErrors = Partial<Record<BillingDetailsField, string>>;

export type ParsedBillingDetails =
  | { readonly ok: true; readonly details: BillingDetails }
  | { readonly ok: false; readonly errors: BillingDetailsErrors };

/** Printable ASCII: every character the invoice font is checked to draw (scripts/embed-invoice-fonts.mjs). */
const PRINTABLE = /^[\x20-\x7E]+$/;
const PINCODE = /^[1-9][0-9]{5}$/;

function text(data: FormData, key: BillingDetailsField): string {
  const value = data.get(key);
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function parseBillingDetails(data: FormData): ParsedBillingDetails {
  const errors: BillingDetailsErrors = {};
  const legalName = text(data, "legalName");
  const gstinInput = normaliseGstin(text(data, "gstin"));
  const addressLine1 = text(data, "addressLine1");
  const addressLine2 = text(data, "addressLine2");
  const city = text(data, "city");
  const postalCode = text(data, "postalCode").replace(/\s/g, "");
  const stateCode = text(data, "stateCode");
  const emailResult = optionalEmail.safeParse(text(data, "email"));
  const phoneResult = parsePhoneEntry({ country: text(data, "phoneCountry"), number: text(data, "phone") }, null);

  if (legalName === "" || legalName.length > 200) errors.legalName = "Enter the name to bill, as on your GST registration.";
  else if (!PRINTABLE.test(legalName)) errors.legalName = "Enter the name as on your GST registration, in English letters.";
  if (addressLine1 === "" || addressLine1.length > 200 || !PRINTABLE.test(addressLine1)) errors.addressLine1 = "Enter the street address, in English letters.";
  if (addressLine2.length > 200 || (addressLine2 !== "" && !PRINTABLE.test(addressLine2))) errors.addressLine2 = "Keep this line in English letters, under 200 characters.";
  if (city === "" || city.length > 100 || !PRINTABLE.test(city)) errors.city = "Enter the city, in English letters.";
  if (!PINCODE.test(postalCode)) errors.postalCode = "Enter a 6 digit pincode.";
  if (!isIndiaStateCode(stateCode)) errors.stateCode = "Choose your state.";
  if (!emailResult.success) errors.email = emailResult.error.issues[0]?.message ?? "Enter a valid email address.";
  if (!phoneResult.success) errors[phoneResult.part === "country" ? "phoneCountry" : "phone"] = phoneResult.message;

  let gstin: string | null = null;
  if (gstinInput !== "") {
    if (!isValidGstin(gstinInput)) {
      errors.gstin = "This GSTIN is not valid. Check it against your GST registration certificate.";
    } else {
      gstin = gstinInput;
      const registeredIn = stateCodeOfGstin(gstinInput);
      if (errors.stateCode === undefined && registeredIn !== stateCode) {
        const name = stateName(registeredIn) ?? registeredIn;
        errors.stateCode = `This GSTIN is registered in ${name}. Choose ${name}, or check the GSTIN.`;
      }
    }
  }

  if (Object.keys(errors).length > 0 || !emailResult.success || !phoneResult.success) return { ok: false, errors };
  return {
    ok: true,
    details: {
      legalName,
      gstin,
      addressLine1,
      addressLine2: addressLine2 === "" ? null : addressLine2,
      city,
      postalCode,
      stateCode,
      email: emailResult.data,
      phone: phoneResult.e164,
    },
  };
}

/** The problem to show first, for forms that show one at a time (the panel and console form patterns). */
export function firstBillingDetailsProblem(errors: BillingDetailsErrors): { readonly field: BillingDetailsField; readonly message: string } {
  for (const field of BILLING_DETAILS_FIELDS) {
    const message = errors[field];
    if (message !== undefined) return { field, message };
  }
  throw new Error("firstBillingDetailsProblem was given no problem");
}
```

  `optionalEmail` (validation/contact.ts) trims, lower-cases and turns a blank into null, so `emailResult.data` is
  `string | null`.

- [ ] **Step 4: Run** the test. Expected: PASS. `pnpm --filter @firstfold/shared typecheck`: PASS.

- [ ] **Step 5: Commit** "Check billing details the way the GST registration states them"

### Task 14: Save action, card and prompt

**Files:** Modify `apps/platform/app/app-host/(protected)/billing/actions.ts`, `apps/platform/app/app-host/(protected)/billing/page.tsx`,
`apps/platform/app/app-host/(protected)/onboarding/review/page.tsx`, `apps/platform/app/app-host/(protected)/upgrade/page.tsx`,
`apps/platform/components/panel/membership/membership-page.tsx`; Create `apps/platform/lib/server/billing-details.ts`,
`apps/platform/components/panel/billing/billing-details.tsx`, `apps/platform/components/panel/billing/billing-details-prompt.tsx`;
Test `apps/platform/app/app-host/(protected)/billing/actions.test.ts`

Before writing any markup, invoke the `design-taste-frontend` skill, read `apps/platform/DESIGN.md` (Forms, Detail panels,
Accessibility checklist) and read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and
`03-api-reference/04-functions/refresh.md` in `apps/platform`. The project's design system wins: the panel form pattern
(`usePanelForm`, `FIELD_CLASSES`, `PanelFormStatus` from `components/panel/form/panel-form.tsx`), `Surface` and
`SectionHeading` from `@firstfold/shared/ui/panel/surface`, `Button` from `@firstfold/shared/ui/panel/button`, `PhoneField`
from `@firstfold/shared/ui/phone-field`, sentence-case labels, no uppercase kickers.

Who can reach what: an account still buying its membership (`isAwaitingMembership`) can open only its plan's page, so
`/billing` would bounce it back. That page therefore shows the form inline instead of a link, and the save action passes
`membershipCheckout: "allow"` as well as `listingAccount: "allow"`. Writing one's own billing details needs nothing more
than a signed-in member of the business: row-level security (`billing_profiles_tenant_all`) does the rest.

- [ ] **Step 1: The action, test first.** Create `apps/platform/app/app-host/(protected)/billing/actions.test.ts`:

```ts
import { saveBillingProfile, withTenantScope } from "@firstfold/db";
import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { saveBillingDetailsAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("@/lib/server/checkout", () => ({ startReactivationFor: vi.fn() }));
vi.mock("@/lib/server/charge-redirect", () => ({ redirectForChargePayment: vi.fn() }));
vi.mock("@firstfold/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@firstfold/db")>()),
  saveBillingProfile: vi.fn(),
  withTenantScope: vi.fn((_db: unknown, _tenant: unknown, work: (tx: unknown) => unknown) => work({ name: "app-tx" })),
}));

const TENANT = { userId: "user-1", businessId: "0192f3c4-1111-7000-8000-000000000001", businessName: "Riverside", role: "owner" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  const defaults = { legalName: "Riverside Dental LLP", gstin: "", addressLine1: "12 MG Road", addressLine2: "", city: "Mumbai", postalCode: "400080", stateCode: "mh", email: "", phoneCountry: "IN", phone: "" };
  for (const [key, value] of Object.entries({ ...defaults, ...fields })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant: TENANT } as never);
});

describe("saveBillingDetailsAction", () => {
  it("lets a listing account and one still buying its membership save its own details", async () => {
    await saveBillingDetailsAction({ status: "idle" }, form({}));
    expect(requireCustomerAccess).toHaveBeenCalledWith({ listingAccount: "allow", membershipCheckout: "allow" });
  });

  it("saves the details for the signed-in business, through its tenant scope, and refreshes the page", async () => {
    expect(await saveBillingDetailsAction({ status: "idle" }, form({ gstin: "27AAPFU0939F1ZV" }))).toEqual({ status: "saved" });
    expect(withTenantScope).toHaveBeenCalledWith({ name: "app-db" }, TENANT, expect.any(Function));
    expect(saveBillingProfile).toHaveBeenCalledWith({ name: "app-tx" }, expect.objectContaining({ businessId: TENANT.businessId, gstin: "27AAPFU0939F1ZV", email: null, phone: null }));
    expect(refresh).toHaveBeenCalled();
  });

  it("hands back the first problem on its field, with what was typed, and saves nothing", async () => {
    const state = await saveBillingDetailsAction({ status: "idle" }, form({ postalCode: "4000", city: "" }));
    expect(state).toMatchObject({ status: "error", field: "city", message: "Enter the city, in English letters.", values: { postalCode: "4000" } });
    expect(saveBillingProfile).not.toHaveBeenCalled();
  });
});
```

  Run `pnpm --filter @firstfold/platform exec vitest run "app/app-host/(protected)/billing/actions.test.ts"`. Expected: FAIL.

- [ ] **Step 2: The action.** Add to `billing/actions.ts` (keep the existing actions; add these imports):

```ts
import { saveBillingProfile, withTenantScope } from "@firstfold/db";
import { firstBillingDetailsProblem, parseBillingDetails } from "@firstfold/shared/lib/billing/billing-details-form";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";
import { refresh } from "next/cache";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { getAppDb } from "@/lib/server/db";
import { unexpectedErrorState } from "@/lib/server/panel-form-errors";

/**
 * Saves the business's billing details for its tax invoices, from Billing or from a plan's pay page. Open to listing
 * accounts and to one still buying its membership: writing one's own details needs only a signed-in member, and
 * row-level security keeps the write to that business. Details apply to invoices issued after this (D6). `refresh`
 * redraws whichever page the form sits on, so its facts and any prompt update in place.
 */
export async function saveBillingDetailsAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  const parsed = parseBillingDetails(formData);
  if (!parsed.ok) return panelFormErrorState(firstBillingDetailsProblem(parsed.errors), formData);
  try {
    await withTenantScope(getAppDb(), customer.tenant, (tx) =>
      saveBillingProfile(tx, { businessId: customer.tenant.businessId, ...parsed.details }),
    );
  } catch (error) {
    console.error("[billing] saveBillingDetailsAction failed", errorLogInfo(error));
    return unexpectedErrorState(error, formData);
  }
  refresh();
  return panelFormSavedState;
}
```

  Run the Step 1 test. Expected: PASS.

- [ ] **Step 3: What the card needs.** Create `apps/platform/lib/server/billing-details.ts`:

```ts
import "server-only";
import { findBillingProfile, getBusinessProfile, withTenantScope } from "@firstfold/db";
import { stateCodeOfIndiaPostName } from "@firstfold/db/india-states";
import { FALLBACK_PHONE_COUNTRY, type PhoneCountryOption } from "@firstfold/shared/lib/phone/fields";
import { phoneCountryOptions } from "@firstfold/shared/server/phone-countries";
import { savedPhoneStart } from "@firstfold/shared/server/phone-defaults";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb } from "./db";

/** What the form fields start with, all as text, so a client component can take it as props. */
export interface BillingDetailsStart {
  readonly legalName: string;
  readonly gstin: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly postalCode: string;
  readonly stateCode: string;
  readonly email: string;
  readonly phoneCountry: string;
  readonly phone: string;
}

/** The saved details as the card lists them. */
export interface SavedBillingDetails {
  readonly legalName: string;
  readonly gstin: string | null;
  readonly address: string;
  readonly stateCode: string;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface BillingDetailsView {
  /** Null until the customer saves details. */
  readonly saved: SavedBillingDetails | null;
  /** The saved details, or else the onboarding name and address, so the form rarely starts empty. */
  readonly start: BillingDetailsStart;
  readonly phoneCountries: readonly PhoneCountryOption[];
}

/** Whether this business is billed in rupees, the only invoices there are (D1). The plan is set for every INR business. */
function billsInRupees(customer: Pick<GrantedCustomer, "billing">): boolean {
  return customer.billing.plan?.currency === "INR";
}

/** Billing details for the card and the inline form, or null for a business that gets no tax invoices. */
export async function loadBillingDetailsView(customer: Pick<GrantedCustomer, "tenant" | "billing">): Promise<BillingDetailsView | null> {
  if (!billsInRupees(customer)) return null;
  const { tenant } = customer;
  const { profile, business } = await withTenantScope(getAppDb(), tenant, async (tx) => ({
    profile: await findBillingProfile(tx, tenant.businessId),
    business: await getBusinessProfile(tx),
  }));
  const phone = savedPhoneStart(profile?.phone ?? null);
  const region = business?.region ?? null;
  const fallbackState = region === null ? null : stateCodeOfIndiaPostName(region);
  return {
    saved:
      profile === null
        ? null
        : {
            legalName: profile.legalName,
            gstin: profile.gstin,
            address: [profile.addressLine1, profile.addressLine2, `${profile.city} ${profile.postalCode}`].filter((line): line is string => line !== null && line !== "").join(", "),
            stateCode: profile.stateCode,
            email: profile.email,
            phone: profile.phone,
          },
    start: {
      legalName: profile?.legalName ?? tenant.businessName,
      gstin: profile?.gstin ?? "",
      addressLine1: profile?.addressLine1 ?? business?.addressLine1 ?? "",
      addressLine2: profile?.addressLine2 ?? business?.addressLine2 ?? "",
      city: profile?.city ?? business?.city ?? "",
      postalCode: profile?.postalCode ?? business?.postalCode ?? "",
      stateCode: profile?.stateCode ?? fallbackState ?? "",
      email: profile?.email ?? "",
      phoneCountry: phone.country ?? FALLBACK_PHONE_COUNTRY,
      phone: phone.number,
    },
    phoneCountries: phoneCountryOptions(),
  };
}

/** True for a business billed in rupees that has given no billing details yet: the pay pages then prompt for them. */
export async function billingDetailsMissing(customer: Pick<GrantedCustomer, "tenant" | "billing">): Promise<boolean> {
  if (!billsInRupees(customer)) return false;
  const { tenant } = customer;
  return (await withTenantScope(getAppDb(), tenant, (tx) => findBillingProfile(tx, tenant.businessId))) === null;
}
```

  (`getBusinessProfile` reads the current tenant's onboarding profile; its `region`, `addressLine1`, `addressLine2`, `city`
  and `postalCode` are nullable strings.)

- [ ] **Step 4: The card** `apps/platform/components/panel/billing/billing-details.tsx`:

```tsx
"use client";

import { useState, type ReactElement } from "react";
import { INDIA_STATES } from "@firstfold/shared/lib/directory/india-states";
import { Button } from "@firstfold/shared/ui/panel/button";
import { SectionHeading, Surface } from "@firstfold/shared/ui/panel/surface";
import { PhoneField } from "@firstfold/shared/ui/phone-field";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";
import type { BillingDetailsView } from "@/lib/server/billing-details";

const LABEL = "block text-[0.8125rem] font-medium text-ink-soft";

interface BillingDetailsProps {
  readonly view: BillingDetailsView;
  readonly action: PanelFormAction;
  /** "card" on Billing; "inline" under a pay button, closed until opened. */
  readonly variant: "card" | "inline";
}

/** The billing details for GST invoices: what is saved, and the form to add or change them. */
export function BillingDetails({ view, action, variant }: BillingDetailsProps): ReactElement {
  const [editing, setEditing] = useState(view.saved === null && variant === "card");
  const form = <BillingDetailsForm view={view} action={action} />;
  if (variant === "inline") {
    return (
      <details className="rounded-control border border-line px-4 py-3 text-sm" open={editing} onToggle={(event) => setEditing(event.currentTarget.open)}>
        <summary className="cursor-pointer font-medium text-ink">Need a GST invoice in your company’s name? Add billing details</summary>
        <div className="mt-4">{form}</div>
      </details>
    );
  }
  return (
    <Surface labelledBy="billing-details">
      <SectionHeading id="billing-details">Billing details</SectionHeading>
      {view.saved === null ? (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Add your company’s details to get GST invoices in its name. They apply to invoices issued after you save them.
        </p>
      ) : (
        <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <Fact label="Billed to" value={view.saved.legalName} />
          <Fact label="GSTIN" value={view.saved.gstin ?? "Not registered"} />
          <Fact label="Address" value={view.saved.address} />
          <Fact label="State" value={INDIA_STATES.find((state) => state.code === view.saved?.stateCode)?.name ?? view.saved.stateCode} />
          <Fact
            label="Billing contact"
            value={[view.saved.email, view.saved.phone].filter((part): part is string => part !== null).join(", ") || "Your account email and number"}
          />
        </dl>
      )}
      {view.saved !== null ? (
        <Button type="button" size="sm" variant="secondary" className="mt-5" aria-expanded={editing} aria-controls="billing-details-form" onClick={() => setEditing(!editing)}>
          {editing ? "Close" : "Edit billing details"}
        </Button>
      ) : null}
      {editing ? <div id="billing-details-form" className="mt-6">{form}</div> : null}
    </Surface>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="mt-1 break-words text-ink">{value}</dd>
    </div>
  );
}

function BillingDetailsForm({ view, action }: { readonly view: BillingDetailsView; readonly action: PanelFormAction }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const { start } = view;
  const stateValue = controls.valueOf("stateCode", start.stateCode);
  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4">
      <TextField controls={controls} name="legalName" label="Legal name" start={start.legalName} maxLength={200} autoComplete="organization" />
      <TextField controls={controls} name="gstin" label="GSTIN" optional start={start.gstin} maxLength={15} autoCapitalize="characters" />
      <TextField controls={controls} name="addressLine1" label="Address line 1" start={start.addressLine1} maxLength={200} autoComplete="address-line1" />
      <TextField controls={controls} name="addressLine2" label="Address line 2" optional start={start.addressLine2} maxLength={200} autoComplete="address-line2" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField controls={controls} name="city" label="City" start={start.city} maxLength={100} autoComplete="address-level2" />
        <TextField controls={controls} name="postalCode" label="Pincode" start={start.postalCode} maxLength={6} inputMode="numeric" autoComplete="postal-code" />
      </div>
      <div>
        <label htmlFor="billing-stateCode" className={LABEL}>State</label>
        {/* A select honours defaultValue only on mount, so a refused save remounts it with what was chosen. */}
        <select key={stateValue} id="billing-stateCode" name="stateCode" defaultValue={stateValue} className={FIELD_CLASSES} {...controls.fieldStatus("stateCode")}>
          <option value="">Choose your state</option>
          {INDIA_STATES.map((state) => (
            <option key={state.code} value={state.code}>{state.name}</option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-ink">Billing contact</legend>
        <TextField
          controls={controls}
          name="email"
          label="Billing email"
          optional
          type="email"
          start={start.email}
          maxLength={254}
          autoComplete="email"
          hint="Where invoices and billing questions go. Leave it blank to use your account email."
        />
        <div>
          <label htmlFor="billing-phone" className={LABEL}>
            Phone <span className="font-normal">(optional)</span>
          </label>
          <PhoneField
            id="billing-phone"
            countries={view.phoneCountries}
            country={controls.valueOf("phoneCountry", start.phoneCountry)}
            defaultCountry="IN"
            number={controls.valueOf("phone", start.phone)}
            size="compact"
            numberStatus={controls.fieldStatus("phone")}
            countryStatus={controls.fieldStatus("phoneCountry")}
            className="mt-1.5"
          />
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="sm" disabled={controls.isPending} aria-busy={controls.isPending}>
          {controls.isPending ? "Saving…" : "Save billing details"}
        </Button>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
      <p className="text-xs text-ink-soft">Invoices issued after you save use these details. Issued invoices stay as they are.</p>
    </form>
  );
}

interface TextFieldProps {
  readonly controls: ReturnType<typeof usePanelForm>["controls"];
  readonly name: string;
  readonly label: string;
  readonly start: string;
  readonly maxLength: number;
  readonly optional?: boolean;
  readonly hint?: string;
  readonly type?: "text" | "email";
  readonly inputMode?: "numeric";
  readonly autoComplete?: string;
  readonly autoCapitalize?: "characters";
}

function TextField({ controls, name, label, start, maxLength, optional = false, hint, type = "text", inputMode, autoComplete, autoCapitalize }: TextFieldProps): ReactElement {
  const id = `billing-${name}`;
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const status = controls.fieldStatus(name);
  const describedBy = [status["aria-describedby"], hintId].filter((part): part is string => part !== undefined).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} {optional ? <span className="font-normal">(optional)</span> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        maxLength={maxLength}
        defaultValue={controls.valueOf(name, start)}
        className={FIELD_CLASSES}
        {...(inputMode === undefined ? {} : { inputMode })}
        {...(autoComplete === undefined ? {} : { autoComplete })}
        {...(autoCapitalize === undefined ? {} : { autoCapitalize })}
        aria-invalid={status["aria-invalid"]}
        aria-describedby={describedBy}
      />
      {hint === undefined ? null : <p id={hintId} className="mt-1.5 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}
```

  Errors show in `PanelFormStatus` (the one live region), focus moves to the field (`usePanelForm`), the field is
  `aria-invalid` and described by the message. At 375 px every field is one column; check the GSTIN and phone fields do
  not overflow. If `ReturnType<typeof usePanelForm>["controls"]` reads poorly, import `PanelFormControls` from
  `panel-form.tsx` instead (it is exported).

- [ ] **Step 5: The prompt** `apps/platform/components/panel/billing/billing-details-prompt.tsx`:

```tsx
import Link from "next/link";
import type { ReactElement } from "react";

/** One line above a pay button for a business billed in rupees that has given no billing details yet. */
export function BillingDetailsPrompt(): ReactElement {
  return (
    <p className="text-sm leading-relaxed text-ink-soft">
      Need a GST invoice in your company’s name?{" "}
      <Link href="/billing#billing-details" className="link-underline text-ink">
        Add your billing details
      </Link>{" "}
      before you pay.
    </p>
  );
}
```

- [ ] **Step 6: Place them.**
  - `billing/page.tsx`: after `requireCustomerAccess`, `const billingDetails = await loadBillingDetailsView(customer);` and
    render `{billingDetails === null ? null : <div className="mt-8"><BillingDetails view={billingDetails} action={saveBillingDetailsAction} variant="card" /></div>}`
    in every branch: the listing account branch above `MonthlyBilling`; both unpaid branches (under "What happens next" and
    under "How paying works", inside their `max-w-2xl` column); and the main branch between the plan block (the
    `<div className="mt-8">` that holds `PlanSummary` or `ReactivatePlan`) and the `MonthlyBilling` block. A lapsed customer
    sees it above Monthly billing and below the restart card, on the same page as the restart button, so no prompt is
    needed on Billing itself.
  - `onboarding/review/page.tsx`: compute `const askForBillingDetails = await billingDetailsMissing({ tenant, billing });`
    beside the other reads, pass it into `PaymentPanel` as a new prop `askForBillingDetails: boolean`, and in the
    `pay-and-send` and `pay` cases render `{askForBillingDetails ? <BillingDetailsPrompt /> : null}` directly above
    `ReviewSubmitForm`. An unpaid website client can open Billing, so the link works.
  - `upgrade/page.tsx`: `const askForBillingDetails = await billingDetailsMissing(customer);` and render the prompt above
    `UpgradePayForm` when not `waiting` and `!quote.free`.
  - `components/panel/membership/membership-page.tsx`: this page is the only one an account buying its membership can
    open. Load `const billingDetails = await loadBillingDetailsView({ tenant, billing });` and render
    `{billingDetails !== null && billingDetails.saved === null ? <BillingDetails view={billingDetails} action={saveBillingDetailsAction} variant="inline" /> : null}`
    directly above `MembershipPayForm`.
  - Charges are paid from Billing's own Pay buttons, where the card already is; the charge pay page
    (`billing/charges/[chargeId]/pay`) opens Razorpay at once and gets nothing.

- [ ] **Step 7: Check it in the browser.** Follow the dev server policy, sign in as a local test owner (see
  `../local-test-logins.txt`), open Billing: save details without a GSTIN, then with `27AAPFU0939F1ZV` and state Karnataka
  (expect the state error on the State field, focus there, your typing kept), then Maharashtra (expect "Saved." and the
  facts). Check the prompt on Check and send before details exist and gone after; the inline form on the Premium page for
  a listing account. Repeat at 375 px.

- [ ] **Step 8: Run** `pnpm --filter @firstfold/platform test && pnpm --filter @firstfold/platform lint && pnpm --filter @firstfold/platform typecheck`. Expected: PASS.

- [ ] **Step 9: Commit** "Let customers give their billing details for GST invoices, from Billing and before they pay"

### Task 14A: Payment method section on Billing

**Files:** Modify `packages/db/src/queries/billing.ts`, `packages/db/src/index.ts`, `apps/platform/app/app-host/(protected)/billing/page.tsx`;
Create `apps/platform/components/panel/billing/payment-method.tsx`; Test `packages/db/src/billing.integration.test.ts`

Customers cannot see today how they pay us: `findLatestPaymentMethod` exists and nothing calls it, and it skips bank
transfers. Changing the card is not built (D13).

- [ ] **Step 1: Test first.** In `packages/db/src/billing.integration.test.ts`, beside the `findLatestPaymentMethod` tests
  (they seed `businessA` and `businessB` and a `VISA` method; reuse those helpers), add a `describe("findCurrentPaymentMethod")`
  with three tests: a business whose newest captured payment is a card renewal after an older bank transfer gets
  `{ provider, method: "card", cardLast4: ... }` of the card; a business with only a staff-recorded bank transfer (provider
  `manual`, `manualReference` set) gets `provider: "manual"` and that reference; a business with only a failed payment
  gets null. Read each through `withTenantScope(dbs.app.db, ...)` as the existing tests do, so row-level security is
  exercised. Run the file. Expected: FAIL, function not found.

- [ ] **Step 2: The query.** Add to `packages/db/src/queries/billing.ts`, after `findLatestPaymentMethod` (`or` and
  `isNotNull` are already imported):

```ts
/** How the business pays now, for Billing's Payment method section. The fields paymentLabel reads, and when. */
export interface CurrentPaymentMethod {
  readonly provider: Payment["provider"];
  readonly method: string | null;
  readonly cardNetwork: string | null;
  readonly cardLast4: string | null;
  readonly cardType: string | null;
  readonly cardIssuer: string | null;
  readonly upiVpa: string | null;
  readonly manualReference: string | null;
  readonly paidAt: Date | null;
}

/**
 * The newest captured payment that says how it was made (a provider method, or a bank transfer staff recorded), or null
 * before the first. Works through row-level security.
 */
export async function findCurrentPaymentMethod(db: Runner, businessId: string): Promise<CurrentPaymentMethod | null> {
  const rows = await db
    .select({ ...PAYMENT_METHOD_COLUMNS, provider: payments.provider, manualReference: payments.manualReference, paidAt: payments.paidAt })
    .from(payments)
    .where(and(eq(payments.businessId, businessId), eq(payments.status, "captured"), or(isNotNull(payments.method), eq(payments.provider, "manual"))))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(1);
  return rows[0] ?? null;
}
```

  Export `findCurrentPaymentMethod` and `type CurrentPaymentMethod` from `packages/db/src/index.ts`, beside
  `findLatestPaymentMethod`. Run the test. Expected: PASS. The shape fits `PaymentMethodFacts`, so `paymentLabel` takes it
  as it is.

- [ ] **Step 3: The section** `apps/platform/components/panel/billing/payment-method.tsx` (server component; invoke
  `design-taste-frontend` and follow `apps/platform/DESIGN.md` first):

```tsx
import type { CurrentPaymentMethod } from "@firstfold/db";
import type { ReactElement, ReactNode } from "react";
import { paymentLabel } from "@firstfold/shared/lib/billing/payment-method";
import { SectionHeading, Surface } from "@firstfold/shared/ui/panel/surface";

interface PaymentMethodProps {
  readonly method: CurrentPaymentMethod;
  /** The plan renews by itself at the provider (a live, provider-billed subscription with no cancellation asked for). */
  readonly renews: boolean;
  /** The support address as a mailto link (the page's EmailUs). */
  readonly emailUs: ReactNode;
}

/** How the customer pays, in the words the invoice uses. Only what a merchant is shown: never more than four digits. */
export function PaymentMethod({ method, renews, emailUs }: PaymentMethodProps): ReactElement {
  const label = paymentLabel(method);
  return (
    <Surface>
      <SectionHeading>Payment method</SectionHeading>
      {method.provider === "manual" ? (
        <div className="mt-4 space-y-2 text-sm leading-relaxed">
          <p>You pay us by bank transfer. We record each payment when it reaches us.</p>
          {method.manualReference === null ? null : <p className="text-ink-soft">Last reference: {method.manualReference}</p>}
        </div>
      ) : renews ? (
        <div className="mt-4 space-y-2 text-sm leading-relaxed">
          <p className="break-words text-[0.9375rem] font-medium text-ink">{label}</p>
          <p>Your plan renews on this automatically through Razorpay.</p>
          <p className="text-ink-soft">To pay with a different card or UPI, email us at {emailUs} and we’ll send you a secure Razorpay link to switch.</p>
        </div>
      ) : (
        <p className="mt-4 break-words text-sm leading-relaxed">You last paid with {label}. You choose how to pay each time.</p>
      )}
    </Surface>
  );
}
```

- [ ] **Step 4: Place it.** In `billing/page.tsx`, read the method once through the tenant scope beside the other reads:
  `const paymentMethod = await withTenantScope(getAppDb(), tenant, (tx) => findCurrentPaymentMethod(tx, tenant.businessId));`
  (or add a `findCustomerPaymentMethod(customer)` helper beside `listCustomerReceipts` in `lib/server/billing.ts` and call
  that). `renews` is
  `billing.status === "paid" && subscription !== null && subscription.provider !== "manual" && subscription.cancelRequestedAt === null`.
  Render `{paymentMethod === null ? null : <div className="mt-8"><PaymentMethod method={paymentMethod} renews={renews} emailUs={<EmailUs />} /></div>}`
  immediately before the Billing details card in the main branch and in the listing branch (with `renews={false}`). Order
  on a paying client's page: Plan, Payment method, Billing details, Monthly billing.

- [ ] **Step 5: Check it in the browser** with the fake provider: after a test payment the section shows what the fake
  provider recorded (or nothing, if it records no method); after staff record a bank transfer it shows the transfer.
  Check 375 px width: the label wraps, nothing overflows.

- [ ] **Step 6: Run** `pnpm --filter @firstfold/platform lint && pnpm --filter @firstfold/platform typecheck && pnpm --filter @firstfold/db typecheck && pnpm test:integration`.
  Expected: PASS.

- [ ] **Step 7: Commit** "Show customers how they pay on Billing"

---

## Phase 5: The PDF

### Task 15: Fonts and the logo

**Files:** Create `packages/shared/assets/invoice-fonts/` (4 TTFs and 2 licences),
`packages/shared/scripts/embed-invoice-fonts.mjs`, generated `packages/shared/src/server/tax-invoice-fonts.generated.ts`,
`packages/shared/src/server/tax-invoice-wordmark.ts`; Modify `packages/shared/package.json`, `pnpm-lock.yaml`

Decision on size (D9): the three static Hanken Grotesk weights from Google Fonts are about 57 KB each, so the generated
module is about 230 KB of base64. Only `tax-invoice-pdf.ts` imports it, and only the customer download route and the
staff download route import that, so it lands in those two server chunks alone, never in a client bundle
(`server-only`), and costs a few milliseconds to parse on a cold start. With `subset: true` a one-invoice PDF is about
26 KB. Reading the TTFs from disk at runtime was rejected (it needs file tracing in two Next apps and behaves differently
in Vitest); fetching them was rejected (a network dependency for a legal document).

- [ ] **Step 1: Dependencies.** `pnpm --filter @firstfold/shared add pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1` (pdf-lib at
  the version the platform app already pins). Both apps already transpile `@firstfold/shared`; pnpm resolves the new
  packages from `packages/shared`, so the apps need no change. If `next build` ever complains about `@pdf-lib/fontkit`,
  add it to `serverExternalPackages` in that app's `next.config.ts`.

- [ ] **Step 2: Fetch static TTFs.** The CSS API serves static instances to a plain user agent (checked 2026-10-09: four
  `.ttf` URLs, none of them variable):

```bash
cd packages/shared/assets && mkdir -p invoice-fonts && cd invoice-fonts
curl -s -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&family=Noto+Sans:wght@600" | grep -o "https://[^)]*\.ttf"
```

  Download the four in the order printed as `HankenGrotesk-Regular.ttf`, `HankenGrotesk-SemiBold.ttf`,
  `HankenGrotesk-Bold.ttf` and `NotoSans-SemiBold.ttf`, then the licences:
  `curl -sSLo OFL-HankenGrotesk.txt https://github.com/google/fonts/raw/main/ofl/hankengrotesk/OFL.txt` and
  `curl -sSLo OFL-NotoSans.txt https://github.com/google/fonts/raw/main/ofl/notosans/OFL.txt`. Both fonts are SIL Open
  Font License 1.1, which allows embedding in documents; keep the licence files beside the fonts. If the API ever serves
  a variable file, make static instances from the variable font instead:
  `uvx --from fonttools fonttools varLib.instancer "HankenGrotesk[wght].ttf" wght=400 -o HankenGrotesk-Regular.ttf`
  (and 600, 700; Noto Sans with `wght=600 wdth=100`).

- [ ] **Step 3: The embed script** `packages/shared/scripts/embed-invoice-fonts.mjs`:

```js
// Writes src/server/tax-invoice-fonts.generated.ts: the invoice's three Hanken Grotesk weights as base64, and the
// rupee sign as a vector path taken from Noto Sans, because Hanken Grotesk has no rupee glyph (checked 2026-10-09).
// Run after changing a font: node packages/shared/scripts/embed-invoice-fonts.mjs
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontDir = join(root, "assets", "invoice-fonts");
const weights = { regular: "HankenGrotesk-Regular.ttf", semibold: "HankenGrotesk-SemiBold.ttf", bold: "HankenGrotesk-Bold.ttf" };

const out = [
  "// Generated by scripts/embed-invoice-fonts.mjs from assets/invoice-fonts (SIL Open Font License 1.1). Do not edit.",
  "",
];
for (const [name, file] of Object.entries(weights)) {
  const bytes = readFileSync(join(fontDir, file));
  const font = fontkit.create(bytes);
  if (Object.keys(font.variationAxes ?? {}).length > 0) throw new Error(`${file} is a variable font; use a static instance`);
  // Every printable ASCII character: the billing details form accepts exactly these, so every name prints.
  for (let code = 0x20; code < 0x7f; code += 1) {
    if (!font.hasGlyphForCodePoint(code)) throw new Error(`${file} cannot print "${String.fromCharCode(code)}"`);
  }
  out.push(`export const HANKEN_${name.toUpperCase()} = "${bytes.toString("base64")}";`);
}

const noto = fontkit.create(readFileSync(join(fontDir, "NotoSans-SemiBold.ttf")));
if (!noto.hasGlyphForCodePoint(0x20b9)) throw new Error("Noto Sans has no rupee glyph");
const rupee = noto.glyphForCodePoint(0x20b9);
// Font units are y-up with the baseline at 0. pdf-lib's drawSvgPath reads SVG (y-down) and flips it, so the path is
// flipped here once: drawn at a baseline y, the sign then sits on that baseline.
out.push(`export const RUPEE_PATH = "${rupee.path.scale(1, -1).toSVG()}";`);
out.push(`export const RUPEE_ADVANCE = ${rupee.advanceWidth};`);
out.push(`export const RUPEE_UNITS_PER_EM = ${noto.unitsPerEm};`);
writeFileSync(join(root, "src", "server", "tax-invoice-fonts.generated.ts"), `${out.join("\n")}\n`);
console.log("wrote src/server/tax-invoice-fonts.generated.ts");
```

  Run `node packages/shared/scripts/embed-invoice-fonts.mjs` from the repo root. Expected: "wrote
  src/server/tax-invoice-fonts.generated.ts" (about 230 KB). It refuses a variable font and a font missing any printable
  ASCII character, which is the promise Task 13's form relies on. Commit the generated file; it changes only when a font
  does.

- [ ] **Step 4: The wordmark.** `../invoice-design/wordmark.json` holds `viewbox` ("0 0 811.3 180.2") and `paths`
  (14 strings: the letters and the rings of the "o"). From `firstfold-platform`, write the module with:

```bash
node -e '
const fs = require("fs");
const w = JSON.parse(fs.readFileSync("../invoice-design/wordmark.json", "utf8"));
if (w.paths.length !== 14) throw new Error(`expected 14 paths, found ${w.paths.length}`);
const body = [
  "/** The Firstfold wordmark from the approved invoice design (invoice-design/wordmark.json), as SVG paths in its viewBox. */",
  "export const WORDMARK_WIDTH = 811.3;",
  "export const WORDMARK_HEIGHT = 180.2;",
  "export const WORDMARK_PATHS: readonly string[] = [",
  ...w.paths.map((path) => `  ${JSON.stringify(path)},`),
  "];",
  "",
].join("\n");
fs.writeFileSync("packages/shared/src/server/tax-invoice-wordmark.ts", body);
'
```

- [ ] **Step 5: Run** `pnpm --filter @firstfold/shared typecheck`. Expected: PASS.

- [ ] **Step 6: Commit** "Embed Hanken Grotesk and the rupee sign for invoice PDFs"

### Task 16: The renderer

**Files:** Create `packages/shared/src/server/tax-invoice-pdf.ts`; Test `packages/shared/src/server/tax-invoice-pdf.test.ts`

The code below was compiled under this repo's strict settings (`noUncheckedIndexedAccess` included) and rendered against
the four approved samples on 2026-10-09; the positions are the template's CSS converted to points and checked against
`../Firstfold-invoice-samples.pdf` pages 2 to 5 (facts columns at 39.7, 156.3 and 248.6 pt; right column at 74 mm; table
columns 16, 9, 20, 20, 23, 11 and 20 mm; declaration and footer rule within a point of the samples). Behaviour beyond the
samples:

- Text is wrapped to its column, and a word too long for its column is broken, so a long legal name, address, charge
  description or bank reference never runs into the next column.
- A character the font lacks prints as "?" instead of an empty box. This is only a last defence: the issuer refuses a
  name or address it cannot print (Task 12A Step 6), and billing details never contain one (Task 13).
- One line, which is every invoice Firstfold issues today, always fits one page. If lines ever do not fit (up to 8 are
  allowed), they carry on to a continuation page with the letterhead marked "Continued" and the invoice number; the totals
  and declaration end the invoice, and every page of it says "Page n of N".
- Dates print as "09 Oct 2026" and "Sep" (not en-GB's "Sept"), like the line's service period.
- The Amount paid box prints "<payment label>, <date paid>" (the samples show a shorter "Visa ending 4366"; the stored
  label is the full one); a label too long for the box prints "Paid <date>" instead. The Payment block prints the full
  label and the day paid (`paidOn`, Task 12A), which differs from the invoice date for an invoice staff issued later.
- The supplier block prints the snapshot's supplier; only the footer's contact line reads today's `businessDetails`.

- [ ] **Step 1: Write the test**

```ts
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import type { TaxInvoice, TaxInvoiceLineRecord } from "@firstfold/db";
import { renderTaxInvoicesPdf } from "./tax-invoice-pdf";

vi.mock("server-only", () => ({}));

const line: TaxInvoiceLineRecord = {
  description: "Firstfold Premium plan",
  detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
  note: "Coupon GAURAV applied, 20% off",
  sac: "998361",
  quantity: 1,
  unitAmountCents: 699_900,
  grossAmountCents: 699_900,
  discountAmountCents: 139_980,
  taxableCents: 559_920,
  taxRateBasisPoints: 1_800,
  cgstCents: 50_393,
  sgstCents: 50_393,
  igstCents: 0,
  taxCents: 100_786,
};

const invoice: TaxInvoice = {
  id: "01920000-0000-7000-8000-000000000001",
  businessId: "01920000-0000-7000-8000-0000000000b1",
  paymentId: "01920000-0000-7000-8000-0000000000a1",
  prefix: "FF",
  financialYear: "26-27",
  serial: 1,
  number: "FF/26-27/000001",
  issuedOn: "2026-10-09",
  paidOn: "2026-10-09",
  supplier: {
    legalName: "Digibranders Private Limited",
    tradeName: "Firstfold",
    gstin: "27AAICD9268J1Z0",
    cin: "U72900MH2021PTC372344",
    addressLines: ["Office No. 2617, 26th Floor, Solus Building,", "Hiranandani Estate, Ghodbunder Road,", "Thane West, Maharashtra 400607, India"],
    stateCode: "mh",
    email: "support@firstfold.io",
    phone: "+91 789 789 6607",
  },
  recipient: {
    legalName: "QA Premium Business",
    tradeName: null,
    gstin: "27AAPFU0939F1ZV",
    cin: null,
    addressLines: ["Shop 4, Gokul Arcade, LBS Marg,", "Mulund West, Mumbai 400080"],
    stateCode: "mh",
    email: null,
    phone: null,
  },
  placeOfSupplyStateCode: "mh",
  placeOfSupplyBasis: "gstin",
  supplyType: "intra_state",
  lines: [line],
  taxableCents: 559_920,
  cgstCents: 50_393,
  sgstCents: 50_393,
  igstCents: 0,
  roundOffCents: 0,
  totalCents: 660_706,
  paymentLabel: "Visa credit card ending 4366",
  paymentReference: "pay_TljxffN6THodkg",
  createdAt: new Date("2026-10-09T06:00:00Z"),
};

async function pages(invoices: readonly TaxInvoice[]): Promise<PDFDocument> {
  return PDFDocument.load(await renderTaxInvoicesPdf(invoices));
}

describe("renderTaxInvoicesPdf", () => {
  it("draws each invoice on its own A4 page", async () => {
    const pdf = await pages([invoice, { ...invoice, serial: 2, number: "FF/26-27/000002" }]);
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
    expect(pdf.getTitle()).toBe("Firstfold tax invoices");
  });

  it("names a single invoice in the document title", async () => {
    expect((await pages([invoice])).getTitle()).toBe("Tax invoice FF/26-27/000001");
  });

  it("links the supplier's email, the footer's email and the website", async () => {
    const pdf = await pages([invoice]);
    expect(pdf.getPage(0).node.Annots()?.size()).toBe(3);
  });

  it("prints a name the font cannot draw, a staff-issued date and a long bank reference without failing", async () => {
    const pdf = await pages([
      {
        ...invoice,
        recipient: { ...invoice.recipient, legalName: "क्यूए प्रीमियम Clinic", gstin: null },
        placeOfSupplyBasis: "billing_address",
        paidOn: "2026-09-30",
        paymentLabel: "Bank transfer, reference NEFT 0921 HDFC0000123 UTR 4419920019 for September and October",
      },
    ]);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("carries lines that do not fit on to a continuation page of the same invoice", async () => {
    const long = "Sri Venkateswara Multispeciality Dental and Orthodontic Clinic and Research Centre Private Limited";
    const pdf = await pages([{ ...invoice, lines: Array.from({ length: 8 }, () => ({ ...line, description: long, note: "Coupon GAURAV applied, 20% off. Stay offer applied" })) }]);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("refuses to render nothing", async () => {
    await expect(renderTaxInvoicesPdf([])).rejects.toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @firstfold/shared exec vitest run src/server/tax-invoice-pdf.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `packages/shared/src/server/tax-invoice-pdf.ts`:

```ts
import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { amountInWords } from "@firstfold/billing/amount-in-words";
import { gstStateCodeOf } from "@firstfold/billing/gst-states";
import type { TaxInvoice, TaxInvoiceLineRecord } from "@firstfold/db";
import { stateName } from "@firstfold/db/india-states";
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { businessDetails } from "../lib/site-config";
import { HANKEN_BOLD, HANKEN_REGULAR, HANKEN_SEMIBOLD, RUPEE_ADVANCE, RUPEE_PATH, RUPEE_UNITS_PER_EM } from "./tax-invoice-fonts.generated";
import { WORDMARK_HEIGHT, WORDMARK_PATHS } from "./tax-invoice-wordmark";

/**
 * Tax invoices as A4 PDFs in the approved design (invoice-design/invoice-template.html and the CA samples), drawn from
 * the stored snapshot only, so a PDF made years later says exactly what the invoice said when it was issued (D2, D10).
 * Positions are the template's CSS converted to points (1 mm = 2.8346 pt) and checked against the samples PDF.
 */

const MM = 2.8346;
const PAGE = { width: 595.28, height: 841.89 } as const;
const LEFT = 14 * MM;
const RIGHT = PAGE.width - 14 * MM;
const TOP = PAGE.height - 13 * MM;
const BOTTOM = 11 * MM;
/** The shared right-hand column (74 mm): Amount paid, Billed to and the totals all start here. */
const RIGHT_COLUMN = RIGHT - 74 * MM;
/** The facts row's three columns: the template's grid of 1.3fr 1fr 1.2fr with 4 mm gaps, left of the right column. */
const FACT_FR = (RIGHT_COLUMN - LEFT - 8 * MM) / 3.5;
const FACT_COLUMNS = [LEFT, LEFT + 1.3 * FACT_FR + 4 * MM, LEFT + 2.3 * FACT_FR + 8 * MM] as const;
/** Where the declaration starts: nothing else may be drawn below this line. */
const FOOTER_TOP = BOTTOM + 86;

const INK = rgb(0x2a / 255, 0x0d / 255, 0x10 / 255);
const INK_SOFT = rgb(0x5e / 255, 0x3a / 255, 0x40 / 255);
const ACCENT = rgb(0x63 / 255, 0x00 / 255, 0x1e / 255);
const RULE = rgb(0xe2 / 255, 0xd2 / 255, 0xc1 / 255);
const TINT = rgb(0xfa / 255, 0xf5 / 255, 0xef / 255);

/** Gate 5: the CA confirms this wording. */
export const DECLARATION_LINES = [
  "Tax is not payable on reverse charge.",
  "The subscription renews monthly until cancelled. A refund is issued against a credit note that quotes this invoice number.",
  "This is a computer generated invoice and does not need a signature.",
] as const;

interface Fonts {
  readonly regular: PDFFont;
  readonly semibold: PDFFont;
  readonly bold: PDFFont;
}

type Align = "left" | "right";

const AMOUNT = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// en-US parts put together by hand: en-GB writes September as "Sept", and the template writes "Sep".
const DATE_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

/** 660706 paise as "6,607.06", grouped the Indian way (1,23,456.00). */
function money(cents: number): string {
  return AMOUNT.format(cents / 100);
}

/** "2026-10-09" as "09 Oct 2026". The stored dates are already Indian calendar dates. */
function longDate(isoDate: string): string {
  const parts = Object.fromEntries(DATE_PARTS.formatToParts(new Date(`${isoDate}T00:00:00Z`)).map((part) => [part.type, part.value]));
  return `${parts.day ?? ""} ${parts.month ?? ""} ${parts.year ?? ""}`;
}

/** "Maharashtra (27)": the place of supply as Rule 46 asks for it, the state's name and its GST code. */
function stateWithCode(stateCode: string): string {
  return `${stateName(stateCode) ?? stateCode} (${gstStateCodeOf(stateCode)})`;
}

/** 1800 basis points as "18", 900 as "9", 1250 as "12.5". */
function percent(basisPoints: number): string {
  const hundredths = basisPoints % 100;
  const whole = Math.floor(basisPoints / 100);
  return hundredths === 0 ? String(whole) : `${whole}.${String(hundredths).padStart(2, "0").replace(/0$/, "")}`;
}

/**
 * Text the font can draw. Billing details are printable ASCII only (parseBillingDetails), but a business name from
 * onboarding or a charge description staff typed may hold anything; a character the font lacks prints as "?" rather
 * than as an empty box.
 */
function printable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && supported.has(codePoint) ? character : "?";
  }).join("");
}

/** Draws one line of text and returns its width. `x` is the right edge when `align` is "right". */
function text(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, color: RGB = INK, align: Align = "left"): number {
  const safe = printable(value, font);
  const width = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: align === "right" ? x - width : x, y, size, font, color });
  return width;
}

/** Letter-spaced capitals (the template's labels): drawn one character at a time, `tracking` in em. Returns the width. */
function spaced(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, tracking: number, color: RGB, align: Align = "left"): number {
  const characters = Array.from(value.toUpperCase());
  const gap = size * tracking;
  const width = characters.reduce((sum, character) => sum + font.widthOfTextAtSize(character, size) + gap, -gap);
  let cursor = align === "right" ? x - width : x;
  for (const character of characters) {
    page.drawText(character, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(character, size) + gap;
  }
  return width;
}

function label(page: PDFPage, value: string, x: number, y: number, fonts: Fonts, align: Align = "left"): number {
  return spaced(page, value, x, y, fonts.semibold, 7.4, 0.08, INK_SOFT, align);
}

/**
 * Breaks text into lines no wider than `maxWidth`: on spaces, and inside a word only when the word alone is too wide
 * (a long legal name or a reference with no spaces), so nothing ever runs past its column.
 */
function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of printable(value, font).split(/\s+/).filter((part) => part !== "")) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== "") lines.push(current);
    let rest = word;
    while (rest.length > 1 && font.widthOfTextAtSize(rest, size) > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current !== "") lines.push(current);
  return lines;
}

/** "₹6,607.06" with its right edge at x: the figure in Hanken Grotesk, the sign as a vector path from Noto Sans. */
function rupees(page: PDFPage, cents: number, x: number, y: number, font: PDFFont, size: number, color: RGB = ACCENT): void {
  const figure = money(cents);
  const figureWidth = font.widthOfTextAtSize(figure, size);
  const scale = size / RUPEE_UNITS_PER_EM;
  page.drawText(figure, { x: x - figureWidth, y, size, font, color });
  page.drawSvgPath(RUPEE_PATH, { x: x - figureWidth - RUPEE_ADVANCE * scale, y, scale, color });
}

/** A clickable area over text already drawn: `mailto:` or a web address. */
function link(doc: PDFDocument, page: PDFPage, uri: string, x: number, y: number, width: number, size: number): void {
  const annotation = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y - size * 0.25, x + width, y + size],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(uri) },
    }),
  );
  page.node.addAnnot(annotation);
}

/** A rectangle with rounded corners as SVG path data, its top-left corner at the origin (drawSvgPath's y runs down). */
function roundedRect(width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return `M${r} 0H${width - r}Q${width} 0 ${width} ${r}V${height - r}Q${width} ${height} ${width - r} ${height}H${r}Q0 ${height} 0 ${height - r}V${r}Q0 0 ${r} 0Z`;
}

/** The letterhead: the wordmark on the left, "TAX INVOICE" on the right, both resting on one line. Returns the y below. */
function header(page: PDFPage, fonts: Fonts, continued: boolean): number {
  const logoHeight = 9.5 * MM;
  const headBottom = TOP - 34;
  const scale = logoHeight / WORDMARK_HEIGHT;
  for (const path of WORDMARK_PATHS) page.drawSvgPath(path, { x: LEFT, y: headBottom + logoHeight, scale, color: ACCENT });
  spaced(page, "Tax invoice", RIGHT, TOP - 15.5, fonts.bold, 19, 0.04, ACCENT, "right");
  spaced(page, continued ? "Continued" : "Original for recipient", RIGHT, TOP - 31, fonts.semibold, 7.6, 0.1, INK_SOFT, "right");
  return headBottom - 6 * MM;
}

/** Invoice number, date and place of supply, with the amount paid in the tinted right column. Returns the y below. */
function facts(page: PDFPage, invoice: TaxInvoice, top: number, fonts: Fonts): number {
  const height = 63.4;
  page.drawRectangle({ x: RIGHT_COLUMN, y: top - height, width: RIGHT - RIGHT_COLUMN, height, color: TINT });
  page.drawLine({ start: { x: RIGHT_COLUMN, y: top }, end: { x: RIGHT_COLUMN, y: top - height }, thickness: 0.5, color: RULE });
  page.drawLine({ start: { x: LEFT, y: top }, end: { x: RIGHT, y: top }, thickness: 1.2, color: ACCENT });
  page.drawLine({ start: { x: LEFT, y: top - height }, end: { x: RIGHT, y: top - height }, thickness: 0.5, color: RULE });
  const entries = [
    ["Invoice number", invoice.number],
    ["Invoice date", longDate(invoice.issuedOn)],
    ["Place of supply", stateWithCode(invoice.placeOfSupplyStateCode)],
  ] as const;
  entries.forEach(([name, value], index) => {
    const x = FACT_COLUMNS[index] ?? LEFT;
    label(page, name, x, top - 15, fonts);
    text(page, value, x, top - 31, fonts.semibold, 9.6);
  });

  const inner = RIGHT - 3 * MM;
  const badgeText = "PAID";
  const badgeTracking = 7 * 0.12;
  const badgeTextWidth = Array.from(badgeText).reduce((sum, character) => sum + fonts.bold.widthOfTextAtSize(character, 7) + badgeTracking, -badgeTracking);
  const badge = { width: badgeTextWidth + 3.6 * MM, height: 11.5 };
  page.drawSvgPath(roundedRect(badge.width, badge.height, 1 * MM), {
    x: inner - badge.width,
    y: top - 9.4,
    borderColor: ACCENT,
    borderWidth: 1,
  });
  spaced(page, badgeText, inner - 1.8 * MM, top - 18, fonts.bold, 7, 0.12, ACCENT, "right");
  label(page, "Amount paid", inner - badge.width - 2 * MM, top - 16.6, fonts, "right");
  rupees(page, invoice.totalCents, inner, top - 37.4, fonts.bold, 15);
  // "Visa credit card ending 4366, 09 Oct 2026", or just the date when a long bank reference would not fit the column.
  const via = `${invoice.paymentLabel}, ${longDate(invoice.paidOn)}`;
  const viaWidth = fonts.regular.widthOfTextAtSize(printable(via, fonts.regular), 7.8);
  text(page, viaWidth <= inner - RIGHT_COLUMN - 5 * MM ? via : `Paid ${longDate(invoice.paidOn)}`, inner, top - 49.7, fonts.regular, 7.8, INK_SOFT, "right");
  return top - height;
}

/** Supplier on the left, the customer in the right column. Returns the y below the taller of the two. */
function parties(page: PDFPage, doc: PDFDocument, invoice: TaxInvoice, top: number, fonts: Fonts): number {
  const supplier = invoice.supplier;
  const leftWidth = RIGHT_COLUMN - 6 * MM - LEFT;
  let left = top - 23.8;
  label(page, "Supplier", LEFT, left, fonts);
  left -= 16.5;
  for (const part of wrap(supplier.legalName, fonts.bold, 10.2, leftWidth)) {
    text(page, part, LEFT, left, fonts.bold, 10.2);
    left -= 14.4;
  }
  if (supplier.tradeName !== null) {
    text(page, `Trading as ${supplier.tradeName}`, LEFT, left, fonts.semibold, 9, ACCENT);
    left -= 15.9;
  }
  for (const line of supplier.addressLines) {
    for (const part of wrap(line, fonts.regular, 9, leftWidth)) {
      text(page, part, LEFT, left, fonts.regular, 9);
      left -= 13;
    }
  }
  left -= 3.6;
  for (const [name, value] of [["GSTIN", supplier.gstin], ["CIN", supplier.cin]] as const) {
    if (value === null) continue;
    const width = text(page, name, LEFT, left, fonts.semibold, 9);
    text(page, value, LEFT + width + 3, left, fonts.regular, 9);
    left -= 14.4;
  }
  const email = supplier.email ?? businessDetails.email;
  const emailWidth = text(page, email, LEFT, left, fonts.regular, 9, INK_SOFT);
  link(doc, page, `mailto:${email}`, LEFT, left, emailWidth, 9);
  if (supplier.phone !== null) text(page, supplier.phone, LEFT + emailWidth + 3 * MM, left, fonts.regular, 9, INK_SOFT);

  const recipient = invoice.recipient;
  const rightWidth = RIGHT - RIGHT_COLUMN;
  let right = top - 23.8;
  label(page, "Billed to", RIGHT_COLUMN, right, fonts);
  right -= 16.5;
  for (const part of wrap(recipient.legalName, fonts.bold, 10.2, rightWidth)) {
    text(page, part, RIGHT_COLUMN, right, fonts.bold, 10.2);
    right -= 15.2;
  }
  right += 2.2;
  const state = recipient.stateCode === null ? [] : [`${stateName(recipient.stateCode) ?? recipient.stateCode}, India`];
  for (const line of [...recipient.addressLines, ...state]) {
    for (const part of wrap(line, fonts.regular, 9, rightWidth)) {
      text(page, part, RIGHT_COLUMN, right, fonts.regular, 9);
      right -= 13;
    }
  }
  if (recipient.gstin !== null) {
    right -= 3.5;
    const width = text(page, "GSTIN", RIGHT_COLUMN, right, fonts.semibold, 9);
    text(page, recipient.gstin, RIGHT_COLUMN + width + 3, right, fonts.regular, 9);
    right -= 13;
  }
  // `left` is the baseline of the supplier's last line; `right` is already one line below the customer's last.
  return Math.min(left, right + 13) - 21;
}

interface Column {
  readonly head: string;
  readonly width: number;
  readonly numeric: boolean;
  readonly bold: boolean;
  readonly value: (line: TaxInvoiceLineRecord) => string;
}

/** The line items' columns. Discount only when a line has one, as in the approved samples. */
function columnsFor(invoice: TaxInvoice): { readonly columns: readonly Column[]; readonly descriptionWidth: number } {
  const showDiscount = invoice.lines.some((line) => line.discountAmountCents > 0);
  const columns: Column[] = [
    { head: "SAC", width: 16 * MM, numeric: false, bold: false, value: (line) => line.sac },
    { head: "Qty", width: 9 * MM, numeric: true, bold: false, value: (line) => String(line.quantity) },
    { head: "Rate", width: 20 * MM, numeric: true, bold: false, value: (line) => money(line.unitAmountCents) },
    ...(showDiscount
      ? [{ head: "Discount", width: 20 * MM, numeric: true, bold: false, value: (line: TaxInvoiceLineRecord) => money(line.discountAmountCents) }]
      : []),
    { head: "Taxable value", width: 23 * MM, numeric: true, bold: true, value: (line) => money(line.taxableCents) },
    { head: "GST", width: 11 * MM, numeric: true, bold: false, value: (line) => `${percent(line.taxRateBasisPoints)}%` },
    { head: "Tax", width: 20 * MM, numeric: true, bold: false, value: (line) => money(line.taxCents) },
  ];
  return { columns, descriptionWidth: RIGHT - LEFT - columns.reduce((sum, column) => sum + column.width, 0) };
}

/** One line item's text, wrapped to the description column, and the height its row takes. */
interface RowLayout {
  readonly line: TaxInvoiceLineRecord;
  readonly description: readonly string[];
  readonly detail: readonly string[];
  readonly note: readonly string[];
  readonly height: number;
}

function rowLayout(line: TaxInvoiceLineRecord, descriptionWidth: number, fonts: Fonts): RowLayout {
  const description = wrap(line.description, fonts.bold, 9.6, descriptionWidth);
  const detail = line.detail === null ? [] : wrap(line.detail, fonts.regular, 8.7, descriptionWidth);
  const note = line.note === null ? [] : wrap(line.note, fonts.regular, 8.7, descriptionWidth);
  const height = 18.7 + (description.length - 1) * 13 + detail.length * 15.1 + note.length * 14.4 + 13.7;
  return { line, description, detail, note, height };
}

const TABLE_HEAD_HEIGHT = 8.7;

/** The column headings and the ink rule under them. Returns the y of that rule. */
function tableHead(page: PDFPage, columns: readonly Column[], top: number, fonts: Fonts): number {
  const baseline = top - 7;
  text(page, "Description", LEFT, baseline, fonts.semibold, 7.6, INK_SOFT);
  let edge = RIGHT - columns.reduce((sum, column) => sum + column.width, 0);
  for (const column of columns) {
    edge += column.width;
    if (column.numeric) text(page, column.head, edge, baseline, fonts.semibold, 7.6, INK_SOFT, "right");
    else text(page, column.head, edge - column.width + 7, baseline, fonts.semibold, 7.6, INK_SOFT);
  }
  const ruleY = baseline - TABLE_HEAD_HEIGHT;
  page.drawLine({ start: { x: LEFT, y: ruleY }, end: { x: RIGHT, y: ruleY }, thickness: 1, color: INK });
  return ruleY;
}

/** One line item below the rule at `top`. Returns the y of the rule under it. */
function tableRow(page: PDFPage, row: RowLayout, columns: readonly Column[], top: number, fonts: Fonts): number {
  let y = top - 18.7;
  const firstBaseline = y;
  row.description.forEach((part, index) => {
    if (index > 0) y -= 13;
    text(page, part, LEFT, y, fonts.bold, 9.6);
  });
  for (const part of row.detail) {
    y -= 15.1;
    text(page, part, LEFT, y, fonts.regular, 8.7);
  }
  for (const part of row.note) {
    y -= 14.4;
    text(page, part, LEFT, y, fonts.regular, 8.7, INK_SOFT);
  }
  let edge = RIGHT - columns.reduce((sum, column) => sum + column.width, 0);
  for (const column of columns) {
    edge += column.width;
    const font = column.bold ? fonts.bold : fonts.regular;
    if (column.numeric) text(page, column.value(row.line), edge, firstBaseline, font, 8.7, INK, "right");
    else text(page, column.value(row.line), edge - column.width + 7, firstBaseline, font, 8.7);
  }
  const ruleY = top - row.height;
  page.drawLine({ start: { x: LEFT, y: ruleY }, end: { x: RIGHT, y: ruleY }, thickness: 0.5, color: RULE });
  return ruleY;
}

/** The tax rows of the totals: CGST and SGST at half the rate within our state, else IGST, then any round-off. */
function taxRows(invoice: TaxInvoice): Array<readonly [string, number]> {
  const rate = invoice.lines[0]?.taxRateBasisPoints ?? 0;
  const rows: Array<readonly [string, number]> =
    invoice.supplyType === "intra_state"
      ? [[`CGST @ ${percent(rate / 2)}%`, invoice.cgstCents], [`SGST @ ${percent(rate / 2)}%`, invoice.sgstCents]]
      : [[`IGST @ ${percent(rate)}%`, invoice.igstCents]];
  if (invoice.roundOffCents !== 0) rows.push(["Round off", invoice.roundOffCents]);
  return rows;
}

const WORDS_WIDTH = 82 * MM;

/** The left half of the block under the table: the total in words, and how and when it was paid, each wrapped. */
function settleText(invoice: TaxInvoice, fonts: Fonts): { readonly words: string[]; readonly method: string[]; readonly reference: string[] } {
  return {
    words: wrap(amountInWords(invoice.totalCents), fonts.semibold, 9, WORDS_WIDTH),
    method: wrap(`${invoice.paymentLabel}, paid ${longDate(invoice.paidOn)}`, fonts.regular, 9, WORDS_WIDTH),
    reference: wrap(`Payment ID ${invoice.paymentReference}`, fonts.regular, 9, WORDS_WIDTH),
  };
}

/** How tall the amount in words, payment and totals block is, so it can be moved whole to a new page when needed. */
function settleHeight(invoice: TaxInvoice, fonts: Fonts): number {
  const { words, method, reference } = settleText(invoice, fonts);
  const leftHeight = 23.8 + 16.5 + (words.length - 1) * 12.3 + 25.9 + 15.8 + (method.length + reference.length - 1) * 13.7 + 4;
  const rightHeight = 28 + 10 + 13.7 + (taxRows(invoice).length - 1) * 18 + 15.2 + 20.1 + 6;
  return Math.max(leftHeight, rightHeight);
}

/** Amount in words and how it was paid on the left, the totals in the right column, below the rule at `top`. */
function settle(page: PDFPage, invoice: TaxInvoice, top: number, fonts: Fonts): void {
  const { words, method, reference } = settleText(invoice, fonts);
  let y = top - 23.8;
  label(page, "Amount in words", LEFT, y, fonts);
  y -= 16.5;
  words.forEach((part, index) => {
    if (index > 0) y -= 12.3;
    text(page, part, LEFT, y, fonts.semibold, 9);
  });
  y -= 25.9;
  label(page, "Payment", LEFT, y, fonts);
  y -= 15.8;
  [...method.map((part) => [part, INK] as const), ...reference.map((part) => [part, INK_SOFT] as const)].forEach(([part, color], index) => {
    if (index > 0) y -= 13.7;
    text(page, part, LEFT, y, fonts.regular, 9, color);
  });

  let r = top - 28;
  text(page, "Taxable value", RIGHT_COLUMN, r, fonts.semibold, 9);
  text(page, money(invoice.taxableCents), RIGHT, r, fonts.semibold, 9, INK, "right");
  r -= 10;
  page.drawLine({ start: { x: RIGHT_COLUMN, y: r }, end: { x: RIGHT, y: r }, thickness: 0.5, color: RULE });
  r -= 13.7;
  taxRows(invoice).forEach(([name, cents], index) => {
    if (index > 0) r -= 18;
    text(page, name, RIGHT_COLUMN, r, fonts.regular, 9, INK_SOFT);
    text(page, money(cents), RIGHT, r, fonts.regular, 9, INK, "right");
  });
  r -= 15.2;
  page.drawLine({ start: { x: RIGHT_COLUMN, y: r }, end: { x: RIGHT, y: r }, thickness: 1.2, color: ACCENT });
  r -= 20.1;
  text(page, "Invoice total", RIGHT_COLUMN, r, fonts.bold, 10);
  rupees(page, invoice.totalCents, RIGHT, r, fonts.bold, 14);
}

/** The contact line on every page, and the declaration above it on the invoice's last page. */
function footer(page: PDFPage, doc: PDFDocument, fonts: Fonts, withDeclaration: boolean): void {
  if (withDeclaration) {
    let y = BOTTOM + 78.5;
    label(page, "Declaration", LEFT, y, fonts);
    y -= 15.8;
    DECLARATION_LINES.forEach((line, index) => {
      if (index > 0) y -= 13.7;
      text(page, line, LEFT, y, fonts.regular, 7.8, INK_SOFT);
    });
  }
  const ruleY = BOTTOM + 22.3;
  page.drawLine({ start: { x: LEFT, y: ruleY }, end: { x: RIGHT, y: ruleY }, thickness: 0.5, color: RULE });
  const baseline = BOTTOM + 7.2;
  const lead = text(page, "Questions about this invoice? Write to ", LEFT, baseline, fonts.regular, 7.8, INK_SOFT);
  const emailWidth = text(page, businessDetails.email, LEFT + lead, baseline, fonts.semibold, 7.8);
  link(doc, page, `mailto:${businessDetails.email}`, LEFT + lead, baseline, emailWidth, 7.8);
  const site = businessDetails.website.replace(/^https?:\/\//, "");
  const siteWidth = text(page, site, RIGHT, baseline, fonts.regular, 7.8, INK_SOFT, "right");
  link(doc, page, businessDetails.website, RIGHT - siteWidth, baseline, siteWidth, 7.8);
}

/** A page after the first: the letterhead marked "Continued", and the invoice number. Returns the y below. */
function continuationPage(doc: PDFDocument, invoice: TaxInvoice, fonts: Fonts): { readonly page: PDFPage; readonly top: number } {
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const top = header(page, fonts, true);
  page.drawLine({ start: { x: LEFT, y: top }, end: { x: RIGHT, y: top }, thickness: 1.2, color: ACCENT });
  label(page, "Invoice number", LEFT, top - 15, fonts);
  text(page, invoice.number, LEFT, top - 31, fonts.semibold, 9.6);
  return { page, top: top - 48 };
}

/**
 * Draws one invoice from a fresh page. It is one page in every case Firstfold issues today (one line); lines that
 * do not fit carry on to a continuation page, and the totals and declaration always end the invoice. Every page of
 * an invoice that runs to more than one says "Page n of N".
 */
function drawInvoice(doc: PDFDocument, invoice: TaxInvoice, fonts: Fonts): void {
  const pages: PDFPage[] = [];
  let page = doc.addPage([PAGE.width, PAGE.height]);
  pages.push(page);
  let y = header(page, fonts, false);
  y = facts(page, invoice, y, fonts);
  y = parties(page, doc, invoice, y, fonts);

  const { columns, descriptionWidth } = columnsFor(invoice);
  y = tableHead(page, columns, y, fonts);
  for (const row of invoice.lines.map((line) => rowLayout(line, descriptionWidth, fonts))) {
    if (y - row.height < FOOTER_TOP) {
      const next = continuationPage(doc, invoice, fonts);
      page = next.page;
      pages.push(page);
      y = tableHead(page, columns, next.top, fonts);
    }
    y = tableRow(page, row, columns, y, fonts);
  }
  if (y - settleHeight(invoice, fonts) < FOOTER_TOP) {
    const next = continuationPage(doc, invoice, fonts);
    page = next.page;
    pages.push(page);
    y = next.top;
  }
  settle(page, invoice, y, fonts);
  pages.forEach((each, index) => {
    footer(each, doc, fonts, index === pages.length - 1);
    if (pages.length > 1) spaced(each, `Page ${index + 1} of ${pages.length}`, RIGHT, BOTTOM + 30, fonts.semibold, 7.4, 0.08, INK_SOFT, "right");
  });
}

/** The invoices as one PDF, each starting on a new A4 page, from their stored snapshots only. */
export async function renderTaxInvoicesPdf(invoices: readonly TaxInvoice[]): Promise<Uint8Array> {
  const first = invoices[0];
  if (first === undefined) throw new RangeError("No invoices to render");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(invoices.length === 1 ? `Tax invoice ${first.number}` : "Firstfold tax invoices");
  doc.setAuthor(first.supplier.legalName);
  doc.setCreator("Firstfold");
  const fonts: Fonts = {
    regular: await doc.embedFont(HANKEN_REGULAR, { subset: true }),
    semibold: await doc.embedFont(HANKEN_SEMIBOLD, { subset: true }),
    bold: await doc.embedFont(HANKEN_BOLD, { subset: true }),
  };
  for (const invoice of invoices) drawInvoice(doc, invoice, fonts);
  return doc.save();
}
```

  pdf-lib notes, so nobody "fixes" these: `embedFont` accepts the base64 string as it is; `drawSvgPath` puts the path's
  origin at (x, y) and flips SVG's downward y, so the wordmark is drawn from its top edge and the rupee path (flipped once
  by the embed script) from the text baseline; `context.obj` turns plain strings into PDF names, so only the URI needs
  `PDFString.of`; `page.node.addAnnot` adds the link to the page's `Annots`.

- [ ] **Step 4: Run** the test. Expected: PASS, 6 tests. `pnpm --filter @firstfold/shared typecheck`: PASS.

- [ ] **Step 5: Compare with the approved design.** Write a temporary test file (do not commit it)
  `packages/shared/src/server/tax-invoice-pdf.samples.test.ts` that renders the four CA samples (MH registered with the
  20% coupon; KA registered, plan plus 2 seats at ₹499; MH unregistered, plan plus 2 seats; KA unregistered with the
  coupon) with `writeFileSync("/tmp/invoice-check.pdf", ...)`, run it with vitest, and open the result beside
  `../Firstfold-invoice-samples.pdf` pages 2 to 5. Check: column starts, the shared right column, the Amount paid box,
  the totals rule, the footer rule, the rupee sign on the baseline, nothing overlapping, and the totals 6,607.06,
  9,436.46, 9,436.46, 6,607.06. Delete the file.

- [ ] **Step 6: Commit** "Draw tax invoices as A4 PDFs in the approved design"

---

## Phase 6: Downloads

### Task 17: Customers download invoices from Billing

**Files:** Modify `packages/db/src/queries/billing.ts`, `apps/platform/lib/billing/receipt-rows.ts`,
`apps/platform/lib/server/billing.ts`, `apps/platform/app/app-host/billing/receipts/route.ts`; Test
`packages/db/src/tax-invoices.integration.test.ts`, `apps/platform/lib/billing/receipt-rows.test.ts`,
`apps/platform/app/app-host/billing/receipts/route.test.ts`, and the `Receipt` fixtures in
`apps/platform/lib/billing/receipt-document.test.ts` and `apps/platform/lib/billing/billing-months.test.ts`

Read `apps/platform/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` first. The route stays a
`GET` handler that reads through row-level security; invoices are read the same way (`tax_invoices_tenant_select`).

- [ ] **Step 1: `Receipt` knows its invoice, test first.** In `packages/db/src/tax-invoices.integration.test.ts` add:

```ts
  it("names a payment's invoice on its receipt, and nothing on a payment without one", async () => {
    const invoice = await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1 }));
    const other = await seedPayment(businessA, "pay_fake_no_invoice");
    const receipts = await asOwner(businessA, OWNER_A, (tx) => listReceiptsForBusiness(tx, businessA, 10));
    expect(receipts.find((row) => row.id === paymentA)).toMatchObject({ taxInvoiceId: invoice.id, taxInvoiceNumber: "FF/26-27/000001" });
    expect(receipts.find((row) => row.id === other)).toMatchObject({ taxInvoiceId: null, taxInvoiceNumber: null });
  });
```

  (import `listReceiptsForBusiness` from `"./queries/billing"`). Run the file. Expected: FAIL.

- [ ] **Step 2: The join.** In `listReceiptsForBusiness` (`packages/db/src/queries/billing.ts`), import `taxInvoices` from
  `"../schema"`, add `taxInvoiceId: taxInvoices.id, taxInvoiceNumber: taxInvoices.number,` to the selected columns and
  `.leftJoin(taxInvoices, eq(taxInvoices.paymentId, payments.id))` after the charges join. Add to `Receipt`:

```ts
  /** The payment's tax invoice, when it has one. Its number replaces the receipt's title on the bill. */
  readonly taxInvoiceId: string | null;
  readonly taxInvoiceNumber: string | null;
```

  `tax_invoices_payment_id_idx` is unique, so the join never duplicates a row. Add `taxInvoiceId: null,
  taxInvoiceNumber: null,` to the `Receipt` fixture builders in `receipt-rows.test.ts`, `receipt-document.test.ts`,
  `billing-months.test.ts` and `route.test.ts` (`rg -l "chargeCreatedAt: null" apps/platform` lists them). Run the
  integration file and `pnpm typecheck`. Expected: PASS.

- [ ] **Step 3: Rows, test first.** In `apps/platform/lib/billing/receipt-rows.test.ts` add:

```ts
  it("titles an invoiced payment by its tax invoice number", () => {
    const [row] = receiptRows([receipt({ taxInvoiceId: "inv_1", taxInvoiceNumber: "FF/26-27/000001" })]);
    expect(row?.title).toBe("Tax invoice FF/26-27/000001");
  });
```

  then in `receipt-rows.ts` `receiptRows`:

```ts
    title: receipt.taxInvoiceNumber === null ? receiptTitle(receipt.sequence, receipt.paidAt) : `Tax invoice ${receipt.taxInvoiceNumber}`,
```

  Run `pnpm --filter @firstfold/platform exec vitest run lib/billing/receipt-rows.test.ts`. Expected: PASS (the existing
  test for an uninvoiced receipt keeps its title).

- [ ] **Step 4: Read invoices for the customer.** In `apps/platform/lib/server/billing.ts`, beside `listCustomerReceipts`
  (import `listTaxInvoicesForPayments` and `type TaxInvoice` from `@firstfold/db`):

```ts
/** The tax invoices for some of the customer's payments, oldest first. Works through row-level security. */
export async function listCustomerTaxInvoices(customer: Pick<GrantedCustomer, "tenant">, paymentIds: readonly string[]): Promise<TaxInvoice[]> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => listTaxInvoicesForPayments(tx, tenant.businessId, paymentIds));
}
```

- [ ] **Step 5: The route, tests first.** In `route.test.ts`, mock the new reader
  (`vi.mock("@/lib/server/billing", () => ({ listCustomerReceipts: vi.fn(), listCustomerTaxInvoices: vi.fn(async () => []) }))`),
  import `listCustomerTaxInvoices` beside `listCustomerReceipts`, build one `TaxInvoice` fixture for `SECOND` (copy the
  `invoice` object from Task 16's test with `paymentId: SECOND`), and add:

```ts
  it("downloads an invoiced payment as its tax invoice, named for its number", async () => {
    mockedReceipts.mockResolvedValue([receipt(SECOND, 2, { currency: "INR", taxInvoiceId: INVOICE.id, taxInvoiceNumber: INVOICE.number })]);
    vi.mocked(listCustomerTaxInvoices).mockResolvedValue([INVOICE]);
    const response = await get(`?ids=${SECOND}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="firstfold-invoice-FF-26-27-000001.pdf"');
    expect(await pageCount(response)).toBe(1);
  });

  it("puts invoices and older receipts in one PDF, oldest first", async () => {
    mockedReceipts.mockResolvedValue([receipt(SECOND, 2, { currency: "INR", taxInvoiceId: INVOICE.id, taxInvoiceNumber: INVOICE.number }), receipt(FIRST, 1)]);
    vi.mocked(listCustomerTaxInvoices).mockResolvedValue([INVOICE]);
    const response = await get();
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="firstfold-receipts.pdf"');
    expect(await pageCount(response)).toBe(2);
  });

  it("falls back to the receipt when an invoice cannot be read", async () => {
    mockedReceipts.mockResolvedValue([receipt(SECOND, 2, { currency: "INR", taxInvoiceId: INVOICE.id, taxInvoiceNumber: INVOICE.number })]);
    vi.mocked(listCustomerTaxInvoices).mockResolvedValue([]);
    expect(await pageCount(await get(`?ids=${SECOND}`))).toBe(1);
  });
```

  Run `pnpm --filter @firstfold/platform exec vitest run app/app-host/billing/receipts/route.test.ts`. Expected: FAIL.

- [ ] **Step 6: The route.** Replace `apps/platform/app/app-host/billing/receipts/route.ts` with:

```ts
import "server-only";
import type { Receipt, TaxInvoice } from "@firstfold/db";
import { renderTaxInvoicesPdf } from "@firstfold/shared/server/tax-invoice-pdf";
import { PDFDocument } from "pdf-lib";
import { isDownloadableReceipt, receiptDocument, type ReceiptCustomer } from "@/lib/billing/receipt-document";
import { parseReceiptSelection } from "@/lib/billing/receipt-download";
import { accountLabel } from "@/lib/server/account-label";
import { listCustomerReceipts, listCustomerTaxInvoices } from "@/lib/server/billing";
import { getCustomerAccess } from "@/lib/server/customer-tenant";
import { renderReceiptsPdf } from "@/lib/server/receipt-pdf";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function refuse(status: 400 | 401 | 404): Response {
  return new Response(null, { status, headers: NO_STORE });
}

/** The receipts a download asked for, oldest first so a combined PDF reads in order; null if any is not theirs. */
function chooseReceipts(receipts: readonly Receipt[], ids: readonly string[] | null): Receipt[] | null {
  const downloadable = receipts.filter(isDownloadableReceipt);
  let chosen = downloadable;
  if (ids !== null) {
    chosen = [];
    for (const id of ids) {
      const receipt = downloadable.find((candidate) => candidate.id === id);
      if (receipt === undefined) return null;
      chosen.push(receipt);
    }
  }
  if (chosen.length === 0) return null;
  return chosen.toSorted((a, b) => a.sequence - b.sequence);
}

/** One downloaded payment: its tax invoice when it has one, else its receipt (payments before invoicing, and USD). */
type Piece = { readonly invoice: TaxInvoice } | { readonly receipt: Receipt };

/** Each run of invoices or receipts drawn by its own renderer, in order, so the joined PDF still reads oldest first. */
async function renderPieces(pieces: readonly Piece[], customer: ReceiptCustomer): Promise<Uint8Array[]> {
  const parts: Uint8Array[] = [];
  let index = 0;
  while (index < pieces.length) {
    const invoices: TaxInvoice[] = [];
    const receipts: Receipt[] = [];
    for (let piece = pieces[index]; piece !== undefined; piece = pieces[index]) {
      if ("invoice" in piece ? receipts.length > 0 : invoices.length > 0) break;
      if ("invoice" in piece) invoices.push(piece.invoice);
      else receipts.push(piece.receipt);
      index += 1;
    }
    parts.push(invoices.length > 0 ? await renderTaxInvoicesPdf(invoices) : await renderReceiptsPdf(receipts.map((receipt) => receiptDocument(receipt, customer))));
  }
  return parts;
}

async function joinPdfs(parts: readonly Uint8Array[]): Promise<Uint8Array> {
  const only = parts[0];
  if (parts.length === 1 && only !== undefined) return only;
  const joined = await PDFDocument.create();
  for (const part of parts) {
    const source = await PDFDocument.load(part);
    for (const page of await joined.copyPages(source, source.getPageIndices())) joined.addPage(page);
  }
  return joined.save();
}

function fileNameFor(pieces: readonly Piece[], customer: ReceiptCustomer): string {
  const only = pieces[0];
  if (pieces.length !== 1 || only === undefined) return "firstfold-receipts.pdf";
  if ("invoice" in only) return `firstfold-invoice-${only.invoice.number.replaceAll("/", "-")}.pdf`;
  return receiptDocument(only.receipt, customer).fileName;
}

/**
 * `GET /billing/receipts[?ids=<id>,<id>]` on the app host: the signed-in customer's bills as one PDF. A payment with a tax
 * invoice downloads as that invoice; any other (before invoicing began, or in dollars) as its receipt. Payments and
 * invoices are read through row-level security, so another business's payment id finds nothing and gets a 404, exactly
 * as for an id that does not exist.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await getCustomerAccess();
  if (access.kind !== "granted") return refuse(401);

  const selection = parseReceiptSelection(new URL(request.url).searchParams.get("ids"));
  if (selection.kind === "invalid") return refuse(400);

  const receipts = chooseReceipts(await listCustomerReceipts(access), selection.kind === "all" ? null : selection.ids);
  if (receipts === null) return refuse(404);

  const invoiced = receipts.filter((receipt) => receipt.taxInvoiceId !== null).map((receipt) => receipt.id);
  const invoices = new Map((await listCustomerTaxInvoices(access, invoiced)).map((invoice) => [invoice.paymentId, invoice]));
  const pieces: Piece[] = receipts.map((receipt) => {
    const invoice = invoices.get(receipt.id);
    return invoice === undefined ? { receipt } : { invoice };
  });

  // "Billed to" on a receipt names the account by what it signs in with: its number, never a phone account's placeholder.
  const customer: ReceiptCustomer = { businessName: access.tenant.businessName, email: accountLabel(access.user) };
  const bytes = await joinPdfs(await renderPieces(pieces, customer));

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileNameFor(pieces, customer)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

  Run the Step 5 tests and the route's existing tests. Expected: PASS.

- [ ] **Step 7: Run** `pnpm --filter @firstfold/platform test && pnpm --filter @firstfold/platform lint && pnpm --filter @firstfold/platform typecheck && pnpm test:integration`.
  Expected: PASS.

- [ ] **Step 8: Commit** "Download tax invoices from Billing; older payments keep their receipts"

### Task 18: Staff see billing details and invoices, correct the details, and issue a missing invoice

**Files:** Modify `packages/db/src/queries/charges.ts`, `packages/db/src/queries/tax-invoices.ts`, `packages/db/src/index.ts`,
`apps/admin/app/(protected)/clients/[businessId]/page.tsx`; Create `packages/shared/src/server/tax-invoice-reissue.ts`,
`apps/admin/lib/server/invoices-admin.ts`, `apps/admin/lib/invoice-notices.ts`, `apps/admin/lib/billing-details-form-state.ts`,
`apps/admin/components/billing-details-form.tsx`, `apps/admin/app/(protected)/clients/[businessId]/invoice-actions.ts`,
`apps/admin/app/(protected)/invoices/[invoiceId]/route.ts`; Test `packages/shared/src/tax-invoice-reissue.integration.test.ts`,
`apps/admin/lib/server/invoices-admin.test.ts`, `apps/admin/app/(protected)/invoices/[invoiceId]/route.test.ts`

Invoke `design-taste-frontend` and read `apps/admin/DESIGN.md` before the markup; read the route handler guide in
`apps/admin/node_modules/next/dist/docs` before the route. Admin pages are staff-only (`requireStaffAccess`, the staff
connection, no row-level limits); route handlers do not run the layout, so the route checks access itself.

- [ ] **Step 1: Two reads.** Add to `packages/db/src/queries/charges.ts`:

```ts
/** The charge a payment settled, or null. Staff connection. */
export async function findChargeByPaymentId(db: Runner, businessId: string, paymentId: string): Promise<Charge | null> {
  const rows = await db
    .select(CHARGE_COLUMNS)
    .from(charges)
    .where(and(eq(charges.businessId, businessId), eq(charges.paymentId, paymentId)))
    .limit(1);
  return rows[0] ?? null;
}
```

  (`CHARGE_COLUMNS` is the column object `findChargeForBusiness` selects). Add to `packages/db/src/queries/tax-invoices.ts`:

```ts
/** One invoice by its id, for the staff download. Staff connection. */
export async function findTaxInvoiceById(db: Runner, invoiceId: string): Promise<TaxInvoice | null> {
  const rows = await db.select().from(taxInvoices).where(eq(taxInvoices.id, invoiceId)).limit(1);
  return rows[0] ?? null;
}
```

  Export both from `packages/db/src/index.ts` in their blocks.

- [ ] **Step 2: Rebuild a missing invoice's source, test first.** Create
  `packages/shared/src/tax-invoice-reissue.integration.test.ts`, reusing the setup of Task 12's
  `payment-invoicing.integration.test.ts` (copy its imports, constants, `addBusiness`, `openSubscription`, `beforeAll`,
  `beforeEach` and `afterEach`). Seed payments directly (owner connection, `payments` table) so no invoice is issued with
  them, then call `issueMissingTaxInvoice` in a staff transaction:
  - an `initial` payment on Premium at `chargedAmountCents(initialAmountCents, 0, rate)`, issued on `2026-11-15`, gets
    `FF/26-27/000001` with `issuedOn: "2026-11-15"`, `paidOn: "2026-10-09"`, and a period from the payment date;
  - a `renewal` payment at the recurring price on a subscription with a stay offer (`applyRetentionDiscount`) charged
    before the offer existed (amount without the offer) is matched to the price without the offer;
  - a `charge` payment settles via `charges.payment_id` and is invoiced by the charge's description;
  - a payment whose amount matches no price this code can rebuild throws `InvoiceSourceMismatchError`, leaving no invoice
    and no serial;
  - a payment that already has its invoice, or is in dollars, or was recorded before the `tax_invoicing_start` row,
    throws `NoMissingInvoiceError`.

  Run it. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `packages/shared/src/server/tax-invoice-reissue.ts`:

```ts
import "server-only";
import { addMonthsUtc, chargedAmountCents } from "@firstfold/billing";
import {
  findChargeByPaymentId,
  findPlanById,
  findSubscriptionById,
  listPaymentsWithoutTaxInvoice,
  type Payment,
  type Plan,
  type ScopedTransaction,
  type Subscription,
  type TaxInvoice,
} from "@firstfold/db";
import { issueTaxInvoice, type InvoiceSource } from "./tax-invoicing";

/** The payment is not one staff can invoice now: it has its invoice, gets none (D1), or is from before invoicing (D17). */
export class NoMissingInvoiceError extends Error {
  constructor() {
    super("This payment has no missing invoice");
    this.name = "NoMissingInvoiceError";
  }
}

/** No price this code knows explains what the payment took (a plan changed since, say). Engineering issues it by hand. */
export class InvoiceSourceMismatchError extends Error {
  constructor(kind: string) {
    super(`No price explains this ${kind} payment`);
    this.name = "InvoiceSourceMismatchError";
  }
}

interface Price {
  readonly netAmountCents: number;
  readonly discountAmountCents: number;
  readonly retentionDiscountCents: number;
}

/** The first price whose charged amount is exactly what the payment took. A discount that leaves nothing never matches. */
function matching(payment: Payment, plan: Plan, prices: readonly Price[]): Price | null {
  for (const price of prices) {
    if (price.discountAmountCents >= price.netAmountCents) continue;
    if (chargedAmountCents(price.netAmountCents, price.discountAmountCents, plan.taxRateBasisPoints) === payment.amountCents) return price;
  }
  return null;
}

/**
 * What a recorded payment bought, rebuilt from the database for an invoice issued after the fact. The payment row
 * does not keep the price it was charged at, so the candidates are tried in order and only an exact match is used:
 * the invoice then explains the charge to the paisa, as buildTaxInvoice also checks. The period is the payment date
 * plus the plan's initial term (a first payment) or one month, since the provider's cycle dates are not kept.
 */
async function sourceFor(tx: ScopedTransaction, payment: Payment): Promise<InvoiceSource> {
  if (payment.kind === "charge") {
    const charge = await findChargeByPaymentId(tx, payment.businessId, payment.id);
    if (charge === null) throw new InvoiceSourceMismatchError("charge");
    return { kind: "charge", chargeId: charge.id };
  }
  const subscription: Subscription | null = payment.subscriptionId === null ? null : await findSubscriptionById(tx, payment.subscriptionId);
  const plan = subscription === null ? null : await findPlanById(tx, subscription.planId);
  if (subscription === null || plan === null || payment.paidAt === null) throw new InvoiceSourceMismatchError(payment.kind);
  const coupon = subscription.discountAmountCents - subscription.retentionDiscountCents;
  const prices: Record<string, readonly Price[]> = {
    initial: [
      { netAmountCents: plan.initialAmountCents, discountAmountCents: coupon, retentionDiscountCents: 0 },
      { netAmountCents: plan.initialAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 },
    ],
    renewal: [
      { netAmountCents: plan.recurringAmountCents, discountAmountCents: subscription.discountAmountCents, retentionDiscountCents: subscription.retentionDiscountCents },
      { netAmountCents: plan.recurringAmountCents, discountAmountCents: coupon, retentionDiscountCents: 0 },
      { netAmountCents: plan.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 },
    ],
    reactivation: [{ netAmountCents: plan.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 }],
  };
  const price = matching(payment, plan, prices[payment.kind] ?? []);
  if (price === null) throw new InvoiceSourceMismatchError(payment.kind);
  const initial = payment.kind === "initial";
  return {
    kind: "plan",
    plan,
    ...price,
    monthly: !initial || plan.initialTermMonths === 1,
    periodStart: payment.paidAt,
    periodEnd: addMonthsUtc(payment.paidAt, initial ? plan.initialTermMonths : 1),
  };
}

/**
 * Issues the invoice a payment is missing, dated `issuedAt` (D16), in the caller's staff transaction, which must hold
 * the business's billing lock. Throws rather than logging: staff see why on the client page.
 */
export async function issueMissingTaxInvoice(tx: ScopedTransaction, businessId: string, paymentId: string, issuedAt: Date): Promise<TaxInvoice> {
  const payment = (await listPaymentsWithoutTaxInvoice(tx, businessId)).find((candidate) => candidate.id === paymentId);
  if (payment === undefined) throw new NoMissingInvoiceError();
  const result = await issueTaxInvoice(tx, payment, await sourceFor(tx, payment), { issuedAt });
  if (result === null) throw new NoMissingInvoiceError();
  return result.invoice;
}
```

  Add both error classes to `MESSAGE_SAFE_ERRORS` in `billing-log.ts` (their messages hold fixed words and a payment
  kind). Run the Step 2 test. Expected: PASS.

- [ ] **Step 4: Notices and the form state.** `apps/admin/lib/invoice-notices.ts`:

```ts
/** What the client page says after staff issue a missing invoice (`?invoice=`). Fixed words only. */
export const INVOICE_NOTICES = {
  issued: { ok: true, text: "Invoice issued. It is dated today and lists the day the payment was made." },
  "not-missing": { ok: false, text: "That payment already has its invoice, or does not get one." },
  mismatch: { ok: false, text: "This payment’s figures do not match its plan. Ask engineering to issue it." },
  refused: { ok: false, text: "The invoice could not be issued with these billing details. Check the GSTIN and state, then try again." },
} as const;

export type InvoiceNotice = keyof typeof INVOICE_NOTICES;

export function readInvoiceNotice(value: string | string[] | undefined): InvoiceNotice | null {
  return typeof value === "string" && Object.hasOwn(INVOICE_NOTICES, value) ? (value as InvoiceNotice) : null;
}

export function invoiceNoticeHref(businessId: string, notice: InvoiceNotice): string {
  return `/clients/${businessId}?invoice=${notice}#tax-invoices`;
}
```

  `apps/admin/lib/billing-details-form-state.ts`:

```ts
import type { BillingDetailsField } from "@firstfold/shared/lib/billing/billing-details-form";

/** The staff billing details form's state: one refusal at a time, with what was typed, as the console's forms do. */
export type StaffBillingDetailsState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | { readonly status: "error"; readonly field: BillingDetailsField; readonly message: string; readonly values: Readonly<Record<string, string>> };

export const INITIAL_STAFF_BILLING_DETAILS_STATE: StaffBillingDetailsState = { status: "idle" };
```

- [ ] **Step 5: Issuing, test first.** `apps/admin/lib/server/invoices-admin.test.ts` mocks `./db`
  (`getStaffDb: () => ({ transaction: (fn) => fn({ name: "staff-tx" }) })`), `@firstfold/db` (`lockBusinessForBilling: vi.fn()`
  over the real module) and `@firstfold/shared/server/tax-invoice-reissue` (the real error classes, a mocked
  `issueMissingTaxInvoice`), and checks: the lock is taken before issuing; success maps to `"issued"`;
  `NoMissingInvoiceError` to `"not-missing"`; `InvoiceSourceMismatchError` and `InvoiceAmountMismatchError` to
  `"mismatch"`; `InvalidGstinError` and `UnknownStateError` to `"refused"` and log `tax-invoice-failed`; any other error
  is rethrown. Then `apps/admin/lib/server/invoices-admin.ts`:

```ts
import "server-only";
import { InvoiceAmountMismatchError, InvalidGstinError, UnknownStateError } from "@firstfold/billing";
import { lockBusinessForBilling } from "@firstfold/db";
import { describeError, logBillingEvent } from "@firstfold/shared/server/billing-log";
import { InvoiceSourceMismatchError, issueMissingTaxInvoice, NoMissingInvoiceError } from "@firstfold/shared/server/tax-invoice-reissue";
import type { InvoiceNotice } from "@/lib/invoice-notices";
import { getStaffDb } from "./db";

/** Issues a client's missing invoice, dated now, under the billing lock every payment path takes. Staff only. */
export async function issueClientMissingInvoice(businessId: string, paymentId: string, now: Date): Promise<InvoiceNotice> {
  try {
    await getStaffDb().transaction(async (tx) => {
      await lockBusinessForBilling(tx, businessId);
      await issueMissingTaxInvoice(tx, businessId, paymentId, now);
    });
    return "issued";
  } catch (error) {
    if (error instanceof NoMissingInvoiceError) return "not-missing";
    if (error instanceof InvoiceSourceMismatchError || error instanceof InvoiceAmountMismatchError) return "mismatch";
    if (error instanceof InvalidGstinError || error instanceof UnknownStateError) {
      logBillingEvent("warn", "tax-invoice-failed", { businessId, paymentId, provider: null, ...describeError(error) });
      return "refused";
    }
    throw error;
  }
}
```

  Run `pnpm --filter @firstfold/admin exec vitest run lib/server/invoices-admin.test.ts`. Expected: PASS.

- [ ] **Step 6: The actions** `apps/admin/app/(protected)/clients/[businessId]/invoice-actions.ts`:

```ts
"use server";

import { saveBillingProfile } from "@firstfold/db";
import { firstBillingDetailsProblem, parseBillingDetails } from "@firstfold/shared/lib/billing/billing-details-form";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StaffBillingDetailsState } from "@/lib/billing-details-form-state";
import { invoiceNoticeHref } from "@/lib/invoice-notices";
import { getStaffDb } from "@/lib/server/db";
import { issueClientMissingInvoice } from "@/lib/server/invoices-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";

const idSchema = z.uuid();

function readId(value: FormDataEntryValue | null, what: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${what} must be a valid id.`);
  return parsed.data;
}

/** What staff typed, kept so a refused form shows it again. */
function typedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) if (typeof value === "string" && !name.startsWith("$ACTION")) values[name] = value;
  return values;
}

/** Issues the invoice a client's payment is missing, dated today (D16). The payment must be listed as missing. */
export async function issueMissingInvoiceAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The invoice's business");
  const paymentId = readId(formData.get("paymentId"), "The invoice's payment");
  const notice = await issueClientMissingInvoice(businessId, paymentId, new Date());
  revalidatePath(`/clients/${businessId}`);
  revalidatePath("/invoices");
  redirect(invoiceNoticeHref(businessId, notice));
}

/** Corrects a client's billing details (D14). They apply to invoices issued from now on; issued invoices stay as they are. */
export async function saveClientBillingDetailsAction(_previous: StaffBillingDetailsState, formData: FormData): Promise<StaffBillingDetailsState> {
  await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The billing details' business");
  const parsed = parseBillingDetails(formData);
  if (!parsed.ok) return { status: "error", ...firstBillingDetailsProblem(parsed.errors), values: typedValues(formData) };
  await saveBillingProfile(getStaffDb(), { businessId, ...parsed.details });
  revalidatePath(`/clients/${businessId}`);
  return { status: "saved" };
}
```

- [ ] **Step 7: The staff form** `apps/admin/components/billing-details-form.tsx`: a client component taking
  `{ businessId, start, phoneCountries, action }` (`start` built on the page as in Task 14's `loadBillingDetailsView`, from
  `findBillingProfile` and the client's onboarding profile), using `useActionState(action, INITIAL_STAFF_BILLING_DETAILS_STATE)`,
  a hidden `businessId`, the same fields, names and order as Task 14's form, `fieldClasses`, `labelClasses` and
  `hintClasses` from `@/components/console/field-styles`, `PhoneField` with `size="roomy"`, the error as one line with
  `role="alert"` focused after a refusal and the field `aria-invalid` with `aria-describedby` (as
  `components/referral-code-form.tsx` does), a `buttonPrimary` "Save billing details" button, and under it: "Changes apply
  to invoices issued from now on. Issued invoices stay as they are." After a save it says "Saved." Fields render from
  `state.values` after a refusal and from `start` otherwise; the State select is keyed on its value so it remounts.

- [ ] **Step 8: The client page.** In `apps/admin/app/(protected)/clients/[businessId]/page.tsx` add to the `Promise.all`
  `findBillingProfile(db, client.businessId)`, `listTaxInvoicesForBusiness(db, client.businessId)` and
  `listPaymentsWithoutTaxInvoice(db, client.businessId)`, read `const invoiceNotice = readInvoiceNotice(sp.invoice);`, and
  after the Billing section add:
  - `<Section title="Billing details" id="billing-details">`: a `FactList` of Billed to, GSTIN (or "Not registered"),
    Address, State and Billing contact, or `<Quiet>Not given. Invoices use the business name and its onboarding address.</Quiet>`;
    then a `<details>` "Edit billing details" holding the Step 7 form.
  - `<Section title="Tax invoices" id="tax-invoices" tone={missing.length > 0 ? "attention" : "plain"} aside={...count}>`:
    the notice (`<Notice tone=...>` with `INVOICE_NOTICES[invoiceNotice]`); then one row per missing payment: "Invoice
    missing for the payment of {formatMoney(amountCents, "INR")} on {date}" with a form posting `businessId` and
    `paymentId` to `issueMissingInvoiceAction` and a `buttonSecondary` "Issue invoice"; then a table of invoices, newest
    first: number, date (`issuedOn`), place of supply (state name), total (`formatMoney`), and a "Download" link to
    `/invoices/{id}` with `aria-label="Download tax invoice {number}"`. With none: `<Quiet>No tax invoices yet.</Quiet>`.
  At 375 px the table becomes stacked rows, as the page's other tables do.

- [ ] **Step 9: The download route, test first.** `apps/admin/app/(protected)/invoices/[invoiceId]/route.test.ts` mocks
  `@/lib/server/staff-access` (`getStaffAccess`), `@/lib/server/db`, `@firstfold/db` (`findTaxInvoiceById`) and checks: 401
  without access; 404 for an id that is not a UUID (and `findTaxInvoiceById` not called) and for an unknown one; 200 with
  `application/pdf`, `attachment; filename="firstfold-invoice-FF-26-27-000001.pdf"`, `private, no-store` and `nosniff` for
  a known one (use Task 16's fixture). Then the route:

```ts
import { findTaxInvoiceById } from "@firstfold/db";
import { renderTaxInvoicesPdf } from "@firstfold/shared/server/tax-invoice-pdf";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess } from "@/lib/server/staff-access";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const idSchema = z.uuid();

/**
 * A tax invoice as staff download it from a client's page: `/invoices/{invoiceId}` on the admin host. A file download
 * cannot follow a sign-in redirect usefully, so anyone without staff access gets a bare 401.
 */
export async function GET(_request: Request, context: RouteContext<"/invoices/[invoiceId]">): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return new Response(null, { status: 401, headers: NO_STORE });
  const { invoiceId } = await context.params;
  const id = idSchema.safeParse(invoiceId);
  const invoice = id.success ? await findTaxInvoiceById(getStaffDb(), id.data) : null;
  if (invoice === null) return new Response(null, { status: 404, headers: NO_STORE });
  const bytes = await renderTaxInvoicesPdf([invoice]);
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="firstfold-invoice-${invoice.number.replaceAll("/", "-")}.pdf"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

  (`RouteContext` is the global helper `next typegen` generates, as `app/media/[mediaId]/route.ts` uses it.) Run the test.
  Expected: PASS.

- [ ] **Step 10: Check it in the browser** on the local admin app: a client with a payment whose invoice failed (seed one
  with a bad-check GSTIN as in Task 12) shows "Invoice missing"; fix the GSTIN with the form; "Issue invoice" issues it,
  dated today, with the payment's own date in its Payment block; Download opens it.

- [ ] **Step 11: Run** `pnpm --filter @firstfold/admin test && pnpm --filter @firstfold/admin lint && pnpm --filter @firstfold/admin typecheck && pnpm test:integration`.
  Expected: PASS.

- [ ] **Step 12: Commit** "Show staff a client's billing details and invoices, let them correct the details and issue a missing invoice"

### Task 18A: Invoice register for the CA, and missing invoices

**Files:** Create `packages/shared/src/lib/billing/invoice-register.ts`, `apps/admin/app/(protected)/invoices/page.tsx`,
`apps/admin/app/(protected)/invoices/export/route.ts`; Modify `packages/db/src/queries/tax-invoices.ts`, `packages/db/src/index.ts`,
`apps/admin/components/console/dock.tsx`; Test `packages/shared/src/lib/billing/invoice-register.test.ts`,
`packages/db/src/tax-invoices.integration.test.ts`, `apps/admin/app/(protected)/invoices/export/route.test.ts`

The CA files GSTR-1 and GSTR-3B every month from the month's invoices. Without a register, someone opens every PDF. The
same page lists every payment still missing its invoice, across all clients, so a `tax-invoice-failed` never hides in a
log (D15).

- [ ] **Step 1: The queries, test first.** In `packages/db/src/tax-invoices.integration.test.ts` add a test that
  `listTaxInvoicesIssuedBetween(dbs.staff.db, "2026-10-01", "2026-11-01")` returns an invoice issued `2026-10-09` and not
  one issued `2026-11-01` (`sampleInvoice` with `issuedOn`, `paidOn`, `financialYear` and number set), in serial order;
  and that `listMissingTaxInvoices(dbs.staff.db, 50)` lists `paymentA` with its business name. Then add to
  `packages/db/src/queries/tax-invoices.ts` (add `gte` and `lt` to the `drizzle-orm` import):

```ts
/** Every invoice issued from `fromDate` up to but not including `toDate` (YYYY-MM-DD, Indian dates), in number order. Staff connection. */
export async function listTaxInvoicesIssuedBetween(db: Runner, fromDate: string, toDate: string): Promise<TaxInvoice[]> {
  return db
    .select()
    .from(taxInvoices)
    .where(and(gte(taxInvoices.issuedOn, fromDate), lt(taxInvoices.issuedOn, toDate)))
    .orderBy(asc(taxInvoices.financialYear), asc(taxInvoices.serial));
}

/** A payment still missing its invoice, with the client it belongs to. */
export interface MissingTaxInvoice {
  readonly payment: Payment;
  readonly businessName: string;
}

/** Every client's invoiceable payments with no invoice, oldest first (see missingTaxInvoice). Staff connection. */
export async function listMissingTaxInvoices(db: Runner, limit: number): Promise<MissingTaxInvoice[]> {
  const rows = await db
    .select({ payment: PAYMENT_COLUMNS, businessName: businesses.name })
    .from(payments)
    .innerJoin(businesses, eq(businesses.id, payments.businessId))
    .where(missingTaxInvoice(db))
    .orderBy(asc(payments.paidAt))
    .limit(limit);
  return rows;
}
```

  Export both and `type MissingTaxInvoice` from `@firstfold/db`. Run the file. Expected: PASS.

- [ ] **Step 2: Write the test** for the pure register:

```ts
import { describe, expect, it } from "vitest";
import { monthRange, registerCsv, registerTotals, type RegisterInvoice } from "./invoice-register";

const invoice = (overrides: Partial<RegisterInvoice>): RegisterInvoice => ({
  number: "FF/26-27/000001",
  issuedOn: "2026-10-09",
  recipientName: "QA Premium Business",
  recipientGstin: "27AAPFU0939F1ZV",
  placeOfSupplyStateCode: "mh",
  sac: "998361",
  taxableCents: 559_920,
  cgstCents: 50_393,
  sgstCents: 50_393,
  igstCents: 0,
  roundOffCents: 0,
  totalCents: 660_706,
  ...overrides,
});

describe("invoice register", () => {
  it("totals a month, splitting B2B (with GSTIN) from B2C", () => {
    const totals = registerTotals([
      invoice({}),
      invoice({ number: "FF/26-27/000002", recipientGstin: null, placeOfSupplyStateCode: "ka", cgstCents: 0, sgstCents: 0, igstCents: 100_786 }),
    ]);
    expect(totals).toEqual({
      count: 2,
      b2b: { count: 1, taxableCents: 559_920, taxCents: 100_786 },
      b2c: { count: 1, taxableCents: 559_920, taxCents: 100_786 },
      taxableCents: 1_119_840,
      cgstCents: 50_393,
      sgstCents: 50_393,
      igstCents: 100_786,
      roundOffCents: 0,
      totalCents: 1_321_412,
    });
  });

  it("writes CSV in rupees with the place of supply's GST code, quoting names with commas", () => {
    const csv = registerCsv([invoice({ recipientName: "Sharma, Rao & Co" })]);
    expect(csv.split("\r\n")[0]).toBe("Invoice number,Invoice date,Customer,GSTIN,Type,Place of supply,SAC,Taxable value,CGST,SGST,IGST,Round off,Invoice total");
    expect(csv.split("\r\n")[1]).toBe('FF/26-27/000001,09-10-2026,"Sharma, Rao & Co",27AAPFU0939F1ZV,B2B,27-Maharashtra,998361,5599.20,503.93,503.93,0.00,0.00,6607.06');
  });

  it("keeps a spreadsheet from running a customer name as a formula", () => {
    expect(registerCsv([invoice({ recipientName: "=HYPERLINK(1)", recipientGstin: null })]).split("\r\n")[1]).toContain(",'=HYPERLINK(1),,B2C,");
  });

  it("gives a month's first day and the next month's, across a year end", () => {
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
    expect(monthRange("2026-13")).toBeNull();
  });
});
```

- [ ] **Step 3: Run** `pnpm --filter @firstfold/shared exec vitest run src/lib/billing/invoice-register.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement** `packages/shared/src/lib/billing/invoice-register.ts`:

```ts
import { gstStateCodeOf } from "@firstfold/billing/gst-states";
import { stateName } from "../directory/india-states";

/** One invoice as the register needs it: what GSTR-1 asks for, per invoice. Pure and browser-safe. */
export interface RegisterInvoice {
  readonly number: string;
  /** YYYY-MM-DD, the Indian date of issue. */
  readonly issuedOn: string;
  readonly recipientName: string;
  readonly recipientGstin: string | null;
  readonly placeOfSupplyStateCode: string;
  /** The first line's SAC; every invoice today has one line. */
  readonly sac: string;
  readonly taxableCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly roundOffCents: number;
  readonly totalCents: number;
}

export interface RegisterBucket {
  readonly count: number;
  readonly taxableCents: number;
  readonly taxCents: number;
}

export interface RegisterTotals {
  readonly count: number;
  readonly b2b: RegisterBucket;
  readonly b2c: RegisterBucket;
  readonly taxableCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly roundOffCents: number;
  readonly totalCents: number;
}

const taxOf = (invoice: RegisterInvoice): number => invoice.cgstCents + invoice.sgstCents + invoice.igstCents;

function bucket(invoices: readonly RegisterInvoice[]): RegisterBucket {
  return {
    count: invoices.length,
    taxableCents: invoices.reduce((sum, invoice) => sum + invoice.taxableCents, 0),
    taxCents: invoices.reduce((sum, invoice) => sum + taxOf(invoice), 0),
  };
}

export function registerTotals(invoices: readonly RegisterInvoice[]): RegisterTotals {
  const sum = (pick: (invoice: RegisterInvoice) => number): number => invoices.reduce((total, invoice) => total + pick(invoice), 0);
  return {
    count: invoices.length,
    b2b: bucket(invoices.filter((invoice) => invoice.recipientGstin !== null)),
    b2c: bucket(invoices.filter((invoice) => invoice.recipientGstin === null)),
    taxableCents: sum((invoice) => invoice.taxableCents),
    cgstCents: sum((invoice) => invoice.cgstCents),
    sgstCents: sum((invoice) => invoice.sgstCents),
    igstCents: sum((invoice) => invoice.igstCents),
    roundOffCents: sum((invoice) => invoice.roundOffCents),
    totalCents: sum((invoice) => invoice.totalCents),
  };
}

/** "2026-10" as the first day of that month and of the next, or null for anything that is not a month. */
export function monthRange(month: string): { readonly from: string; readonly to: string } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (match === null) return null;
  const year = Number(match[1]);
  const index = Number(match[2]);
  const next = index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

const rupees = (cents: number): string => (cents / 100).toFixed(2);

/** A CSV cell: a leading = + - @ is defused (spreadsheets run those as formulas), and quotes, commas and breaks quoted. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The month's register as CSV, the way Indian accounting tools import it: DD-MM-YYYY dates, plain rupee figures. */
export function registerCsv(invoices: readonly RegisterInvoice[]): string {
  const head = ["Invoice number", "Invoice date", "Customer", "GSTIN", "Type", "Place of supply", "SAC", "Taxable value", "CGST", "SGST", "IGST", "Round off", "Invoice total"];
  const rows = invoices.map((invoice) => {
    const [year, month, day] = invoice.issuedOn.split("-");
    return [
      invoice.number,
      `${day ?? ""}-${month ?? ""}-${year ?? ""}`,
      invoice.recipientName,
      invoice.recipientGstin ?? "",
      invoice.recipientGstin === null ? "B2C" : "B2B",
      `${gstStateCodeOf(invoice.placeOfSupplyStateCode)}-${stateName(invoice.placeOfSupplyStateCode) ?? invoice.placeOfSupplyStateCode}`,
      invoice.sac,
      rupees(invoice.taxableCents),
      rupees(invoice.cgstCents),
      rupees(invoice.sgstCents),
      rupees(invoice.igstCents),
      rupees(invoice.roundOffCents),
      rupees(invoice.totalCents),
    ]
      .map(cell)
      .join(",");
  });
  return [head.join(","), ...rows].join("\r\n");
}
```

  And the mapper, in the same file (import `type TaxInvoice` from `@firstfold/db`; type-only, so the module stays
  browser-safe):

```ts
/** A stored invoice as a register row. */
export function registerInvoiceOf(invoice: TaxInvoice): RegisterInvoice {
  return {
    number: invoice.number,
    issuedOn: invoice.issuedOn,
    recipientName: invoice.recipient.legalName,
    recipientGstin: invoice.recipient.gstin,
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
    sac: invoice.lines[0]?.sac ?? "",
    taxableCents: invoice.taxableCents,
    cgstCents: invoice.cgstCents,
    sgstCents: invoice.sgstCents,
    igstCents: invoice.igstCents,
    roundOffCents: invoice.roundOffCents,
    totalCents: invoice.totalCents,
  };
}
```

- [ ] **Step 5: Run** the test. Expected: PASS.

- [ ] **Step 6: The export, test first.** `apps/admin/app/(protected)/invoices/export/route.test.ts` (mocks as in Task 18
  Step 9, plus `listTaxInvoicesIssuedBetween`): 401 without access; 400 for `?month=2026-13` and for no month; for
  `?month=2026-10` a 200 with `text/csv; charset=utf-8`, `attachment; filename="firstfold-invoices-2026-10.csv"`,
  `private, no-store`, a body that starts with the byte order mark, and `listTaxInvoicesIssuedBetween` called with
  `"2026-10-01", "2026-11-01"`. Then the route:

```ts
import { listTaxInvoicesIssuedBetween } from "@firstfold/db";
import { monthRange, registerCsv, registerInvoiceOf } from "@firstfold/shared/lib/billing/invoice-register";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess } from "@/lib/server/staff-access";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** `/invoices/export?month=2026-10`: the month's invoice register as CSV, for the CA's GST returns. Staff only. */
export async function GET(request: Request): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return new Response(null, { status: 401, headers: NO_STORE });
  const month = new URL(request.url).searchParams.get("month") ?? "";
  const range = monthRange(month);
  if (range === null) return new Response(null, { status: 400, headers: NO_STORE });
  const invoices = await listTaxInvoicesIssuedBetween(getStaffDb(), range.from, range.to);
  // The byte order mark makes Excel read the file as UTF-8.
  return new Response(`﻿${registerCsv(invoices.map(registerInvoiceOf))}`, {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="firstfold-invoices-${month}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

- [ ] **Step 7: The page** `apps/admin/app/(protected)/invoices/page.tsx`: `await requireStaffAccess()` as the other console
  pages; `?month=` read with `monthRange` (default the current Indian month, `indianDate(new Date()).slice(0, 7)` from
  `@firstfold/billing/invoice-number`; an invalid month is a `notFound()`); previous and next month links; a facts row from
  `registerTotals` (invoices, taxable value, CGST, SGST, IGST, round off, total, then B2B and B2C count and tax); the
  month's invoices (number, date, customer, GSTIN or "Unregistered", place of supply, total, Download link to
  `/invoices/{id}`); a "Download CSV" link to `/invoices/export?month=...`; and above all of it, when
  `listMissingTaxInvoices(db, 50)` is not empty, a `Section` with `tone="attention"` titled "Missing invoices" listing each
  client, amount and date with a link to `/clients/{businessId}#tax-invoices`. Follow `apps/admin/DESIGN.md` (Money:
  `formatMoney`, `tabular-nums`).

- [ ] **Step 8: The dock.** In `apps/admin/components/console/dock.tsx` add
  `{ href: "/invoices", label: "Invoices", icon: <DocumentIcon className="size-5" /> }` after Pricing (`DocumentIcon` is in
  `@firstfold/shared/ui/icons`; the platform's monthly billing already uses it).

- [ ] **Step 9: Run** `pnpm --filter @firstfold/shared test && pnpm --filter @firstfold/admin test && pnpm --filter @firstfold/admin lint && pnpm --filter @firstfold/admin typecheck && pnpm test:integration`.
  Expected: PASS. Open `/invoices` locally after the Task 19 walk-through and check the CSV opens in Excel or Numbers with
  the right figures.

- [ ] **Step 10: Commit** "Give staff a monthly invoice register, a CSV for the CA and one list of missing invoices"

---

## Phase 7: Verify and ship

### Task 19: Verify and ship

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build`. Expected: all pass.
- [ ] `rg -n "\x{2014}|\x{2013}" docs/superpowers/plans/2026-10-09-gst-tax-invoices.md docs/superpowers/specs/2026-10-09-gst-tax-invoices-design.md packages/billing/src packages/shared/src/server/tax-invoic* packages/shared/src/lib/billing apps/platform/components/panel/billing apps/admin/app/\(protected\)/invoices`
  returns nothing (no em or en dashes in copy or docs).
- [ ] Local walk-through on the fake provider: a new Maharashtra customer with billing details pays; Billing shows "Tax
  invoice FF/26-27/000001" and the download matches sample 1 (with SAC 998361). A Karnataka customer without details
  pays; the invoice's place of supply is their onboarding state, or Maharashtra (27) with basis `supplier_location` when
  none is known. Pay an extra; it gets the next number. Redeliver a webhook (or confirm the same payment twice); nothing
  new is issued. Seed a bad-check GSTIN, pay, and see the payment succeed, `tax-invoice-failed` in the log, the payment
  under Missing invoices on `/invoices` and the client page, and "Issue invoice" fix it after the GSTIN is corrected.
- [ ] Billing as a paying client: Plan, Payment method, Billing details, Monthly billing, in that order, readable at
  375 px. As a listing account: Payment method, Billing details and the ad spots' invoices. As an account buying its
  membership: the inline form above the pay button.
- [ ] Console: the client page shows billing details (edit and save one), the invoices and no "Invoice missing" rows;
  `/invoices` for this month lists the walk-through invoices and its CSV matches them.
- [ ] Gates 1 to 5 and 7 answered by the CA and reflected in code; Gate 6 asked of Razorpay support. Regenerate the
  samples PDF and the artifact with SAC 998361 for that review.
- [ ] Release (owner): push `development` and open a PR to `main`. The deploy runs lint, typecheck, tests and build, then
  migrations 0119 to 0123 (0119 to 0127 once the add-ons and feedback work ship in the same release) before the restart. The tax ones only add tables, checks, grants and one column on an empty table, so
  the code running until the restart is unaffected (vps.md: migrations must work with the code before them). No new
  environment variables. 0123's `tax_invoicing_start` row records the moment invoicing begins (D17).
- [x] Migration number clash (found 2026-10-09, resolved 2026-10-10 on `integrate/feedback-upstream`). Our migrations and
  upstream's (`0115` to `0118`, already on `main`), the add-ons and `codex/feedback-support` (then `0119_feedback_support_and_error_issues`)
  all took the same numbers. Upstream kept its numbers. The final order is: upstream 0115 to 0118 (journal idx 113 to 116);
  tax invoices 0119 `tax_invoices`, 0120 `tax_invoice_guards`, 0121 `tax_invoice_recipient_guards`, 0122 `tax_invoices_grants`,
  0123 `tax_invoice_paid_on` (idx 117 to 121); add-ons 0124 `add_on_enum_values`, 0125 `add_ons`, 0126 `add_ons_grants`
  (idx 122 to 124); feedback and support 0127 `feedback_support_and_error_issues` (idx 125). The runner decides what is
  pending by each entry's `when`, so ours were all moved later than upstream's last one (1791627100000); a database that
  already ran upstream's four applies exactly 0119 to 0127. Do not run an older branch against the same local databases:
  `webfold` and `webfold_test` that recorded the old numbers must be recreated, or they will refuse the renumbered files. Use a
  separate database per branch (for example `webfold_gst` and `webfold_gst_test`) for the final walk-through.
- [ ] After deploy: watch `journalctl -u firstfold-app` for `tax-invoice-failed` (and `tax-invoice-issued`) during the
  first real payments, check `/invoices` for missing invoices, then download the first invoice and check it against the
  template.

---

## Self-review

- **Every payment path.** Task 12's table lists the seven ways money is recorded; the activations and
  `recordChargePaymentWithInvoice` cover all of them, each once, under `lockBusinessForBilling`, with the invoice last.
- **Failures.** An invoice that cannot be built rolls back alone (savepoint), is logged without customer details, shows on
  the client page and the register's Missing invoices, and staff issue it with today's date and the true payment date.
  Payments from before launch are never listed (D17).
- **Types.** `issueTaxInvoice` returns `{ invoice, issued } | null`; `issueTaxInvoiceSafely` returns `TaxInvoice | null`;
  `InvoiceSource` carries `monthly` and `retentionDiscountCents`; `RecipientInput` has no email or phone; `NewTaxInvoice`
  gains `paidOn` in Task 12A; `RazorpayWebhookEvent`'s `charged` gains `currentStart: Date | null` in Task 12.
- **Known gaps to watch.** A customer who adds a GSTIN after paying gets that payment invoiced without it (D6); the fix is
  a credit note and a new invoice, which needs the credit note plan. A missing renewal invoice rebuilt by staff prints a
  one-month period from the payment date, not Razorpay's exact cycle. A payment applied by staff recording a new manual
  payment is invoiced as a bank transfer even if the money came through Razorpay. A paying customer whose business name
  from onboarding is not in English letters gets no invoice until they give billing details, so staff will see those
  under "Missing invoices" and should ask for them.
