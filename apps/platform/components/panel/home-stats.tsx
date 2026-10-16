import type { ReactElement } from "react";
import type { Plan, ProjectStatus, Subscription } from "@fynix/db";
import { LocalDate } from "@fynix/shared/ui/panel/local-date-time";
import { StatRow, StatTile, type StatTone } from "@fynix/shared/ui/panel/stat-tile";
import { ONBOARDING_STEPS } from "@fynix/shared/lib/onboarding/steps";
import { renewalCharge } from "@fynix/shared/lib/billing/terms";
import { nextBundledNetCents } from "@fynix/shared/lib/billing/bundle";

/**
 * What a customer would otherwise have to read four screens to find out.
 *
 * Every figure here comes from something already stored. There is deliberately no traffic or uptime tile: nothing
 * records either, and a number with no source behind it is worse than an empty space.
 */
export interface HomeStatsInput {
  readonly status: ProjectStatus | null;
  readonly completedSteps: number;
  readonly submitted: boolean;
  readonly liveSince: Date | null;
  readonly plan: Plan | null;
  readonly subscription: Subscription | null;
  readonly billingPaid: boolean;
  readonly posts: { readonly total: number; readonly published: number };
}

function websiteTile({
  status,
  liveSince,
  billingPaid,
}: Pick<HomeStatsInput, "status" | "liveSince" | "billingPaid">): {
  readonly value: string;
  readonly hint: ReactElement | string;
  readonly tone: StatTone;
} {
  if (status === "live") {
    // A live site whose billing has lapsed is taken down, which the customer needs to see here and not on Billing.
    if (!billingPaid) return { value: "Offline", hint: "Payment due. See Billing.", tone: "attention" };
    return {
      value: "Live",
      hint: liveSince === null ? "Up and running." : <>Up since <LocalDate iso={liveSince.toISOString()} /></>,
      tone: "good",
    };
  }
  if (status === "on_hold") return { value: "Paused", hint: "We’ll be in touch.", tone: "attention" };
  if (status === "submitted" || status === "building") {
    return { value: "Being built", hint: "In progress.", tone: "neutral" };
  }
  if (status === "preview") return { value: "Ready to review", hint: "Preview ready.", tone: "attention" };
  return { value: "Not started", hint: "Starts after setup.", tone: "neutral" };
}

function paymentTile({
  plan,
  subscription,
  submitted,
}: Pick<HomeStatsInput, "plan" | "subscription" | "submitted">): {
  readonly value: ReactElement | string;
  readonly hint: ReactElement | string;
} {
  if (subscription === null) {
    return { value: "—", hint: submitted ? "Nothing due." : "Due after setup." };
  }
  if (subscription.status === "cancelled") return { value: "None", hint: "Ends with the paid period." };
  if (subscription.provider === "manual") return { value: "—", hint: "Arranged directly." };

  const due =
    subscription.commitmentEndsAt !== null && subscription.commitmentEndsAt.getTime() > Date.now()
      ? subscription.commitmentEndsAt
      : subscription.paidThroughAt;
  const amount = plan === null ? null : renewalCharge(plan, subscription.discountAmountCents, nextBundledNetCents(subscription));
  if (amount === null || due === null) return { value: "—", hint: "Nothing scheduled." };
  return {
    value: amount,
    hint: <>Due <LocalDate iso={due.toISOString()} /></>,
  };
}

export function HomeStats(input: HomeStatsInput): ReactElement {
  const website = websiteTile(input);
  const payment = paymentTile(input);
  const totalSteps = ONBOARDING_STEPS.length;
  const setupDone = input.submitted || input.status === "live";

  return (
    <StatRow>
      <StatTile label="Your website" value={website.value} hint={website.hint} tone={website.tone} showDot />
      <StatTile
        label="Setup"
        value={setupDone ? "Sent" : `${String(input.completedSteps)} of ${String(totalSteps)}`}
        hint={setupDone ? "With our team." : "Steps done."}
        tone={setupDone ? "good" : "neutral"}
        showDot
      />
      <StatTile label="Next payment" value={payment.value} hint={payment.hint} />
      <StatTile
        label="Blog posts"
        value={String(input.posts.total)}
        hint={
          input.posts.total === 0
            ? "None yet."
            : `${String(input.posts.published)} published, ${String(input.posts.total - input.posts.published)} draft.`
        }
      />
    </StatRow>
  );
}
