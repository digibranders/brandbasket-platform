"use client";

import { ArrowLeft, ArrowRight, Check, DownloadSimple, Receipt } from "@phosphor-icons/react/dist/ssr";
import { Fragment, useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { payChargeAction } from "@/app/app-host/(protected)/billing/actions";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageSection } from "@/components/v2/page";
import type { BillingMonth, BillLine } from "@/lib/billing/billing-months";
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

/** Pay for an extra: a form post, so a payment is only ever opened on purpose. */
function PayButton({ chargeId, title }: { readonly chargeId: string; readonly title: string }): ReactElement {
  return (
    <form action={payChargeAction} className="inline-block">
      <input type="hidden" name="chargeId" value={chargeId} />
      <SubmitButton size="sm" pendingLabel="Opening…" className="h-8! rounded-lg! px-4! py-0! text-[0.8125rem]! hover:bg-ink-raised!">
        Pay<span className="sr-only"> for {title}</span>
      </SubmitButton>
    </form>
  );
}

/** One payment: what it was and what it came to, then its invoice number and date, then its state and its receipt. */
function PaymentRow({ line }: { readonly line: BillLine }): ReactElement {
  if (line.kind === "due") {
    return (
      <li className="grid gap-1 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-semibold text-ink">{line.title}</p>
          <p className="shrink-0 font-figure text-sm font-semibold tabular-nums text-ink">{line.amount}</p>
        </div>
        <p className="text-[0.8125rem] text-ink-2">
          Added <LocalDate iso={line.addedIso} />
          {line.taxNote === null ? null : `, ${line.taxNote}`}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <StatusPill tone="due" label="To pay" detail={null} />
          <PayButton chargeId={line.chargeId} title={line.title} />
        </div>
      </li>
    );
  }
  const { row } = line;
  return (
    <li className="grid gap-1 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-ink">{row.description}</p>
        <p className="shrink-0 font-figure text-sm font-semibold tabular-nums text-ink">{row.amount}</p>
      </div>
      <p className="text-[0.8125rem] text-ink-2">
        <RowTitle title={row.title} /> · {row.paidAtIso === null ? "Not recorded" : <LocalDate iso={row.paidAtIso} />}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <StatusPill tone={row.tone} label={row.status} detail={row.statusDetail} />
        <ReceiptLink row={row} />
      </div>
    </li>
  );
}

function lineKey(line: BillLine): string {
  return line.kind === "receipt" ? line.row.id : `due-${line.chargeId}`;
}

/** The receipts in a list of months that have a PDF to download. */
function downloadableIds(months: readonly BillingMonth[]): string[] {
  return months.flatMap((month) => month.lines.flatMap((line) => (line.kind === "receipt" && line.row.downloadable ? [line.row.id] : [])));
}

/** A month's heading: its name and what it came to, with its receipts as one PDF when it has any. */
function MonthHeading({ month }: { readonly month: BillingMonth }): ReactElement {
  const ids = downloadableIds([month]);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3 className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{month.label}</h3>
      <p className="flex items-baseline gap-3 text-[0.8125rem] text-ink-2">
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
 * The customer's payments, month by month: each month's plan payment and the extras added that month (paid, or still to pay
 * with a Pay button), as rows that wrap instead of cutting words short. Every payment keeps its PDF, a tax invoice or the
 * older receipt; each month downloads as one PDF, and Download all takes every one.
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
          {pageMonths.map((month) => (
            <section key={month.key} aria-label={month.label}>
              <MonthHeading month={month} />
              <ul className="mt-1 divide-y divide-line">
                {month.lines.map((line) => (
                  <PaymentRow key={lineKey(line)} line={line} />
                ))}
              </ul>
            </section>
          ))}
          {view.pageCount > 1 ? <Pager page={view.page} pageCount={view.pageCount} onPage={setRequestedPage} /> : null}
        </div>
      )}
    </PageSection>
  );
}
