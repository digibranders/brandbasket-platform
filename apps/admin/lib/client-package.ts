import type { BillingCurrency, BundledAddOn, Subscription } from "@brandbasket/db";
import { isMonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { packageBasisPointsFor } from "@brandbasket/shared/lib/billing/packages";
import { formatCalendarDate } from "@brandbasket/shared/lib/format";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { packageLabel } from "./service-packages";

/** Dates are in India time, the same as the customer's pages. */
const INDIA_TIME = "Asia/Kolkata";

/** What the client page's Billing section says about the package. */
export interface ClientPackageFacts {
  /** "Website + Social, 20% off each service", or "No package". */
  readonly package: string;
  /** "₹2,000 a month", or "None". */
  readonly adCredit: string;
  /** The day the package offer was given up for good, or null while it has not been. */
  readonly forfeitedOn: string | null;
}

/**
 * The package a client has today: the services staying on their latest subscription (active and not asked to end) and the
 * percentage off each, which is none for one service or once the offer was given up. The ad credit is shown only while the
 * subscription is live and paid, as in the "Ad credit due this month" list (listAdCreditDue): a cancelled row that never took
 * a payment can still carry a credit that is not owed. A client who asked to close keeps it to the end of the paid month.
 */
export function clientPackageFacts(input: {
  readonly lines: readonly BundledAddOn[];
  readonly subscription: Subscription | null;
  readonly currency: BillingCurrency;
  readonly forfeitedAt: Date | null;
}): ClientPackageFacts {
  const { subscription } = input;
  const services = input.lines
    .filter((row) => row.subscriptionId === subscription?.id && row.status === "active" && row.endRequestedAt === null)
    .map((row) => row.addOn)
    .filter(isMonthlyAddOnId);
  const basisPoints = packageBasisPointsFor({ services, forfeited: input.forfeitedAt !== null });
  const owed =
    subscription !== null &&
    subscription.adCreditCents > 0 &&
    subscription.activatedAt !== null &&
    (subscription.status === "active" || subscription.status === "past_due");
  return {
    package: basisPoints > 0 ? `${packageLabel(services)}, ${basisPoints / 100}% off each service` : "No package",
    adCredit: owed ? `${formatMoney(subscription.adCreditCents, input.currency)} a month` : "None",
    forfeitedOn: input.forfeitedAt === null ? null : formatCalendarDate(input.forfeitedAt, INDIA_TIME),
  };
}
