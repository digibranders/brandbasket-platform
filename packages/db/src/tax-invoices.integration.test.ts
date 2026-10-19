import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listReceiptsForBusiness } from "./queries/billing";
import {
  allocateInvoiceSerial,
  findBillingProfile,
  findBusinessOwnerPhone,
  findInvoiceFallbackRecipient,
  findPaymentForInvoice,
  findReferralCodeForInvoice,
  findTaxInvoiceById,
  findTaxInvoiceByPaymentId,
  findTaxInvoiceForBusiness,
  insertTaxInvoice,
  isInvoiceablePayment,
  lockPaymentForInvoice,
  listMissingTaxInvoices,
  listPaymentsWithoutTaxInvoice,
  listTaxInvoicesForBusiness,
  listTaxInvoicesIssuedBetween,
  listTaxInvoicesForPayments,
  saveBillingProfile,
  type BillingProfileInput,
  type NewTaxInvoice,
} from "./queries/tax-invoices";
import {
  businessMembers,
  businessProfiles,
  businesses,
  payments,
  referralCodes,
  taxInvoicingStart,
  users,
  type TaxInvoiceLineRecord,
  type TaxInvoicePartyRecord,
} from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const PAID_AT = new Date("2026-10-09T09:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";
let paymentA = "";

const sampleBillingDetails = {
  legalName: "QA Premium Business",
  gstin: "27AAPFU0939F1ZV",
  addressLine1: "Shop 4, Gokul Arcade",
  addressLine2: null,
  city: "Mumbai",
  postalCode: "400080",
  stateCode: "mh",
  email: "accounts@qapremium.in",
  phone: "+919820012345",
} as const;

const SUPPLIER: TaxInvoicePartyRecord = {
  legalName: "Digibranders Private Limited",
  tradeName: "Fynix",
  gstin: "27AAPFU0939F1ZV",
  cin: "U72900MH2020PTC123456",
  addressLines: ["Mumbai 400080"],
  stateCode: "mh",
  email: null,
  phone: null,
};

const RECIPIENT: TaxInvoicePartyRecord = {
  legalName: "QA Premium Business",
  tradeName: null,
  gstin: null,
  cin: null,
  addressLines: ["Shop 4, Gokul Arcade", "Mumbai 400080"],
  stateCode: "mh",
  email: null,
  phone: null,
};

const INTRA_LINE: TaxInvoiceLineRecord = {
  description: "Fynix Premium plan",
  detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
  note: "Coupon GAURAV applied",
  sac: "998361",
  quantity: 1,
  unitAmountCents: 699_900,
  grossAmountCents: 699_900,
  discountAmountCents: 139_980,
  taxableCents: 559_920,
  taxRateBasisPoints: 1800,
  cgstCents: 50_393,
  sgstCents: 50_393,
  igstCents: 0,
  taxCents: 100_786,
};

/** The number a serial gets. Written out here because @brandbasket/billing depends on this package, not the reverse. */
function numberFor(prefix: string, financialYear: string, serial: number): string {
  return `${prefix}/${financialYear}/${String(serial).padStart(6, "0")}`;
}

/**
 * A valid invoice for the seeded business: one intra-state line of 559,920 taxable, CGST and SGST 50,393, total 660,706,
 * issued on 9 Oct 2026 (financial year 26-27), place of supply Maharashtra by the billing address. It passes every
 * CHECK from 0119 to 0121, so a test that overrides one field fails on that field's check alone.
 */
function sampleInvoice(overrides: Partial<NewTaxInvoice> & { readonly paymentId: string; readonly serial?: number }): NewTaxInvoice {
  const serial = overrides.serial ?? 1;
  return {
    businessId: businessA,
    prefix: "FY",
    financialYear: "26-27",
    serial,
    number: numberFor("FY", "26-27", serial),
    issuedOn: "2026-10-09",
    paidOn: "2026-10-09",
    supplier: SUPPLIER,
    recipient: RECIPIENT,
    placeOfSupplyStateCode: "mh",
    placeOfSupplyBasis: "billing_address",
    supplyType: "intra_state",
    lines: [INTRA_LINE],
    taxableCents: 559_920,
    cgstCents: 50_393,
    sgstCents: 50_393,
    igstCents: 0,
    roundOffCents: 0,
    totalCents: 660_706,
    paymentLabel: "Visa credit card ending 4366",
    paymentReference: "pay_fake_1",
    ...overrides,
  };
}

/** The same sale to a Karnataka address: IGST instead of CGST and SGST. */
function interStateInvoice(overrides: Partial<NewTaxInvoice> & { readonly paymentId: string }): NewTaxInvoice {
  return sampleInvoice({
    recipient: { ...RECIPIENT, stateCode: "ka" },
    placeOfSupplyStateCode: "ka",
    supplyType: "inter_state",
    lines: [{ ...INTRA_LINE, cgstCents: 0, sgstCents: 0, igstCents: 100_786 }],
    cgstCents: 0,
    sgstCents: 0,
    igstCents: 100_786,
    ...overrides,
  });
}

/** Inserts a captured INR payment for a business straight into the books and returns its id. */
async function seedPayment(businessId: string, providerPaymentId: string, overrides: Partial<typeof payments.$inferInsert> = {}): Promise<string> {
  const rows = await dbs.staff.db
    .insert(payments)
    .values({
      businessId,
      provider: "fake",
      providerPaymentId,
      kind: "initial",
      amountCents: 660_706,
      currency: "INR",
      status: "captured",
      paidAt: PAID_AT,
      ...overrides,
    })
    .returning({ id: payments.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`Payment ${providerPaymentId} was not seeded`);
  return id;
}

function asOwner<T>(businessId: string, userId: string, work: Parameters<typeof withTenantScope<T>>[2]): Promise<T> {
  return withTenantScope(dbs.app.db, { userId, businessId }, work);
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Asha", email: "asha@example.com" },
    { id: OWNER_B, name: "Ben", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "qa-premium", name: "QA Premium Business", currency: "INR" },
      { slug: "riverside", name: "Riverside", currency: "USD" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "qa-premium")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "riverside")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
  paymentA = await seedPayment(businessA, "pay_fake_1");
});

/** The counter only runs inside the issuing transaction, so each call here is its own short one. */
function allocate(prefix: string, financialYear: string): Promise<number> {
  return dbs.staff.db.transaction((tx) => allocateInvoiceSerial(tx, prefix, financialYear));
}

describe("invoice numbers", () => {
  it("numbers invoices 1, 2, 3 within a financial year and starts again at 1 in the next", async () => {
    expect(await allocate("FY", "26-27")).toBe(1);
    expect(await allocate("FY", "26-27")).toBe(2);
    expect(await allocate("FY", "27-28")).toBe(1);
    expect(await allocate("FY", "26-27")).toBe(3);
  });

  it("gives a number back when the transaction that took it rolls back", async () => {
    await expect(
      dbs.staff.db.transaction(async (tx) => {
        await allocateInvoiceSerial(tx, "FY", "26-27");
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");
    expect(await allocate("FY", "26-27")).toBe(1);
  });

  it("makes a second issuer wait for the first one's transaction, so numbers never repeat", async () => {
    let secondSerial: number | undefined;
    let second: Promise<void> = Promise.resolve();
    const first = await dbs.staff.db.transaction(async (tx) => {
      const serial = await allocateInvoiceSerial(tx, "FY", "26-27");
      second = allocate("FY", "26-27").then((value) => {
        secondSerial = value;
      });
      // The second call is waiting on the series row's lock; give it time to show it has not slipped past.
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(secondSerial).toBeUndefined();
      return serial;
    });
    await second;
    expect([first, secondSerial]).toEqual([1, 2]);
  });

  it("refuses to run past the last serial a number can hold", async () => {
    await dbs.owner.db.execute(sql`insert into tax_invoice_series (prefix, financial_year, next_serial) values ('FY', '26-27', 999999)`);
    expect(await allocate("FY", "26-27")).toBe(999_999);
    expect(await captureErrorText(allocate("FY", "26-27"))).toMatch(/tax_invoice_series_next_serial_check/);
  });

  it("keeps the counter away from customers", async () => {
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => allocateInvoiceSerial(tx, "FY", "26-27")))).toMatch(/permission denied/i);
  });
});

describe("storing an invoice", () => {
  it("stores an invoice and reads it back by payment", async () => {
    const stored = await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA }));
    expect(stored).toMatchObject({ number: "FY/26-27/000001", businessId: businessA, paymentId: paymentA, totalCents: 660_706 });
    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, paymentA)).toMatchObject({ id: stored.id });
    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, businessB)).toBeNull();
  });

  it("issues at most one invoice per payment", async () => {
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1 }));
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 2 })))).toMatch(/tax_invoices_payment_id_idx/);
  });

  it("never reuses a number or a serial", async () => {
    const second = await seedPayment(businessA, "pay_fake_2");
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1 }));
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: second, serial: 1 })))).toMatch(/tax_invoices_number_idx|tax_invoices_series_serial_idx/);
  });

  it("accepts the other shapes of a valid invoice", async () => {
    const [two, three, four] = await Promise.all([seedPayment(businessA, "pay_fake_2"), seedPayment(businessA, "pay_fake_3"), seedPayment(businessA, "pay_fake_4")]);
    // A GSTIN decides the place of supply and the address may be in another state.
    await insertTaxInvoice(
      dbs.staff.db,
      sampleInvoice({ paymentId: paymentA, serial: 1, placeOfSupplyBasis: "gstin", recipient: { ...RECIPIENT, gstin: "27AAPFU0939F1ZV", stateCode: "ka" } }),
    );
    // Nothing known of the customer: our own state, and no address state on the recipient.
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: two, serial: 2, placeOfSupplyBasis: "supplier_location", recipient: { ...RECIPIENT, stateCode: null } }));
    // Karnataka by the billing address: IGST.
    await insertTaxInvoice(dbs.staff.db, interStateInvoice({ paymentId: three, serial: 3 }));
    // The last day of the financial year still belongs to it.
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: four, serial: 4, issuedOn: "2027-03-31" }));
    expect(await listTaxInvoicesForBusiness(dbs.staff.db, businessA)).toHaveLength(4);
  });

  it("refuses CGST and SGST that differ, and a total that does not add up", async () => {
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, cgstCents: 50_394, sgstCents: 50_392 })))).toMatch(/tax_invoices_tax_check/);
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, totalCents: 1 })))).toMatch(/tax_invoices_total_check/);
  });

  it("refuses a number that does not match its series and serial", async () => {
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1, number: numberFor("FY", "26-27", 2) })))).toMatch(/tax_invoices_number_check/);
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1, number: "FY/26-27/1" })))).toMatch(/tax_invoices_number_check/);
  });

  it("refuses a number longer than the 16 characters GST allows, even when it matches its series", async () => {
    const error = await captureErrorText(
      insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, prefix: "FYNIX", serial: 1, number: numberFor("FYNIX", "26-27", 1) })),
    );
    expect(error).toMatch(/tax_invoices_number_check/);
  });

  it("refuses a financial year that does not match the date of issue", async () => {
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, issuedOn: "2027-04-01" })))).toMatch(/tax_invoices_financial_year_check/);
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, issuedOn: "2026-03-31", paidOn: "2026-03-31" })))).toMatch(/tax_invoices_financial_year_check/);
  });

  it("refuses intra-state tax for a place of supply other than the supplier's state, and the reverse", async () => {
    const stateMismatch = sampleInvoice({ paymentId: paymentA, placeOfSupplyStateCode: "ka", recipient: { ...RECIPIENT, stateCode: "ka" } });
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, stateMismatch))).toMatch(/tax_invoices_place_of_supply_check/);
    const sameStateButInter = interStateInvoice({ paymentId: paymentA, placeOfSupplyStateCode: "mh", recipient: { ...RECIPIENT, stateCode: "mh" } });
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sameStateButInter))).toMatch(/tax_invoices_place_of_supply_check/);
  });

  it("refuses a recipient that carries an email or a phone", async () => {
    for (const contact of [{ email: "accounts@qapremium.in" }, { phone: "+919820012345" }]) {
      const error = await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, recipient: { ...RECIPIENT, ...contact } })));
      expect(error).toMatch(/tax_invoices_recipient_check/);
    }
  });

  it("refuses a recipient state that is not a lower-case code", async () => {
    const error = await captureErrorText(
      insertTaxInvoice(dbs.staff.db, interStateInvoice({ paymentId: paymentA, placeOfSupplyStateCode: "KA", recipient: { ...RECIPIENT, stateCode: "KA" } })),
    );
    expect(error).toMatch(/tax_invoices_place_of_supply_check/);
    const recipientOnly = await captureErrorText(
      insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, placeOfSupplyBasis: "gstin", recipient: { ...RECIPIENT, gstin: "27AAPFU0939F1ZV", stateCode: "KA" } })),
    );
    expect(recipientOnly).toMatch(/tax_invoices_recipient_check/);
  });

  it("refuses a billing-address basis that does not match the recipient's address, or that carries a GSTIN", async () => {
    // The address state differs from the place of supply (also IGST, so only the basis is wrong).
    const differs = interStateInvoice({ paymentId: paymentA, recipient: { ...RECIPIENT, stateCode: "mh" } });
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, differs))).toMatch(/tax_invoices_recipient_check/);
    // No address state at all: the comparison is NULL, which must still refuse.
    const noState = sampleInvoice({ paymentId: paymentA, recipient: { ...RECIPIENT, stateCode: null } });
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, noState))).toMatch(/tax_invoices_recipient_check/);
    // The key missing altogether (not a JSON null) gives NULL from ->>, the case a bare comparison would let through.
    const { stateCode: _omitted, ...keyAbsent } = RECIPIENT;
    const absent = sampleInvoice({ paymentId: paymentA, recipient: keyAbsent as TaxInvoicePartyRecord });
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, absent))).toMatch(/tax_invoices_recipient_check/);
    // A GSTIN means the GSTIN decided the place of supply, so the basis cannot be the address.
    const withGstin = sampleInvoice({ paymentId: paymentA, recipient: { ...RECIPIENT, gstin: "27AAPFU0939F1ZV" } });
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, withGstin))).toMatch(/tax_invoices_recipient_check/);
  });

  it("refuses a supplier-location basis that has a GSTIN or an address state", async () => {
    const withState = sampleInvoice({ paymentId: paymentA, placeOfSupplyBasis: "supplier_location" });
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, withState))).toMatch(/tax_invoices_recipient_check/);
    const withGstin = sampleInvoice({ paymentId: paymentA, placeOfSupplyBasis: "supplier_location", recipient: { ...RECIPIENT, stateCode: null, gstin: "27AAPFU0939F1ZV" } });
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, withGstin))).toMatch(/tax_invoices_recipient_check/);
  });

  it("refuses an invoice with no lines, a bad payment label, or a GSTIN that is not a GSTIN", async () => {
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, lines: [] })))).toMatch(/tax_invoices_json_shape_check/);
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, paymentLabel: " " })))).toMatch(/tax_invoices_payment_check/);
    const badGstin = sampleInvoice({ paymentId: paymentA, placeOfSupplyBasis: "gstin", recipient: { ...RECIPIENT, gstin: "27aapfu0939f1zv" } });
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, badGstin))).toMatch(/tax_invoices_place_of_supply_check/);
  });
});

describe("who can see and change invoices", () => {
  it("lets a customer read its own invoices and no one else's", async () => {
    const stored = await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1 }));
    expect(await asOwner(businessA, OWNER_A, (tx) => listTaxInvoicesForBusiness(tx, businessA))).toHaveLength(1);
    expect(await asOwner(businessA, OWNER_A, (tx) => findTaxInvoiceForBusiness(tx, businessA, stored.id))).toMatchObject({ id: stored.id });
    expect(await asOwner(businessB, OWNER_B, (tx) => listTaxInvoicesForBusiness(tx, businessA))).toHaveLength(0);
    expect(await asOwner(businessB, OWNER_B, (tx) => findTaxInvoiceForBusiness(tx, businessA, stored.id))).toBeNull();
  });

  it("lets nobody edit, delete or write an invoice through the customer connection", async () => {
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1 }));
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.execute(sql`update tax_invoices set total_cents = 0`)))).toMatch(/permission denied/i);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.execute(sql`delete from tax_invoices`)))).toMatch(/permission denied/i);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => insertTaxInvoice(tx, sampleInvoice({ paymentId: paymentA, serial: 2 }))))).toMatch(/permission denied/i);
  });

  it("lets no one edit or delete an invoice, staff included", async () => {
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1 }));
    expect(await captureErrorText(dbs.staff.db.execute(sql`update tax_invoices set total_cents = 0`))).toMatch(/permission denied/i);
    expect(await captureErrorText(dbs.staff.db.execute(sql`delete from tax_invoices`))).toMatch(/permission denied/i);
  });

  it("reads one invoice by its id on the staff connection, and nothing for an id that is not one", async () => {
    const invoice = await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1 }));
    expect(await findTaxInvoiceById(dbs.staff.db, invoice.id)).toMatchObject({ id: invoice.id, number: "FY/26-27/000001", businessId: businessA });
    expect(await findTaxInvoiceById(dbs.staff.db, "0192f3c4-0000-7000-8000-00000000dead")).toBeNull();
  });

  it("lists the invoices for chosen payments, oldest first, and only for the asking business", async () => {
    const second = await seedPayment(businessA, "pay_fake_2");
    const foreign = await seedPayment(businessB, "pay_fake_3", { currency: "USD" });
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: second, serial: 2 }));
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1 }));
    const rows = await asOwner(businessA, OWNER_A, (tx) => listTaxInvoicesForPayments(tx, businessA, [second, paymentA, foreign]));
    expect(rows.map((row) => row.number)).toEqual(["FY/26-27/000001", "FY/26-27/000002"]);
    expect(await listTaxInvoicesForPayments(dbs.staff.db, businessA, [])).toEqual([]);
  });

  it("names a payment's invoice on its receipt, and nothing on a payment without one", async () => {
    const invoice = await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1 }));
    const other = await seedPayment(businessA, "pay_fake_no_invoice");
    const receipts = await asOwner(businessA, OWNER_A, (tx) => listReceiptsForBusiness(tx, businessA, 10));
    expect(receipts).toHaveLength(2);
    expect(receipts.find((row) => row.id === paymentA)).toMatchObject({ taxInvoiceId: invoice.id, taxInvoiceNumber: "FY/26-27/000001" });
    expect(receipts.find((row) => row.id === other)).toMatchObject({ taxInvoiceId: null, taxInvoiceNumber: null });
  });
});

describe("dates and the invoicing start", () => {
  it("refuses an invoice whose payment date is after its own date", async () => {
    expect(await captureErrorText(insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, paidOn: "2026-10-10" })))).toMatch(
      /tax_invoices_paid_on_check/,
    );
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

describe("the monthly register", () => {
  it("lists the invoices issued in a month in number order, and none from the days either side", async () => {
    const second = await seedPayment(businessA, "pay_fake_second");
    const lastOfMonth = await seedPayment(businessA, "pay_fake_last");
    const nextMonth = await seedPayment(businessA, "pay_fake_next");
    const monthBefore = await seedPayment(businessA, "pay_fake_before");
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: second, serial: 2, issuedOn: "2026-10-10" }));
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: paymentA, serial: 1, issuedOn: "2026-10-09" }));
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: lastOfMonth, serial: 3, issuedOn: "2026-10-31" }));
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: nextMonth, serial: 4, issuedOn: "2026-11-01" }));
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: monthBefore, serial: 5, issuedOn: "2026-09-30", paidOn: "2026-09-30" }));

    const october = await listTaxInvoicesIssuedBetween(dbs.staff.db, "2026-10-01", "2026-11-01");
    expect(october.map((row) => row.number)).toEqual(["FY/26-27/000001", "FY/26-27/000002", "FY/26-27/000003"]);
    expect((await listTaxInvoicesIssuedBetween(dbs.staff.db, "2026-11-01", "2026-12-01")).map((row) => row.number)).toEqual(["FY/26-27/000004"]);
    expect(await listTaxInvoicesIssuedBetween(dbs.staff.db, "2026-12-01", "2027-01-01")).toEqual([]);
  });

  it("orders a month that crosses a financial year by year, then serial", async () => {
    const march = await seedPayment(businessA, "pay_fake_march");
    const april = await seedPayment(businessA, "pay_fake_april");
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: april, financialYear: "27-28", serial: 1, number: "FY/27-28/000001", issuedOn: "2027-04-01", paidOn: "2027-04-01" }));
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: march, financialYear: "26-27", serial: 9, number: "FY/26-27/000009", issuedOn: "2027-03-31", paidOn: "2027-03-31" }));

    const spanning = await listTaxInvoicesIssuedBetween(dbs.staff.db, "2027-03-01", "2027-05-01");
    expect(spanning.map((row) => row.number)).toEqual(["FY/26-27/000009", "FY/27-28/000001"]);
  });
});

describe("missing invoices across clients", () => {
  it("lists every client's missing payment with the business name, oldest first, and leaves out invoiced ones", async () => {
    const riversideInr = await seedPayment(businessB, "pay_fake_riverside_inr", { currency: "INR", paidAt: new Date("2026-09-01T09:00:00.000Z") });
    const invoiced = await seedPayment(businessA, "pay_fake_invoiced");
    await seedPayment(businessB, "pay_fake_usd", { currency: "USD" });
    await seedPayment(businessA, "pay_fake_unapplied", { attentionReason: "already_paid", attentionRaisedAt: PAID_AT });
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: invoiced, serial: 1 }));

    const missing = await listMissingTaxInvoices(dbs.staff.db, 50);
    expect(missing.map((row) => [row.payment.id, row.businessName])).toEqual([
      [riversideInr, "Riverside"],
      [paymentA, "QA Premium Business"],
    ]);
  });

  it("leaves out payments recorded before invoicing started, and honours the limit", async () => {
    const before = await seedPayment(businessB, "pay_fake_before", { currency: "INR", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    await dbs.owner.db.insert(taxInvoicingStart).values({ startedAt: new Date("2026-06-01T00:00:00.000Z") });
    const later = await seedPayment(businessB, "pay_fake_later", { currency: "INR", paidAt: new Date("2026-10-10T09:00:00.000Z") });

    const all = await listMissingTaxInvoices(dbs.staff.db, 50);
    expect(all.map((row) => row.payment.id)).not.toContain(before);
    expect(all.map((row) => row.payment.id)).toEqual([paymentA, later]);
    expect((await listMissingTaxInvoices(dbs.staff.db, 1)).map((row) => row.payment.id)).toEqual([paymentA]);
  });
});

describe("payments without an invoice", () => {
  it("lists captured INR payments with no invoice and attention-free, oldest first", async () => {
    const older = await seedPayment(businessA, "pay_fake_older", { paidAt: new Date("2026-09-09T09:00:00.000Z") });
    const invoiced = await seedPayment(businessA, "pay_fake_invoiced");
    await seedPayment(businessA, "pay_fake_failed", { status: "failed", paidAt: null });
    await seedPayment(businessA, "pay_fake_unapplied", { attentionReason: "already_paid", attentionRaisedAt: PAID_AT });
    await seedPayment(businessA, "pay_fake_mismatch", { attentionReason: "amount_mismatch", attentionRaisedAt: PAID_AT });
    await seedPayment(businessB, "pay_fake_usd", { currency: "USD" });
    await insertTaxInvoice(dbs.staff.db, sampleInvoice({ paymentId: invoiced, serial: 1 }));

    const missing = await listPaymentsWithoutTaxInvoice(dbs.staff.db, businessA);
    expect(missing.map((row) => row.id)).toEqual([older, paymentA]);
    expect(await listPaymentsWithoutTaxInvoice(dbs.staff.db, businessB)).toEqual([]);
  });

  it("lists a payment that applied even though staff were asked to look at it, but not one that bought nothing", async () => {
    const submissionFailed = await seedPayment(businessA, "pay_fake_submission", { attentionReason: "submission_failed", attentionRaisedAt: PAID_AT });
    const pendingAtProvider = await seedPayment(businessA, "pay_fake_pending", { attentionReason: "upgrade_provider_pending", attentionRaisedAt: PAID_AT });
    await seedPayment(businessA, "pay_fake_mismatch", { attentionReason: "amount_mismatch", attentionRaisedAt: PAID_AT });
    // Staff dealing with an unapplied payment does not make it one that bought something.
    await seedPayment(businessA, "pay_fake_resolved", {
      attentionReason: "upgrade_not_applied",
      attentionRaisedAt: PAID_AT,
      attentionResolvedAt: PAID_AT,
      attentionResolvedByStaffId: OWNER_A,
    });

    const missing = await listPaymentsWithoutTaxInvoice(dbs.staff.db, businessA);
    expect(missing.map((row) => row.id).sort()).toEqual([paymentA, submissionFailed, pendingAtProvider].sort());
  });

  it("applies the same rule in TypeScript as in SQL", async () => {
    const payment = (overrides: Partial<Parameters<typeof isInvoiceablePayment>[0]> = {}) => ({
      currency: "INR" as const,
      status: "captured" as const,
      attentionReason: null,
      paidAt: PAID_AT,
      ...overrides,
    });
    expect(isInvoiceablePayment(payment())).toBe(true);
    expect(isInvoiceablePayment(payment({ attentionReason: "submission_failed" }))).toBe(true);
    expect(isInvoiceablePayment(payment({ attentionReason: "upgrade_provider_pending" }))).toBe(true);
    for (const reason of ["checkout_replaced", "already_paid", "amount_mismatch", "upgrade_not_applied"] as const) {
      expect(isInvoiceablePayment(payment({ attentionReason: reason })), reason).toBe(false);
    }
    expect(isInvoiceablePayment(payment({ currency: "USD" }))).toBe(false);
    expect(isInvoiceablePayment(payment({ status: "failed" }))).toBe(false);
    expect(isInvoiceablePayment(payment({ status: "refunded" }))).toBe(false);
    expect(isInvoiceablePayment(payment({ paidAt: null }))).toBe(false);
  });

  it("describes how a payment was made", async () => {
    const card = await seedPayment(businessA, "pay_fake_card", { method: "card", cardNetwork: "Visa", cardType: "credit", cardLast4: "4366" });
    expect(await findPaymentForInvoice(dbs.staff.db, card)).toEqual({
      provider: "fake",
      providerPaymentId: "pay_fake_card",
      method: "card",
      cardNetwork: "Visa",
      cardType: "credit",
      cardLast4: "4366",
      upiVpa: null,
      manualReference: null,
    });
    await expect(findPaymentForInvoice(dbs.staff.db, "00000000-0000-7000-8000-000000000000")).rejects.toThrow(/not found/);
  });
});

describe("billing details", () => {
  const input = (businessId: string, overrides: Partial<BillingProfileInput> = {}): BillingProfileInput => ({ businessId, ...sampleBillingDetails, ...overrides });

  it("keeps a customer's billing details to its own business", async () => {
    await asOwner(businessA, OWNER_A, (tx) => saveBillingProfile(tx, input(businessA)));
    expect(await asOwner(businessB, OWNER_B, (tx) => findBillingProfile(tx, businessA))).toBeNull();
    expect(await asOwner(businessA, OWNER_A, (tx) => findBillingProfile(tx, businessA))).toMatchObject({ legalName: "QA Premium Business", email: "accounts@qapremium.in", phone: "+919820012345" });
    expect((await findBillingProfile(dbs.staff.db, businessA))?.legalName).toBe(sampleBillingDetails.legalName);
  });

  it("replaces the details on a second save", async () => {
    await asOwner(businessA, OWNER_A, (tx) => saveBillingProfile(tx, input(businessA)));
    await asOwner(businessA, OWNER_A, (tx) => saveBillingProfile(tx, input(businessA, { legalName: "QA Premium Pvt Ltd", gstin: null, email: null, phone: null })));
    expect(await findBillingProfile(dbs.staff.db, businessA)).toMatchObject({ legalName: "QA Premium Pvt Ltd", gstin: null, email: null, phone: null });
    expect(await dbs.owner.db.execute(sql`select count(*)::int as n from billing_profiles`).then((result) => (result.rows[0] as { n: number }).n)).toBe(1);
  });

  it("replaces every detail on save, so nothing from an earlier save survives", async () => {
    await asOwner(businessA, OWNER_A, (tx) => saveBillingProfile(tx, input(businessA, { addressLine2: "Near the station" })));
    const cleared = { ...input(businessA), gstin: null, addressLine2: null, email: null, phone: null };
    await asOwner(businessA, OWNER_A, (tx) => saveBillingProfile(tx, cleared));
    expect(await findBillingProfile(dbs.staff.db, businessA)).toMatchObject({ gstin: null, addressLine2: null, email: null, phone: null });
  });

  it("will not compile a save that leaves a detail out, which is how an old one used to survive", () => {
    const { gstin: _omitted, ...withoutGstin } = input(businessA);
    // @ts-expect-error every column is required, so a caller cannot forget to clear one
    const save = (): Promise<unknown> => saveBillingProfile(dbs.staff.db, withoutGstin);
    expect(save).toBeTypeOf("function");
  });

  it("refuses to save details for another business", async () => {
    expect(await captureErrorText(asOwner(businessB, OWNER_B, (tx) => saveBillingProfile(tx, input(businessA))))).toMatch(/row-level security/i);
  });

  it("does not let a customer delete its billing details", async () => {
    await saveBillingProfile(dbs.staff.db, input(businessA));
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.execute(sql`delete from billing_profiles`)))).toMatch(/permission denied/i);
  });

  it("refuses details the database cannot print on an invoice", async () => {
    expect(await captureErrorText(saveBillingProfile(dbs.staff.db, input(businessA, { postalCode: "00000" })))).toMatch(/billing_profiles_postal_code_check/);
    expect(await captureErrorText(saveBillingProfile(dbs.staff.db, input(businessA, { stateCode: "KA" })))).toMatch(/billing_profiles_state_code_check/);
    expect(await captureErrorText(saveBillingProfile(dbs.staff.db, input(businessA, { email: "nobody" })))).toMatch(/billing_profiles_email_check/);
    expect(await captureErrorText(saveBillingProfile(dbs.staff.db, input(businessA, { phone: "98200" })))).toMatch(/billing_profiles_phone_check/);
  });

  it("falls back on the business name and onboarding address when no billing details exist", async () => {
    await dbs.staff.db.insert(businessProfiles).values({
      businessId: businessA,
      displayName: "QA Premium",
      addressLine1: "Shop 4, Gokul Arcade",
      addressLine2: null,
      city: "Mumbai",
      region: "Maharashtra",
      postalCode: "400080",
    });
    expect(await findInvoiceFallbackRecipient(dbs.staff.db, businessA)).toEqual({
      name: "QA Premium Business",
      addressLines: ["Shop 4, Gokul Arcade", "Mumbai 400080"],
      region: "Maharashtra",
      postalCode: "400080",
      registeredStateCode: null,
    });
    expect(await findInvoiceFallbackRecipient(dbs.staff.db, businessB)).toEqual({ name: "Riverside", addressLines: [], region: null, postalCode: null, registeredStateCode: null });
    await expect(findInvoiceFallbackRecipient(dbs.staff.db, "00000000-0000-7000-8000-000000000000")).rejects.toThrow(/not found/);
  });

  it("finds the owner's mobile for the invoice, and null when they have none", async () => {
    expect(await findBusinessOwnerPhone(dbs.staff.db, businessA)).toBeNull();
    await dbs.staff.db.update(users).set({ phoneNumber: "+919820012345" }).where(eq(users.id, OWNER_A));
    expect(await findBusinessOwnerPhone(dbs.staff.db, businessA)).toBe("+919820012345");
    expect(await findBusinessOwnerPhone(dbs.staff.db, businessB)).toBeNull();
    expect(await findBusinessOwnerPhone(dbs.staff.db, "00000000-0000-7000-8000-000000000000")).toBeNull();
  });

  it("trims the fallback address and treats blank parts as missing", async () => {
    await dbs.staff.db.insert(businessProfiles).values({
      businessId: businessA,
      displayName: "QA Premium",
      addressLine1: "  Shop 4, Gokul Arcade ",
      addressLine2: "   ",
      city: " Mumbai ",
      region: "  ",
      postalCode: " 400080 ",
    });
    expect(await findInvoiceFallbackRecipient(dbs.staff.db, businessA)).toEqual({
      name: "QA Premium Business",
      addressLines: ["Shop 4, Gokul Arcade", "Mumbai 400080"],
      region: null,
      postalCode: "400080",
      registeredStateCode: null,
    });
    await dbs.staff.db.update(businessProfiles).set({ city: "\t", postalCode: " " }).where(eq(businessProfiles.businessId, businessA));
    expect(await findInvoiceFallbackRecipient(dbs.staff.db, businessA)).toEqual({
      name: "QA Premium Business",
      addressLines: ["Shop 4, Gokul Arcade"],
      region: null,
      postalCode: null,
      registeredStateCode: null,
    });
  });

  it("returns the state the owner typed at sign-up, to decide the invoice's place of supply", async () => {
    await dbs.staff.db.update(businesses).set({ countryCode: "IN", stateCode: "ka" }).where(eq(businesses.id, businessA));
    expect((await findInvoiceFallbackRecipient(dbs.staff.db, businessA)).registeredStateCode).toBe("ka");
    await expect(dbs.staff.db.update(businesses).set({ countryCode: "AE", stateCode: "ka" }).where(eq(businesses.id, businessA))).rejects.toThrow();
  });

  it("locks a payment for its invoice, and refuses one that does not exist", async () => {
    await expect(dbs.staff.db.transaction((tx) => lockPaymentForInvoice(tx, paymentA))).resolves.toBeUndefined();
    expect(await captureErrorText(dbs.staff.db.transaction((tx) => lockPaymentForInvoice(tx, "00000000-0000-7000-8000-000000000000")))).toMatch(
      /not found/,
    );
  });

  it("reads a referral code's text and discount for the invoice note", async () => {
    const rows = await dbs.staff.db
      .insert(referralCodes)
      .values([
        { code: "FLAT1000", currency: "INR", discountKind: "amount", discountAmountCents: 100_000, createdByStaffId: OWNER_A },
        { code: "GAURAV", currency: "INR", discountKind: "percent", discountPercentBasisPoints: 2_000, createdByStaffId: OWNER_A },
      ])
      .returning({ id: referralCodes.id, code: referralCodes.code });
    const idOf = (code: string): string => rows.find((row) => row.code === code)?.id ?? "";
    expect(await findReferralCodeForInvoice(dbs.staff.db, idOf("FLAT1000"))).toEqual({
      code: "FLAT1000",
      discountKind: "amount",
      discountPercentBasisPoints: null,
    });
    expect(await findReferralCodeForInvoice(dbs.staff.db, idOf("GAURAV"))).toEqual({
      code: "GAURAV",
      discountKind: "percent",
      discountPercentBasisPoints: 2_000,
    });
    expect(await findReferralCodeForInvoice(dbs.staff.db, "00000000-0000-7000-8000-000000000000")).toBeNull();
  });
});
