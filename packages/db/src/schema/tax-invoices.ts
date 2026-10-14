import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    /**
     * The Indian calendar date the payment was made, printed in the Payment block. The same as `issuedOn` for an invoice
     * issued with its payment; earlier for one staff issued later, which is dated the day it is issued (D16).
     */
    paidOn: date("paid_on", { mode: "string" }).notNull(),
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
    check("tax_invoices_paid_on_check", sql`${table.paidOn} <= ${table.issuedOn}`),
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

export type BillingProfile = typeof billingProfiles.$inferSelect;
export type TaxInvoice = typeof taxInvoices.$inferSelect;
