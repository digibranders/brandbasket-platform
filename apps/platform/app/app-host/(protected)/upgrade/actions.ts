"use server";

import { redirect } from "next/navigation";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { startUpgradeFor } from "@/lib/server/plan-upgrade";
import type { UpgradeFormState } from "@/lib/upgrade-view";

/**
 * Pay to move up to Premium. A form post, so opening a payment only ever happens on purpose. Nothing in the form is
 * read: whether this business may move up, and for how much, is worked out again on the server (startUpgradeFor), under
 * the business's billing lock. On success the customer goes to pay the charge, or, when there is nothing to pay, back to
 * the page with Premium on.
 */
export async function startUpgrade(): Promise<UpgradeFormState> {
  const customer = await requireCustomerAccess();
  const outcome = await startUpgradeFor(customer, new Date());
  switch (outcome.kind) {
    case "refused":
      return { status: "error", message: outcome.message };
    case "applied":
      redirect("/upgrade?payment=paid");
    case "pay":
      redirectForChargePayment(outcome.start);
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled upgrade action: ${JSON.stringify(unhandled)}`);
    }
  }
}
