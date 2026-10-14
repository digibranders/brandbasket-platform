# GST tax invoices: every rupee payment gets a lawful invoice

Date: 2026-10-09. Status: approved design; Tasks 1 to 18A built and the automated checks pass, the CA's gates and the
release are still open. Plan:
`docs/superpowers/plans/2026-10-09-gst-tax-invoices.md`. Approved look: the invoice artifact
(https://claude.ai/artifact/7UogCdVqQ7z3UwqPUvsbBa), its template `../invoice-design/invoice-template.html`, and the CA pack
`../Fynix-invoice-samples.pdf`. The artifact prints SAC 998361. The sample PDF still shows the old placeholder 998315; the owner
chose not to regenerate it. The code prints 998361.

## Why

Fynix is sold by Digibranders Private Limited (GSTIN 27AAICD9268J1Z0, Maharashtra) to businesses in India. Today a
customer who pays gets a "receipt" PDF. A GST-registered customer cannot claim input tax credit on a receipt, and the
supplier must issue a tax invoice for every taxable supply (Section 31 CGST Act, Rule 46 CGST Rules). The CA also needs
the month's invoices to file GSTR-1 and GSTR-3B, and today someone would have to reconstruct them from payments.

## Goals

- Every captured INR payment that buys something gets exactly one tax invoice, issued in the same transaction that
  records the payment, with a gapless number per financial year.
- The invoice is a frozen record: what it says never changes after issue.
- Customers give their billing details (legal name, GSTIN, address) once, and download invoices from Billing.
- Staff see and correct billing details, see every payment missing its invoice and issue it, and export a monthly
  register for the CA.
- A failure in invoicing never loses a payment or blocks the customer's access.

## Not in scope

- Credit notes and refunds (no refund flow exists in code yet). An issued invoice is never edited; a mistake needs a
  credit note, which is a separate plan.
- E-invoicing (IRN and QR code): Digibranders' turnover is well below the threshold.
- Export invoices and invoices in dollars: Fynix sells in India only; USD payments keep today's receipt.
- Emailing invoices: there is no email provider yet.
- A GSTIN lookup against the GST portal (needs a paid GSP API). Customers declare their own details.
- Invoices for payments made before invoicing went live (they keep their receipts unless the CA asks for a backfill).
- A self-serve "change card" button (asked of Razorpay first, Gate 6).

## Who it is for

- **Customers** (website clients on Care or Premium, and free listing accounts paying for promotions and ad spots).
  Mostly small clinics and shops; some are GST registered and want input tax credit, most are not.
- **Staff** (the superadmin console), who answer "my invoice has the wrong GSTIN" and issue anything that failed.
- **The CA**, who files the returns from the register and answers the open gates below.

## What people see

### Customer: Billing details (Billing page)

A card titled "Billing details" on Billing, in every state of the page (paying client, unpaid, lapsed, listing account).

- With nothing saved: "Add your company's details to get GST invoices in its name. They apply to invoices issued after
  you save them." and the form, prefilled from the onboarding name and address.
- With details saved: a short list (Billed to, GSTIN or "Not given", Address, State, Billing contact, which reads "Your
  account email and number" when none was given) and an "Edit billing details" button that opens the form in place.
- Fields: Legal name; GSTIN (optional); Address line 1; Address line 2 (optional); City; Pincode; State (a list of the
  36 states and union territories); then "Billing contact": Billing email (optional, "Leave it blank to use your account
  email") and Phone (optional, the shared phone field, India preselected).
- Rules: text in printable English characters only (the invoice font prints exactly these); a 6 digit pincode; a GSTIN
  with a valid check character, whose state must match the State chosen ("This GSTIN is registered in Maharashtra.
  Choose Maharashtra, or check the GSTIN."). One problem is shown at a time, next to its field, with focus moved there and
  everything typed kept.
- After saving: "Saved. Your next invoice uses these details." Focus moves to that line. Details apply to invoices issued
  from then on (D6).

### Customer: before paying

- On Check and send and on the Upgrade page, above the pay button, when no details exist: "Need a GST invoice in your
  company's name? Add your billing details before you pay." linking to the card on Billing.
- On the Premium or Care page of a listing account that is buying its membership (it cannot open Billing yet), the same
  form sits inline above the pay button, closed until opened.
- Paying never requires details: without them the invoice is made out to the business name and onboarding address.

### Customer: Payment method (Billing page)

A "Payment method" card above Billing details, once the business has paid:

- Card or UPI on a renewing plan: "Visa credit card ending 4366" (never more than the last four digits, and no issuing
  bank, because Razorpay sends a code for it and not a name), "Your plan renews on this automatically through
  Razorpay.", and "To pay with a different card or UPI, email us at hello@fynix.digital and
  we'll send you a secure Razorpay link to switch."
- Not renewing (listing account, lapsed): "You last paid with ... You choose how to pay each time."
- Bank transfer: "You pay us by bank transfer. We record each payment when it reaches us." and the last reference.

### Customer: invoices on Billing

Monthly billing lists each payment as today. A payment with an invoice is titled "Tax invoice FY/26-27/000001" and its
download is the invoice (`fynix-invoice-FY-26-27-000001.pdf`). Older payments and USD payments still download as
receipts (`fynix-receipt-<number>.pdf`). Downloading several gives one PDF, oldest first, invoices and receipts mixed
in order, named `fynix-invoices.pdf`, `fynix-receipts.pdf` or `fynix-invoices-and-receipts.pdf` by what it
holds.

### Staff: client page

- **Billing details**: the same facts, or "Not given. Invoices use the business name and its onboarding address.", and an
  "Edit billing details" disclosure with the same fields and rules. Under its button: "Changes apply to invoices issued from now
  on. Issued invoices stay as they are."
- **Tax invoices**: each invoice (number, date, place of supply, total, Download). Above them, when any payment is
  missing its invoice: "Invoice missing for the payment of ₹6,607.06 on 9 October 2026" with an "Issue invoice" button. The
  section is marked for attention while anything is missing. The result shows as a fixed notice: issued (dated today, with the day the payment was made); already issued or not
  invoiceable; "This payment’s figures do not match its plan. Ask engineering to issue it."; refused with these billing
  details (check the GSTIN and the state); a name or address with characters an invoice cannot print; an issue date
  before the payment date; a service period that is not valid; or a kind of payment that cannot be rebuilt here.

### Staff: Invoices register (`/invoices`, new dock entry)

- Missing invoices across every client first, each linking to its client page.
- A month picker with previous and next links (default the current month in India, by the day each invoice was issued), the month's totals (invoices, taxable value, CGST, SGST, IGST,
  round off, total, then B2B and B2C counts and tax) and the month's invoices with downloads.
- "Download CSV" (`fynix-invoices-YYYY-MM.csv`): one row per invoice (number, DD-MM-YYYY date, customer, GSTIN, B2B or B2C, place of supply as "27-Maharashtra",
  SAC, taxable value, CGST, SGST, IGST, round off, total), UTF-8 with a byte order mark so Excel reads it, and a customer
  name starting with = + - or @ defused so a spreadsheet cannot run it.

## Data model

Three tables (migration 0119, guards 0120 and 0121, grants 0122) and, in 0123, a payment date and a start marker.

**`billing_profiles`**: one row per business, what the customer told us. Legal name (1 to 200 characters), GSTIN (shape
checked; check character checked in code), address line 1 and 2, city, pincode (`^[1-9][0-9]{5}$`), state (a platform
state code such as `mh`), billing email and E.164 phone (both optional; null means "use the account's"). A save replaces
the whole row, so nothing from an earlier save survives. Erased with the account.

**`tax_invoice_series`**: one counter row per prefix and financial year (`FY`, `26-27`), `next_serial` from 1 to 1,000,000.
Staff connection only.

**`tax_invoices`**: one row per invoice, insert only (no role may update or delete one). It holds:

- the number in parts (prefix, financial year, serial) and whole (`FY/26-27/000147`), unique, at most 16 characters, the
  database checking that the parts and the whole agree and that the financial year matches the issue date;
- `issued_on` (the Indian date of issue) and, from 0123, `paid_on` (the Indian date of the payment, never after
  `issued_on`);
- the supplier and the recipient as JSON snapshots (legal name, trade name, GSTIN, CIN, address lines, state). The
  recipient never carries an email or phone: the row cannot be edited, so contact details frozen into it could never be
  erased;
- place of supply (state code), how it was decided (`gstin`, `billing_address`, `supplier_location`) and the supply type
  (`intra_state` or `inter_state`), with checks that they agree;
- the lines as JSON (1 to 8; description, detail, note, SAC, quantity, rate, gross, discount, taxable value, rate, CGST,
  SGST, IGST, tax) and the totals (taxable, CGST, SGST, IGST, round off, total), with checks that CGST equals SGST within a
  state, that IGST is the only tax across states, that the total adds up, and that the round off is at most a paisa a line;
- how it was paid ("Visa credit card ending 4366") and the provider's payment id.

**`tax_invoicing_start`** (0123): one row, written as that migration runs, recording when invoicing went live.

**Why a snapshot.** Rule 46 content must not drift. Plans, coupons, addresses and even our own registered office change;
an invoice must still say exactly what it said when issued, years later (records are kept 72 months, Rule 56). The PDF is
therefore drawn from the row every time and never stored (nothing extra to secure or back up; the public R2 bucket never
holds invoices).

## Numbering and the financial year

- Format `FY/yy-yy>/<6 digits>`: `FY/26-27/000001`. One consecutive series per financial year (1 April to 31 March, in
  Indian time). The first invoice issued at or after midnight IST on 1 April starts the new year's series at 1.
- The serial comes from the counter row, updated inside the transaction that issues the invoice. A rolled-back
  transaction gives its number back, so the series never has a gap (a database sequence would skip).
- Locks are always taken in one order: the business's billing lock (every payment path), the payment row, then the
  series row. The series row is taken last and held until commit, so invoicing is the last write that takes a lock outside
  the business's own rows (completePlanUpgradeAtRenewal and sendAfterPayment run after it, but touch only those rows).
- The year is decided by the issue date. A missing invoice issued by staff on 2 April for a payment on 31 March belongs to
  the new year and is dated 2 April; its Payment block says the payment was made on 31 March. An invoice is never
  backdated.
- The first number is `FY/26-27/000001` unless the CA asks to continue a manual series (Gate 3).

## Tax rules

- **Place of supply** (Section 12(2) IGST Act): the GSTIN's state when the customer gave a GSTIN; else the state of the
  address on record (billing details, else the onboarding address); else our own state, Maharashtra. The basis is stored.
- **Type of tax**: place of supply in Maharashtra means CGST and SGST at half the rate each; anywhere else, IGST at the
  full rate. (UTGST never applies: a supply is intra-state only within Maharashtra.)
- **Per line, rounded per line**: tax is worked out on each line's taxable value (rate × quantity, less discount),
  rounding half up to the paisa. CGST and SGST are each rounded on their own so they are always equal.
- **What was charged is the authority**: Razorpay took `chargedAmountCents` (one rounding of 18%). Two roundings of 9% can
  differ from it by a paisa; that difference prints as a "Round off" row. A difference of more than a paisa per line
  means the lines do not describe the payment, and no invoice is issued (it is logged as a failure for staff).
- **Rates**: 18% on everything sold today, SAC 998361 on every line.
- **Discounts**: the line shows the full price, the discount (referral code and any stay offer together), and the
  taxable value. A note names the coupon ("Coupon GAURAV applied, 20% off") only for the part of the discount that is
  the coupon's own, and its percentage only when it is exactly what that percentage of this price comes to; a stay offer
  reads "Stay offer applied".
- **Line wording**: "Fynix Premium plan", detail "Monthly subscription, 09 Oct to 08 Nov 2026" (or "Subscription,
  ..." for a first payment covering more than a month). Charges print their own description, quantity and rate.

## Which payments get an invoice, and failures

**Invoiceable (D1)**: an INR payment, captured, with a payment date, and not money that bought nothing. "Bought nothing"
is the unapplied reasons (a replaced checkout, a duplicate, a wrong amount, a stale move up). A reason raised after the
money applied (onboarding failed to send, the provider still to be told) does not stop the invoice. One function
(`isInvoiceablePayment`) and its SQL twin decide this everywhere.

**Where it is issued**: in the activation for a first payment, a renewal and a restart (whether it arrived by webhook,
by the customer's return from checkout, by the fake provider, or by staff recording a bank transfer), and in the one
wrapper every charge payment uses. Each payment path takes the business's billing lock, so a webhook racing the
customer's return records and invoices the payment once; a redelivered webhook finds the payment recorded and issues
nothing.

**When it fails (D7)**: issuing runs in a savepoint. If anything is wrong (a GSTIN that fails its check, figures that
do not add up, an unknown state), only the invoice and its number roll back; the payment, the subscription and access
commit as usual. The failure is logged as `tax-invoice-failed` with the error's name, database code and constraint, and
its message only when the message is ours and holds no customer data. A lost database connection is not swallowed,
because the payment could not commit either.

**How staff find and fix it**: the payment appears under Missing invoices on `/invoices` and on the client page. Staff
correct the billing details if needed and press "Issue invoice". The issue rebuilds what the payment bought from the
database (its plan and the subscription's discounts, or the charge it settled) and uses it only if it explains the
amount taken to the paisa; otherwise it says "Ask engineering to issue it". The invoice is dated the day it is issued
and states the real payment date.

**Past payments**: payments recorded before `tax_invoicing_start` keep their receipts and are never listed as missing
(Gate 4). A backfill, if the CA wants one, is a separate plan.

## The PDF

- A4, one page per invoice in every case Fynix issues today (one line). Margins 13 mm top, 14 mm sides, 11 mm
  bottom; a 74 mm right-hand column shared by Amount paid, Billed to and the totals. Positions are the template's CSS
  converted to points and checked against the samples.
- Top to bottom: letterhead (wordmark, "TAX INVOICE", "ORIGINAL FOR RECIPIENT"); facts (invoice number, invoice date,
  place of supply as "Maharashtra (27)"; Amount paid with a PAID mark, the total, and how and when it was paid); Supplier
  (legal name, "Trading as Fynix", registered office, GSTIN, CIN, email and phone) and Billed to (legal name, address,
  state, GSTIN); the lines (Description, SAC, Qty, Rate, Discount only when a line has one, Taxable value, GST, Tax);
  amount in words ("Indian Rupees Six Thousand Six Hundred Seven and Six Paise Only") and the Payment block (method, date
  paid, payment id); totals (Taxable value, CGST and SGST or IGST, Round off when not zero, Invoice total); the
  declaration; and the contact line.
- Text wraps to its column and breaks a word too long for it. If lines ever overflow (up to 8 are allowed), they carry on
  to a continuation page marked "Continued" with the invoice number, totals and declaration end the invoice, and each
  page says "Page n of N".
- **Fonts**: Hanken Grotesk 400, 600 and 700 (the dashboard's typeface), static instances embedded and subset, so an
  invoice is about 26 KB. Hanken Grotesk has no rupee sign, so "₹" is drawn as a vector path taken from Noto Sans
  SemiBold. Both fonts are under the SIL Open Font License; the licences ship beside them. The fonts live in a generated
  module used only by the two download routes (D9).
- A character the font cannot draw is a last defence only (it prints "?"). The issuer refuses a name or address it cannot
  print, so the payment waits under "Missing invoices" until the customer gives billing details in English letters.
- **Typographic punctuation is converted, other scripts are held.** Before the printable check, every text that reaches
  the invoice (the name, the address lines, a line's description, detail and note, the payment label) goes through
  `normaliseInvoiceText`: middle dots and bullets become a comma, curly quotes become straight ones, dashes and the
  minus sign become a hyphen, an ellipsis becomes three dots, no-break and other Unicode spaces become a space,
  zero-width characters are removed, and runs of spaces collapse. The snapshot stores the printed text. The charge keeps
  its own wording in the app ("Upgrade to Premium", a middle dot, "31 days left"), and the invoice prints it with a
  comma. The billing details form does the same before it validates, so a name typed on a phone keyboard with a curly
  apostrophe is accepted and saved with a straight one. Letters of other scripts (Devanagari, accented letters) are
  not touched, so they still hold the invoice.
- **Links**: the supplier's email, the footer's email (mailto) and fynix.digital are clickable.
- **Declaration** (Gate 5): "Tax is not payable on reverse charge." "The subscription renews monthly until cancelled. A
  refund is issued against a credit note that quotes this invoice number." "This is a computer generated invoice and
  does not need a signature."
- Built with pdf-lib, not a headless browser: production units are sandboxed and cannot run Chromium (D8).

## Privacy and erasure

- Billing details are personal and business data the customer chose to give. They are erased with the account.
- Issued invoices are financial records kept for 72 months and survive erasure. They keep the legal name, address and
  GSTIN they were issued to, never an email or phone (the database refuses them on a recipient).
- Logs carry ids, invoice numbers and error names, never names, addresses or GSTINs: Drizzle puts query parameters into
  its error messages, so only our own messages, which hold numbers and fixed words, are logged.
- The CSV export is staff only and is sent with `private, no-store`.

## Security

| Table | Customer (app connection, row-level security) | Staff connection | Public |
|---|---|---|---|
| `billing_profiles` | Read and write its own business's row | All, including delete (erasure) | None |
| `tax_invoices` | Read its own business's invoices | Read and insert; no update or delete for anyone | None |
| `tax_invoice_series` | None | Read, insert, update | None |
| `tax_invoicing_start` | None | Read | None |

- Invoices are issued only on the staff connection, inside the payment paths, which verify the provider's signature or a
  staff session first.
- Customer downloads read through row-level security: another business's id finds nothing and gets a 404.
- The staff download and export routes check staff access themselves (route handlers do not run the console layout),
  validate the id and month, and answer 401, 400 or 404 without detail.

## Rollout

1. Build Tasks 12 to 18A on `development`; every task passes lint, typecheck, unit and integration tests on its own commit.
2. CA answers Gates 2 to 5 and 7 (the SAC is settled); the owner asks Razorpay Gate 6.
3. Release by PR to `main`. The deploy runs lint, typecheck, tests and build, then migrations 0119 to 0123 before the
   restart. They add tables, checks, grants and a column on an empty table, so the running code is unaffected until the
   restart. No new environment variables.
4. 0123 writes the start marker; invoicing begins with the restarted code.
5. No feature flag (D18): an invoice is a legal record, and turning invoicing off after launch would leave supplies
   uninvoiced. Release is held instead until the gates are answered.
6. Watch for `tax-invoice-failed` in the app log and Missing invoices on `/invoices` after the first real payments, and
   check the first invoice against the template.

## Open questions for the CA (gates)

1. **SAC**: 998361, given by the owner's CA. Settled.
2. **Rounding**: tax to the paisa, a Round off row only for the one-paisa CGST/SGST case, total not rounded to the rupee.
   Acceptable?
3. **First number**: start at `FY/26-27/000001`, or continue an existing manual series?
4. **Past payments**: keep receipts for payments before launch, or backfill invoices?
5. **Declaration and signature**: is "computer generated, does not need a signature" enough for Rule 46(q) on an
   invoice that is not an e-invoice, or is a digital signature or the authorised signatory's name needed? Is the reverse
   charge sentence worded correctly?
6. (Razorpay, not the CA) How can a customer change the card or UPI on a live subscription?
7. **Unregistered customer, ₹50,000 or more**: if an unregistered customer's taxable value reaches ₹50,000 and no address
   is on record, must the invoice wait for an address? Plans are below this today; a custom charge could reach it.

## Rule 46 checklist

Against what the PDF prints. "Confirm with CA" marks a point we believe is met but have not had confirmed.

| Rule 46 | Requirement | Where it is met | Status |
|---|---|---|---|
| (a) | Supplier's name, address and GSTIN | Supplier block: legal name, trade name, registered office, GSTIN | Met |
| (b) | Consecutive serial number, unique per financial year, at most 16 characters | `FY/26-27/000001`, counter under lock, checked in the database | Met |
| (c) | Date of issue | Invoice date (the day issued, never backdated) | Met |
| (d) | Recipient's name, address and GSTIN, if registered | Billed to block | Met |
| (e) | Unregistered recipient, taxable value ₹50,000 or more: name, address, state name and code | Name and address when known; the state's code prints in Place of supply | Gap when no address is on record (Gate 7) |
| (g) | HSN or SAC | SAC 998361 on every line | Met (code given by the owner's CA) |
| (h) | Description of the service | Line description and detail | Met |
| (i) | Quantity | Qty column | Met |
| (j) | Total value of supply | Rate × Qty and the line's taxable value; gross per line is not printed separately | Confirm with CA |
| (k) | Taxable value, taking discount into account | Discount and Taxable value columns, Taxable value total | Met |
| (l) | Rate of tax (central, state, integrated) | GST % per line; CGST @ 9% and SGST @ 9%, or IGST @ 18%, in the totals | Met; per-line split shown only in totals, confirm with CA |
| (m) | Amount of tax charged (central, state, integrated) | Tax per line; CGST, SGST or IGST in the totals | Met |
| (n) | Place of supply with the state's name, for inter-state supply | "Place of supply: Karnataka (29)" on every invoice | Met |
| (o) | Delivery address, where different from place of supply | Not applicable to a service delivered online | Not applicable |
| (p) | Whether tax is payable on reverse charge | Declaration: "Tax is not payable on reverse charge." | Met; wording to confirm (Gate 5) |
| (q) | Signature or digital signature of the supplier or authorised representative | "Computer generated, does not need a signature" | Open (Gate 5) |
| Rule 48 | Copies for a supply of services | "Original for recipient"; the supplier's record is the stored snapshot | Confirm with CA |
| Companies Act s.12 | Name, registered office, CIN, contact on bills | Supplier block and footer | Met |

Not applicable to us today: e-invoicing (IRN, QR), the B2C dynamic QR code (turnover below the thresholds), export
details, and UTGST.

## Testing

- **Pure rules** (`@fynix/billing`, Vitest): state codes, GSTIN check characters (published vectors and our own
  GSTIN), the tax split (equal halves, the one-paisa case), numbering across the April turn in IST and the 16 character
  limit, amount in words in lakh and crore, the invoice builder (all three bases, round off, refusals).
- **Database** (integration, real Postgres): numbering without gaps and under concurrency, every check constraint,
  insert-only and row-level security for each role, the missing-invoice rule in SQL and TypeScript agreeing, erasure, the
  start marker, receipts naming their invoice.
- **Issuing** (integration): each payment path invoices once; redelivery issues nothing; USD and unapplied money get
  nothing; a failure leaves the payment and access in place and spends no number; a later issue is dated the day it is
  issued with the payment's own date; staff rebuilds match only exact prices.
- **Webhook and wrappers** (unit): Razorpay's cycle start parsed leniently; the renewal passes the verified price, stay
  offer and cycle start; charge payments invoice only what settled.
- **Forms and routes** (unit): billing details parsing and the first problem shown; the customer save action's access
  and tenant scope; the download route's file names, mixing and 404s; the staff routes' 401, 400 and 404; the register's
  totals, CSV quoting, formula defusing and month ranges.
- **PDF** (unit, plus a visual check): one A4 page per invoice, three links, titles, an unprintable name and a long bank
  reference without failure, overflow onto a continuation page; then the four CA samples rendered and compared by eye
  with the samples PDF before the commit.
- **By hand** before release: the walk-through in Task 19 on the fake provider, at 375 px and on a desktop.
