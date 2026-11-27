"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { BillingCurrency, ReferralDiscount } from "@brandbasket/db";
import { addOnById, cyclePriceCents, perCycle } from "@brandbasket/shared/lib/billing/add-ons";
import { describeDiscountMonths, describeReferralDiscount } from "@brandbasket/shared/lib/billing/referral-value";
import { WEBSITE_KINDS, WEBSITE_KIND_LABELS, type WebsiteKind, websiteBuildFeeCents } from "@brandbasket/shared/lib/billing/website-kind";
import { cn } from "@brandbasket/shared/lib/cn";
import { HOME_COUNTRY } from "@brandbasket/shared/lib/countries";
import { INDIA_STATES } from "@brandbasket/shared/lib/directory/india-states";
import { FIELD_PATTERNS } from "@brandbasket/shared/lib/forms/input-rules";
import { formatMoney, parseMoney } from "@brandbasket/shared/lib/money";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, readOnlyValueClasses } from "@/components/console/field-styles";
import { CopyTokenButton } from "@/components/copy-token-button";
import { Field } from "@/components/referral-code-form";
import { initialPaymentLinkFormState, type PaymentLinkFormState } from "@/components/payment-link-form-state";
import type { PaymentLinkField } from "@/lib/payment-link-form";
import {
  CUSTOM_PRICE_FIELDS,
  LINK_SERVICE_IDS,
  NOTE_MAX_LENGTH,
  SUMMARY_REFUSALS,
  type BuildDiscountKind,
  type DealAdvanceKind,
  readBuildDiscount,
  readCustomPrice,
  readDealAdvance,
  summariseLink,
} from "@/lib/payment-link-summary";
import { typedValues, useGuardedFormState } from "@/lib/use-guarded-form-state";

type PaymentLinkAction = (state: PaymentLinkFormState, formData: FormData) => Promise<PaymentLinkFormState>;

/** A coupon staff may put on a link, with what the summary needs to price it. */
export interface CouponChoice {
  readonly id: string;
  readonly code: string;
  readonly currency: BillingCurrency;
  readonly discount: ReferralDiscount;
  readonly discountMonths: number | null;
}

const ERROR_ID = "payment-link-error";

const dropped = (message: string, formData: FormData): PaymentLinkFormState => ({ status: "error", message, field: null, values: { ...typedValues(formData), service: formData.getAll("service").filter((value): value is string => typeof value === "string") } });

const DISCOUNT_KINDS: readonly { readonly value: BuildDiscountKind; readonly label: string }[] = [
  { value: "none", label: "No discount" },
  { value: "amount", label: "Amount off" },
  { value: "percent", label: "Percentage off" },
  { value: "final", label: "Final price" },
];

const DEAL_TYPES = [
  { value: "free", label: "Free website" },
  { value: "paid", label: "Paid website" },
] as const;

const ADVANCE_KINDS: readonly { readonly value: DealAdvanceKind; readonly label: string }[] = [
  { value: "amount", label: "Amount" },
  { value: "percent", label: "Percentage" },
];

const INTERVALS = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
] as const;

/** A row of radio choices in the console's pill style (the same control the coupon form uses for amount or percentage). */
function Choice<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  invalid,
}: {
  readonly name: string;
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly invalid?: boolean;
}): ReactElement {
  return (
    <span className="mt-2 flex w-fit flex-wrap rounded-[1.25rem] bg-card p-1 ring-1 ring-inset ring-line" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
            value === option.value ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
          )}
        >
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" aria-invalid={invalid === true ? true : undefined} />
          {option.label}
        </label>
      ))}
    </span>
  );
}

function Block({ title, hint, children }: { readonly title: string; readonly hint?: string; readonly children: ReactNode }): ReactElement {
  return (
    <fieldset className="border-t border-line pt-6">
      <legend className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{title}</legend>
      {hint === undefined ? null : <p className="mt-1 text-sm text-ink-2">{hint}</p>}
      <div className="mt-4 space-y-6">{children}</div>
    </fieldset>
  );
}

/** What the customer pays, worked out by the shared billing rules on every change (lib/payment-link-summary), never typed here. */
function PaysSummary({ summary, currency, kind, interval }: { readonly summary: ReturnType<typeof summariseLink>; readonly currency: BillingCurrency; readonly kind: WebsiteKind | null; readonly interval: "month" | "year" }): ReactElement {
  const money = (cents: number): string => formatMoney(cents, currency);
  if (summary.kind === "refused") {
    return (
      <p role="alert" className="border-l-2 border-error py-1 pl-4 text-sm text-error">
        {SUMMARY_REFUSALS[summary.reason]}
      </p>
    );
  }
  const { deal } = summary;
  const cycle = interval === "year" ? "a year" : "a month";
  const after = deal === null ? "payment" : "the balance payment";
  const when = summary.chargeInMonths === 1 ? `one month after ${after}` : `${summary.chargeInMonths} months after ${after}`;
  return (
    <section role="status" aria-label="The customer pays" className="border-l-2 border-gold-deep py-1 pl-4 text-sm leading-relaxed text-ink">
      <h2 className="font-display text-[0.9375rem] font-semibold">The customer pays</h2>
      <dl className="mt-2 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1">
        {deal === null || kind === null ? null : (
          <>
            <dt>Website build ({WEBSITE_KIND_LABELS[kind]})</dt>
            <dd className="text-right font-figure tabular-nums">{money(deal.listCents)}</dd>
            {deal.discountCents === 0 ? null : (
              <>
                <dt>Build discount</dt>
                <dd className="text-right font-figure tabular-nums">-{money(deal.discountCents)}</dd>
              </>
            )}
          </>
        )}
        {deal === null ? (
          <>
            <dt>First payment for the services</dt>
            <dd className="text-right font-figure tabular-nums">{money(summary.payTodayCents)}</dd>
            <dt className="font-semibold">To pay today</dt>
            <dd className="text-right font-figure font-semibold tabular-nums">{money(summary.payTodayCents)}</dd>
          </>
        ) : (
          <>
            <dt className="font-semibold">Advance now</dt>
            <dd className="text-right font-figure font-semibold tabular-nums">{money(summary.payTodayCents)}</dd>
            <dt className="font-semibold">Balance at go-live</dt>
            <dd className="text-right font-figure font-semibold tabular-nums">{money(summary.secondPaymentCents ?? 0)}</dd>
          </>
        )}
      </dl>
      <p className="mt-2">
        Then <strong className="font-figure tabular-nums">{money(summary.thenCents)}</strong> {cycle}, GST included, from {when}.
      </p>
    </section>
  );
}

/**
 * The payment link form. Every rule it hints at runs again on the server (parsePaymentLinkForm and createPaymentLinkFor): this
 * form is a courtesy, not a control. Once a link is made its address is shown here and never again.
 */
export function PaymentLinkForm({
  action,
  prefill,
  countries,
  coupons,
  provider,
  editing,
}: {
  readonly action: PaymentLinkAction;
  /** Field names to starting values, from the enquiry or the account the page was opened for. */
  readonly prefill: Readonly<Record<string, string>>;
  readonly countries: readonly SelectOption[];
  readonly coupons: readonly CouponChoice[];
  readonly provider: Parameters<typeof summariseLink>[0]["provider"];
  /** Set when the form edits a paid deal whose advance is received (plan 66, step 6): the advance is shown, never typed, and the customer's details are not asked again. */
  readonly editing?: { readonly advanceCents: number };
}): ReactElement {
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [state, formAction, isPending] = useGuardedFormState(action, initialPaymentLinkFormState, dropped, formRef);

  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else errorRef.current?.focus();
  }, [state]);

  const echoed = state.status === "error" ? state.values : null;
  const valueOf = (name: string): string => {
    const value = echoed?.[name];
    return typeof value === "string" ? value : (prefill[name] ?? "");
  };
  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const errorField: PaymentLinkField | null = errorMessage !== null && state.status === "error" ? state.field : null;
  const status = (name: PaymentLinkField): Record<string, unknown> => (errorField === name ? { "aria-invalid": true, "aria-describedby": ERROR_ID } : {});

  const echoedServices = echoed?.service;
  const [country, setCountry] = useState(valueOf("countryCode"));
  const [services, setServices] = useState<readonly string[]>(Array.isArray(echoedServices) ? echoedServices : prefill.service === undefined ? ["managed-website"] : prefill.service.split(","));
  const [kind, setKind] = useState<WebsiteKind>(valueOf("websiteKind") === "ecommerce" ? "ecommerce" : "b2b");
  const [interval, setInterval] = useState<"month" | "year">(valueOf("billingInterval") === "year" ? "year" : "month");
  const [dealType, setDealType] = useState<"free" | "paid">(valueOf("dealType") === "paid" ? "paid" : "free");
  // Null until staff type a price: the catalogue price for the kind and country shows meanwhile, so changing either re-prefills it.
  const [typedBuildPrice, setTypedBuildPrice] = useState<string | null>(echoed?.buildPrice !== undefined ? valueOf("buildPrice") : (prefill.buildPrice ?? null));
  const [advanceKind, setAdvanceKind] = useState<DealAdvanceKind>(valueOf("advanceKind") === "percent" ? "percent" : "amount");
  const [advanceValue, setAdvanceValue] = useState(valueOf("advanceValue"));
  const [customTyped, setCustomTyped] = useState<Readonly<Record<string, string>>>(() => Object.fromEntries(LINK_SERVICE_IDS.map((id) => [id, valueOf(CUSTOM_PRICE_FIELDS[id])])));
  const [discountKind, setDiscountKind] = useState<BuildDiscountKind>((["amount", "percent", "final"] as const).find((candidate) => candidate === valueOf("discountKind")) ?? "none");
  const [discountValue, setDiscountValue] = useState(valueOf("discountValue"));
  const [couponId, setCouponId] = useState(valueOf("couponId"));

  if (state.status === "created") return <CreatedLink address={state.address} customer={state.customer} expiresAt={state.expiresAt} />;

  const currency: BillingCurrency = country === HOME_COUNTRY ? "INR" : "USD";
  const hasWebsite = services.includes("managed-website");
  const websiteKind = hasWebsite ? kind : null;
  const paid = hasWebsite && dealType === "paid";
  const catalogueCents = websiteBuildFeeCents(kind, currency);
  const buildPriceText = typedBuildPrice ?? (catalogueCents % 100 === 0 ? String(catalogueCents / 100) : (catalogueCents / 100).toFixed(2));
  const listCents = parseMoney(buildPriceText);
  const discount = !paid || listCents === null ? { ok: true as const, cents: 0 } : readBuildDiscount(discountKind, discountValue, listCents);
  const advance = !paid || listCents === null || !discount.ok || websiteKind === null ? null : readDealAdvance(advanceKind, advanceValue, { currency, kind: websiteKind, listCents, discountCents: discount.cents });
  const chosen = LINK_SERVICE_IDS.filter((id) => services.includes(id));
  const customPrices = Object.fromEntries(
    chosen.flatMap((id) => {
      const read = readCustomPrice(customTyped[id] ?? "");
      return read.ok && read.cents !== null ? [[id, read.cents] as const] : [];
    }),
  );
  const couponsHere = coupons.filter((coupon) => coupon.currency === currency);
  const coupon = couponsHere.find((candidate) => candidate.id === couponId) ?? null;
  const pricesReadable = chosen.every((id) => readCustomPrice(customTyped[id] ?? "").ok);
  const summary =
    country === "" || services.length === 0 || !pricesReadable || (paid && (listCents === null || advance === null || !advance.ok))
      ? null
      : summariseLink({
          services: chosen,
          interval,
          currency,
          websiteKind,
          build: paid && listCents !== null && discount.ok ? { listCents, discountCents: discount.cents, advanceCents: advance !== null && advance.ok ? advance.amounts.advanceCents : 0 } : null,
          customPrices,
          coupon: coupon === null ? null : { discount: coupon.discount, discountMonths: coupon.discountMonths },
          provider,
        });
  const couponOptions: readonly SelectOption[] = [{ value: "", label: "No coupon" }, ...couponsHere.map((choice) => ({ value: choice.id, label: `${choice.code}: ${describeReferralDiscount(choice.discount, choice.currency)}, ${describeDiscountMonths(choice.discountMonths)}` }))];
  const stateOptions: readonly SelectOption[] = [{ value: "", label: "Not known yet" }, ...INDIA_STATES.map((entry) => ({ value: entry.code, label: entry.name }))];
  const inIndia = country === HOME_COUNTRY;

  return (
    <form ref={formRef} action={formAction} noValidate className="max-w-2xl space-y-8">
      {errorMessage === null ? null : (
        <p ref={errorRef} id={ERROR_ID} role="alert" tabIndex={-1} className="border-l-2 border-error py-1 pl-4 text-sm text-error outline-none">
          {errorMessage}
        </p>
      )}

      {editing === undefined ? (
        <Block title="Country" hint="India is billed in rupees, any other country in dollars. This overrides where the customer is.">
          <Field id="link-country" label="Customer's country" required>
            <SelectField key={valueOf("countryCode")} id="link-country" name="countryCode" required options={countries} value={country} onChange={setCountry} className={fieldClasses} {...status("countryCode")} />
          </Field>
        </Block>
      ) : (
        <input type="hidden" name="countryCode" value={country} />
      )}

      <Block title="What they buy">
        <div>
          <span className="block text-sm font-medium text-ink">Services</span>
          <div className="mt-2 grid gap-2" role="group" aria-label="Services">
            {LINK_SERVICE_IDS.map((id) => (
              <label key={id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="service"
                  value={id}
                  checked={services.includes(id)}
                  onChange={(event) => setServices((held) => (event.target.checked ? [...held, id] : held.filter((other) => other !== id)))}
                  className={checkboxClasses}
                  {...(errorField === "service" ? { "aria-invalid": true } : {})}
                />
                {addOnById(id).title}
              </label>
            ))}
          </div>
        </div>
        {hasWebsite ? (
          <div>
            <span className="block text-sm font-medium text-ink">Kind of website</span>
            <Choice name="websiteKind" label="Kind of website" options={WEBSITE_KINDS.map((value) => ({ value, label: WEBSITE_KIND_LABELS[value] }))} value={kind} onChange={setKind} invalid={errorField === "websiteKind"} />
          </div>
        ) : null}
        <div>
          <span className="block text-sm font-medium text-ink">Billed</span>
          <Choice name="billingInterval" label="Billed" options={INTERVALS} value={interval} onChange={setInterval} />
        </div>
        {editing !== undefined ? (
          <input type="hidden" name="dealType" value="paid" />
        ) : hasWebsite ? (
          <div>
            <span className="block text-sm font-medium text-ink">Website deal</span>
            <Choice name="dealType" label="Website deal" options={DEAL_TYPES} value={dealType} onChange={setDealType} invalid={errorField === "dealType"} />
          </div>
        ) : (
          <input type="hidden" name="dealType" value="free" />
        )}
      </Block>

      {paid ? (
        <Block title="Build price">
          <Field id="link-build-price" label="Finalised build price" hint={`List price ${formatMoney(catalogueCents, currency)}. Type the price agreed with the customer.`} required>
            <RuleInput rule="amount" id="link-build-price" name="buildPrice" required pattern={FIELD_PATTERNS.amount} autoComplete="off" value={buildPriceText} onChange={(event) => setTypedBuildPrice(event.target.value)} className={fieldClasses} {...status("buildPrice")} />
          </Field>
        </Block>
      ) : null}

      {paid ? (
        <Block title="Build fee discount" hint="Takes from nothing to the whole build fee off. The monthly price is only discounted by a coupon.">
          <div>
            <span className="block text-sm font-medium text-ink">Discount as</span>
            <Choice name="discountKind" label="Discount as" options={DISCOUNT_KINDS} value={discountKind} onChange={setDiscountKind} />
          </div>
          {discountKind === "none" ? null : (
            <div className="grid gap-6 sm:grid-cols-2">
              <Field
                id="link-discount"
                label={discountKind === "percent" ? "Percentage off the build fee" : discountKind === "final" ? "Final price of the build" : "Amount off the build fee"}
                hint={discountKind === "percent" ? "Up to 100." : `Out of ${formatMoney(listCents ?? 0, currency)}.`}
                required
              >
                <RuleInput rule="amount" id="link-discount" name="discountValue" required pattern={FIELD_PATTERNS.amount} autoComplete="off" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} className={fieldClasses} {...status("discountValue")} />
              </Field>
              <Field id="link-note" label="Note for the customer and the invoice" hint={`Plain English, up to ${NOTE_MAX_LENGTH} characters. Required with a discount.`} required>
                <input id="link-note" name="setupFeeNote" required maxLength={NOTE_MAX_LENGTH} autoComplete="off" defaultValue={valueOf("setupFeeNote")} className={fieldClasses} {...status("setupFeeNote")} />
              </Field>
            </div>
          )}
          {discount.ok ? null : (
            <p role="status" className="text-sm text-error">
              {discount.reason === "too-much" ? "That is more than the build fee." : "Type the discount as a number."}
            </p>
          )}
        </Block>
      ) : null}

      {paid && editing !== undefined ? (
        <Block title="Advance" hint="Already paid by the customer. It cannot change; the balance is the net build price less this.">
          <p className="font-figure text-sm tabular-nums text-ink">{formatMoney(editing.advanceCents, currency)} paid</p>
          <input type="hidden" name="advanceKind" value="amount" />
          <input type="hidden" name="advanceValue" value={advanceValue} />
          {advance === null || advance.ok ? null : (
            <p role="status" className="text-sm text-error">
              The build price after the discount is less than the advance already paid. The balance cannot be negative.
            </p>
          )}
        </Block>
      ) : paid ? (
        <Block title="Advance">
          <div>
            <span className="block text-sm font-medium text-ink">Advance as</span>
            <Choice name="advanceKind" label="Advance as" options={ADVANCE_KINDS} value={advanceKind} onChange={setAdvanceKind} invalid={errorField === "advanceKind"} />
          </div>
          <Field
            id="link-advance"
            label={advanceKind === "percent" ? "Percentage of the net build price" : "Advance amount"}
            hint={advanceKind === "percent" ? "Rounded down to a whole rupee or dollar." : advance !== null && advance.ok ? `Out of ${formatMoney(advance.amounts.netCents, currency)}.` : undefined}
            required
          >
            <RuleInput rule="amount" id="link-advance" name="advanceValue" required pattern={FIELD_PATTERNS.amount} autoComplete="off" value={advanceValue} onChange={(event) => setAdvanceValue(event.target.value)} className={fieldClasses} {...status("advanceValue")} />
          </Field>
          {advance === null || advance.ok ? null : (
            <p role="status" className="text-sm text-error">
              {advance.reason === "out-of-range" ? "The advance is from 1 to the net build price." : "Type the advance as a number."}
            </p>
          )}
        </Block>
      ) : null}

      {chosen.length === 0 ? null : (
        <Block title="Custom prices" hint={`Leave a price blank to use the list price. Typed for each ${interval === "year" ? "year" : "month"}, GST included. A link takes custom prices or a coupon, not both.`}>
          <div className="grid gap-6 sm:grid-cols-2">
            {chosen.map((id) => (
              <Field key={id} id={`link-price-${id}`} label={`${addOnById(id).title} price ${perCycle(interval)}`} hint={`List price ${formatMoney(cyclePriceCents(addOnById(id), currency, interval, kind), currency)}.`}>
                <RuleInput
                  rule="digits"
                  id={`link-price-${id}`}
                  name={CUSTOM_PRICE_FIELDS[id]}
                  autoComplete="off"
                  value={customTyped[id] ?? ""}
                  onChange={(event) => setCustomTyped((held) => ({ ...held, [id]: event.target.value }))}
                  className={fieldClasses}
                  {...status(CUSTOM_PRICE_FIELDS[id])}
                />
              </Field>
            ))}
          </div>
        </Block>
      )}

      <Block title="Coupon" hint="Takes money off the monthly price once the customer is paying monthly. Only live coupons in this currency are listed.">
        <Field id="link-coupon" label="Coupon">
          <SelectField id="link-coupon" name="couponId" options={couponOptions} value={coupon === null ? "" : coupon.id} onChange={setCouponId} className={fieldClasses} {...status("couponId")} />
        </Field>
      </Block>

      {editing !== undefined ? null : (
        <Block title="Customer details" hint="Optional. The customer sees these filled in and can correct them.">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="link-business" label="Business name">
              <input id="link-business" name="businessName" autoComplete="off" defaultValue={valueOf("businessName")} className={fieldClasses} {...status("businessName")} />
            </Field>
            <Field id="link-contact" label="Contact name">
              <input id="link-contact" name="contactName" autoComplete="off" defaultValue={valueOf("contactName")} className={fieldClasses} {...status("contactName")} />
            </Field>
            <Field id="link-email" label="Email">
              <input id="link-email" name="email" type="email" autoComplete="off" defaultValue={valueOf("email")} className={fieldClasses} {...status("email")} />
            </Field>
            <Field id="link-phone" label="Phone" hint="With the country code, like +91 98765 43210, or just the number for the country above.">
              <RuleInput rule="phone" type="tel" id="link-phone" name="phone" autoComplete="off" defaultValue={valueOf("phone")} className={fieldClasses} {...status("phone")} />
            </Field>
          </div>
          {inIndia ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="link-state" label="State">
                <SelectField key={valueOf("stateCode")} id="link-state" name="stateCode" options={stateOptions} defaultValue={valueOf("stateCode")} className={fieldClasses} {...status("stateCode")} />
              </Field>
              <Field id="link-gstin" label="GSTIN" hint="Fixes the state.">
                <RuleInput rule="code" id="link-gstin" name="gstin" maxLength={15} pattern={FIELD_PATTERNS.gstin} autoComplete="off" defaultValue={valueOf("gstin")} className={fieldClasses} {...status("gstin")} />
              </Field>
              <Field id="link-legal" label="Name on the GST registration" hint="Needed with a GSTIN.">
                <input id="link-legal" name="legalName" autoComplete="off" defaultValue={valueOf("legalName")} className={fieldClasses} {...status("legalName")} />
              </Field>
            </div>
          ) : null}
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="link-address1" label="Address">
              <input id="link-address1" name="addressLine1" autoComplete="off" defaultValue={valueOf("addressLine1")} className={fieldClasses} {...status("addressLine1")} />
            </Field>
            <Field id="link-address2" label="Address line 2">
              <input id="link-address2" name="addressLine2" autoComplete="off" defaultValue={valueOf("addressLine2")} className={fieldClasses} {...status("addressLine2")} />
            </Field>
            <Field id="link-city" label="City">
              <input id="link-city" name="city" autoComplete="off" defaultValue={valueOf("city")} className={fieldClasses} {...status("city")} />
            </Field>
            <Field id="link-postal" label={inIndia ? "Pincode" : "Postal code"}>
              <RuleInput rule={inIndia ? "digits" : "code"} id="link-postal" name="postalCode" maxLength={inIndia ? 6 : 20} autoComplete="off" defaultValue={valueOf("postalCode")} className={fieldClasses} {...status("postalCode")} />
            </Field>
          </div>
        </Block>
      )}

      {summary === null ? null : <PaysSummary summary={summary} currency={currency} kind={websiteKind} interval={interval} />}

      <GatedSubmitButton className={buttonPrimary} pendingLabel={editing === undefined ? "Creating…" : "Saving…"}>
        {editing === undefined ? "Create payment link" : "Save deal"}
      </GatedSubmitButton>
      <p className="text-sm leading-relaxed text-ink-2">
        {editing === undefined
          ? "The link works for one payment and for 7 days. You copy it and send it yourself. The deal cannot be changed once the link exists: cancel it and make another."
          : "The advance stays as paid. The customer is asked for the new balance once you mark the website ready."}
      </p>
    </form>
  );
}

/** The made link: its address, once. Only a hash is stored, so a lost address means cancelling and making a new link. */
function CreatedLink({ address, customer, expiresAt }: { readonly address: string; readonly customer: string; readonly expiresAt: string }): ReactElement {
  return (
    <div className="max-w-2xl space-y-5">
      <p role="status" className="border-l-2 border-sage py-1 pl-4 text-sm leading-relaxed text-ink">
        Payment link made for {customer}. Copy it now: it is shown only once.
      </p>
      <div className="flex items-center gap-2">
        <output className={cn(readOnlyValueClasses, "min-w-0 flex-1 select-all break-all font-figure text-sm")}>{address}</output>
        <CopyTokenButton value={address} what="payment link" />
      </div>
      <p className="text-sm leading-relaxed text-ink-2">
        It works for one payment until <time dateTime={expiresAt}>{new Date(expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}</time>. If you lose it, cancel it in Payment links and make a new one.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/payment-links" className={buttonSecondary}>
          Payment links
        </Link>
      </div>
    </div>
  );
}
