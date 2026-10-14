"use client";

import { useActionState, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  discountCentsFor,
  isChargeableDiscount,
  MAX_DISCOUNT_BASIS_POINTS,
  MAX_REFERRAL_CODE_LENGTH,
  MIN_REFERRAL_CODE_LENGTH,
} from "@firstfold/billing/referral";
import { chargedAmountCents } from "@firstfold/billing/tax";
import type { BillingCurrency, ReferralDiscount, ReferralValueKind } from "@firstfold/db";
import { parsePercent } from "@firstfold/shared/lib/billing/referral-value";
import { cn } from "@firstfold/shared/lib/cn";
import { formatMoney, parseMoney } from "@firstfold/shared/lib/money";
import {
  BILLING_CURRENCY_LABELS,
  BILLING_CURRENCY_ORDER,
  BILLING_CURRENCY_SYMBOLS,
} from "@firstfold/shared/lib/currency";
import { FIELD_PATTERNS } from "@firstfold/shared/lib/forms/input-rules";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@firstfold/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";
import type { ReferralField } from "@/lib/server/referral-admin";
import { buttonDanger, buttonPrimary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";

/** What a code form's action hands back. A successful create redirects, so only errors are ever seen. */
export type ReferralFormState =
  | { readonly status: "idle" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly field: ReferralField | null;
      readonly values: Readonly<Record<string, string>>;
    };

export const initialReferralFormState: ReferralFormState = { status: "idle" };

type ReferralAction = (state: ReferralFormState, formData: FormData) => Promise<ReferralFormState>;

const ERROR_ID = "referral-form-error";

/**
 * A code as the server reads it: letters, digits and hyphens, starting with a letter or digit. It is not filtered as it
 * is typed (the `code` rule would drop hyphens), and the server stores it in capitals, so lowercase is accepted too.
 */
const CODE_PATTERN = `[A-Za-z0-9][A-Za-z0-9\\-]{${String(MIN_REFERRAL_CODE_LENGTH - 1)},${String(MAX_REFERRAL_CODE_LENGTH - 1)}}`;

/**
 * One labelled field. The hint sits in a fixed slot between the label and the input rather than being dropped
 * when absent, so fields side by side in a grid keep their inputs on the same line.
 */
function Field({
  id,
  label,
  hint,
  required = false,
  children,
}: {
  readonly id: string;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly required?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className={labelClasses}>
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {hint === undefined ? null : <p className={hintClasses}>{hint}</p>}
      <div className="mt-auto">{children}</div>
    </div>
  );
}

/** Today's price for one currency: what a discount is measured against. Null when there is no active plan. */
export interface PriceBasis {
  readonly netAmountCents: number;
  readonly taxRateBasisPoints: number;
}

/** What the discount control can choose. "none" exists only on an affiliate's code. */
type DiscountChoice = ReferralValueKind | "none";

function choiceOf(raw: string, allowNone: boolean): DiscountChoice {
  if (raw === "percent") return "percent";
  if (raw === "none" && allowNone) return "none";
  return "amount";
}

/**
 * A discount typed so far, or null until it reads as one. Mirrors the server's rules (readDiscount in
 * referral-admin), which are the ones that count; this only decides whether the summary has enough to go on.
 */
function typedDiscount(kind: ReferralValueKind, typed: string): ReferralDiscount | null {
  if (kind === "amount") {
    const amountCents = parseMoney(typed);
    return amountCents === null ? null : { kind, amountCents };
  }
  const basisPoints = parsePercent(typed);
  return basisPoints === null || basisPoints < 1 || basisPoints > MAX_DISCOUNT_BASIS_POINTS ? null : { kind, basisPoints };
}

/** The live summary under the discount: what the plan costs and what the member pays with the code. */
interface ReferralPreview {
  readonly planCharge: string;
  readonly memberPays: string;
  readonly discounted: boolean;
  readonly taxed: boolean;
}

/**
 * What the code typed so far means against today's plan, or null until there is enough to say. Worked out with the
 * same functions checkout and the webhook use (discountCentsFor, chargedAmountCents), so it can never disagree with
 * what is charged.
 */
function previewFor(
  currency: BillingCurrency,
  choice: DiscountChoice,
  discount: ReferralDiscount | null,
  basis: PriceBasis | null,
): ReferralPreview | null {
  if (basis === null) return null;
  const net = basis.netAmountCents;
  const tax = basis.taxRateBasisPoints;
  const money = (cents: number): string => formatMoney(cents, currency);
  const planCharge = money(chargedAmountCents(net, 0, tax));
  if (choice === "none") return { planCharge, memberPays: planCharge, discounted: false, taxed: tax !== 0 };
  if (discount === null) return null;
  const discountCents = discountCentsFor(discount, net);
  if (!isChargeableDiscount(net, discountCents)) return null;
  return { planCharge, memberPays: money(chargedAmountCents(net, discountCents, tax)), discounted: true, taxed: tax !== 0 };
}

/** One calm line: the money the code means today. */
function ReferralSummary({ preview }: { readonly preview: ReferralPreview }): ReactElement {
  const gst = preview.taxed ? " with GST" : "";
  return (
    <p role="status" className="mt-4 border-l-2 border-gold-deep py-1 pl-4 text-sm leading-relaxed text-ink">
      {preview.discounted ? (
        <>
          The member pays <strong>{preview.memberPays}</strong> a month{gst}, down from {preview.planCharge}.
        </>
      ) : (
        <>
          The member pays the full <strong>{preview.planCharge}</strong> a month{gst}.
        </>
      )}
    </p>
  );
}

const CHOICE_LABELS: Readonly<Record<DiscountChoice, string>> = {
  amount: "Amount",
  percent: "Percentage",
  none: "No discount",
};

/**
 * The discount: "Amount" / "Percentage" (and, on an affiliate's code, "No discount") beside one value input. The input
 * carries the currency symbol in front for an amount and a "%" after it for a percentage, so what is typed can only
 * be read one way; with no discount there is nothing to type.
 *
 * The radios are keyed by the echoed choice for the same reason the currency select is: React resets the form after
 * the action, and a reset returns an uncontrolled input to what it was when it mounted.
 */
function DiscountField({
  choices,
  choice,
  echoedChoice,
  onChoiceChange,
  value,
  onValueChange,
  currency,
  fieldStatus,
}: {
  readonly choices: readonly DiscountChoice[];
  readonly choice: DiscountChoice;
  readonly echoedChoice: DiscountChoice;
  readonly onChoiceChange: (choice: DiscountChoice) => void;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly currency: BillingCurrency;
  readonly fieldStatus: (field: ReferralField) => Record<string, unknown>;
}): ReactElement {
  const percent = choice === "percent";
  return (
    <Field
      id="referral-discount"
      label="Discount"
      required={choice !== "none"}
      hint={
        <>
          <span
            className="mb-2 mt-2 flex w-fit rounded-full bg-card p-1 ring-1 ring-inset ring-line"
            role="radiogroup"
            aria-label="Discount as"
            key={echoedChoice}
          >
            {choices.map((option) => (
              <label
                key={option}
                className={cn(
                  "cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300 ease-calm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                  choice === option ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
                )}
              >
                <input
                  type="radio"
                  name="discountKind"
                  value={option}
                  defaultChecked={echoedChoice === option}
                  onChange={() => onChoiceChange(option)}
                  className="sr-only"
                  {...fieldStatus("discountKind")}
                />
                {CHOICE_LABELS[option]}
              </label>
            ))}
          </span>
          <span className="block">
            {choice === "none"
              ? "The member pays the full price. The code only records who brought them."
              : percent
                ? "A share of the plan’s price before GST, off every month for as long as the plan runs. Up to 99%."
                : "How much comes off every month, before GST, for as long as the plan runs. Less than the plan’s own price."}
          </span>
        </>
      }
    >
      {choice === "none" ? null : (
        // fieldClasses brings its own top margin, so the symbol starts below it to stay centred on the input.
        <div className="relative">
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute bottom-0 top-2 flex items-center text-base text-ink-soft",
              percent ? "right-4" : "left-4",
            )}
          >
            {percent ? "%" : BILLING_CURRENCY_SYMBOLS[currency]}
          </span>
          <RuleInput
            rule="amount"
            id="referral-discount"
            name="discountValue"
            required
            pattern={FIELD_PATTERNS.amount}
            title={percent ? "A percentage like 10 or 12.5" : "An amount like 500 or 12.50"}
            autoComplete="off"
            placeholder={percent ? "10" : "500"}
            defaultValue={value}
            onChange={(event) => onValueChange(event.target.value)}
            aria-label={`Discount, ${percent ? "percentage" : `amount in ${currency}`}`}
            className={cn(fieldClasses, percent ? "pr-10" : "pl-9")}
            {...fieldStatus("discountValue")}
          />
        </div>
      )}
    </Field>
  );
}

/** The affiliate a new code is for, when it is not a coupon. */
export interface CodeAffiliate {
  readonly name: string;
  /** The one currency their codes may be in, when they earn a fixed amount; null when any will do. */
  readonly currency: BillingCurrency | null;
}

/**
 * Creating a coupon, or a code for an affiliate. Every rule it hints at is enforced again in createReferralCodeFor:
 * this form is a courtesy, not a control.
 */
export function NewReferralCodeForm({
  action,
  priceBases,
  affiliate,
}: {
  readonly action: ReferralAction;
  /** Today's active plan per currency, so the form can say what the member will pay. */
  readonly priceBases: Readonly<Record<BillingCurrency, PriceBasis | null>>;
  /** Null for a coupon. */
  readonly affiliate: CodeAffiliate | null;
}): ReactElement {
  const { formRef, errorRef, formAction, errorMessage, valueOf, fieldStatus } = useReferralForm(action);
  const currencies = affiliate?.currency == null ? BILLING_CURRENCY_ORDER : [affiliate.currency];
  const currencyOptions: readonly SelectOption[] = currencies.map((option) => ({ value: option, label: BILLING_CURRENCY_LABELS[option] }));
  // Tracked only to show the price live; the inputs themselves stay uncontrolled so a refused save echoes back
  // exactly what was typed. `currency` already holds the submitted choice, which is what a refused save echoes.
  // Rupees unless the affiliate is paid in something else: nearly every member is in India.
  const echoedCurrency = (valueOf("currency") || affiliate?.currency || "INR") as BillingCurrency;
  const [currency, setCurrency] = useState<BillingCurrency>(echoedCurrency);
  const choices: readonly DiscountChoice[] = affiliate === null ? ["amount", "percent"] : ["amount", "percent", "none"];
  const echoedChoice = choiceOf(valueOf("discountKind"), affiliate !== null);
  const [choice, setChoice] = useState<DiscountChoice>(echoedChoice);
  const [discountTyped, setDiscountTyped] = useState(valueOf("discountValue"));
  const preview = previewFor(
    currency,
    choice,
    choice === "none" ? null : typedDiscount(choice, discountTyped),
    priceBases[currency],
  );
  const noun = affiliate === null ? "coupon" : "code";

  return (
    <form ref={formRef} action={formAction} noValidate className="max-w-2xl space-y-6">
      <FormError message={errorMessage} errorRef={errorRef} />

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="referral-code" label="Code" hint="What the member types. Stored in capitals." required>
          <input
            id="referral-code"
            name="code"
            required
            pattern={CODE_PATTERN}
            title="3 to 24 letters, numbers or hyphens, starting with a letter or number"
            minLength={MIN_REFERRAL_CODE_LENGTH}
            maxLength={MAX_REFERRAL_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder={affiliate === null ? "LAUNCH500" : "PRIYA"}
            defaultValue={valueOf("code")}
            className={`${fieldClasses} uppercase`}
            {...fieldStatus("code")}
          />
        </Field>

        <Field
          id="referral-currency"
          label="Currency"
          required
          hint={affiliate?.currency == null ? "A code works in one currency only." : `${affiliate.name} is paid in ${affiliate.currency}.`}
        >
          {/* Keyed by the echoed currency so a refused save remounts it on that value. React resets the form after
              the action, and a reset returns an uncontrolled dropdown to the value it first mounted with: without
              the remount, choosing USD and failing validation silently switched the code back to INR. */}
          <SelectField
            key={echoedCurrency}
            id="referral-currency"
            name="currency"
            required
            options={currencyOptions}
            defaultValue={echoedCurrency}
            onChange={(value) => setCurrency(value as BillingCurrency)}
            className={fieldClasses}
            {...fieldStatus("currency")}
          />
        </Field>
      </div>

      <div>
        <DiscountField
          choices={choices}
          choice={choice}
          echoedChoice={echoedChoice}
          onChoiceChange={setChoice}
          value={valueOf("discountValue")}
          onValueChange={setDiscountTyped}
          currency={currency}
          fieldStatus={fieldStatus}
        />
        {preview === null ? null : <ReferralSummary preview={preview} />}
      </div>

      <RetirementFields
        expiresAt={valueOf("expiresAt")}
        maxRedemptions={valueOf("maxRedemptions")}
        fieldStatus={fieldStatus}
      />

      <GatedSubmitButton className={buttonPrimary} pendingLabel="Creating…">
        Create {noun}
      </GatedSubmitButton>

      <p className="text-sm leading-relaxed text-ink-soft">
        The discount and the currency are fixed once the {noun} exists. If one is wrong, turn it off and make another.
      </p>
    </form>
  );
}

/**
 * Editing an existing code: whether, until when and how often it may be used. The discount and the currency are
 * absent by design: members already paying carry a frozen copy of the discount, on a Razorpay plan priced for it.
 */
export function RetireReferralCodeForm({
  action,
  active,
  expiresOn,
  maxRedemptions,
}: {
  readonly action: ReferralAction;
  readonly active: boolean;
  /** `YYYY-MM-DD`, or "" when the code never expires. */
  readonly expiresOn: string;
  readonly maxRedemptions: string;
}): ReactElement {
  const { formRef, errorRef, formAction, errorMessage, valueOf, fieldStatus } = useReferralForm(action);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-6">
      <FormError message={errorMessage} errorRef={errorRef} />

      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="active" defaultChecked={active} className={checkboxClasses} />
        Active: members may still apply this code
      </label>

      <RetirementFields
        expiresAt={valueOf("expiresAt") || expiresOn}
        maxRedemptions={valueOf("maxRedemptions") || maxRedemptions}
        fieldStatus={fieldStatus}
      />

      <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving…">
        Save
      </GatedSubmitButton>
    </form>
  );
}

/**
 * The two fields that retire a code: when it stops working, and how many may ever use it. Both carry a one-line
 * hint, so the two inputs line up across the pair; a hint on only one would push its input half a line lower.
 */
function RetirementFields({
  expiresAt,
  maxRedemptions,
  fieldStatus,
}: {
  readonly expiresAt: string;
  readonly maxRedemptions: string;
  readonly fieldStatus: (field: ReferralField) => Record<string, unknown>;
}): ReactElement {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Field id="referral-expires" label="Expires" hint="Blank never expires.">
        <input
          id="referral-expires"
          name="expiresAt"
          type="date"
          defaultValue={expiresAt}
          className={fieldClasses}
          {...fieldStatus("expiresAt")}
        />
      </Field>

      <Field id="referral-max" label="Redemption limit" hint="Blank means no cap.">
        <RuleInput
          rule="digits"
          id="referral-max"
          name="maxRedemptions"
          pattern="[1-9][0-9]*"
          title="A whole number of 1 or more, or blank for no cap"
          maxLength={9}
          autoComplete="off"
          defaultValue={maxRedemptions}
          className={fieldClasses}
          {...fieldStatus("maxRedemptions")}
        />
      </Field>
    </div>
  );
}

/**
 * Deleting a code for good. Only offered for a code nobody is on; the server refuses it for any other, and
 * refuses it without the tick, so neither rule depends on this form.
 */
export function DeleteReferralCodeForm({
  action,
  code,
  redeemed,
}: {
  readonly action: ReferralAction;
  /** Shown so the confirmation names what is about to go. */
  readonly code: string;
  /** True once any subscription points at the code, paid or mid-checkout. Deleting is not offered then. */
  readonly redeemed: boolean;
}): ReactElement {
  const { formRef, errorRef, formAction, errorMessage } = useReferralForm(action);

  if (redeemed) {
    return (
      <p className="text-sm leading-relaxed text-ink-soft">
        This code cannot be deleted: customers are on it, and it is the only record of where their discount came
        from. Turn it off above to stop anyone new applying it.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4">
      <FormError message={errorMessage} errorRef={errorRef} />
      <p className="text-sm leading-relaxed text-ink-soft">
        Nobody is on <span className="font-semibold tracking-[0.06em] text-ink">{code}</span> yet, so it can be
        removed for good. Anyone who has applied it without paying will simply lose it.
      </p>
      <label className="flex items-start gap-3 text-sm font-medium">
        <input type="checkbox" name="confirm" required className={checkboxClasses} />
        <span>
          Yes, delete this code. This cannot be undone.
          <RequiredMark />
        </span>
      </label>
      <GatedSubmitButton className={buttonDanger} pendingLabel="Deleting…">
        Delete code
      </GatedSubmitButton>
    </form>
  );
}

function FormError({
  message,
  errorRef,
}: {
  readonly message: string | null;
  readonly errorRef: React.RefObject<HTMLParagraphElement | null>;
}): ReactElement | null {
  if (message === null) return null;
  return (
    <p
      ref={errorRef}
      id={ERROR_ID}
      role="alert"
      tabIndex={-1}
      className="border-l-2 border-accent py-1 pl-4 text-sm text-accent outline-none"
    >
      {message}
    </p>
  );
}

/** The shared behaviour of both forms: values echoed back on error, the failing field focused and marked. */
function useReferralForm(action: ReferralAction) {
  const [state, formAction, isPending] = useActionState(action, initialReferralFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else errorRef.current?.focus();
  }, [state]);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const errorField = errorMessage !== null && state.status === "error" ? state.field : null;

  return {
    formRef,
    errorRef,
    formAction,
    isPending,
    errorMessage,
    errorField,
    valueOf: (name: string): string => (state.status === "error" ? (state.values[name] ?? "") : ""),
    fieldStatus: (field: ReferralField): Record<string, unknown> =>
      errorField === field ? { "aria-invalid": true, "aria-describedby": ERROR_ID } : {},
  };
}
