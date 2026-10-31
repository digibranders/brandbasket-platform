import { listMissingTaxInvoices, listPaymentsForStaff, listTaxInvoicesIssuedBetween } from "@brandbasket/db";
import { documentSeries, financialYearOf, financialYearRange, gstSummary, monthTotals } from "@brandbasket/shared/lib/billing/gst-summary";
import { monthRange, registerInvoiceOf, registerTotals } from "@brandbasket/shared/lib/billing/invoice-register";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { DownloadIcon } from "@brandbasket/shared/ui/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { Avatar } from "@/components/console/avatar";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Figures } from "@/components/console/figures";
import { FilterPills } from "@/components/console/filter-pills";
import { HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { Quiet, Section } from "@/components/console/section";
import { GstSummary } from "@/components/invoices/gst-summary";
import { PaymentsSection } from "@/components/invoices/payments-section";
import { RegisterTable } from "@/components/invoices/register-table";
import { reconciliationItems } from "@/lib/invoice-reconciliation";
import {
  documentSeriesView,
  exportZipHref,
  financialYearChips,
  gstSummaryView,
  missingRegisterRow,
  monthLabel,
  monthLinks,
  plural,
  registerFooterView,
  registerMoney,
  registerTableRow,
  registerTotalsView,
  resolveRegisterMonth,
} from "@/lib/invoice-register-view";
import { paymentMonthBounds, paymentRowView } from "@/lib/payments-view";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";

export const metadata: Metadata = { title: "Invoices" };

/** More than this and the list says it is showing the oldest ones: a failed invoice should be a rare thing. */
const MISSING_LIMIT = 50;

/** shortcut: one month of payments is read in one go; page the query if a month ever passes 1,000 payments. */
const PAYMENT_LIMIT = 1000;

interface InvoicesPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * A month's books for the CA (`?month=2026-10`, the current Indian month by default): the financial year month by month,
 * the figures, what the GSTR-1 and GSTR-3B need, every invoice with all its tax columns and its PDF, and the month's payments
 * with how they line up to the invoices. Downloads: the whole month as a ZIP of PDFs with the register, the register as
 * CSV, or one PDF from its row. Above the detail, every payment still missing its invoice across all clients, so a failed
 * invoice shows up here instead of only in a log (D15). Tables, as the console's lists are (DESIGN.md).
 */
export default async function InvoicesPage({ searchParams }: InvoicesPageProps): Promise<ReactElement> {
  const { user } = await requireStaffCan("money");
  const params = await searchParams;
  const month = resolveRegisterMonth(params.month, new Date());
  const range = month === null ? null : monthRange(month);
  const year = month === null ? null : financialYearOf(month);
  const yearRange = month === null ? null : financialYearRange(month);
  const bounds = month === null ? null : paymentMonthBounds(month);
  if (month === null || range === null || year === null || yearRange === null || bounds === null) notFound();

  const db = getStaffDb();
  const [yearInvoices, missing, payments] = await Promise.all([
    listTaxInvoicesIssuedBetween(db, yearRange.from, yearRange.to),
    listMissingTaxInvoices(db, MISSING_LIMIT + 1),
    listPaymentsForStaff(db, { ...bounds, limit: PAYMENT_LIMIT }),
  ]);
  await logStaffAccess({ staffUserId: user.id, action: "invoice.register_view", targetType: "invoice_register", targetId: month });

  const invoices = yearInvoices.filter((invoice) => invoice.issuedOn.startsWith(month));
  const upToMonth = yearInvoices.filter((invoice) => invoice.issuedOn.slice(0, 7) <= month);
  const totals = registerTotals(invoices.map(registerInvoiceOf));
  const totalsView = registerTotalsView(totals);
  const links = monthLinks(month);
  const label = monthLabel(month);
  const byMonth = monthTotals(yearInvoices, year.months);
  const yearCount = byMonth.reduce((sum, entry) => sum + entry.count, 0);
  const yearCents = byMonth.reduce((sum, entry) => sum + entry.totalCents, 0);
  const received = payments.filter((row) => row.currency === "INR" && row.status !== "failed");
  const receivedCents = received.reduce((sum, row) => sum + row.amountCents, 0);
  const missingRows = missing.slice(0, MISSING_LIMIT).map(missingRegisterRow);
  const gst = gstSummaryView(gstSummary(invoices));
  const series = documentSeriesView(documentSeries(invoices, upToMonth));
  const paymentRows = [...payments].reverse().map(paymentRowView);

  return (
    <>
      <PageHeader
        title="Invoices"
        meta={`${label}, financial year ${year.label}. Each invoice sits in the month it was issued.`}
        action={
          <>
            {links.previous === null ? null : (
              <Link href={links.previous.href} className={buttonSecondary}>
                <span aria-hidden="true">‹ </span>
                <span className="sr-only">Previous month: </span>
                {links.previous.label}
              </Link>
            )}
            {links.next === null ? null : (
              <Link href={links.next.href} className={buttonSecondary}>
                <span className="sr-only">Next month: </span>
                {links.next.label}
                <span aria-hidden="true"> ›</span>
              </Link>
            )}
            <a href={links.exportHref} className={buttonSecondary}>
              <DownloadIcon className="size-4" />
              Register CSV
            </a>
            {invoices.length === 0 ? null : (
              <a href={exportZipHref(month)} className={buttonPrimary}>
                <DownloadIcon className="size-4" />
                Download all as ZIP
              </a>
            )}
          </>
        }
      />

      <Section title={`Financial year ${year.label}`} aside={`${plural(yearCount, "invoice")}, ${registerMoney(yearCents)}`} className="mt-6">
        <FilterPills
          label="Month of the financial year"
          options={financialYearChips(month, byMonth).map((chip) => ({ href: chip.href, label: chip.label, count: chip.count, current: chip.current }))}
        />
        <form action="/invoices" method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="register-month" className={labelClasses}>
              Go to another month<RequiredMark />
            </label>
            <input
              id="register-month"
              name="month"
              type="month"
              required
              defaultValue={month}
              pattern="[0-9]{4}-[0-9]{2}"
              placeholder="2026-10"
              className={`${fieldClasses} w-auto`}
            />
          </div>
          <GatedSubmitButton className={buttonSecondary}>Show month</GatedSubmitButton>
        </form>
      </Section>

      {missingRows.length === 0 ? null : (
        <Section
          id="missing-invoices"
          title="Missing invoices"
          tone="attention"
          aside={`${missing.length > MISSING_LIMIT ? `${MISSING_LIMIT}+` : missingRows.length} to issue`}
        >
          <p className="max-w-2xl text-ink-soft">
            These payments came in without a tax invoice, across every client. Open the client to issue it. It is dated the day it is issued.
          </p>
          <HairlineList label="Payments missing an invoice">
            {missingRows.map((row) => (
              <HairlineRow
                key={row.paymentId}
                href={row.href}
                lead={<Avatar id={row.businessId} name={row.businessName} />}
                title={row.businessName}
                sub={row.detail}
              />
            ))}
          </HairlineList>
          {missing.length > MISSING_LIMIT ? (
            <p className="mt-3 text-sm text-ink-soft">Showing the oldest {MISSING_LIMIT}. The rest appear once these are issued.</p>
          ) : null}
        </Section>
      )}

      <Figures
        items={[
          { value: totalsView.count, label: "Invoices", note: label, long: true },
          { value: totalsView.figures.taxable, label: "Taxable value", long: true },
          { value: registerMoney(totals.cgstCents + totals.sgstCents + totals.igstCents), label: "GST", note: "CGST, SGST and IGST", long: true },
          { value: totalsView.figures.total, label: "Invoiced with GST", long: true },
          { value: registerMoney(receivedCents), label: "Payments received", note: plural(received.length, "payment"), long: true },
        ]}
      />

      <div className="mt-10">
        <Section id="gst-summary" title="For the GST returns" aside="GSTR-3B and GSTR-1">
          <GstSummary summary={gst} b2b={totalsView.split[0] ?? { label: "", value: "" }} series={series} />
        </Section>

        <Section id="register" title="Invoice register" aside={`${plural(invoices.length, "invoice")} in ${label}`}>
          {invoices.length === 0 ? (
            <Quiet>No invoices were issued in {label}.</Quiet>
          ) : (
            <RegisterTable label={`Invoices issued in ${label}`} rows={invoices.map(registerTableRow)} footer={registerFooterView(totals)} />
          )}
        </Section>

        <Section id="payments" title="Payments and how they line up" aside={`${plural(payments.length, "payment")} in ${label}`}>
          <PaymentsSection label={label} reconciliation={reconciliationItems(payments, invoices, month)} rows={paymentRows} />
        </Section>
      </div>
    </>
  );
}
