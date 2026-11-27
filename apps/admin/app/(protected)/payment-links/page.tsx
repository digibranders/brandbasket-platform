import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { EmptyState } from "@brandbasket/shared/ui/patterns";
import { buttonPrimary, buttonSmall } from "@/components/console/buttons";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { StatusPill, type PillTone } from "@/components/console/status-pill";
import { TableScroll } from "@/components/console/table-scroll";
import { TABLE, TD, TD_NUM, TD_TIME, TH } from "@/components/console/table";
import { PAYMENT_LINK_STATE_LABELS, type PaymentLinkRow } from "@/lib/payment-link-rows";
import { loadPaymentLinkRows } from "@/lib/server/payment-links-admin";
import { requireStaffCan } from "@/lib/server/staff-role";
import { cancelPaymentLinkAction, extendPaymentLinkAction } from "./actions";

export const metadata: Metadata = { title: "Payment links" };

const STATE_TONES: Readonly<Record<PaymentLinkRow["state"], PillTone>> = { open: "wait", paid: "done", revoked: "todo", expired: "problem", building: "wait", balance_due: "wait" };

/** What an action's redirect says happened, in one line. */
const RESULTS: Readonly<Record<string, { readonly ok: boolean; readonly text: string }>> = {
  cancelled: { ok: true, text: "The link is cancelled. Opening its address now shows a plain page that says it cannot be used." },
  extended: { ok: true, text: "The link has 7 more days from now." },
  gone: { ok: false, text: "That link no longer exists." },
  closed: { ok: false, text: "That link has already been paid or cancelled, so nothing changed." },
  another: { ok: false, text: "This business has another open link. Cancel that one first." },
};

function oneOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function RowActions({ row }: { readonly row: PaymentLinkRow }): ReactElement | null {
  if (!row.canChange) return null;
  return (
    <div className="flex justify-end gap-2">
      <form action={extendPaymentLinkAction}>
        <input type="hidden" name="linkId" value={row.id} />
        <button type="submit" className={buttonSmall}>
          Extend 7 days
        </button>
      </form>
      <form action={cancelPaymentLinkAction}>
        <input type="hidden" name="linkId" value={row.id} />
        <button type="submit" className={buttonSmall}>
          Cancel
        </button>
      </form>
    </div>
  );
}

export default async function PaymentLinksPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<ReactElement> {
  await requireStaffCan("money");
  const result = RESULTS[oneOf((await searchParams).result) ?? ""];
  const rows = await loadPaymentLinkRows(new Date());

  return (
    <>
      <PageHeader
        title="Payment links"
        meta="Single-use addresses staff send so a customer pays with the deal already in place. Each lasts 7 days."
        action={
          <Link href="/payment-links/new" className={buttonPrimary}>
            New payment link
          </Link>
        }
      />
      <SectionTabs page="/payment-links" />

      {result === undefined ? null : (
        <div className="mt-6">
          <Notice tone={result.ok ? "ok" : "problem"}>{result.text}</Notice>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No payment links yet." description="Make one from an enquiry, from an account that has not paid, or with New payment link." />
      ) : (
        <TableScroll label="Payment links" className="mt-6">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Customer</th>
                <th className={TH}>Services</th>
                <th className={`${TH} text-right`}>Pays today</th>
                <th className={TH}>State</th>
                <th className={TH}>Expires</th>
                <th className={TH}>Made by</th>
                <th className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={TD}>
                    <span className="font-semibold">{row.customer}</span>
                  </td>
                  <td className={TD}>
                    {row.services}
                    <span className="block text-xs text-ink-2">{row.interval === "year" ? "Yearly" : "Monthly"}</span>
                  </td>
                  <td className={TD_NUM}>{row.payToday ?? "Not priced"}</td>
                  <td className={TD}>
                    <StatusPill tone={STATE_TONES[row.state]}>{PAYMENT_LINK_STATE_LABELS[row.state]}</StatusPill>
                  </td>
                  <td className={TD_TIME}>
                    <LocalDate iso={row.expiresAt} />
                  </td>
                  <td className={TD}>{row.createdBy}</td>
                  <td className={TD}>
                    <RowActions row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  );
}
