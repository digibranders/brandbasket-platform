import { PAYMENT_RECEIVED_MESSAGE } from "@brandbasket/shared/lib/billing/payment-step";
import { StatusChip } from "@brandbasket/shared/ui/patterns";
import type { ReactNode } from "react";
import { MetricStrip, PageHeader, Panel, PanelEmpty, PanelError } from "@/components";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { formatDate } from "@/lib/format";
import { Banner, Icon, LinkButton, TabLinks } from "@/ui";
import { PaymentWaiting } from "../../checkout/components/payment-waiting";
import { BRAND } from "../../checkout/rules/brand";
import { CHARGE_NOTICES } from "../../checkout/rules/charge-notices";
import { loadBillingOverview, loadInvoices, loadPaymentPage, type BillingOverview, type NoticesView, type PaymentView, type ServicesPanelView } from "../loader";
import { BILLING_REQUEST_HREF, BILLING_TABS, PAYMENT_PATH, type BillView, type PlanState } from "../rules";
import { BillingDetailsForm } from "./billing-details-form";
import { InvoicesTable } from "./invoices-table";
import { PaymentMethodRequest } from "./payment-method-request";
import { ReactivateCard } from "./reactivate-card";
import { ServicesPanel } from "./services-panel";

type Params = Readonly<Record<string, string | string[] | undefined>>;

function BillingHeader({ current, description }: { readonly current: string; readonly description?: string | null }) {
  return (
    <PageHeader
      title="Plan & billing"
      {...(description === null || description === undefined || description === "" ? {} : { description })}
      tabs={<TabLinks items={BILLING_TABS} current={current} aria-label="Plan and billing" />}
    />
  );
}

function Notices({ notices }: { readonly notices: NoticesView }) {
  const charge = notices.charge === null ? null : CHARGE_NOTICES[notices.charge];
  return (
    <>
      {charge === null ? null : <Banner tone={charge.ok ? "pos" : "neg"}>{charge.text}</Banner>}
      {notices.chargeWaiting ? (
        <PaymentWaiting waitKey="billing:charge" waitingText="Thanks, we’re confirming your payment with the bank. This page updates by itself." delayedText="Confirming your payment is taking longer than usual." supportEmail={BRAND.contactEmail} />
      ) : null}
      {notices.paymentReturn === "confirming" ? (
        <PaymentWaiting waitKey="billing:plan" waitingText="We’ve received your payment. Confirming it with the bank…" delayedText="Confirming your payment is taking longer than usual." supportEmail={BRAND.contactEmail} />
      ) : null}
      {notices.paymentReturn === "confirmed" ? <Banner tone="pos">Payment confirmed. Your website is back online.</Banner> : null}
      {notices.paymentReturn === "failed" ? <Banner tone="neg">That payment didn’t go through, and nothing was taken. You can try again.</Banner> : null}
    </>
  );
}

/** The plan at a glance: focal card with gold top border when active plan exists. */
function Glance({ glance }: { readonly glance: NonNullable<ServicesPanelView["glance"]> }) {
  return (
    <article className="relative flex flex-col rounded-overlay border border-border border-t-2 border-t-accent-gold bg-surface p-6 shadow-hero sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <StatusChip label="Active subscription" variant="active" hasDot />
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
            Growth Plan
          </h2>
          <p className="font-sans text-sm text-ink-2 max-w-xl">
            Website maintenance, automated social posts, and dedicated expert support.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl sm:text-3xl font-bold text-ink tabular-nums">
            {glance.nextAmount}
          </div>
          <div className="font-sans text-xs text-ink-3">
            per month, GST included
          </div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-border">
        <MetricStrip
          label="Your plan at a glance"
          metrics={[
            { label: "Next payment", value: glance.nextAmount, period: glance.nextOn },
            { label: "Your plans", value: String(glance.plansHeld), unit: `of ${glance.plansTotal}`, period: "Dedicated Expert Monitoring is free with all three" },
          ]}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs font-sans text-ink-2">
        <span>
          Next renewal: <strong className="font-mono text-ink">{glance.nextOn}</strong>
        </span>
        <LinkButton href={PAYMENT_PATH} size="sm" variant="secondary">
          Payment details
        </LinkButton>
      </div>
    </article>
  );
}

function BillPanel({ bill, isFocal = false }: { readonly bill: BillView; readonly isFocal?: boolean }) {
  const containerClass = isFocal
    ? "relative flex flex-col rounded-overlay border border-border border-t-2 border-t-accent-gold bg-surface p-6 shadow-hero sm:p-7"
    : "rounded-panel border border-border bg-surface p-6 shadow-card";
  return (
    <article className={containerClass}>
      <h2 className="font-display text-lg font-bold tracking-tight text-ink mb-3">
        {bill.period === "year" ? "This year's bill" : "This month's bill"}
      </h2>
      <dl className="flex flex-col gap-2">
        {bill.rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="text-ink-3 font-sans text-sm">{row.label}</dt>
            <dd className={row.discount ? "tabular-nums font-mono text-sm text-pos-text font-medium" : "tabular-nums font-mono text-sm text-ink font-medium"}>{row.amount}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <dt className="type-sub font-semibold text-ink">{bill.period === "year" ? "Total per year" : "Total per month"}</dt>
          <dd className="type-metric-sm tabular-nums font-mono">{bill.total}</dd>
        </div>
      </dl>
      {bill.gstLine === null && bill.adMoneyLine === null ? null : <p className="mt-3 type-meta">{[bill.gstLine, bill.adMoneyLine].filter((line) => line !== null).join(" ")}</p>}
    </article>
  );
}

/** The panel for a plan that is not simply paid, with its one action. Null for a paid plan. */
function StatePanel({ state, overview }: { readonly state: PlanState; readonly overview: BillingOverview }): ReactNode {
  switch (state.kind) {
    case "paid":
      return null;
    case "renewal-failing":
      return (
        <div role="alert" className="flex flex-col gap-3 rounded-panel border border-neg-border bg-neg-wash p-5 text-left shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-neg-text shadow-button" aria-hidden="true">
                <Icon name="Warning" size="sm" />
              </span>
              <h2 className="font-display text-lg font-semibold text-neg-text">
                We couldn’t take your last payment
              </h2>
            </div>
            {overview.canManage ? (
              <LinkButton href={PAYMENT_PATH} variant="primary" size="sm">
                Change payment method
              </LinkButton>
            ) : null}
          </div>
          <p className="type-body text-ink-2">
            We’ll try again on our own. Your website stays online until {formatDate(state.until)}. If the payments keep failing, it goes offline then, and you can restart it from this page. Check
            that the account, card or UPI you subscribed with has enough balance and hasn’t expired.
          </p>
        </div>
      );
    case "under-review":
      return (
        <Panel title="What happens next">
          <p className="type-body text-ink-3">{PAYMENT_RECEIVED_MESSAGE} There’s nothing more for you to pay.</p>
        </Panel>
      );
    case "unpaid":
      return (
        <article className="relative flex flex-col rounded-overlay border border-border border-t-2 border-t-accent-gold bg-surface p-6 shadow-hero sm:p-7">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">Your plan</h2>
            <p className="type-body text-ink-3">Your plan starts when your first payment goes through.</p>
          </div>
          {overview.canManage ? (
            <div className="mt-4">
              <LinkButton href="/checkout" variant="primary">
                Go to checkout
              </LinkButton>
            </div>
          ) : null}
        </article>
      );
    case "lapsed": {
      const loaded = overview.reactivation;
      if (loaded === null) return null;
      if (!loaded.ok) {
        return (
          <Panel title="Your plan has ended">
            <PanelError failure={loaded.error} what="your plan" />
          </Panel>
        );
      }
      return loaded.data === null ? (
        <Panel title="Your plan has ended">
          <p className="type-body text-ink-3">We couldn’t find your plan’s details. Ask the team and we’ll sort it out.</p>
          <div className="mt-3">
            <LinkButton href={BILLING_REQUEST_HREF}>Ask the team</LinkButton>
          </div>
        </Panel>
      ) : (
        <ReactivateCard view={loaded.data} canManage={overview.canManage} />
      );
    }
    default: {
      const unhandled: never = state;
      throw new Error(`Unhandled plan state: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** `/billing`: Your services. Every billing state, each with its one action. */
export async function BillingScreen({ customer, params }: { readonly customer: CustomerContext; readonly params: Params }) {
  const overview = await loadBillingOverview(customer, params);
  const services = overview.services;
  const headerLine = services !== null && services.ok ? services.data.headerLine : null;
  const glance = services !== null && services.ok ? services.data.glance : null;
  return (
    <>
      {/* The strip says the next payment, so the header does not repeat it. */}
      <BillingHeader current={BILLING_TABS[0].href} description={glance === null ? headerLine : null} />
      <div className="flex flex-col gap-4">
        {overview.notices.ok ? <Notices notices={overview.notices.data} /> : <PanelError failure={overview.notices.error} what="the result of your payment" />}
        <StatePanel state={overview.state} overview={overview} />
        {services === null ? null : services.ok ? (
          <>
            {services.data.glance === null ? null : <Glance glance={services.data.glance} />}
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ServicesPanel view={services.data} preselect={overview.preselect} />
              </div>
              {services.data.bill === null ? null : <BillPanel bill={services.data.bill} isFocal={services.data.glance === null} />}
            </div>
          </>
        ) : (
          <Panel title="Your services">
            <PanelError failure={services.error} what="your services" />
          </Panel>
        )}
      </div>
    </>
  );
}

/** `/billing/invoices`: every invoice and receipt, with its PDF. */
export async function InvoicesScreen({ customer }: { readonly customer: CustomerContext }) {
  const loaded = await load("billing.invoices", () => loadInvoices(customer));
  const downloadAll =
    loaded.ok && loaded.data.canDownload && loaded.data.invoices.some((view) => view.row.kind === "payment" && view.row.downloadable) ? (
      <LinkButton href="/billing/receipts" prefetch={false} size="sm">
        Download all
      </LinkButton>
    ) : undefined;
  return (
    <>
      <BillingHeader current={BILLING_TABS[1].href} />
      {loaded.ok ? (
        <Panel flush action={downloadAll}>
          <InvoicesTable invoices={loaded.data.invoices} billedTo={loaded.data.billedTo} canDownload={loaded.data.canDownload} canPay={customer.role === "owner"} />
        </Panel>
      ) : (
        <Panel title="Invoices">
          <PanelError failure={loaded.error} what="your invoices" />
        </Panel>
      )}
    </>
  );
}

/** `canChange`: the owner of a plan running now (the request needs a live plan); a bank transfer is arranged by hand anyway. */
function PaymentMethodPanel({ loaded, canChange }: { readonly loaded: Loaded<PaymentView>; readonly canChange: boolean }) {
  if (!loaded.ok) {
    return (
      <Panel title="Payment method">
        <PanelError failure={loaded.error} what="your payment method" />
      </Panel>
    );
  }
  const { method, renewsOn } = loaded.data;
  if (method === null) {
    return (
      <Panel title="Payment method">
        <PanelEmpty icon="CreditCard" title="No payment yet" description="The card, UPI or account you pay with shows here after your first payment." />
      </Panel>
    );
  }
  const label = method.kind === "bank-transfer" ? `Bank transfer${method.reference === null ? "" : `, reference ${method.reference}`}` : method.label;
  const line =
    method.kind === "renews"
      ? renewsOn === null
        ? "Renews automatically through Razorpay."
        : `Renews automatically on ${renewsOn} through Razorpay.`
      : method.kind === "bank-transfer"
        ? "We arrange each payment with you directly."
        : "The last payment was made with this.";
  const rawLabel = method.kind === "bank-transfer" ? "" : method.label.toLowerCase();
  const brandName =
    method.kind === "bank-transfer"
      ? "NEFT"
      : rawLabel.includes("visa")
        ? "VISA"
        : rawLabel.includes("mastercard")
          ? "MC"
          : rawLabel.includes("rupay")
            ? "RUPAY"
            : "CARD";
  return (
    <article className="rounded-panel border border-border bg-surface p-6 shadow-card">
      <h2 className="font-display text-lg font-bold tracking-tight text-ink mb-4">Payment method</h2>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-12 items-center justify-center rounded-control border border-border bg-canvas font-mono text-xs font-bold text-ink">
          {brandName}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="font-mono text-sm font-semibold text-ink">{label}</b>
          <span className="font-sans text-xs text-ink-3">{line}</span>
        </div>
        {canChange && method.kind !== "bank-transfer" ? <PaymentMethodRequest /> : null}
      </div>
    </article>
  );
}

/** `/billing/payment`: how the plan is paid, and who the invoices go to. */
export async function PaymentScreen({ customer }: { readonly customer: CustomerContext }) {
  const view = await loadPaymentPage(customer);
  return (
    <>
      <BillingHeader current={BILLING_TABS[2].href} />
      <div className="flex flex-col gap-4">
        <PaymentMethodPanel loaded={view.method} canChange={view.canManage && customer.billing.status === "paid"} />
        {view.details.ok ? (
          view.details.data === null ? null : (
            <Panel title="Billing details">
              <BillingDetailsForm view={view.details.data} canManage={view.canManage} />
            </Panel>
          )
        ) : (
          <Panel title="Billing details">
            <PanelError failure={view.details.error} what="your billing details" />
          </Panel>
        )}
      </div>
    </>
  );
}
