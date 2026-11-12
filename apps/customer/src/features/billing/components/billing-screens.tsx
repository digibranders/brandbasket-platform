import { PAYMENT_RECEIVED_MESSAGE } from "@brandbasket/shared/lib/billing/payment-step";
import type { ReactNode } from "react";
import { PageHeader, Panel, PanelEmpty, PanelError } from "@/components";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { formatDate } from "@/lib/format";
import { Banner, Icon, LinkButton, TabLinks } from "@/ui";
import { PaymentWaiting } from "../../checkout/components/payment-waiting";
import { BRAND } from "../../checkout/rules/brand";
import { CHARGE_NOTICES } from "../../checkout/rules/charge-notices";
import { loadBillingOverview, loadInvoices, loadPaymentPage, type BillingOverview, type NoticesView, type PaymentView } from "../loader";
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

function BillPanel({ bill }: { readonly bill: BillView }) {
  return (
    <Panel title={bill.period === "year" ? "This year's bill" : "This month's bill"}>
      <dl className="flex flex-col gap-2">
        {bill.rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="text-ink-3">{row.label}</dt>
            <dd className={row.discount ? "tabular-nums text-pos-text" : "tabular-nums"}>{row.amount}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4">
          <dt className="type-sub text-ink">{bill.period === "year" ? "Total per year" : "Total per month"}</dt>
          <dd className="type-metric-sm tabular-nums">{bill.total}</dd>
        </div>
      </dl>
      {bill.gstLine === null && bill.adMoneyLine === null ? null : <p className="mt-2 type-meta">{[bill.gstLine, bill.adMoneyLine].filter((line) => line !== null).join(" ")}</p>}
    </Panel>
  );
}

/** The panel for a plan that is not simply paid, with its one action. Null for a paid plan. */
function StatePanel({ state, overview }: { readonly state: PlanState; readonly overview: BillingOverview }): ReactNode {
  switch (state.kind) {
    case "paid":
      return null;
    case "renewal-failing":
      return (
        <Panel title="We couldn’t take your last payment">
          <p className="type-body text-ink-3">
            We’ll try again on our own. Your website stays online until {formatDate(state.until)}. If the payments keep failing, it goes offline then, and you can restart it from this page. Check
            that the account, card or UPI you subscribed with has enough balance and hasn’t expired.
          </p>
          {overview.canManage ? (
            <div className="mt-3">
              <LinkButton href={PAYMENT_PATH} variant="primary">
                Change payment method
              </LinkButton>
            </div>
          ) : null}
        </Panel>
      );
    case "under-review":
      return (
        <Panel title="What happens next">
          <p className="type-body text-ink-3">{PAYMENT_RECEIVED_MESSAGE} There’s nothing more for you to pay.</p>
        </Panel>
      );
    case "unpaid":
      return (
        <Panel title="Your plan">
          <p className="type-body text-ink-3">Your plan starts when your first payment goes through.</p>
          {overview.canManage ? (
            <div className="mt-3">
              <LinkButton href="/checkout" variant="primary">
                Go to checkout
              </LinkButton>
            </div>
          ) : null}
        </Panel>
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
  return (
    <>
      <BillingHeader current={BILLING_TABS[0].href} description={headerLine} />
      <div className="flex flex-col gap-4">
        {overview.notices.ok ? <Notices notices={overview.notices.data} /> : <PanelError failure={overview.notices.error} what="the result of your payment" />}
        <StatePanel state={overview.state} overview={overview} />
        {services === null ? null : services.ok ? (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ServicesPanel view={services.data} preselect={overview.preselect} />
            {services.data.bill === null ? null : <BillPanel bill={services.data.bill} />}
          </div>
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
  return (
    <Panel title="Payment method">
      <div className="flex flex-wrap items-center gap-3">
        <Icon name="CreditCard" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="type-sub text-ink">{label}</b>
          <span className="type-meta">{line}</span>
        </div>
        {canChange && method.kind !== "bank-transfer" ? <PaymentMethodRequest /> : null}
      </div>
    </Panel>
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
