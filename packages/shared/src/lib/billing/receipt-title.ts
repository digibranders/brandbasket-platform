import type { PaymentKind, Receipt } from "@firstfold/db";
import { addOnById, isMonthlyAddOnId } from "./add-ons";
import { chargeLabel } from "./charges";
import { initialTermPhrase } from "./terms";

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * A receipt's number as customers read it: "#007". The sequence is the payment's place among everything the business
 * has paid, oldest first, so it never changes once a receipt exists.
 */
export function receiptNumber(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(`A receipt number must be a positive whole number, received ${sequence}`);
  }
  return `#${String(sequence).padStart(3, "0")}`;
}

/** "Receipt #007 – Sep 2026": the number and the month it was paid in. The month is left off when it is unknown. */
export function receiptTitle(sequence: number, paidAt: Date | null): string {
  const title = `Receipt ${receiptNumber(sequence)}`;
  return paidAt === null ? title : `${title} – ${monthFormat.format(paidAt)}`;
}

/** What a payment bought, in the term of the plan it was sold on rather than the plan on sale today. */
export function paymentDescription(kind: PaymentKind, initialTermMonths: number | null): string {
  switch (kind) {
    case "initial":
      return initialTermMonths === null
        ? "First payment"
        : `First payment, covering ${initialTermPhrase(initialTermMonths)}`;
    case "renewal":
      return "Monthly payment";
    case "reactivation":
      return "Restarting your plan";
    case "extra_publish":
      return "Extra publish";
    case "charge":
      return "Paid extra";
    case "add_on":
      return "Add-on";
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled payment kind: ${String(unhandled)}`);
    }
  }
}

/** A plan's name as a label: "Care plan". A name that already says "plan" is left as it is. */
export function planLabel(name: string): string {
  const trimmed = name.trim();
  return /\bplan$/i.test(trimmed) ? trimmed : `${trimmed} plan`;
}

/**
 * The title of the monthly add-on a payment bought ("Local SEO"), or null when it is not an add-on payment or the
 * add-on is unknown.
 */
export function addOnPaymentTitle(receipt: Pick<Receipt, "kind" | "addOnId">): string | null {
  if (receipt.kind !== "add_on" || receipt.addOnId === null || !isMonthlyAddOnId(receipt.addOnId)) return null;
  return addOnById(receipt.addOnId).title;
}

/**
 * What a receipt was for: a paid extra by its own label ("Extra change hours · 2 h"), an add-on by its name
 * ("Local SEO, monthly"), anything else by the kind of payment it was, in the term of the plan it bought.
 */
export function receiptDescription(
  receipt: Pick<Receipt, "kind" | "initialTermMonths" | "chargeKind" | "chargeDescription" | "chargeQuantity" | "addOnId">,
): string {
  const addOnTitle = addOnPaymentTitle(receipt);
  if (addOnTitle !== null) return `${addOnTitle}, monthly`;
  if (receipt.kind === "charge" && receipt.chargeKind !== null && receipt.chargeDescription !== null && receipt.chargeQuantity !== null) {
    return chargeLabel({ kind: receipt.chargeKind, description: receipt.chargeDescription, quantity: receipt.chargeQuantity });
  }
  return paymentDescription(receipt.kind, receipt.initialTermMonths);
}
