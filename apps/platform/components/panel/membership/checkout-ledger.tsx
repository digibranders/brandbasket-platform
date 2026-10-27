"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";
import { useActionState, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { addOnById, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { applyMembershipCode, removeMembershipCode, startMembership } from "@/app/app-host/(protected)/plan/actions";
import { BillingDetails } from "@/components/panel/billing/billing-details";
import { ReferralCodeForm } from "@/components/panel/referral-code-form";
import { CHECKOUT_COPY, CHECKOUT_PLAN_COPY, CHECKOUT_STEPS } from "@/lib/checkout-plans";
import { ledgerRows, ledgerSummary, type LedgerCode, type LedgerPricing, type LedgerRow } from "@/lib/checkout-ledger";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";
import { initialMembershipFormState, membershipHrefWithServices, renewalTerms, servicesAfterToggle, type MembershipTier } from "@/lib/membership";

interface CheckoutLedgerProps {
  readonly tier: MembershipTier;
  /** The services the address named, checked on the server: where the choice starts. */
  readonly initialServices: readonly MonthlyAddOnId[];
  /** Whether the services can be chosen here: not for a business that is buying back the basket it lapsed with. */
  readonly choosable: boolean;
  readonly pricing: LedgerPricing;
  readonly initialTermMonths: number;
  /** The code in force, or null. */
  readonly code: LedgerCode | null;
  /** A code applied earlier that no longer works, so the code form can say why the full price applies. */
  readonly lapsedCode: string | null;
  readonly billingDetails: BillingDetailsView | null;
  /** The provider sent the customer back from a payment that did not go through. */
  readonly paymentFailed: boolean;
}

const CHIP_BASE =
  "grid w-full grid-cols-[22px_1fr_auto] items-center gap-3 rounded-[0.625rem] px-4 py-3.5 text-left transition-[background-color,transform] duration-200 active:scale-[0.992] motion-reduce:transition-none max-[860px]:grid-cols-[22px_1fr] max-[860px]:items-start";
const DETAILS_SUMMARY =
  "cursor-pointer list-none text-sm font-semibold underline decoration-line underline-offset-[3px] [&::-webkit-details-marker]:hidden";
const TONE: Readonly<Record<LedgerRow["tone"], string>> = {
  plain: "",
  free: "font-semibold text-sage-deep",
  save: "font-semibold text-sage-deep",
};

/**
 * The plan page's checkout in the Ledger style (docs/design/checkout-ledger.html): one raised card to choose plans, a live
 * summary and the Pay button, with what the plans include and what happens next beside it.
 *
 * Choosing a plan is state here, so the figures change at once: they come from the same pure functions the server prices
 * with (lib/checkout-ledger.ts). The address follows the choice with history.replaceState, so a reload or Back lands on it.
 * Nothing is trusted from here: Pay posts the chosen services and the server prices and checks them again
 * (startMembershipCheckoutFor).
 */
export function CheckoutLedger({
  tier,
  initialServices,
  choosable,
  pricing,
  initialTermMonths,
  code,
  lapsedCode,
  billingDetails,
  paymentFailed,
}: CheckoutLedgerProps): ReactElement {
  const [services, setServices] = useState(initialServices);
  const summary = useMemo(() => ledgerSummary(pricing, services, code), [pricing, services, code]);
  const rows = ledgerRows(summary, pricing.currency, code);
  const money = (cents: number): string => formatMoney(cents, pricing.currency);
  const total = money(summary.totalCents);
  const onlyOne = services.length === 1;
  const monthlyOf = (id: MonthlyAddOnId): string => money(bundleLines([id], pricing.currency)[0]?.listCents ?? 0);

  const [payState, payAction, isPending] = useActionState(startMembership, initialMembershipFormState);
  const payError = payState.status === "error" && !isPending ? payState.message : null;
  const errorRef = useRef<HTMLParagraphElement>(null);
  // On a phone the Pay button is in the bottom bar and the message is up in the card: bring it into view.
  useEffect(() => {
    if (payError !== null) errorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [payError]);

  function toggle(id: MonthlyAddOnId): void {
    const next = servicesAfterToggle(services, id);
    if (next === services) return;
    setServices(next);
    window.history.replaceState(null, "", membershipHrefWithServices(tier, next));
  }

  const payLabel = isPending ? "Opening payment…" : `Pay ${total}`;
  const payClasses =
    "rounded-[0.625rem] bg-ink font-display font-semibold text-white transition-colors duration-200 hover:bg-ink-raised active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";

  return (
    <div className="max-[860px]:pb-24">
      <h1 className="font-display text-[clamp(1.875rem,4vw,2.5rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-ink">{CHECKOUT_COPY.title}</h1>
      <p className="mt-2 text-ink-2">{CHECKOUT_COPY.lead}</p>

      {paymentFailed ? (
        <p role="alert" className="mt-5 rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          We couldn&rsquo;t confirm that payment, so nothing has been recorded. You can try again below.
        </p>
      ) : null}

      <div className="mt-7 grid items-start gap-8 min-[861px]:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] min-[861px]:gap-12">
        <section aria-label="Choose your plans" className="rounded-lift bg-surface p-6 shadow-lift sm:p-[1.625rem]">
          {choosable ? (
            <>
              <p className="text-ink-2">{CHECKOUT_COPY.packageNote}</p>
              <div role="group" aria-label="Plans" className="mt-4 grid gap-2">
                {MONTHLY_ADD_ON_IDS.map((id) => {
                  const on = services.includes(id);
                  const addOn = addOnById(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      aria-disabled={on && onlyOne ? true : undefined}
                      onClick={() => toggle(id)}
                      className={`${CHIP_BASE} ${on ? "bg-rattan" : "bg-sunken hover:bg-line"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`grid size-[22px] place-items-center rounded-full border-[1.5px] transition-colors duration-200 motion-reduce:transition-none max-[860px]:mt-0.5 ${
                          on ? "border-ink bg-ink text-white" : "border-ink-2/40 bg-surface"
                        }`}
                      >
                        {on ? <Check size={12} weight="fill" /> : null}
                      </span>
                      <span>
                        <span className="block font-display text-[0.96875rem] font-semibold">
                          {addOn.title}
                          {id === "managed-website" ? (
                            <span className={`ml-2 inline-block rounded-md px-2 py-px align-[2px] text-[0.71875rem] font-semibold text-sage-deep ${on ? "bg-surface" : "bg-sage-wash"}`}>
                              {CHECKOUT_COPY.websiteBadge}
                            </span>
                          ) : null}
                        </span>
                        <span className={`block text-[0.8125rem] ${on ? "text-ink" : "text-ink-2"}`}>{CHECKOUT_PLAN_COPY[id].blurb(monthlyOf(id))}</span>
                      </span>
                      <span className="text-right font-figure text-[0.9375rem] font-medium tracking-[-0.02em] max-[860px]:col-start-2 max-[860px]:flex max-[860px]:items-baseline max-[860px]:gap-1.5 max-[860px]:text-left">
                        {monthlyOf(id)}
                        <span className={`block font-sans text-xs tracking-normal font-normal max-[860px]:inline ${on ? "text-ink" : "text-ink-2"}`}>a month</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {services.length === MONTHLY_ADD_ON_IDS.length ? (
                <p className="mt-3 text-[0.84375rem] font-semibold text-sage-deep">{CHECKOUT_COPY.allThree}</p>
              ) : null}
            </>
          ) : null}

          <div aria-live="polite" className={choosable ? "mt-5 border-t border-line pt-[1.125rem]" : ""}>
            <ul>
              {rows.map((row) => (
                <li key={row.key} className="flex justify-between py-[3px] text-sm text-ink-2">
                  <span className={row.tone === "save" ? TONE.save : ""}>{row.label}</span>
                  <span className={`${row.tone === "free" ? "" : "font-figure tabular-nums"} ${TONE[row.tone]}`}>{row.amount}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-[0.9375rem] font-semibold">Due today</span>
              <span data-testid="due-total" className="font-figure text-[2.375rem] font-medium leading-none tracking-[-0.05em]">
                {total}
              </span>
            </div>
            {pricing.taxRateBasisPoints > 0 ? (
              <p className="mt-1 text-right text-xs text-ink-2">
                Includes {money(summary.gstCents)} of GST at {pricing.taxRateBasisPoints / 100}%
              </p>
            ) : null}
            {summary.adCredit === null ? null : <p className="mt-1 text-right text-[0.8125rem] font-semibold text-sage-deep">{summary.adCredit.label}</p>}
          </div>

          <form id="checkout-pay" action={payAction}>
            <input type="hidden" name="tier" value={tier} />
            {services.map((service) => (
              <input key={service} type="hidden" name="service" value={service} />
            ))}
            <button
              type="submit"
              disabled={isPending}
              aria-busy={isPending}
              aria-describedby={payError === null ? undefined : "membership-error"}
              className={`mt-4 w-full p-4 text-base max-[860px]:hidden ${payClasses}`}
            >
              {payLabel}
            </button>
            {payError === null ? null : (
              <p ref={errorRef} id="membership-error" role="alert" className="mt-4 rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
                {payError}
              </p>
            )}
          </form>
          <p className="mt-3 text-[0.8125rem] text-ink-2">{renewalTerms(summary, { ...pricing, initialTermMonths }, code?.months ?? null)}</p>

          <div className="mt-3.5 flex flex-wrap gap-x-[22px] gap-y-1.5 border-t border-line pt-3.5">
            <details className="min-w-0 open:basis-full" open={code !== null || lapsedCode !== null}>
              <summary className={DETAILS_SUMMARY}>Have a code? (optional)</summary>
              <div className="mt-2.5">
                <ReferralCodeForm
                  applyAction={applyMembershipCode.bind(null, services)}
                  removeAction={removeMembershipCode}
                  discount={code === null ? null : { code: code.code, amountCents: summary.discountCents, months: code.months, stated: code.stated }}
                  currency={pricing.currency}
                  label="Code"
                  labelHidden
                  lapsedCode={lapsedCode}
                  compact
                />
              </div>
            </details>
            {billingDetails === null ? null : (
              <details className="min-w-0 open:basis-full" open={billingDetails.saved !== null}>
                <summary className={DETAILS_SUMMARY}>Billing details for your GST invoice</summary>
                <div className="mt-2.5">
                  <BillingDetails view={billingDetails} variant="ledger" />
                </div>
              </details>
            )}
          </div>
        </section>

        <aside aria-label="About your plan">
          <section aria-labelledby="checkout-get">
            <h2 id="checkout-get" className="font-display text-[0.9375rem] font-semibold">
              {CHECKOUT_COPY.getHeading}
            </h2>
            <ul className="mt-3 grid gap-4">
              {services.map((id) => (
                <li key={id}>
                  <p className="text-[0.84375rem] font-semibold">{addOnById(id).title}</p>
                  <ul className="mt-1.5 grid gap-1">
                    {CHECKOUT_PLAN_COPY[id].gets.map((item) => (
                      <li key={item} className="relative pl-3.5 text-sm text-ink-2 before:absolute before:left-[3px] before:top-[9px] before:size-1 before:rounded-full before:bg-ink">
                        {item}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="checkout-next" className="mt-8">
            <h2 id="checkout-next" className="font-display text-[0.9375rem] font-semibold">
              {CHECKOUT_COPY.nextHeading}
            </h2>
            <ol className="mt-3.5">
              {CHECKOUT_STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="relative grid grid-cols-[28px_1fr] gap-3.5 pb-5 not-last:before:absolute not-last:before:bottom-0 not-last:before:left-[13px] not-last:before:top-7 not-last:before:w-0.5 not-last:before:bg-line"
                >
                  <span className={`grid size-7 place-items-center rounded-full font-figure text-[0.8125rem] font-semibold ${index === 0 ? "bg-rattan text-ink" : "bg-sunken text-ink-2"}`}>
                    {index + 1}
                  </span>
                  <span>
                    <span className="block font-display text-[0.9375rem] font-semibold">{step.title}</span>
                    <span className="text-[0.84375rem] text-ink-2">{step.note}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 hidden items-center gap-3.5 border-t border-line bg-bg/95 px-4 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-md max-[860px]:flex">
        <div aria-hidden="true" className="flex-1">
          <span className="block text-xs text-ink-2">Due today</span>
          <span className="font-figure text-[1.375rem] font-medium tracking-[-0.04em]">{total}</span>
        </div>
        <button type="submit" form="checkout-pay" disabled={isPending} aria-busy={isPending} className={`px-6 py-3.5 text-base ${payClasses}`}>
          {payLabel}
        </button>
      </div>
    </div>
  );
}
