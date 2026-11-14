import type { StaffPaymentRow } from "@brandbasket/db";
import { rupees } from "@brandbasket/shared/lib/billing/invoice-register";
import { Fragment, type ReactElement } from "react";
import { buttonDanger, buttonSmall } from "@/components/console/buttons";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { EmptyLine } from "@/components/console/hairline-list";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TD_NUM, TD_TIME, TH } from "@/components/console/table";
import { paymentRowView } from "@/lib/payments-view";
import { REFUND_NOTICE_TEXT, type RefundNotice } from "@/lib/refund-form";
import { TableScroll } from "@/components/console/table-scroll";

interface ClientPaymentsProps {
  readonly businessId: string;
  readonly payments: readonly StaffPaymentRow[];
  /** Finance and admin: offers Mark refunded on paid payments. The action checks again. */
  readonly canRefund: boolean;
  readonly notice: RefundNotice | null;
  readonly refundAction: (formData: FormData) => Promise<void>;
}

/** Every payment the client has made or tried, newest first, each with an anchor the Payments page links to. */
export function ClientPayments({ businessId, payments, canRefund, notice, refundAction }: ClientPaymentsProps): ReactElement {
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
                            <details>
                              <summary className={`${buttonSmall} cursor-pointer list-none`}>Mark refunded</summary>
                              <div className="mt-3 max-w-xl">
                                <ConfirmDialog
                                  title="Mark payment as refunded"
                                  consequence="This records the refund in the console and issues a credit note. The console moves no money; ensure funds were returned in Razorpay or by bank transfer."
                                  triggerLabel="Review and mark refunded"
                                  triggerClassName={buttonDanger}
                                  confirmLabel="Confirm refund"
                                  cancelLabel="Cancel"
                                  variant="danger"
                                  formAction={refundAction}
                                >
                                  <input type="hidden" name="businessId" value={businessId} />
                                  <input type="hidden" name="paymentId" value={payment.id} />
                                  <div className="grid gap-3 my-4">
                                    <label className={labelClasses}>
                                      Amount given back ({payment.currency})
                                      <input name="amount" required inputMode="decimal" defaultValue={rupees(payment.amountCents)} className={fieldClasses} />
                                    </label>
                                    <label className={labelClasses}>
                                      Why it was refunded
                                      <textarea name="reason" required minLength={3} maxLength={300} rows={2} className={fieldClasses} />
                                    </label>
                                  </div>
                                </ConfirmDialog>
                              </div>
                            </details>
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
