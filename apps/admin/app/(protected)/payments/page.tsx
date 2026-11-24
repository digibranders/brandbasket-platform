import { listClients, listPaymentsForStaff, listPaymentsNeedingAttention, type ClientSummary, type PaymentNeedingAttention } from "@brandbasket/db";
import { LAPSE_DATA_RETENTION_DAYS, LAPSE_GRACE_PERIOD_DAYS, LAPSE_HOSTING_PAUSE_DAYS } from "@brandbasket/billing";
import { rupees } from "@brandbasket/shared/lib/billing/invoice-register";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { StatTile } from "@brandbasket/shared/ui/patterns";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { buttonSecondary } from "@/components/console/buttons";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { RefundDialog, ManualRefundDialog } from "@/components/console/refund-dialogs";
import { NeedsALookStrip, RenewalsLane } from "@/components/payments/money-lanes";
import { PaymentsWorkspace } from "@/components/payments/payments-workspace";
import { PAYMENT_ATTENTION_LABELS } from "@/lib/billing/attention";
import { monthLabel, resolveRegisterMonth } from "@/lib/invoice-register-view";
import { moneyNeedsALookCount, renewalLane } from "@/lib/money-attention";
import { paymentsAttention } from "@/lib/payments-attention";
import {
  filterCounts,
  matchesFilter,
  nextPaymentMonthLink,
  paymentFigures,
  paymentMonthBounds,
  paymentMonthLinks,
  paymentPanelRow,
  readPaymentFilter,
} from "@/lib/payments-view";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";
import { markPaymentRefundedAction, refundPaymentAction } from "../clients/[businessId]/billing/refund-actions";

export const metadata: Metadata = { title: "Payments" };

/** shortcut: one month is read in one go and filtered here; page the query if a month ever passes 1,000 payments. */
const MONTH_LIMIT = 1000;

/** Far more flagged payments than are ever open at once, so none is left out (the Today queue reads the same way). */
const FLAGGED_READ_LIMIT = 100;

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

interface PaymentsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** One read that may fail without taking the page down: the page then says what it could not read instead of showing zero. */
async function readOrNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    console.error("[payments] could not read a source", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/**
 * Every payment in a month (`?month=2026-11`, the current Indian month by default), across every client: paid, failed,
 * refunded and recorded by hand. Three figures, what needs a look (payments and overdue plans together, as the rail counts it),
 * then the table with a side panel. `?show=` narrows the table; the figures always cover the whole month.
 */
export default async function PaymentsPage({ searchParams }: PaymentsPageProps): Promise<ReactElement> {
  const { user } = await requireStaffCan("money");
  const params = await searchParams;
  const now = new Date();
  const month = resolveRegisterMonth(params.month, now);
  const bounds = month === null ? null : paymentMonthBounds(month);
  if (month === null || bounds === null) notFound();

  const db = getStaffDb();
  const [rows, flagged, clients] = await Promise.all([
    listPaymentsForStaff(db, { ...bounds, limit: MONTH_LIMIT }),
    readOrNull<PaymentNeedingAttention[]>(() => listPaymentsNeedingAttention(db, { limit: FLAGGED_READ_LIMIT })),
    readOrNull<ClientSummary[]>(() => listClients(db)),
  ]);
  await logStaffAccess({ staffUserId: user.id, action: "payment.list_view", targetType: "payments", targetId: month });

  const filter = readPaymentFilter(params.show);
  const counts = filterCounts(rows);
  const rupeeFigures = paymentFigures(rows, "INR");
  const dollars = paymentFigures(rows, "USD");
  const attentionTitle = (row: (typeof rows)[number]): string | null =>
    row.attentionReason !== null && row.attentionResolvedAt === null ? PAYMENT_ATTENTION_LABELS[row.attentionReason].title : null;
  const shown = rows.filter((row) => matchesFilter(row, filter)).map((row) => paymentPanelRow(row, attentionTitle(row)));

  const attention = paymentsAttention(month, rows, flagged ?? []);
  const renewals = clients === null ? [] : renewalLane(clients, now);
  const unreadSources = [...(flagged === null ? ["flagged payments"] : []), ...(clients === null ? ["plans"] : [])];
  const needsLook = unreadSources.length > 0 && attention.count + renewals.length === 0 ? null : moneyNeedsALookCount({ payments: attention.count, renewals: renewals.length });

  const openRaw = params.open;
  const openId = typeof openRaw === "string" && openRaw !== "" ? openRaw : null;
  const openSource = openId === null ? undefined : rows.find((row) => row.id === openId);
  const openRow = openSource === undefined ? null : paymentPanelRow(openSource, attentionTitle(openSource));
  const fullAmount = openSource === undefined ? "" : rupees(openSource.amountCents);

  const links = paymentMonthLinks(month);
  const next = nextPaymentMonthLink(month, resolveRegisterMonth(undefined, now) ?? month);
  const label = monthLabel(month);

  return (
    <>
      <PageHeader
        title="Payments"
        meta={`${label} · ${formatMoney(rupeeFigures.collectedCents, "INR")} in`}
        action={
          <>
            {links.previous === null ? null : (
              <Link href={links.previous.href} className={buttonSecondary}>
                ‹ {links.previous.label}
              </Link>
            )}
            {next === null ? null : (
              <Link href={next.href} className={buttonSecondary}>
                {next.label} ›
              </Link>
            )}
            <a href={links.exportHref} className={buttonSecondary}>
              Export for the CA
            </a>
          </>
        }
      />
      <SectionTabs page="/payments" />

      <section aria-label={`Figures for ${label}`} className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-3">
        <StatTile label="Collected" value={formatMoney(rupeeFigures.collectedCents, "INR")} size="medium" note={`${rupeeFigures.paymentsCount} payments`} deltaTone="neutral" />
        <StatTile
          label="Failed"
          value={rupeeFigures.failedCount}
          note={rupeeFigures.failedCount === 0 ? "None" : `${formatMoney(rupeeFigures.failedCents, "INR")} not collected`}
          deltaTone={rupeeFigures.failedCount > 0 ? "negative" : "positive"}
        />
        <StatTile
          label="Needs a look"
          value={needsLook ?? "?"}
          note={
            needsLook === null
              ? `Could not read ${unreadSources.join(" and ")}`
              : needsLook === 0 && unreadSources.length === 0
                ? "All clear"
                : `${count(attention.count, "payment")}, ${count(renewals.length, "renewal")}${unreadSources.length > 0 ? `. Could not read ${unreadSources.join(" and ")}` : ""}`
          }
          deltaTone={needsLook === null || needsLook > 0 ? "warning" : "positive"}
        />
      </section>

      <NeedsALookStrip items={attention.items} />
      <RenewalsLane
        rows={renewals}
        readFailed={clients === null}
        policy={`Payment lapse policy: ${LAPSE_GRACE_PERIOD_DAYS} days grace period with full service after a missed payment, website hosting paused after ${LAPSE_HOSTING_PAUSE_DAYS} days of non-payment, and account data retained for ${LAPSE_DATA_RETENTION_DAYS} days before permanent deletion.`}
      />

      {dollars.paymentsCount + dollars.failedCount === 0 ? null : (
        <Notice tone="ok" className="mt-4">
          Dollar payments in {label}: {formatMoney(dollars.collectedCents, "USD")} collected from {dollars.paymentsCount}. They are not in the
          figures above.
        </Notice>
      )}

      <div className="mt-6">
        <PaymentsWorkspace
          rows={shown}
          month={month}
          monthLabel={label}
          filter={filter}
          counts={counts}
          openId={openId}
          openRow={openRow}
          refundSlot={
            openSource === undefined || openSource.status !== "captured" ? null : (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <RefundDialog
                  businessId={openSource.businessId}
                  paymentId={openSource.id}
                  businessName={openSource.businessName}
                  currency={openSource.currency}
                  amountCents={openSource.amountCents}
                  fullAmount={fullAmount}
                  invoiceNumber={openSource.invoiceNumber}
                  action={refundPaymentAction}
                />
                <ManualRefundDialog
                  businessId={openSource.businessId}
                  paymentId={openSource.id}
                  currency={openSource.currency}
                  fullAmount={fullAmount}
                  action={markPaymentRefundedAction}
                />
              </div>
            )
          }
        />
      </div>
    </>
  );
}
