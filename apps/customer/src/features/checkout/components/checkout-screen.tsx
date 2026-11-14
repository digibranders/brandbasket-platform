import Link from "next/link";
import { EmptyState } from "@brandbasket/shared/ui/patterns";
import { TimelineSteps } from "@/components";
import { Banner, Icon } from "@/ui";
import type { CheckoutView } from "../loader";
import { BRAND } from "../rules/brand";
import { BillingSwitch } from "./billing-switch";
import { CodeForm } from "./code-form";
import { PayForm } from "./pay-form";
import { PaymentWaiting } from "./payment-waiting";

/**
 * The checkout (old /plan, and the payment on the old Check and send): the services, what they cost together, a code, the
 * billing details and Pay, with what the services include and what happens next beside it. Every figure arrives worked out.
 */
export function CheckoutScreen({ view }: { readonly view: CheckoutView }) {
  switch (view.kind) {
    case "under-review":
      return (
        <Shell>
          <Banner tone="info">{view.message}</Banner>
        </Shell>
      );
    case "waiting":
      return (
        <Shell>
          <PaymentWaiting
            waitKey={view.waitKey}
            waitingText="We’ve received your payment. Opening your membership…"
            delayedText="Opening your membership is taking longer than usual."
            supportEmail={BRAND.contactEmail}
          />
        </Shell>
      );
    case "no-plan":
      return (
        <Shell>
          <EmptyState
            title="Your basket is empty"
            description="Browse plans to select a package for your business."
            action={
              <Link href="/" className="inline-flex h-control items-center justify-center rounded-control border border-border bg-surface px-4 font-sans text-sm font-semibold text-ink shadow-button hover:bg-surface-hover">
                Browse plans
              </Link>
            }
          />
        </Shell>
      );
    case "owner-only":
      return (
        <Shell>
          <Banner tone="info">Only the owner of this account can pay. Ask them to sign in and finish the checkout.</Banner>
        </Shell>
      );
    case "pay":
      return <PayScreen view={view} />;
    default: {
      const unhandled: never = view;
      throw new Error(`Unhandled checkout view: ${JSON.stringify(unhandled)}`);
    }
  }
}

function Shell({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex max-w-xl flex-col gap-4 mx-auto w-full">
      <h1 className="sr-only">Checkout</h1>
      {children}
    </div>
  );
}

function PayScreen({ view }: { readonly view: Extract<CheckoutView, { kind: "pay" }> }) {
  const { ledger, about } = view;
  return (
    <>
      <header className="flex flex-col gap-1">
        <span className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-3">
          Membership Checkout
        </span>
        <h1 className="type-title text-ink">{view.title}</h1>
        {view.lead ? <p className="font-sans text-sm text-ink-2">{view.lead}</p> : null}
      </header>

      {ledger.paymentFailed ? (
        <div role="alert" className="flex items-start gap-3 rounded-panel border border-neg-border bg-neg-wash p-4 text-neg-text shadow-card">
          <Icon name="Warning" size="sm" className="mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5 font-sans text-sm">
            <strong className="font-semibold text-neg-text">Payment declined</strong>
            <span>We couldn’t confirm that payment, so nothing has been recorded. You can try again below.</span>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <article className="relative flex flex-col rounded-overlay border border-border border-t-2 border-t-accent-gold bg-surface p-6 shadow-hero sm:p-7 lg:col-span-7">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                Business Details
              </h2>
              {ledger.changeServicesHref === null ? null : (
                <Link href={ledger.changeServicesHref} className="type-sub font-medium text-accent-gold-text underline underline-offset-4 decoration-accent-gold/40 hover:decoration-accent-gold">
                  Change services
                </Link>
              )}
            </div>

            <BillingSwitch interval={ledger.billing.interval} monthlyHref={ledger.billing.monthlyHref} yearlyHref={ledger.billing.yearlyHref} />

            <PayForm
              services={ledger.services}
              billing={ledger.billing.value}
              total={ledger.total}
              billingDetails={ledger.billingDetails}
              summary={{
                title: "Confirm your plan",
                rows: ledger.rows,
                totalLabel: "Due today",
                total: ledger.total,
                notes: [ledger.renewal, ...(ledger.gstLine === null ? [] : [ledger.gstLine]), ...(ledger.adCredit === null ? [] : [ledger.adCredit])],
              }}
            />

            <details className="border-t border-border pt-3" open={ledger.code !== null || ledger.lapsedCode !== null}>
              <summary className="cursor-pointer type-sub text-ink font-medium">Have a code? (optional)</summary>
              <div className="pt-3">
                <CodeForm services={ledger.services} code={ledger.code} lapsedCode={ledger.lapsedCode} />
              </div>
            </details>

            <p className="type-meta">{ledger.renewal}</p>
          </div>
        </article>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <article className="rounded-panel border border-border bg-surface p-6 shadow-card">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink mb-4">
              Order Summary
            </h2>
            <div aria-live="polite" className="flex flex-col gap-1">
              <ul className="flex flex-col divide-y divide-border-subtle">
                {ledger.rows.map((row) => (
                  <li key={row.key} className="flex justify-between gap-4 py-2 type-body text-ink-2">
                    <span className={row.tone === "save" ? "text-pos-text font-medium" : undefined}>{row.label}</span>
                    <span className={`${row.tone === "free" ? "" : "tabular-nums font-mono"} ${row.tone === "plain" ? "text-ink" : "text-pos-text font-medium"}`}>{row.amount}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 mt-1">
                <span className="type-sub font-semibold text-ink">Due today</span>
                <span className="font-mono text-2xl font-bold text-ink tabular-nums" data-testid="due-total">
                  {ledger.total}
                </span>
              </div>
              {ledger.gstLine === null ? null : <p className="font-sans text-xs text-ink-3 text-right mt-1">{ledger.gstLine}</p>}
              {ledger.adCredit === null ? null : <p className="type-sub text-right text-pos-text font-medium mt-1">{ledger.adCredit}</p>}
            </div>
          </article>

          <article className="rounded-panel border border-border bg-surface p-6 shadow-card">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink mb-4">What you get</h2>
            <ul className="flex flex-col gap-4">
              {about.gets.map((service) => (
                <li key={service.title} className="flex flex-col gap-1">
                  <p className="type-sub font-semibold text-ink">{service.title}</p>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    {service.items.map((item) => (
                      <li key={item} className="type-body text-ink-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-panel border border-border bg-surface p-6 shadow-card">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink mb-4">What happens next</h2>
            <TimelineSteps
              label="What happens next"
              steps={about.steps.map((step, index) => ({ title: step.title, meta: step.note, state: index === 0 ? "now" : "todo" }))}
            />
          </article>
        </div>
      </div>
    </>
  );
}
