"use client";

import { Fragment, useState, type ReactElement } from "react";
import { ArrowIcon, CardIcon, ChevronDownIcon, ClockIcon, DocumentIcon, DownloadIcon, TickIcon } from "@brandbasket/shared/ui/icons";
import { EmptyState } from "@brandbasket/shared/ui/panel/empty-state";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { cn } from "@brandbasket/shared/lib/cn";
import { payChargeAction } from "@/app/app-host/(protected)/billing/actions";
import type { BillingMonth, BillLine } from "@/lib/billing/billing-months";
import { splitInvoiceNumber } from "@/lib/billing/invoice-title";
import { BILLING_MONTHS_PER_PAGE, pageWindow } from "@/lib/billing/pagination";
import { receiptDownloadHref } from "@/lib/billing/receipt-download";
import type { ReceiptRow, ReceiptTone } from "@/lib/billing/receipt-rows";

type Tone = ReceiptTone | "due";

const TONES: Readonly<Record<Tone, string>> = {
  paid: "bg-accent-pale text-accent-deep",
  due: "bg-ink text-paper",
  review: "bg-paper-deep text-ink",
  refunded: "text-ink-soft ring-1 ring-line",
  failed: "text-ink-soft ring-1 ring-line",
};

function StatusPill({ tone, label, detail }: { readonly tone: Tone; readonly label: string; readonly detail: string | null }): ReactElement {
  return (
    <span
      title={detail ?? undefined}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", TONES[tone])}
    >
      {tone === "paid" ? <TickIcon className="size-3" /> : null}
      {label}
      {detail === null ? null : <span className="sr-only">. {detail}</span>}
    </span>
  );
}

function LineBadge({ due }: { readonly due: boolean }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full",
        due ? "bg-paper-deep text-ink" : "bg-accent-pale text-accent-deep",
      )}
    >
      {due ? <ClockIcon className="size-5" /> : <DocumentIcon className="size-5" />}
    </span>
  );
}

/**
 * A row's title with its invoice number kept on one line. A narrow screen would otherwise break "FY/26-27/000001" at
 * its hyphen. Screen readers read the same words; the Download link keeps the plain string title for its name.
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

function PaidOn({ row }: { readonly row: ReceiptRow }): ReactElement {
  return row.paidAtIso === null ? <>Not recorded</> : <LocalDate iso={row.paidAtIso} />;
}

function DownloadLink({ row }: { readonly row: ReceiptRow }): ReactElement | null {
  if (!row.downloadable) return null;
  return (
    <a
      href={receiptDownloadHref([row.id])}
      download
      className="font-semibold text-accent-deep transition-colors duration-300 ease-calm hover:text-ink"
    >
      Download<span className="sr-only"> {row.title}</span>
    </a>
  );
}

/** Pay for an extra: a form post, so a payment is only ever opened on purpose. */
function PayButton({ chargeId, title }: { readonly chargeId: string; readonly title: string }): ReactElement {
  return (
    <form action={payChargeAction} className="inline-block">
      <input type="hidden" name="chargeId" value={chargeId} />
      <SubmitButton size="sm" pendingLabel="Opening…" className="px-4 py-1.5 text-xs">
        Pay<span className="sr-only"> for {title}</span>
      </SubmitButton>
    </form>
  );
}

/**
 * The desktop table's columns, defined once so each header and the cells under it always share a width, padding and
 * alignment. One table holds every month, so the columns line up down the whole page; the item column takes the
 * rest. Amounts and the last column sit flush right, everything else flush left.
 */
const COLUMNS = {
  serial: { width: "w-16", cell: "pl-6 pr-2 tabular-nums text-ink-soft" },
  item: { width: "", cell: "pr-6" },
  date: { width: "w-[16%]", cell: "pr-6 tabular-nums" },
  status: { width: "w-[12%]", cell: "pr-6" },
  amount: { width: "w-[11%]", cell: "pr-6 text-right" },
  plan: { width: "w-[15%]", cell: "pr-6" },
  action: { width: "w-[12%]", cell: "pr-6 text-right" },
} as const;

const HEAD_CELL = "py-3.5 align-middle font-medium";
const BODY_CELL = "py-4 align-middle";

interface PagerProps {
  readonly page: number;
  readonly pageCount: number;
  readonly onPage: (page: number) => void;
}

const PAGER_BUTTON =
  "inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold transition-colors duration-300 ease-calm hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card";

/** Previous and next, and the page numbers between them. */
function Pager({ page, pageCount, onPage }: PagerProps): ReactElement {
  return (
    <nav aria-label="Billing pages" className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="text-sm tabular-nums text-ink-soft" aria-live="polite">
        Page {page} of {pageCount}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={PAGER_BUTTON} disabled={page === 1} onClick={() => onPage(page - 1)}>
          <ArrowIcon className="size-4 rotate-180" />
          Newer
        </button>
        <ol className="hidden items-center gap-1 sm:flex">
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
            <li key={number}>
              <button
                type="button"
                aria-label={`Page ${number}`}
                aria-current={number === page ? "page" : undefined}
                onClick={() => onPage(number)}
                className={cn(
                  "size-9 rounded-full text-sm font-semibold tabular-nums transition-colors duration-300 ease-calm",
                  number === page ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink",
                )}
              >
                {number}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className={PAGER_BUTTON} disabled={page === pageCount} onClick={() => onPage(page + 1)}>
          Older
          <ArrowIcon className="size-4" />
        </button>
      </div>
    </nav>
  );
}

/** Every receipt of one month as a single PDF; nothing when the month has only unpaid extras. */
function MonthDownload({ month }: { readonly month: BillingMonth }): ReactElement | null {
  const ids = downloadableIds([month]);
  if (ids.length === 0) return null;
  return (
    <a
      href={receiptDownloadHref(ids)}
      download
      className="text-xs font-semibold text-accent-deep transition-colors duration-300 ease-calm hover:text-ink"
    >
      Download month<span className="sr-only"> {month.label}</span>
    </a>
  );
}

interface MonthToggleProps {
  readonly month: BillingMonth;
  /** The id of the element holding the month's lines. */
  readonly controls: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}

/**
 * A month's name as the button that opens and closes it. The chevron points down while the month is closed and up
 * while it is open.
 */
function MonthToggle({ month, controls, open, onToggle }: MonthToggleProps): ReactElement {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-md text-left font-serif text-base font-medium transition-colors duration-300 ease-calm hover:text-accent-deep"
    >
      <ChevronDownIcon className={cn("size-4 shrink-0 transition-transform duration-300 ease-calm", open && "rotate-180")} />
      {month.label}
      <span className="sr-only">{open ? ", hide lines" : ", show lines"}</span>
    </button>
  );
}

function lineKey(line: BillLine): string {
  return line.kind === "receipt" ? line.row.id : `due-${line.chargeId}`;
}

/** The receipts in a list of months that have a PDF to download. */
function downloadableIds(months: readonly BillingMonth[]): string[] {
  return months.flatMap((month) =>
    month.lines.flatMap((line) => (line.kind === "receipt" && line.row.downloadable ? [line.row.id] : [])),
  );
}

/** A line's serial number within its month, starting at 1. */
interface LineProps {
  readonly line: BillLine;
  readonly serial: number;
}

function DesktopLine({ line, serial }: LineProps): ReactElement {
  if (line.kind === "due") {
    return (
      <tr>
        <td className={cn(BODY_CELL, COLUMNS.serial.cell)}>{serial}</td>
        <td className={cn(BODY_CELL, COLUMNS.item.cell)}>
          <div className="flex min-w-0 items-center gap-3">
            <LineBadge due />
            <div className="min-w-0">
              <p className="truncate font-medium">{line.title}</p>
              <p className="truncate text-xs text-ink-soft">{line.taxNote === null ? "Extra" : `Extra · ${line.taxNote}`}</p>
            </div>
          </div>
        </td>
        <td className={cn(BODY_CELL, COLUMNS.date.cell)}>
          <span className="block truncate" title="Date added">
            <LocalDate iso={line.addedIso} />
          </span>
        </td>
        <td className={cn(BODY_CELL, COLUMNS.status.cell)}>
          <StatusPill tone="due" label="To pay" detail={null} />
        </td>
        <td className={cn(BODY_CELL, COLUMNS.amount.cell, "tabular-nums")}>{line.amount}</td>
        <td className={cn(BODY_CELL, COLUMNS.plan.cell)}>Extra</td>
        <td className={cn(BODY_CELL, COLUMNS.action.cell)}>
          <PayButton chargeId={line.chargeId} title={line.title} />
        </td>
      </tr>
    );
  }
  const { row } = line;
  return (
    <tr>
      <td className={cn(BODY_CELL, COLUMNS.serial.cell)}>{serial}</td>
      <td className={cn(BODY_CELL, COLUMNS.item.cell)}>
        <div className="flex min-w-0 items-center gap-3">
          <LineBadge due={false} />
          <div className="min-w-0">
            <p className="truncate font-medium">
                <RowTitle title={row.title} />
              </p>
            <p className="truncate text-xs text-ink-soft">{row.description}</p>
          </div>
        </div>
      </td>
      <td className={cn(BODY_CELL, COLUMNS.date.cell)}>
        <span className="block truncate">
          <PaidOn row={row} />
        </span>
      </td>
      <td className={cn(BODY_CELL, COLUMNS.status.cell)}>
        <StatusPill tone={row.tone} label={row.status} detail={row.statusDetail} />
      </td>
      <td className={cn(BODY_CELL, COLUMNS.amount.cell, "tabular-nums")}>{row.amount}</td>
      <td className={cn(BODY_CELL, COLUMNS.plan.cell)}>
        <span className="block truncate" title={row.plan}>
          {row.plan}
        </span>
      </td>
      <td className={cn(BODY_CELL, COLUMNS.action.cell)}>
        <DownloadLink row={row} />
      </td>
    </tr>
  );
}

function SerialBadge({ serial }: { readonly serial: number }): ReactElement {
  return (
    <span className="w-5 shrink-0 pt-2.5 text-right text-xs tabular-nums text-ink-soft">
      <span className="sr-only">Number </span>
      {serial}
    </span>
  );
}

function MobileLine({ line, serial }: LineProps): ReactElement {
  if (line.kind === "due") {
    return (
      <li className="flex items-start gap-3 p-4">
        <SerialBadge serial={serial} />
        <LineBadge due />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-sm font-medium">{line.title}</p>
            <p className="shrink-0 text-sm tabular-nums">{line.amount}</p>
          </div>
          <p className="mt-0.5 text-xs tabular-nums text-ink-soft">
            Added <LocalDate iso={line.addedIso} />
            {line.taxNote === null ? null : ` · ${line.taxNote}`}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <StatusPill tone="due" label="To pay" detail={null} />
            <PayButton chargeId={line.chargeId} title={line.title} />
          </div>
        </div>
      </li>
    );
  }
  const { row } = line;
  return (
    <li className="flex items-start gap-3 p-4">
      <SerialBadge serial={serial} />
      <LineBadge due={false} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-medium">
            <RowTitle title={row.title} />
          </p>
          <p className="shrink-0 text-sm tabular-nums">{row.amount}</p>
        </div>
        <p className="mt-0.5 text-xs tabular-nums text-ink-soft">
          {row.description} · <PaidOn row={row} />
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-3 text-sm">
          <StatusPill tone={row.tone} label={row.status} detail={row.statusDetail} />
          <DownloadLink row={row} />
        </div>
      </div>
    </li>
  );
}

/**
 * The customer's bill, month by month: each month's plan payment, the extras added that month (paid, or still to pay
 * with a Pay button), and what the month comes to. Lines are numbered from 1 within each month, so a customer can
 * refer to "October, line 2". Every payment keeps its PDF, a tax invoice or the older receipt; each month downloads as one PDF, and Download all
 * takes every one.
 */
interface MonthlyBillingProps {
  readonly months: readonly BillingMonth[];
  /** The line under the heading. A free listing account has no plan, so its Billing page says what it does pay for. */
  readonly lede?: string;
  /** What the empty state says. A free listing account is billed for ad spots, not a plan, so it passes its own. */
  readonly emptyBody?: string;
}

const DEFAULT_LEDE = "Each month’s plan and extras, with a PDF invoice or receipt for every payment.";
const DEFAULT_EMPTY_BODY =
  "Once your first payment goes through, each month’s plan and any extras show here, with an invoice or receipt for every payment.";

export function MonthlyBilling({ months, lede = DEFAULT_LEDE, emptyBody = DEFAULT_EMPTY_BODY }: MonthlyBillingProps): ReactElement {
  const [requestedPage, setRequestedPage] = useState(1);
  // The newest month starts open and the ones before it closed, so the current bill is what the customer sees
  // first. When a new month's bill arrives it becomes the newest, so it opens and last month folds away below it.
  // Keyed by what the customer changed, so a month they opened or closed stays that way.
  const newestKey = months[0]?.key ?? null;
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const isOpen = (key: string): boolean => toggled.get(key) ?? key === newestKey;
  function toggleMonth(key: string): void {
    setToggled((current) => new Map(current).set(key, !(current.get(key) ?? key === newestKey)));
  }
  const view = pageWindow(months.length, requestedPage, BILLING_MONTHS_PER_PAGE);
  const pageMonths = months.slice(view.start, view.end);
  const hasDownloads = downloadableIds(months).length > 0;

  return (
    <section aria-labelledby="billing-months-heading">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-5">
        <div className="min-w-0">
          <h2 id="billing-months-heading" className="panel-section">
            Monthly billing
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{lede}</p>
        </div>
        {hasDownloads ? (
          <a
            href={receiptDownloadHref(null)}
            download
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm font-semibold transition-colors duration-300 ease-calm hover:bg-paper-deep"
          >
            <DownloadIcon className="size-4" />
            Download all<span className="sr-only"> invoices and receipts</span>
          </a>
        ) : null}
      </div>

      {months.length === 0 ? (
        <EmptyState
          icon={<CardIcon className="size-5" />}
          title="Nothing billed yet"
          body={emptyBody}
        />
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-card border border-line bg-card xl:block">
            <table className="w-full table-fixed text-left text-[0.8125rem]">
              <colgroup>
                <col className={COLUMNS.serial.width} />
                <col />
                <col className={COLUMNS.date.width} />
                <col className={COLUMNS.status.width} />
                <col className={COLUMNS.amount.width} />
                <col className={COLUMNS.plan.width} />
                <col className={COLUMNS.action.width} />
              </colgroup>
              <thead className="bg-paper-deep/50 text-xs text-ink-soft">
                <tr>
                  <th scope="col" className={cn(HEAD_CELL, COLUMNS.serial.cell)}>
                    S.No.
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, COLUMNS.item.cell)}>
                    Item
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, COLUMNS.date.cell)}>
                    Date
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, COLUMNS.status.cell)}>
                    Status
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, COLUMNS.amount.cell)}>
                    Amount
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, COLUMNS.plan.cell)}>
                    Type
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, COLUMNS.action.cell)}>
                    <span className="sr-only">Download or pay</span>
                  </th>
                </tr>
              </thead>
              {pageMonths.map((month) => (
                <tbody key={month.key} id={`month-${month.key}`} className="divide-y divide-line border-t border-line">
                  <tr className="bg-paper/70">
                    <th scope="colgroup" colSpan={4} className="py-3 pl-6 pr-6 text-left">
                      <MonthToggle
                        month={month}
                        controls={`month-${month.key}`}
                        open={isOpen(month.key)}
                        onToggle={() => toggleMonth(month.key)}
                      />
                    </th>
                    <td className={cn("py-3 align-middle font-semibold tabular-nums", COLUMNS.amount.cell)}>
                      <span className="sr-only">Total for {month.label}: </span>
                      {month.total}
                    </td>
                    <td className="py-3 pr-6 text-xs text-ink-soft">Month total</td>
                    <td className={cn("py-3 align-middle", COLUMNS.action.cell)}>
                      <MonthDownload month={month} />
                    </td>
                  </tr>
                  {isOpen(month.key)
                    ? month.lines.map((line, index) => (
                        <DesktopLine key={lineKey(line)} line={line} serial={index + 1} />
                      ))
                    : null}
                </tbody>
              ))}
            </table>
          </div>

          <div className="mt-5 space-y-5 xl:hidden">
            {pageMonths.map((month) => (
              <section key={month.key} aria-label={month.label} className="overflow-hidden rounded-card border border-line bg-card">
                <div
                  className={cn(
                    "flex items-baseline justify-between gap-3 bg-paper/70 px-4 py-3",
                    isOpen(month.key) && "border-b border-line",
                  )}
                >
                  <h3>
                    <MonthToggle
                      month={month}
                      controls={`month-${month.key}-list`}
                      open={isOpen(month.key)}
                      onToggle={() => toggleMonth(month.key)}
                    />
                  </h3>
                  <div className="flex items-baseline gap-4">
                    <p className="text-sm font-semibold tabular-nums">
                      <span className="sr-only">Total: </span>
                      {month.total}
                    </p>
                    <MonthDownload month={month} />
                  </div>
                </div>
                {isOpen(month.key) ? (
                  <ul id={`month-${month.key}-list`} className="divide-y divide-line">
                    {month.lines.map((line, index) => (
                      <MobileLine key={lineKey(line)} line={line} serial={index + 1} />
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          {view.pageCount > 1 ? <Pager page={view.page} pageCount={view.pageCount} onPage={setRequestedPage} /> : null}
        </>
      )}
    </section>
  );
}
