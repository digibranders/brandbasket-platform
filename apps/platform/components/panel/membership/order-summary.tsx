import type { ReactElement, ReactNode } from "react";
import { ChevronDownIcon, TickIcon } from "@fynix/shared/ui/icons";
import { addOnById, addOnPrice, isAddOnId } from "@fynix/shared/lib/billing/add-ons";
import { formatMoney } from "@fynix/shared/lib/money";
import { MembershipPayForm } from "@/components/panel/membership/membership-pay-form";
import { orderSummary, type MembershipTier } from "@/lib/membership";
import type { MembershipCheckoutView } from "@/lib/server/membership-checkout";
import { describeDiscountedPlanTerms } from "@fynix/shared/lib/billing/terms";
import { startMembership } from "@/app/app-host/(protected)/premium/actions";

interface OrderSummaryProps {
  readonly tier: MembershipTier;
  /** A view whose plan is on sale: the page only draws a summary when there is something to pay. */
  readonly view: MembershipCheckoutView & { readonly plan: NonNullable<MembershipCheckoutView["plan"]> };
  /** What the plan includes, in the groups the page used to list: shown in a dropdown under the plan's line. */
  readonly groups: readonly { readonly name: string; readonly items: readonly string[] }[];
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

/**
 * Today's payment, in one place: the plan, a code if one is applied, the GST, what is due and the Pay button. Beside the
 * page's content on a wide screen and following it down; below it on a phone, where the Pay button also floats
 * (membership-page.tsx). Add-ons already bought here are listed as billed apart: each is its own monthly subscription,
 * paid when it was added.
 */
export function OrderSummary({ tier, view, groups, children }: OrderSummaryProps): ReactElement {
  const { plan, discount, offer } = view;
  const money = (cents: number): string => formatMoney(cents, plan.currency);
  const parts = orderSummary(plan, discount?.amountCents ?? 0);
  const added = offer.kind === "available" ? offer.claimed.filter(isAddOnId) : [];

  return (
    <section aria-label="Order summary" className="rounded-card border border-line bg-card p-5 shadow-[0_18px_40px_-28px_rgb(42_13_16/0.35)]">
      <h2 className="text-sm font-semibold text-ink">Order summary</h2>
      <dl className="mt-3 divide-y divide-line">
        <div className="py-1.5">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="text-ink">Website and hosting</dt>
            <dd className="tabular-nums text-ink">
              {parts.discountCents > 0 ? <s className="mr-2 text-xs text-ink-soft">{money(parts.listCents)}</s> : null}
              <span className={parts.discountCents > 0 ? "font-semibold text-success" : undefined}>{money(parts.netCents)}</span>
            </dd>
          </div>
          {/* What the plan includes, kept out of the way until asked for. */}
          <details className="group mt-1.5">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-ink-soft transition-colors duration-300 ease-calm hover:text-ink [&::-webkit-details-marker]:hidden">
              What&rsquo;s included
              <ChevronDownIcon className="size-3.5 transition-transform duration-300 ease-calm group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-3">
              {groups.map((group) => (
                <div key={group.name}>
                  <p className="text-xs font-semibold text-ink">{group.name}</p>
                  <ul className="mt-1 space-y-1">
                    {group.items.map((item) => (
                      <li key={item} className="flex items-baseline gap-2 text-xs text-ink-soft">
                        <TickIcon className="size-3 shrink-0 translate-y-[0.1rem] text-success" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </div>
        <Row label={`GST ${plan.taxRateBasisPoints / 100}%`} amount={money(parts.gstCents)} />
        <div className="flex items-baseline justify-between gap-4 pt-3">
          <dt className="text-sm font-semibold text-ink">Due today</dt>
          <dd className="font-serif text-3xl tabular-nums text-ink">{money(parts.totalCents)}</dd>
        </div>
      </dl>

      <div className="mt-4 hidden lg:block">
        <MembershipPayForm action={startMembership} amount={money(parts.totalCents)} tier={tier} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">{describeDiscountedPlanTerms(plan, discount)}</p>

      {children === undefined ? null : <div className="mt-4 space-y-5 border-t border-line pt-4">{children}</div>}

      <div className="mt-4 border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Add-ons</h3>
        {added.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">None added. You can add them above, or later at full price.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {added.map((id) => {
              const addOn = addOnById(id);
              return (
                <li key={id} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">{addOn.title}</span>
                  <span className="tabular-nums text-ink-soft">{money(addOnPrice(addOn, false, true).netCents)} a month + GST</span>
                </li>
              );
            })}
          </ul>
        )}
        {added.length === 0 ? null : <p className="mt-2 text-xs text-ink-soft">Billed on their own each month, already paid for this month.</p>}
      </div>
    </section>
  );
}
