import type { ChargeFormProblem } from "./charge-form";
import type { ManualPaymentFormProblem } from "./manual-payment-form";

/** What the staff console's client page says after adding, marking paid or waiving a charge. */
export type StaffChargeNotice =
  | "added"
  | "paid"
  | "waived"
  | "not-open"
  | "no-plan"
  | "payment-kept"
  | ChargeFormProblem
  | ManualPaymentFormProblem;

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const STAFF_CHARGE_NOTICES: Readonly<Record<StaffChargeNotice, { readonly text: string; readonly ok: boolean }>> = {
  added: { text: "Charge added. The customer sees it under To pay on their Billing page.", ok: true },
  paid: { text: "Marked paid. It moved to the customer’s monthly billing.", ok: true },
  waived: { text: "Charge waived. The customer no longer sees it.", ok: true },
  "not-open": { text: "Nothing changed: that charge was already paid or waived.", ok: false },
  "no-plan": { text: "Nothing added: there is no plan for this business’s currency to price it from.", ok: false },
  "payment-kept": {
    text: "The payment was recorded but didn’t settle the charge, so it is flagged under payments needing attention.",
    ok: false,
  },
  "invalid-kind": { text: "Nothing added: pick what the charge is for.", ok: false },
  "invalid-quantity": { text: "Nothing added: the quantity must be a whole number from 1 to 100.", ok: false },
  "missing-description": { text: "Nothing added: say what the charge is for (up to 200 characters).", ok: false },
  "invalid-price": { text: "Nothing added: give a price above zero, like 1500 or 1,500.50.", ok: false },
  unconfirmed: { text: "Nothing recorded: tick the box to confirm the money has arrived.", ok: false },
  "missing-reference": { text: "Nothing recorded: give the bank or payment reference (up to 100 characters).", ok: false },
  "invalid-date": {
    text: "Nothing recorded: the date received must be a real date within the last year, and not in the future.",
    ok: false,
  },
};

export function staffChargeNoticeHref(businessId: string, notice: StaffChargeNotice): string {
  return `/clients/${businessId}?charges=${notice}#extras`;
}

export function readStaffChargeNotice(value: string | string[] | undefined): StaffChargeNotice | null {
  return typeof value === "string" && Object.hasOwn(STAFF_CHARGE_NOTICES, value) ? (value as StaffChargeNotice) : null;
}
