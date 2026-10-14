import type { Plan, PlanPriceField, PriceChange } from "@fynix/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@fynix/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@fynix/shared/ui/panel/local-date-time";
import { chargedAmountCents } from "@fynix/billing/tax";
import {
  formPriceValue,
  PRICING_CURRENCY_FIELD,
  PRICING_EXTRA_BLOG_POSTS_FIELD,
  PRICING_EXTRA_HOUR_FIELD,
  PRICING_EXTRA_PUBLISH_FIELD,
  PRICING_MONTHLY_FIELD,
  PRICING_TIER_FIELD,
} from "@fynix/shared/lib/billing/pricing-form";
import { BILLING_CURRENCY_LABELS } from "@fynix/shared/lib/currency";
import { formatMoney } from "@fynix/shared/lib/money";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { Quiet, Section } from "@/components/console/section";
import { PRICING_NOTICES, readPricingNotice } from "@/lib/pricing-notices";
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

const TIER_LABELS: Readonly<Record<Plan["tier"], string>> = { care: "Care", premium: "Premium" };

function PriceSheetForm({ plan }: { readonly plan: Plan }): ReactElement {
  const key = `${plan.tier}-${plan.currency.toLowerCase()}`;
  const tax = plan.taxRateBasisPoints > 0 ? `before ${plan.taxRateBasisPoints / 100}% GST` : "no tax";
  return (
    <Section
      title={`${TIER_LABELS[plan.tier]} · ${BILLING_CURRENCY_LABELS[plan.currency]}`}
      aside={
        <>
          <span className="block">Prices {tax}.</span>
          <span className="mt-1 block">
            Plan <code className="break-all text-xs">{plan.code}</code>
          </span>
          {plan.providerPlanId === null ? (
            // A price a migration put on sale has no Razorpay plan until it is saved here, and until then Razorpay
            // refuses to charge it. Only said where Razorpay is the provider: the fake one has no plans to make.
            process.env.BILLING_PROVIDER === "razorpay" ? (
              <span className="mt-1 block font-medium text-accent">Not at Razorpay yet. Save to create it.</span>
            ) : null
          ) : (
            <span className="mt-1 block">
              Razorpay <code className="break-all text-xs">{plan.providerPlanId}</code>
            </span>
          )}
        </>
      }
    >
      <form action={savePricesAction} className="max-w-2xl">
        <input type="hidden" name={PRICING_CURRENCY_FIELD} value={plan.currency} />
        <input type="hidden" name={PRICING_TIER_FIELD} value={plan.tier} />
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <PriceInput
            id={`${key}-monthly`}
            name={PRICING_MONTHLY_FIELD}
            label="Monthly price"
            cents={plan.recurringAmountCents}
            plan={plan}
            hint="New sign-ups only"
          />
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
          A new monthly price creates a new Razorpay plan: customers who already subscribe keep paying their current
          price. Care and Premium have their own monthly price; the extras are the same for both and apply to everyone
          from now on. Extras already added keep their price.
        </p>
        <GatedSubmitButton className={`${buttonPrimary} mt-6`} pendingLabel="Saving…">
          Save {TIER_LABELS[plan.tier]} {plan.currency} prices
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
                  {change.tier === null ? "" : `${TIER_LABELS[change.tier]} `}
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
        meta="What new customers pay each month, and what extras cost. The website and checkout read these."
      />
      {notice === null ? null : (
        <Notice tone={PRICING_NOTICES[notice].ok ? "ok" : "problem"} className="mt-10">
          {PRICING_NOTICES[notice].text}
        </Notice>
      )}
      <div className="mt-12">
        {plans.map((plan) => (
          <PriceSheetForm key={plan.id} plan={plan} />
        ))}
        <PriceHistory changes={changes} />
      </div>
    </>
  );
}
