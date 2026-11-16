import type { StaffPaymentRow } from "@brandbasket/db";
import { rupees } from "@brandbasket/shared/lib/billing/invoice-register";
import { Fragment, type ReactElement } from "react";
import { EmptyLine } from "@/components/console/hairline-list";
import { Notice } from "@/components/console/notice";
import { ManualRefundDialog, RefundDialog } from "@/components/console/refund-dialogs";
import { Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TD_NUM, TD_TIME, TH } from "@/components/console/table";
import { paymentRowView } from "@/lib/payments-view";
import { REFUND_NOTICE_TEXT, type RefundNotice } from "@/lib/refund-form";
import { TableScroll } from "@/components/console/table-scroll";

interface ClientPaymentsProps {
  readonly businessId: string;
  readonly payments: readonly StaffPaymentRow[];
  /** Finance and admin: offers Refund on paid payments. The action checks again. */
  readonly canRefund: boolean;
  readonly notice: RefundNotice | null;
  /** Primary refund action that calls the payment provider, marks refunded, and issues a credit note. */
  readonly refundAction: (formData: FormData) => Promise<void>;
  /** Secondary action that records a refund made outside BrandBasket (marks only, moves no money). */
  readonly recordManualRefundAction?: (formData: FormData) => Promise<void>;
}

/** Every payment the client has made or tried, newest first, each with an anchor the Payments page links to. */
export function ClientPayments({ businessId, payments, canRefund, notice, refundAction, recordManualRefundAction }: ClientPaymentsProps): ReactElement {
  const noticeText = notice === null ? null : REFUND_NOTICE_TEXT[notice];
  return (
    <Section id="payments" title="Payments" aside={`${payments.length} shown`}>
      {noticeText === null ? null : <Notice tone={noticeText.tone}>{noticeText.text}</Notice>}
      {payments.length === 0 ? (
        <EmptyLine>No payments yet.</EmptyLine>
      ) : (
        <div className="overflow-x-auto">
          <TableScroll label="Payments">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>When</th>
                  <th className={TH}>For</th>
                  <th className={TH}>Method</th>
                  <th className={`${TH} text-right`}>Amount</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const view = paymentRowView(payment);
                  const fullAmount = rupees(payment.amountCents);
                  return (
                    <Fragment key={payment.id}>
                      <tr id={`payment-${payment.id}`} className="scroll-mt-8">
                        <td className={TD_TIME}>{view.when}</td>
                        <td className={TD}>
                          {view.forLabel}
                          {payment.refundReason === null ? null : <small className="block text-xs text-ink-2">Refunded: {payment.refundReason}</small>}
                          {payment.failureReason === null ? null : <small className="block text-xs text-ink-2">Failed: {payment.failureReason}</small>}
                        </td>
                        <td className={`${TD} text-ink-2`}>{view.method}</td>
                        <td className={TD_NUM}>{view.amount}</td>
                        <td className={TD}>
                          <StatusPill tone={view.status.tone}>{view.status.label}</StatusPill>
                        </td>
                        <td className={`${TD} font-figure text-xs`}>{view.invoice}</td>
                      </tr>
                      {canRefund && payment.status === "captured" ? (
                        <tr>
                          <td colSpan={6} className="border-b border-line pb-4">
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                              <RefundDialog
                                businessId={businessId}
                                paymentId={payment.id}
                                businessName={payment.businessName}
                                currency={payment.currency}
                                amountCents={payment.amountCents}
                                fullAmount={fullAmount}
                                invoiceNumber={payment.invoiceNumber}
                                action={refundAction}
                              />
                              {recordManualRefundAction ? (
                                <ManualRefundDialog
                                  businessId={businessId}
                                  paymentId={payment.id}
                                  currency={payment.currency}
                                  fullAmount={fullAmount}
                                  action={recordManualRefundAction}
                                />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}
    </Section>
  );
}
