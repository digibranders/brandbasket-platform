/**
 * Whether Razorpay's form post back to a callback address reports a failure. Success carries `razorpay_payment_id` and a
 * signature; a decline or a cancel carries an `error` object (form-encoded as `error[code]`, `error[description]` and so on). A
 * body that cannot be read counts as failed: claiming a payment was received when the post cannot even be read would be the
 * worse mistake. The signature is never read here: the signed webhook is the only source of truth for a payment.
 */
export async function razorpayReportedFailure(request: Request): Promise<boolean> {
  try {
    const body = await request.formData();
    return Array.from(body.keys()).some((key) => key === "error" || key.startsWith("error["));
  } catch {
    return true;
  }
}
