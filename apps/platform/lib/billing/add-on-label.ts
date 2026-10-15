import { receiptDescription } from "@fynix/shared/lib/billing/receipt-title";
import type { MonthlyAddOnId } from "@fynix/shared/lib/billing/add-ons";

/**
 * What a monthly add-on payment is called wherever it is paid: "Social media, monthly". It is the wording the add-on's
 * receipts use, taken from receiptDescription so the payment window and the receipt never drift apart.
 */
export function addOnPaymentLabel(addOn: MonthlyAddOnId): string {
  return receiptDescription({
    kind: "add_on",
    addOnId: addOn,
    initialTermMonths: null,
    chargeKind: null,
    chargeDescription: null,
    chargeQuantity: null,
  });
}
