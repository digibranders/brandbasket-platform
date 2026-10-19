import type { Plan, Subscription } from "@brandbasket/db";
import { type Brand } from "@/lib/brand";
import type { ReactElement, ReactNode } from "react";
import { ChevronDownIcon, TickIcon } from "@brandbasket/shared/ui/icons";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { billingPeriodProgress, type PeriodProgress } from "@brandbasket/shared/lib/billing/period";
import { changesNote, renewalCharge } from "@brandbasket/shared/lib/billing/terms";
import { nextBundledNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { planLabel } from "@brandbasket/shared/lib/billing/receipt-title";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { carePlan } from "@brandbasket/shared/lib/pricing";

interface PlanSummaryProps {
  readonly plan: Plan;
  readonly subscription: Subscription;
  readonly now: Date;
  /** The brand the dashboard is sold under: it words the plan's name. Brandbasket when left out. */
  readonly brand?: Brand;
  /** How they pay, shown inside the card under the price (components/panel/billing/payment-method.tsx), or left out. */
  readonly paymentMethod?: ReactNode;
}

/** Under the plan's name: the net price and its tax for a taxed plan, otherwise what the plan is. */
export function priceNote(plan: Plan, discountAmountCents: number, bundledAddOnNetCents = 0): string {
  const discounted = discountAmountCents > 0 ? " Includes your discount." : "";
  const addOns = bundledAddOnNetCents > 0 ? " Includes your add-ons." : "";
  if (plan.taxRateBasisPoints === 0) return `Design, hosting and care for your website.${discounted}${addOns}`;
  const net = formatMoney(plan.recurringAmountCents + bundledAddOnNetCents - discountAmountCents, plan.currency);
  return `${net} a month plus ${plan.taxRateBasisPoints / 100}% GST.${discounted}${addOns}`;
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
  // Cancelled at the provider, or asked to end with the paid period (leaving) and not yet closed there: either way the
  // plan ends on its date and nothing more is taken.
  if (subscription.status === "cancelled" || subscription.cancelRequestedAt !== null) {
    return <>No more payments. Your plan ends on {end}.</>;
  }
  if (subscription.provider === "manual") return <>We’ll arrange your next payment with you directly.</>;
  const amount = renewalCharge(plan, subscription.discountAmountCents, nextBundledNetCents(subscription));
  if (amount === null) return <>Your next period starts on {end}.</>;
  return (
    <>
      Next payment <span className="font-semibold text-ink">{amount}</span> on {end}
    </>
  );
}

function PeriodBar({ progress, children }: { readonly progress: PeriodProgress; readonly children: ReactNode }): ReactElement {
  const percent = Math.round((progress.elapsedDays / progress.totalDays) * 100);
  return (
    <div className="mt-6">
      <p className="text-xs font-medium tabular-nums">
        {progress.elapsedDays} of {progress.totalDays} days
      </p>
      <div
        role="progressbar"
        aria-label="Days used in this billing period"
        aria-valuemin={0}
        aria-valuemax={progress.totalDays}
        aria-valuenow={progress.elapsedDays}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-calm" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-ink-soft">{children}</p>
    </div>
  );
}

/** The plan card: name, price per month, how far through the paid period the customer is, how they pay, and what it includes. */
export function PlanSummary({ plan, subscription, now, paymentMethod }: PlanSummaryProps): ReactElement {
  const price = renewalCharge(plan, subscription.discountAmountCents, nextBundledNetCents(subscription));
  const progress = billingPeriodProgress(subscription, now);

  return (
    <section aria-labelledby="plan-heading" className="flex flex-col rounded-card border border-line bg-card">
      <div className={paymentMethod === undefined || paymentMethod === null ? "" : "grid md:grid-cols-2"}>
        <div className="flex-1 p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h2 id="plan-heading" className="panel-section text-base">
                  {planLabel(plan.name)}
                </h2>
                <span className="rounded-full bg-accent-pale px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-deep">
                  Monthly
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">{priceNote(plan, subscription.discountAmountCents, nextBundledNetCents(subscription))}</p>
            </div>
            {price === null ? null : (
              <p className="flex items-baseline gap-1.5">
                <span className="font-serif text-3xl leading-none tracking-tight tabular-nums">{price}</span>
                <span className="text-xs text-ink-soft">per month</span>
              </p>
            )}
          </div>

          {progress === null ? null : (
            <PeriodBar progress={progress}>
              <NextPaymentCaption plan={plan} subscription={subscription} progress={progress} />
            </PeriodBar>
          )}
        </div>

        {paymentMethod === undefined || paymentMethod === null ? null : (
          <div className="border-t border-line p-6 sm:p-7 md:border-l md:border-t-0">{paymentMethod}</div>
        )}
      </div>

      <details className="group border-t border-line">
        <summary className="flex cursor-pointer list-none items-center justify-end gap-1.5 px-6 py-3.5 text-xs font-semibold text-accent-deep transition-colors duration-300 ease-calm hover:text-ink sm:px-7 [&::-webkit-details-marker]:hidden">
          What’s included
          <ChevronDownIcon className="size-3.5 transition-transform duration-300 ease-calm group-open:rotate-180" />
        </summary>
        <div className="px-6 pb-6 sm:px-7">
          <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {carePlan.includes.map((item) => (
              <li key={item} className="flex gap-2 text-xs">
                <TickIcon className="mt-px size-3.5 shrink-0 text-accent" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink-soft">{changesNote(plan)}</p>
        </div>
      </details>
    </section>
  );
}
