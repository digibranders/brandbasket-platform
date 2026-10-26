import type { ReactElement, ReactNode } from "react";
import { ChevronDownIcon } from "@brandbasket/shared/ui/icons";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { formatMoney } from "@brandbasket/shared/lib/money";
import Link from "next/link";
import { IncludedList } from "@/components/panel/membership/included-list";
import { MembershipPayForm } from "@/components/panel/membership/membership-pay-form";
import { MANAGED_WEBSITE_INCLUDED, type IncludedItem } from "@/lib/checkout-included";
import { renewalTerms, type MembershipTier, type OrderSummary as OrderSummaryParts } from "@/lib/membership";
import type { MembershipCheckoutView } from "@/lib/server/membership-checkout";
import { startMembership } from "@/app/app-host/(protected)/plan/actions";

interface OrderSummaryProps {
  readonly tier: MembershipTier;
  /** A view whose plan is on sale: the page only draws a summary when there is something to pay. */
  readonly view: MembershipCheckoutView & { readonly plan: NonNullable<MembershipCheckoutView["plan"]> };
  /** Today's payment, worked out by orderSummary from the same basket the Pay button posts. */
  readonly parts: OrderSummaryParts;
  /** The address of this page with a service taken out: what each Remove goes to. */
  readonly removeHref: (service: MonthlyAddOnId) => string;
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
 * Today's payment, in one place: a line for each service in the basket at its list price (the Managed Website line with what
 * it includes), the package offer and the code if there is one, what is due with the GST it includes and the Pay button, then the ad credit
 * a package earns. Beside the page's content on a wide screen and following it down; below it on a phone, where the Pay
 * button also floats (membership-page.tsx). Every figure is in `parts`, which the page worked out with the functions the
 * checkout charges by. A service can be taken out with Remove unless it is the only one.
 */
export function OrderSummary({ tier, view, parts, removeHref, children }: OrderSummaryProps): ReactElement {
  const { plan, discount } = view;
  const money = (cents: number): string => formatMoney(cents, plan.currency);
  // What the package offer and a code take off: the figure the lines above add up to less.
  const savedCents = parts.discountCents + (parts.offer?.discountCents ?? 0);
  const removable = parts.lines.length > 1;

  return (
    <section aria-label="Order summary" className="rounded-card border border-line bg-card p-5 shadow-[0_18px_40px_-28px_rgb(42_13_16/0.35)]">
      <h2 className="text-sm font-semibold text-ink">Order summary</h2>
      <dl className="mt-3 divide-y divide-line">
        {parts.lines.map((line) => (
          <div key={line.addOn} className="py-1.5">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-ink">{line.title}</dt>
              <dd className="tabular-nums text-ink">{money(line.listCents)}</dd>
            </div>
            <p className="mt-0.5 flex items-baseline justify-between gap-4 text-xs text-ink-soft">
              <span className="whitespace-nowrap">Billed monthly</span>
              {removable ? (
                <Link href={removeHref(line.addOn)} replace scroll={false} prefetch={false} aria-label={`Remove ${line.title}`} className="shrink-0 underline underline-offset-2 hover:text-ink">
                  Remove
                </Link>
              ) : null}
            </p>
            {line.addOn === "managed-website" ? <Included items={MANAGED_WEBSITE_INCLUDED} /> : null}
          </div>
        ))}
        {parts.offer === null ? null : <Row label={parts.offer.label} amount={`-${money(parts.offer.discountCents)}`} />}
        {discount === null || parts.discountCents === 0 ? null : <Row label={`Code ${discount.code}`} amount={`-${money(parts.discountCents)}`} />}
        <div className="flex items-baseline justify-between gap-4 pt-3">
          <dt className="text-sm font-semibold text-ink">Due today</dt>
          <dd className="font-serif text-3xl tabular-nums text-ink">{money(parts.totalCents)}</dd>
        </div>
        {plan.taxRateBasisPoints > 0 ? <p className="pt-1 text-right text-xs text-ink-soft">Includes {money(parts.gstCents)} of GST at {plan.taxRateBasisPoints / 100}%</p> : null}
        {savedCents > 0 ? (
          <div>
            <p className="pt-1.5 text-right text-base font-semibold text-success">You saved {money(savedCents)}</p>
          </div>
        ) : null}
        {parts.adCredit === null ? null : (
          <div>
            <p className="pt-1.5 text-right text-base font-semibold text-success">{parts.adCredit.label}</p>
          </div>
        )}
      </dl>

      <div className="mt-4 hidden lg:block">
        <MembershipPayForm action={startMembership} amount={money(parts.totalCents)} tier={tier} services={parts.lines.map((line) => line.addOn)} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">{renewalTerms(parts, plan, discount?.months ?? null)}</p>

      {children === undefined ? null : <div className="mt-4 space-y-5 border-t border-line pt-4">{children}</div>}

    </section>
  );
}
