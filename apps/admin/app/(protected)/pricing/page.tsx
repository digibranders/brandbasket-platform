import type { Plan, PlanPriceField, PriceChange } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { chargedAmountCents } from "@brandbasket/billing/tax";
import {
  formPriceValue,
  PRICING_CURRENCY_FIELD,
  PRICING_EXTRA_BLOG_POSTS_FIELD,
  PRICING_EXTRA_HOUR_FIELD,
  PRICING_EXTRA_PUBLISH_FIELD,
  PRICING_TIER_FIELD,
} from "@brandbasket/shared/lib/billing/pricing-form";
import { BILLING_CURRENCY_LABELS } from "@brandbasket/shared/lib/currency";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { Quiet, Section } from "@/components/console/section";
import { PRICING_NOTICES, readPricingNotice } from "@/lib/pricing-notices";
import { catalogueRows, packageRows } from "@/lib/service-packages";
import { listPricingPlans, listRecentPriceChanges } from "@/lib/server/pricing-admin";
import { requireStaffCan } from "@/lib/server/staff-role";
import { savePricesAction } from "./actions";

export const metadata: Metadata = { title: "Pricing" };

/** Rupees or dollars with up to two places, as the server reads them (parseMoney); the typing rule already drops commas. */
const PRICE_PATTERN = "[0-9]+(?:\\.[0-9]{1,2})?";

const FIELD_LABELS: Readonly<Record<PlanPriceField, string>> = {
  monthly: "Monthly price",
  extra_hour: "Extra change hour",
  extra_publish: "Extra publish",
  extra_blog_posts: "Blog posts block",
};

interface PriceInputProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly cents: number;
  readonly plan: Plan;
  readonly hint: string;
}

/** One price box: typed before tax, with what the customer is actually charged shown under it. */
function PriceInput({ id, name, label, cents, plan, hint }: PriceInputProps): ReactElement {
  const charged = formatMoney(chargedAmountCents(cents, 0, plan.taxRateBasisPoints), plan.currency);
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        {label}
        <RequiredMark />
      </label>
      <RuleInput
        id={id}
        name={name}
        rule="amount"
        required
        pattern={PRICE_PATTERN}
        title="An amount like 2999 or 69.50"
        defaultValue={formPriceValue(cents)}
        autoComplete="off"
        className={`${fieldClasses} tabular-nums`}
      />
      <p className={`${hintClasses} tabular-nums`}>
        {hint}
        {plan.taxRateBasisPoints > 0 ? ` · charged ${charged} with GST` : null}
      </p>
    </div>
  );
}

/** The plan a logged monthly price change was made on: the plan rows no longer carry a price, but the history keeps its name. */
const HISTORY_TIER_LABELS: Readonly<Record<Plan["tier"], string>> = { managed: "Managed Website" };

function ServicesCatalogue(): ReactElement {
  return (
    <Section title="Services" aside="Before GST. Set in code, not here.">
      <ul aria-label="Services" className="max-w-3xl divide-y divide-line">
        {catalogueRows().map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 text-sm first:pt-0">
            <span className="font-medium">{row.title}</span>
            <span className="tabular-nums">
              {row.inr} or {row.usd} a month
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PackageOffers(): ReactElement {
  return (
    <Section title="Packages">
      <ul aria-label="Packages" className="max-w-3xl divide-y divide-line">
        {packageRows().map((row) => (
          <li key={row.services} className="grid gap-x-6 gap-y-1 py-3 text-sm first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto]">
            <span className="font-medium">{row.services}</span>
            <span className="tabular-nums text-ink-soft sm:text-right">
              {row.offer}
              <span className="block">Ad credit: {row.adCredit}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ExtrasForm({ plan }: { readonly plan: Plan }): ReactElement {
  const key = `${plan.tier}-${plan.currency.toLowerCase()}`;
  const tax = plan.taxRateBasisPoints > 0 ? `before ${plan.taxRateBasisPoints / 100}% GST` : "no tax";
  return (
    <Section title={`Extras · ${BILLING_CURRENCY_LABELS[plan.currency]}`} aside={`Prices ${tax}.`}>
      <form action={savePricesAction} className="max-w-2xl">
        <input type="hidden" name={PRICING_CURRENCY_FIELD} value={plan.currency} />
        <input type="hidden" name={PRICING_TIER_FIELD} value={plan.tier} />
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <PriceInput
            id={`${key}-hour`}
            name={PRICING_EXTRA_HOUR_FIELD}
            label="Extra change hour"
            cents={plan.extraHourAmountCents}
            plan={plan}
            hint={`After ${plan.includedChangeHours} free`}
          />
          <PriceInput
            id={`${key}-publish`}
            name={PRICING_EXTRA_PUBLISH_FIELD}
            label="Extra publish"
            cents={plan.extraPublishAmountCents}
            plan={plan}
            hint={`After ${plan.includedPublishesPerMonth} a month`}
          />
          <PriceInput
            id={`${key}-blog`}
            name={PRICING_EXTRA_BLOG_POSTS_FIELD}
            label={`${plan.blogPostBlockSize} more blog posts`}
            cents={plan.extraBlogPostsAmountCents}
            plan={plan}
            hint={`After ${plan.includedBlogPosts} included`}
          />
        </div>
        <p className="mt-6 max-w-2xl border-l-2 border-gold-deep py-1 pl-4 text-sm leading-relaxed">
          The extras apply to everyone from now on. Extras already added keep their price.
        </p>
        <GatedSubmitButton className={`${buttonPrimary} mt-6`} pendingLabel="Saving…">
          Save {plan.currency} extras
        </GatedSubmitButton>
      </form>
    </Section>
  );
}

function PriceHistory({ changes }: { readonly changes: readonly PriceChange[] }): ReactElement {
  return (
    <Section title="Price changes" aside={changes.length === 0 ? undefined : `Latest ${changes.length}`}>
      {changes.length === 0 ? (
        <Quiet>No prices changed from here yet.</Quiet>
      ) : (
        <ul className="max-w-3xl divide-y divide-line">
          {changes.map((change) => (
            <li key={change.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 text-sm first:pt-0">
              <span>
                <span className="font-medium">
                  {change.tier === null ? "" : `${HISTORY_TIER_LABELS[change.tier]} `}
                  {change.tier === null ? FIELD_LABELS[change.field] : FIELD_LABELS[change.field].toLowerCase()} ({change.currency})
                </span>
                {": "}
                <span className="tabular-nums text-ink-soft line-through">{formatMoney(change.oldAmountCents, change.currency)}</span>
                {" → "}
                <span className="font-semibold tabular-nums">{formatMoney(change.newAmountCents, change.currency)}</span>
              </span>
              <span className="tabular-nums text-ink-soft">
                {change.changedByName ?? "Staff"} · <LocalDateTime iso={change.createdAt.toISOString()} variant="timestamp" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export default async function PricingPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await requireStaffCan("money");
  const [plans, changes, params] = await Promise.all([listPricingPlans(), listRecentPriceChanges(), searchParams]);
  const notice = readPricingNotice(params.saved);

  return (
    <>
      <PageHeader
        title="Pricing"
        meta="What each service costs a month, the package offers, and what extras cost."
      />
      {notice === null ? null : (
        <Notice tone={PRICING_NOTICES[notice].ok ? "ok" : "problem"} className="mt-10">
          {PRICING_NOTICES[notice].text}
        </Notice>
      )}
      <div className="mt-12">
        <ServicesCatalogue />
        <PackageOffers />
        {plans.map((plan) => (
          <ExtrasForm key={plan.id} plan={plan} />
        ))}
        <PriceHistory changes={changes} />
      </div>
    </>
  );
}
