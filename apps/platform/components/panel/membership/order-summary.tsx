import type { ReactElement, ReactNode } from "react";
import { ChevronDownIcon } from "@fynix/shared/ui/icons";
import type { MonthlyAddOnId } from "@fynix/shared/lib/billing/add-ons";
import type { BundleLine } from "@fynix/shared/lib/billing/bundle";
import { formatMoney } from "@fynix/shared/lib/money";
import Link from "next/link";
import { IncludedList } from "@/components/panel/membership/included-list";
import { MembershipPayForm } from "@/components/panel/membership/membership-pay-form";
import { MAINTENANCE_INCLUDED, WEBSITE_INCLUDED, type IncludedItem } from "@/lib/checkout-included";
import { orderSummary, type MembershipTier } from "@/lib/membership";
import type { MembershipCheckoutView } from "@/lib/server/membership-checkout";
import { LIFETIME_OFFER_PERCENT } from "@fynix/shared/lib/billing/lifetime-offer";
import { describeDiscountedPlanTerms } from "@fynix/shared/lib/billing/terms";
import { startMembership } from "@/app/app-host/(protected)/premium/actions";

interface OrderSummaryProps {
  readonly tier: MembershipTier;
  /** A view whose plan is on sale: the page only draws a summary when there is something to pay. */
  readonly view: MembershipCheckoutView & { readonly plan: NonNullable<MembershipCheckoutView["plan"]> };
  /** The add-ons ticked on the page, paid in this same payment. */
  readonly addOns: readonly BundleLine[];
  /** The address of this page with an add-on taken out: what each Remove goes to. */
  readonly removeHref: (addOn: MonthlyAddOnId) => string;
  /** What goes under the Pay button: a code and the optional GST details. */
  readonly children?: ReactNode;
}

function Row({ label, amount }: { readonly label: string; readonly amount: string }): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums text-ink">{amount}</dd>
    </div>
  );
}

/** "What's included", kept out of the way until asked for: a native disclosure, so it works without JavaScript. */
function Included({ items }: { readonly items: readonly IncludedItem[] }): ReactElement {
  return (
    <details className="group mt-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-ink-soft transition-colors duration-300 ease-calm hover:text-ink [&::-webkit-details-marker]:hidden">
        What&rsquo;s included
        <ChevronDownIcon className="size-3.5 transition-transform duration-300 ease-calm group-open:rotate-180" />
      </summary>
      <IncludedList items={items} />
    </details>
  );
}

/**
 * Today's payment, in one place: the free website and the monthly maintenance (each with what it includes), a code if one is applied, the GST, what is due and the Pay button. Beside the
 * page's content on a wide screen and following it down; below it on a phone, where the Pay button also floats
 * (membership-page.tsx). The add-ons ticked on the page are lines of the same payment and of every monthly payment after
 * it, each with its lifetime discount and a way to take it out.
 */
export function OrderSummary({ tier, view, addOns, removeHref, children }: OrderSummaryProps): ReactElement {
  const { plan, discount } = view;
  const money = (cents: number): string => formatMoney(cents, plan.currency);
  const parts = orderSummary(plan, discount?.amountCents ?? 0, addOns);
  // What the code and the lifetime discounts take off, before GST: the same struck-through prices the lines above show.
  const savedCents = parts.discountCents + parts.addOns.reduce((sum, line) => sum + line.listCents - line.netCents, 0);

  return (
    <section aria-label="Order summary" className="rounded-card border border-line bg-card p-5 shadow-[0_18px_40px_-28px_rgb(42_13_16/0.35)]">
      <h2 className="text-sm font-semibold text-ink">Order summary</h2>
      <dl className="mt-3 divide-y divide-line">
        <div className="py-1.5">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="text-ink">Website</dt>
            <dd className="font-semibold text-success">Free</dd>
          </div>
          <Included items={WEBSITE_INCLUDED} />
        </div>
        <div className="py-1.5">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="text-ink">Maintenance</dt>
            <dd className="tabular-nums text-ink">
              {parts.discountCents > 0 ? <s className="mr-2 text-xs text-ink-soft">{money(parts.listCents)}</s> : null}
              <span className={parts.discountCents > 0 ? "font-semibold text-success" : undefined}>{money(parts.planNetCents)}</span>
            </dd>
          </div>
          <Included items={MAINTENANCE_INCLUDED} />
        </div>
        {parts.addOns.map((line) => (
          <div key={line.addOn} className="py-1.5">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-ink">{line.title}</dt>
              <dd className="tabular-nums text-ink">
                <s className="mr-2 text-xs text-ink-soft">{money(line.listCents)}</s>
                <span className="font-semibold text-success">{money(line.netCents)}</span>
              </dd>
            </div>
            <p className="mt-0.5 flex items-baseline justify-between gap-4 text-xs text-ink-soft">
              <span className="whitespace-nowrap">{LIFETIME_OFFER_PERCENT}% lifetime discount, billed monthly</span>
              <Link href={removeHref(line.addOn)} replace scroll={false} prefetch={false} aria-label={`Remove ${line.title}`} className="shrink-0 underline underline-offset-2 hover:text-ink">
                Remove
              </Link>
            </p>
          </div>
        ))}
        <Row label={`GST ${plan.taxRateBasisPoints / 100}%`} amount={money(parts.gstCents)} />
        <div className="flex items-baseline justify-between gap-4 pt-3">
          <dt className="text-sm font-semibold text-ink">Due today</dt>
          <dd className="font-serif text-3xl tabular-nums text-ink">{money(parts.totalCents)}</dd>
        </div>
        {savedCents > 0 ? (
          <div>
            <p className="pt-1.5 text-right text-base font-semibold text-success">You saved {money(savedCents)}</p>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 hidden lg:block">
        <MembershipPayForm action={startMembership} amount={money(parts.totalCents)} tier={tier} addOns={addOns.map((line) => line.addOn)} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        {addOns.length === 0
          ? describeDiscountedPlanTerms(plan, discount)
          : `Your first payment covers one month, then ${money(parts.totalCents)} (GST included) is taken each month for your plan and add-ons.`}
      </p>

      {children === undefined ? null : <div className="mt-4 space-y-5 border-t border-line pt-4">{children}</div>}

    </section>
  );
}
