"use client";

import { ArrowLeft, ArrowRight, Check, DownloadSimple, Receipt } from "@phosphor-icons/react/dist/ssr";
import { Fragment, useId, useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { payChargeAction } from "@/app/app-host/(protected)/billing/actions";
import { ConfirmPaymentDialog } from "@/components/panel/confirm-payment";
import { PaymentConfirmButton, usePaymentForm } from "@/components/panel/payment-form";
import { LIFT, SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageSection } from "@/components/v2/page";
import type { BillingMonth, BillLine } from "@/lib/billing/billing-months";
import type { PaymentSummary } from "@/lib/billing/payment-summary";
import { splitInvoiceNumber } from "@/lib/billing/invoice-title";
import { BILLING_MONTHS_PER_PAGE, pageWindow } from "@/lib/billing/pagination";
import { receiptDownloadHref } from "@/lib/billing/receipt-download";
import type { ReceiptRow, ReceiptTone } from "@/lib/billing/receipt-rows";

type Tone = ReceiptTone | "due";

const TONES: Readonly<Record<Tone, string>> = {
  paid: "bg-sage-wash text-sage-deep",
  due: "bg-rattan-wash text-rattan-ink",
  review: "bg-sunken text-ink",
  refunded: "bg-sunken text-ink-2",
  failed: "bg-sunken text-ink-2",
};

function StatusPill({ tone, label, detail }: { readonly tone: Tone; readonly label: string; readonly detail: string | null }): ReactElement {
  return (
    <span title={detail ?? undefined} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", TONES[tone])}>
      {tone === "paid" ? <Check size={12} weight="bold" aria-hidden="true" /> : null}
      {label}
      {detail === null ? null : <span className="sr-only">. {detail}</span>}
    </span>
  );
}

/**
 * A row's invoice number kept on one line. A narrow screen would otherwise break "FY/26-27/000001" at its hyphen. Screen
 * readers read the same words; the Receipt link keeps the plain string title for its name.
 */
function RowTitle({ title }: { readonly title: string }): ReactElement {
  return (
    <>
      {splitInvoiceNumber(title).map((part, index) =>
        part.nowrap ? (
          <span key={index} className="whitespace-nowrap">
            {part.text}
          </span>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

function ReceiptLink({ row }: { readonly row: ReceiptRow }): ReactElement | null {
  if (!row.downloadable) return null;
  return (
    <a href={receiptDownloadHref([row.id])} download className="inline-flex min-h-11 items-center text-[0.8125rem] font-semibold text-ink underline underline-offset-[3px] transition-colors duration-200 hover:text-ink-2">
      Receipt<span className="sr-only"> for {row.title}</span>
    </a>
  );
}

/** Pay for an extra: Pay shows what is paid, and the dialog's button posts the form, so a payment is only ever opened on purpose. */
function PayButton({ chargeId, title, summary }: { readonly chargeId: string; readonly title: string; readonly summary: PaymentSummary }): ReactElement {
  const formId = useId();
  const { action, confirm, opening } = usePaymentForm(payChargeAction);
  return (
    <form id={formId} action={action} className="inline-block">
      <input type="hidden" name="chargeId" value={chargeId} />
      <Button type="button" size="sm" onClick={confirm.ask} disabled={opening} aria-busy={opening} className="h-8! rounded-lg! px-4! py-0! text-[0.8125rem]! hover:bg-ink-raised!">
        {opening ? "Opening…" : <>Pay<span className="sr-only"> for {title}</span></>}
      </Button>
      <ConfirmPaymentDialog
        summary={summary}
        open={confirm.open}
        onClose={confirm.close}
        busy={opening}
        confirm={<PaymentConfirmButton formId={formId} opening={opening} label={`Pay ${summary.total}`} />}
      />
    </form>
  );
}

/*
 * The table's cells. Wide enough (a container of 48rem), each payment is a table row; narrower, the same cells are laid out as a
 * card: what it was and what it came to, then its date and invoice, then its status and receipt. Every table element
 * keeps its ARIA role, because a changed `display` would otherwise drop the table's meaning for a screen reader.
 */
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-line px-5 py-4 @3xl:table-row @3xl:px-0";
const CELL = "@3xl:table-cell @3xl:px-5 @3xl:py-4 @3xl:align-middle";
const HEAD = "px-5 py-3 text-left text-[0.8125rem] font-medium text-ink-3";

/** One payment, as a row: its date, what it was, its invoice number, what it came to, its state and its receipt. */
function PaymentRow({ line }: { readonly line: BillLine }): ReactElement {
  if (line.kind === "due") {
    return (
      <tr role="row" className={ROW}>
        <td role="cell" className={cn(CELL, "col-span-2 row-start-2 text-[0.8125rem] text-ink-2 @3xl:text-[0.9375rem]")}>
          <LocalDate iso={line.addedIso} />
        </td>
        <td role="cell" className={cn(CELL, "col-start-1 row-start-1 min-w-0")}>
          <p className="text-[0.9375rem] font-semibold text-ink">{line.title}</p>
          {line.taxNote === null ? null : <p className="text-[0.8125rem] text-ink-3">{line.taxNote}</p>}
        </td>
        <td role="cell" className={cn(CELL, "col-span-2 row-start-3 text-[0.8125rem] text-ink-3 @3xl:text-[0.9375rem]")}>
          Not issued yet
        </td>
        <td role="cell" className={cn(CELL, "col-start-2 row-start-1 text-right font-figure text-[0.9375rem] font-semibold tabular-nums text-ink")}>{line.amount}</td>
        <td role="cell" className={cn(CELL, "col-start-1 row-start-4 mt-1.5 @3xl:mt-0")}>
          <StatusPill tone="due" label="To pay" detail={null} />
        </td>
        <td role="cell" className={cn(CELL, "col-start-2 row-start-4 mt-1.5 justify-self-end text-right @3xl:mt-0")}>
          <PayButton chargeId={line.chargeId} title={line.title} summary={line.summary} />
        </td>
      </tr>
    );
  }
  const { row } = line;
  return (
    <tr role="row" className={ROW}>
      <td role="cell" className={cn(CELL, "col-span-2 row-start-2 whitespace-nowrap text-[0.8125rem] text-ink-2 @3xl:text-[0.9375rem]")}>
        {row.paidAtIso === null ? "Not recorded" : <LocalDate iso={row.paidAtIso} />}
      </td>
      <td role="cell" className={cn(CELL, "col-start-1 row-start-1 min-w-0")}>
        <p className="text-[0.9375rem] font-semibold text-ink">{row.description}</p>
        <p className="text-[0.8125rem] text-ink-3">{row.plan}</p>
      </td>
      <td role="cell" className={cn(CELL, "col-span-2 row-start-3 text-[0.8125rem] text-ink-2 @3xl:text-[0.9375rem]")}>
        <RowTitle title={row.title} />
      </td>
      <td role="cell" className={cn(CELL, "col-start-2 row-start-1 text-right font-figure text-[0.9375rem] font-semibold tabular-nums text-ink")}>{row.amount}</td>
      <td role="cell" className={cn(CELL, "col-start-1 row-start-4 mt-1.5 @3xl:mt-0")}>
        <StatusPill tone={row.tone} label={row.status} detail={row.statusDetail} />
      </td>
      <td role="cell" className={cn(CELL, "col-start-2 row-start-4 mt-1.5 justify-self-end text-right @3xl:mt-0")}>
        <ReceiptLink row={row} />
      </td>
    </tr>
  );
}

function lineKey(line: BillLine): string {
  return line.kind === "receipt" ? line.row.id : `due-${line.chargeId}`;
}

/** The receipts in a list of months that have a PDF to download. */
function downloadableIds(months: readonly BillingMonth[]): string[] {
  return months.flatMap((month) => month.lines.flatMap((line) => (line.kind === "receipt" && line.row.downloadable ? [line.row.id] : [])));
}

/** A month's heading row: its name and what it came to, with its receipts as one PDF when it has any. */
function MonthHeading({ month }: { readonly month: BillingMonth }): ReactElement {
  const ids = downloadableIds([month]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4">
      <h3 className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{month.label}</h3>
      <p className="flex items-center gap-3 text-[0.8125rem] text-ink-2">
        <span>
          <span className="sr-only">Total for {month.label}: </span>
          <span className="font-figure tabular-nums text-ink">{month.total}</span>
        </span>
        {ids.length === 0 ? null : (
          <a href={receiptDownloadHref(ids)} download className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-[3px] transition-colors duration-200 hover:text-ink-2">
            Download month<span className="sr-only"> {month.label}</span>
          </a>
        )}
      </p>
    </div>
  );
}

const PAGER_BUTTON = `${SOFT_BUTTON} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-sunken`;

/** Earlier and later months, when the bill runs to more than one page. */
function Pager({ page, pageCount, onPage }: { readonly page: number; readonly pageCount: number; readonly onPage: (page: number) => void }): ReactElement {
  return (
    <nav aria-label="Payment pages" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="text-[0.8125rem] tabular-nums text-ink-2" aria-live="polite">
        Page {page} of {pageCount}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={PAGER_BUTTON} disabled={page === 1} onClick={() => onPage(page - 1)}>
          <ArrowLeft size={14} aria-hidden="true" />
          Newer
        </button>
        <button type="button" className={PAGER_BUTTON} disabled={page === pageCount} onClick={() => onPage(page + 1)}>
          Older
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

interface PaymentsListProps {
  readonly months: readonly BillingMonth[];
  /** What the empty state says. A free listing account is billed for ad spots, not a plan, so it passes its own. */
  readonly emptyBody?: string;
}

const DEFAULT_EMPTY_BODY = "Once your first payment goes through, each month’s plan and any extras show here, with an invoice or receipt for every payment.";

/**
 * The customer's payments as a table, a group of rows for each month: each month's plan payment and the extras added that month
 * (paid, or still to pay with a Pay button). The columns are the date, what it was, its invoice number, the amount, the state
 * and the receipt. Every payment keeps its PDF, a tax invoice or the older receipt; each month downloads as one PDF, and Download
 * all takes every one. On a narrow page each row becomes a card, so no word is cut short.
 */
export function PaymentsList({ months, emptyBody = DEFAULT_EMPTY_BODY }: PaymentsListProps): ReactElement {
  const [requestedPage, setRequestedPage] = useState(1);
  const view = pageWindow(months.length, requestedPage, BILLING_MONTHS_PER_PAGE);
  const pageMonths = months.slice(view.start, view.end);
  const hasDownloads = downloadableIds(months).length > 0;

  return (
    <PageSection
      id="payments"
      title="Payments"
      aside={
        hasDownloads ? (
          <a href={receiptDownloadHref(null)} download className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-ink underline underline-offset-[3px] transition-colors duration-200 hover:text-ink-2">
            <DownloadSimple size={14} aria-hidden="true" />
            Download all<span className="sr-only"> invoices and receipts</span>
          </a>
        ) : undefined
      }
    >
      {months.length === 0 ? (
        <EmptyState compact icon={Receipt} title="Nothing billed yet" text={emptyBody} />
      ) : (
        <div className="grid gap-6">
          <div className={cn(LIFT, "overflow-hidden")}>
            <table role="table" aria-labelledby="payments-title" className="block w-full border-collapse text-left @3xl:table">
              <thead role="rowgroup" className="sr-only @3xl:not-sr-only @3xl:table-header-group">
                <tr role="row" className="@3xl:table-row">
                  <th role="columnheader" scope="col" className={cn(HEAD, "@3xl:w-44")}>
                    Date
                  </th>
                  <th role="columnheader" scope="col" className={HEAD}>
                    Description
                  </th>
                  <th role="columnheader" scope="col" className={cn(HEAD, "@3xl:w-60")}>
                    Invoice
                  </th>
                  <th role="columnheader" scope="col" className={cn(HEAD, "@3xl:w-32 @3xl:text-right")}>
                    Amount
                  </th>
                  <th role="columnheader" scope="col" className={cn(HEAD, "@3xl:w-36")}>
                    Status
                  </th>
                  <th role="columnheader" scope="col" className={cn(HEAD, "@3xl:w-32 @3xl:text-right")}>
                    <span className="sr-only">Receipt</span>
                  </th>
                </tr>
              </thead>
              {pageMonths.map((month) => (
                <tbody key={month.key} role="rowgroup" aria-label={month.label} className="block @3xl:table-row-group">
                  <tr role="row" className="block bg-bg @3xl:table-row @3xl:border-t @3xl:border-line">
                    <th role="rowheader" colSpan={6} scope="rowgroup" className="block px-5 py-2 text-left font-normal @3xl:table-cell">
                      <MonthHeading month={month} />
                    </th>
                  </tr>
                  {month.lines.map((line) => (
                    <PaymentRow key={lineKey(line)} line={line} />
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          {view.pageCount > 1 ? <Pager page={view.page} pageCount={view.pageCount} onPage={setRequestedPage} /> : null}
        </div>
      )}
    </PageSection>
  );
}
