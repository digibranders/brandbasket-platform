import type { Plan, Subscription } from "@brandbasket/db";
import { type Brand } from "@/lib/brand";
import type { ReactElement, ReactNode } from "react";
import { ChevronDownIcon, TickIcon } from "@brandbasket/shared/ui/icons";
import { PageSection } from "@/components/v2/page";
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

function PeriodBar({ progress, children }: { readonly progress: PeriodProgress; readonly children: ReactNode }): ReactElement {
  const percent = Math.round((progress.elapsedDays / progress.totalDays) * 100);
  return (
    <div className="mt-6">
      <p className="font-figure text-xs font-medium tabular-nums text-ink">
        {progress.elapsedDays} of {progress.totalDays} days
      </p>
      <div
        role="progressbar"
        aria-label="Days used in this billing period"
        aria-valuemin={0}
        aria-valuemax={progress.totalDays}
        aria-valuenow={progress.elapsedDays}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"
      >
        <div className="h-full rounded-full bg-rattan transition-[width] duration-700" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-ink-2">{children}</p>
    </div>
  );
}

/** The plan: name, price per month, how far through the paid period the customer is, and what it includes. A section on the page, no box. */
export function PlanSummary({ plan, subscription, now, hasWebsite }: PlanSummaryProps): ReactElement {
  const price = renewalCharge(plan, nextDiscountCents(subscription), nextBundledNetCents(subscription));
  const progress = billingPeriodProgress(subscription, now);

  return (
    <PageSection id="plan" title={planLabel(plan.name)} aside="Monthly">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p className="max-w-md text-[0.84375rem] text-ink-2">{priceNote(plan, nextDiscountCents(subscription), nextBundledNetCents(subscription))}</p>
        {price === null ? null : (
          <p className="flex items-baseline gap-1.5">
            <span className="font-figure text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-ink">{price}</span>
            <span className="text-xs text-ink-2">per month</span>
          </p>
        )}
      </div>

      {progress === null ? null : (
        <PeriodBar progress={progress}>
          <NextPaymentCaption plan={plan} subscription={subscription} progress={progress} />
        </PeriodBar>
      )}

      {hasWebsite ? (
        <details className="group mt-6 border-t border-line pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[0.8125rem] font-semibold text-ink transition-colors duration-200 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
            What’s included
            <ChevronDownIcon className="size-3.5 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {carePlan.includes.map((item) => (
              <li key={item} className="flex gap-2 text-xs text-ink">
                <TickIcon className="mt-px size-3.5 shrink-0 text-sage" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink-2">{changesNote(plan)}</p>
        </details>
      ) : null}
    </PageSection>
  );
}
