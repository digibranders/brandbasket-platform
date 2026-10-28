import type { BillingState, HostedSite } from "@brandbasket/db";
import { formatCalendarDate, formatTimestamp } from "@brandbasket/shared/lib/format";
import { formatMoney } from "@brandbasket/shared/lib/money";

/*
 * What the Customers channel is told when a client's website is paused because their plan lapsed: who, which plan, why it
 * ended, when and where it was paused. Pure: lib/server/site-hosting.ts reads the billing state, this words it.
 */

const TIME_ZONE = "Asia/Kolkata";

const STATUS_WORDS: Readonly<Record<NonNullable<BillingState["subscription"]>["status"], string>> = {
  active: "Active",
  past_due: "Payment failing",
  cancelled: "Cancelled",
  inactive: "Stopped by the payment provider",
  incomplete: "Never paid",
};

/** Why the website is no longer served, in the words staff will read. Mirrors hasWebsiteService (packages/billing/src/access.ts). */
export function lapseReason(subscription: BillingState["subscription"], now: Date): string {
  if (subscription === null) return "The business has no subscription.";
  if (subscription.status === "inactive") return "The payment provider stopped retrying the payment.";
  if (subscription.status === "incomplete") return "The first payment was never made.";
  if (subscription.paidThroughAt === null || subscription.paidThroughAt.getTime() <= now.getTime()) {
    const until = subscription.paidThroughAt === null ? null : formatCalendarDate(subscription.paidThroughAt, TIME_ZONE);
    const period = until === null ? "the paid period ended" : `the paid period ended on ${until}`;
    return subscription.status === "cancelled"
      ? `The plan was cancelled and ${period}.`
      : `${period.charAt(0).toUpperCase()}${period.slice(1)} and the next payment did not arrive.`;
  }
  return "The plan no longer includes the Managed Website service.";
}

export interface WebsitePausedAlert {
  readonly facts: readonly { readonly name: string; readonly value: string | null }[];
  readonly text: string;
}

export function websitePausedAlert(input: {
  readonly state: BillingState | null;
  readonly site: Pick<HostedSite, "vercelProjectId" | "vercelTeamId">;
  readonly pausedAt: Date;
}): WebsitePausedAlert {
  const { state, site, pausedAt } = input;
  const subscription = state?.subscription ?? null;
  const plan = state?.plan ?? null;
  return {
    facts: [
      { name: "Plan", value: plan === null ? null : `${plan.name}, ${formatMoney(plan.recurringAmountCents, plan.currency)} a month` },
      { name: "Plan status", value: subscription === null ? "No subscription" : STATUS_WORDS[subscription.status] },
      { name: "Paid until", value: subscription?.paidThroughAt == null ? null : formatCalendarDate(subscription.paidThroughAt, TIME_ZONE) },
      { name: "Why", value: lapseReason(subscription, pausedAt) },
      { name: "Paused at", value: formatTimestamp(pausedAt, TIME_ZONE) },
      { name: "Vercel project", value: site.vercelTeamId === null ? site.vercelProjectId : `${site.vercelProjectId} (${site.vercelTeamId})` },
    ],
    text: "The website is paused on Vercel and visitors no longer see it. It comes back on its own when the client pays.",
  };
}
