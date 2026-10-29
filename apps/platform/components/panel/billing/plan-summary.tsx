import type { Plan, Subscription } from "@brandbasket/db";
import { type Brand } from "@/lib/brand";
import type { ReactElement, ReactNode } from "react";
import { CaretDown, Check } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT } from "@/components/v2/classes";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { billingPeriodProgress, type PeriodProgress } from "@brandbasket/shared/lib/billing/period";
import { changesNote, renewalCharge } from "@brandbasket/shared/lib/billing/terms";
import { nextBundledNetCents, nextDiscountCents } from "@brandbasket/shared/lib/billing/bundle";
import { planLabel } from "@brandbasket/shared/lib/billing/receipt-title";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { subscriptionEnding } from "@/lib/billing/payments-continue";
import { carePlan } from "@brandbasket/shared/lib/pricing";

interface PlanSummaryProps {
  readonly plan: Plan;
  readonly subscription: Subscription;
  readonly now: Date;
  /** The business holds the Managed Website service: "What's included" and the change and blog allowances are the website's, so only it is shown them. */
  readonly hasWebsite: boolean;
  /** The brand the dashboard is sold under: it words the plan's name. Brandbasket when left out. */
  readonly brand?: Brand;
}

/** Under the plan's name: the monthly price with its GST named for a taxed plan, otherwise what the plan is. */
export function priceNote(plan: Plan, discountAmountCents: number, bundledAddOnNetCents = 0): string {
  const discounted = discountAmountCents > 0 ? " Includes your discount." : "";
  if (plan.taxRateBasisPoints === 0) return `Design, hosting and care for your website.${discounted}`;
  const price = formatMoney(plan.recurringAmountCents + bundledAddOnNetCents - discountAmountCents, plan.currency);
  return `${price} a month, GST included.${discounted}`;
}

/** What the bar's caption says about the next payment, which depends on how the plan is paid and whether it ends. */
function NextPaymentCaption({
  plan,
  subscription,
  progress,
}: {
  readonly plan: Plan;
  readonly subscription: Subscription;
  readonly progress: PeriodProgress;
}): ReactNode {
  const end = <LocalDate iso={progress.end.toISOString()} />;
  if (subscriptionEnding(subscription)) {
    return <>No more payments. Your plan ends on {end}.</>;
  }
  if (subscription.provider === "manual") return <>We’ll arrange your next payment with you directly.</>;
  const amount = renewalCharge(plan, nextDiscountCents(subscription), nextBundledNetCents(subscription));
  if (amount === null) return <>Your next period starts on {end}.</>;
  return (
    <>
      Next payment <span className="font-figure font-semibold text-ink">{amount}</span> on {end}
    </>
  );
}

/** The next payment in one plain line, in place of a bar of days used: the customer wants the date and the amount, not a gauge. */
function NextPaymentLine({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="mt-5 text-[0.9375rem] tabular-nums text-ink-2">{children}</p>;
}

/** The plan: name, price per month, the next payment, and what it includes. The page's one raised card. */
export function PlanSummary({ plan, subscription, now, hasWebsite }: PlanSummaryProps): ReactElement {
  const price = renewalCharge(plan, nextDiscountCents(subscription), nextBundledNetCents(subscription));
  const progress = billingPeriodProgress(subscription, now);

  return (
    <section aria-labelledby="plan-title" className={cn(LIFT, "p-6 sm:p-7")}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 id="plan-title" className="font-display text-[1.125rem] font-semibold tracking-[-0.02em] text-ink">
          {planLabel(plan.name)}
        </h2>
        <span className="rounded-full bg-sunken px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-2">Monthly</span>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        {price === null ? null : (
          <p className="flex items-baseline gap-1.5">
            <span className="font-figure text-[2.125rem] font-semibold leading-none tracking-tight tabular-nums text-ink">{price}</span>
            <span className="text-[0.8125rem] text-ink-2">per month</span>
          </p>
        )}
        <p className="max-w-xs text-[0.84375rem] text-ink-2">{priceNote(plan, nextDiscountCents(subscription), nextBundledNetCents(subscription))}</p>
      </div>

      {progress === null ? null : (
        <NextPaymentLine>
          <NextPaymentCaption plan={plan} subscription={subscription} progress={progress} />
        </NextPaymentLine>
      )}

      {hasWebsite ? (
        <details className="group mt-6 border-t border-line pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[0.8125rem] font-semibold text-ink transition-colors duration-200 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
            What’s included
            <CaretDown size={14} aria-hidden="true" className="transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {carePlan.includes.map((item) => (
              <li key={item} className="flex gap-2 text-[0.8125rem] text-ink">
                <Check size={14} weight="bold" aria-hidden="true" className="mt-0.5 shrink-0 text-sage" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink-2">{changesNote(plan)}</p>
        </details>
      ) : null}
    </section>
  );
}
