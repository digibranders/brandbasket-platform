import { listPaymentsForStaff } from "@brandbasket/db";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { buttonSecondary, buttonSmall } from "@/components/console/buttons";
import { LIFT } from "@/components/console/classes";
import { Figures } from "@/components/console/figures";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine } from "@/components/console/hairline-list";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TD_NUM, TD_TIME, TH } from "@/components/console/table";
import { monthLabel, resolveRegisterMonth } from "@/lib/invoice-register-view";
import {
  filterCounts,
  matchesFilter,
  PAYMENT_FILTER_LABELS,
  PAYMENT_FILTERS,
  paymentFigures,
  paymentFilterHref,
  paymentMonthBounds,
  paymentMonthLinks,
  paymentRowView,
  readPaymentFilter,
} from "@/lib/payments-view";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Payments" };

/** shortcut: one month is read in one go and filtered here; page the query if a month ever passes 1,000 payments. */
const MONTH_LIMIT = 1000;

interface PaymentsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * Every payment in a month (`?month=2026-11`, the current Indian month by default), across every client: paid, failed,
 * refunded and recorded by hand, with the month's figures in rupees. `?show=` narrows the table; the figures always
 * cover the whole month. Finance and admin only.
 */
export default async function PaymentsPage({ searchParams }: PaymentsPageProps): Promise<ReactElement> {
  const { user } = await requireStaffCan("money");
  const params = await searchParams;
  const month = resolveRegisterMonth(params.month, new Date());
  const bounds = month === null ? null : paymentMonthBounds(month);
  if (month === null || bounds === null) notFound();

  const rows = await listPaymentsForStaff(getStaffDb(), { ...bounds, limit: MONTH_LIMIT });
  await logStaffAccess({ staffUserId: user.id, action: "payment.list_view", targetType: "payments", targetId: month });

  const filter = readPaymentFilter(params.show);
  const counts = filterCounts(rows);
  const rupees = paymentFigures(rows, "INR");
  const dollars = paymentFigures(rows, "USD");
  const shown = rows.filter((row) => matchesFilter(row, filter)).map(paymentRowView);
  const links = paymentMonthLinks(month);
  const label = monthLabel(month);
  const lookLine = rupees.attentionCount === 0 ? "" : rupees.attentionCount === 1 ? " · 1 needs a look" : ` · ${rupees.attentionCount} need a look`;

  return (
    <>
      <PageHeader
        title="Payments"
        meta={`${label} · ${formatMoney(rupees.collectedCents, "INR")} in${lookLine}`}
        action={
          <>
            {links.previous === null ? null : (
              <Link href={links.previous.href} className={buttonSecondary}>
                ‹ {links.previous.label}
              </Link>
            )}
            {links.next === null ? null : (
              <Link href={links.next.href} className={buttonSecondary}>
                {links.next.label} ›
              </Link>
            )}
            <a href={links.exportHref} className={buttonSecondary}>
              Export for the CA
            </a>
          </>
        }
      />

      <Figures
        items={[
          { value: formatMoney(rupees.collectedCents, "INR"), label: "Collected", note: `${rupees.paymentsCount} payments`, long: true },
          { value: formatMoney(rupees.planCents, "INR"), label: "Monthly plans", note: `${rupees.planClients} clients`, long: true },
          { value: formatMoney(rupees.extrasCents, "INR"), label: "Extras and charges", note: `${rupees.extrasCount} paid`, long: true },
          {
            value: formatMoney(rupees.refundedCents, "INR"),
            label: "Refunded",
            note: `${rupees.refundedCount} payments`,
            tone: rupees.refundedCount > 0 ? "warn" : "good",
            long: true,
          },
          {
            value: rupees.failedCount,
            label: "Failed",
            note: rupees.failedCount === 0 ? "None" : `${formatMoney(rupees.failedCents, "INR")} not collected`,
            tone: rupees.failedCount > 0 ? "bad" : "good",
          },
          {
            value: rupees.attentionCount,
            label: "Needs a look",
            note: rupees.attentionCount === 0 ? "All clear" : "Open each one",
            tone: rupees.attentionCount > 0 ? "warn" : "good",
          },
        ]}
      />

      {dollars.paymentsCount + dollars.failedCount === 0 ? null : (
        <Notice tone="ok" className="mt-6">
          Dollar payments in {label}: {formatMoney(dollars.collectedCents, "USD")} collected from {dollars.paymentsCount}. They are not in the
          figures above.
        </Notice>
      )}

      <div className="mt-8">
        <FilterPills
          label="Show payments"
          options={PAYMENT_FILTERS.map((option) => ({
            href: paymentFilterHref(month, option),
            label: PAYMENT_FILTER_LABELS[option],
            count: counts[option],
            current: option === filter,
          }))}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyLine>No payments to show for {label}.</EmptyLine>
      ) : (
        <section aria-label={`Payments in ${label}`} className={`${LIFT} mt-4 overflow-x-auto px-4`}>
          <TableScroll label="Payments">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>When</th>
                  <th className={TH}>Client</th>
                  <th className={TH}>For</th>
                  <th className={TH}>Method</th>
                  <th className={`${TH} text-right`}>Amount</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Invoice</th>
                  <th className={TH}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id}>
                    <td className={TD_TIME}>{row.when}</td>
                    <td className={`${TD} font-semibold`}>{row.client}</td>
                    <td className={TD}>{row.forLabel}</td>
                    <td className={`${TD} text-ink-2`}>{row.method}</td>
                    <td className={TD_NUM}>{row.amount}</td>
                    <td className={TD}>
                      <StatusPill tone={row.status.tone}>{row.status.label}</StatusPill>
                    </td>
                    <td className={`${TD} font-figure text-xs`}>{row.invoice}</td>
                    <td className={`${TD} text-right`}>
                      <Link href={row.href} className={buttonSmall}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      )}
    </>
  );
}
