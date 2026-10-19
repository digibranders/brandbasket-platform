import { listMissingTaxInvoices, listTaxInvoicesIssuedBetween } from "@brandbasket/db";
import { monthRange, registerInvoiceOf, registerTotals } from "@brandbasket/shared/lib/billing/invoice-register";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { ChevronRightIcon, DownloadIcon } from "@brandbasket/shared/ui/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { Avatar } from "@/components/console/avatar";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Figures } from "@/components/console/figures";
import { HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { FactList, Quiet, Section } from "@/components/console/section";
import {
  missingRegisterRow,
  monthLabel,
  monthLinks,
  registerRow,
  registerTotalsView,
  resolveRegisterMonth,
} from "@/lib/invoice-register-view";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";

export const metadata: Metadata = { title: "Invoices" };

/** More than this and the list says it is showing the oldest ones: a failed invoice should be a rare thing. */
const MISSING_LIMIT = 50;

interface InvoicesPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * The month's tax invoice register for the CA (`?month=2026-10`, the current Indian month by default): totals, every
 * invoice with its PDF, and a CSV. Above it, every payment still missing its invoice across all clients, so a failed
 * invoice shows up here instead of only in a log (D15). Hairline rows that wrap on a phone, not a table (DESIGN.md).
 */
export default async function InvoicesPage({ searchParams }: InvoicesPageProps): Promise<ReactElement> {
  await requireStaffCan("money");
  const params = await searchParams;
  const month = resolveRegisterMonth(params.month, new Date());
  const range = month === null ? null : monthRange(month);
  if (month === null || range === null) notFound();

  const db = getStaffDb();
  const [invoices, missing] = await Promise.all([
    listTaxInvoicesIssuedBetween(db, range.from, range.to),
    listMissingTaxInvoices(db, MISSING_LIMIT + 1),
  ]);
  const rows = invoices.map((invoice) => registerRow(invoice.id, registerInvoiceOf(invoice)));
  const totals = registerTotalsView(registerTotals(invoices.map(registerInvoiceOf)));
  const links = monthLinks(month);
  const label = monthLabel(month);
  const missingRows = missing.slice(0, MISSING_LIMIT).map(missingRegisterRow);

  return (
    <>
      <PageHeader
        title="Invoices"
        meta={`${label}, by the day each invoice was issued`}
        action={
          <a href={links.exportHref} className={buttonPrimary}>
            <DownloadIcon className="size-4" />
            Download CSV
          </a>
        }
      />

      <nav aria-label="Month" className="mt-8 flex flex-wrap items-end gap-x-6 gap-y-4">
        {links.previous === null ? null : (
          <Link href={links.previous.href} className="link-underline inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            <ChevronRightIcon className="size-4 rotate-180" />
            <span>
              <span className="sr-only">Previous month: </span>
              {links.previous.label}
            </span>
          </Link>
        )}
        <form action="/invoices" method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="register-month" className={labelClasses}>
              Month<RequiredMark />
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
        {links.next === null ? null : (
          <Link href={links.next.href} className="link-underline inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            <span>
              <span className="sr-only">Next month: </span>
              {links.next.label}
            </span>
            <ChevronRightIcon className="size-4" />
          </Link>
        )}
      </nav>

      {missingRows.length === 0 ? null : (
        <div className="mt-10">
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
        </div>
      )}

      <Figures
        items={[
          { value: totals.count, label: "Invoices", note: label, long: true },
          { value: totals.figures.taxable, label: "Taxable value", long: true },
          { value: totals.figures.total, label: "Invoiced with GST", long: true },
        ]}
      />

      <div className="mt-10">
        <Section title="Tax" aside="For GSTR-3B">
          <FactList items={totals.tax} />
        </Section>
        <Section title="Customers" aside="For GSTR-1">
          <FactList items={totals.split} />
        </Section>
        <Section id="register" title="Invoices" aside={`${rows.length} in ${label}`}>
          {rows.length === 0 ? (
            <Quiet>No invoices were issued in {label}.</Quiet>
          ) : (
            <ul aria-label={`Invoices issued in ${label}`} className="divide-y divide-line">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4 first:pt-0">
                  <div className="min-w-0">
                    <p className="whitespace-nowrap font-medium tabular-nums">{row.number}</p>
                    <p className="mt-0.5 break-words">{row.customer}</p>
                    <p className="mt-0.5 break-words text-sm tabular-nums text-ink-soft">{row.detail}</p>
                  </div>
                  <div className="flex items-center gap-5">
                    <span className="font-serif text-lg tabular-nums">{row.total}</span>
                    <a href={row.downloadHref} aria-label={row.downloadLabel} className="link-underline text-sm font-semibold text-accent">
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
