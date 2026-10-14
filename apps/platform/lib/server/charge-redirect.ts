import "server-only";
import { notFound, redirect } from "next/navigation";
import { chargeNoticeHref, chargePayPath } from "@/lib/billing/charge-notices";
import type { ChargePaymentStart } from "./charges";

/** Sends the customer wherever a started charge payment goes next: the provider's page, or back with a notice. */
export function redirectForChargePayment(started: ChargePaymentStart): never {
  switch (started.kind) {
    case "not-found":
      notFound();
    case "not-open":
      redirect(chargeNoticeHref("not-open"));
    case "redirect":
      redirect(started.url);
    case "razorpay":
      redirect(chargePayPath(started.charge.id));
    default: {
      const unhandled: never = started;
      throw new Error(`Unhandled charge payment start: ${JSON.stringify(unhandled)}`);
    }
  }
}
