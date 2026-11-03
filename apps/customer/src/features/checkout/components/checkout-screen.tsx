import Link from "next/link";
import { PageHeader, Panel, TimelineSteps } from "@/components";
import { Banner } from "@/ui";
import type { CheckoutView } from "../loader";
import { BRAND } from "../rules/brand";
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
          <p className="type-body text-ink-3">
            We can’t take payment for this plan just yet. Email us at <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a> and we’ll sort it out.
          </p>
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
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="sr-only">Checkout</h1>
      {children}
    </div>
  );
}

function PayScreen({ view }: { readonly view: Extract<CheckoutView, { kind: "pay" }> }) {
  const { ledger, about } = view;
  return (
    <>
      <PageHeader title={view.title} description={view.lead} />
      {ledger.paymentFailed ? <Banner tone="warn">We couldn’t confirm that payment, so nothing has been recorded. You can try again below.</Banner> : null}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Due today">
          <div className="flex flex-col gap-4">
            {ledger.changeServicesHref === null ? null : (
              <Link href={ledger.changeServicesHref} className="type-sub">
                Change services
              </Link>
            )}
            <div aria-live="polite" className="flex flex-col gap-1">
              <ul className="flex flex-col">
                {ledger.rows.map((row) => (
                  <li key={row.key} className="flex justify-between gap-4 py-1 type-body text-ink-2">
                    <span className={row.tone === "save" ? "text-pos-text" : undefined}>{row.label}</span>
                    <span className={`${row.tone === "free" ? "" : "tabular-nums"} ${row.tone === "plain" ? "" : "text-pos-text"}`}>{row.amount}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between gap-4 border-t border-border-subtle pt-3">
                <span className="type-sub text-ink">Due today</span>
                <span className="type-metric text-ink" data-testid="due-total">
                  {ledger.total}
                </span>
              </div>
              {ledger.gstLine === null ? null : <p className="type-meta text-right">{ledger.gstLine}</p>}
              {ledger.adCredit === null ? null : <p className="type-sub text-right text-pos-text">{ledger.adCredit}</p>}
            </div>
            <details className="border-t border-border-subtle pt-3" open={ledger.code !== null || ledger.lapsedCode !== null}>
              <summary className="cursor-pointer type-sub text-ink">Have a code? (optional)</summary>
              <div className="pt-3">
                <CodeForm services={ledger.services} code={ledger.code} lapsedCode={ledger.lapsedCode} />
              </div>
            </details>
            <PayForm services={ledger.services} total={ledger.total} billingDetails={ledger.billingDetails} />
            <p className="type-meta">{ledger.renewal}</p>
          </div>
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel title="What you get">
            <ul className="flex flex-col gap-4">
              {about.gets.map((service) => (
                <li key={service.title} className="flex flex-col gap-1">
                  <p className="type-sub text-ink">{service.title}</p>
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
          </Panel>
          <Panel title="What happens next">
            <TimelineSteps
              label="What happens next"
              steps={about.steps.map((step, index) => ({ title: step.title, meta: step.note, state: index === 0 ? "now" : "todo" }))}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
