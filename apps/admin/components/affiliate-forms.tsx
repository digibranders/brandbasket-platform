"use client";

import { useActionState, useEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import type { BillingCurrency, ReferralValueKind } from "@fynix/db";
import { cn } from "@fynix/shared/lib/cn";
import { FIELD_PATTERNS } from "@fynix/shared/lib/forms/input-rules";
import {
  BILLING_CURRENCY_LABELS,
  BILLING_CURRENCY_ORDER,
  BILLING_CURRENCY_SYMBOLS,
} from "@fynix/shared/lib/currency";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@fynix/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@fynix/shared/ui/select-field";
import type { AffiliateField } from "@/lib/server/affiliate-admin";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";

/** What an affiliate form's action hands back. A successful create redirects, so only errors and "done" are seen. */
export type AffiliateFormState =
  | { readonly status: "idle" }
  | { readonly status: "done"; readonly message: string }
  | {
      readonly status: "error";
      readonly message: string;
      readonly field: AffiliateField | null;
      readonly values: Readonly<Record<string, string>>;
    };

export const initialAffiliateFormState: AffiliateFormState = { status: "idle" };

type AffiliateAction = (state: AffiliateFormState, formData: FormData) => Promise<AffiliateFormState>;

const ERROR_ID = "affiliate-form-error";

/** The most paid months a reward can run for; the server refuses more. */
const MAX_REWARD_CYCLES = 120;
/** A whole number from 1 to MAX_REWARD_CYCLES. */
const REWARD_CYCLES_PATTERN = "[1-9]|[1-9][0-9]|1[01][0-9]|120";

const CURRENCY_OPTIONS: readonly SelectOption[] = BILLING_CURRENCY_ORDER.map((option) => ({ value: option, label: option }));

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

function FormMessage({
  state,
  isPending,
  errorRef,
}: {
  readonly state: AffiliateFormState;
  readonly isPending: boolean;
  readonly errorRef: RefObject<HTMLParagraphElement | null>;
}): ReactElement | null {
  if (isPending || state.status === "idle") return null;
  if (state.status === "done") {
    return (
      <p role="status" className="border-l-2 border-gold-deep py-1 pl-4 text-sm text-ink">
        {state.message}
      </p>
    );
  }
  return (
    <p
      ref={errorRef}
      id={ERROR_ID}
      role="alert"
      tabIndex={-1}
      className="border-l-2 border-accent py-1 pl-4 text-sm text-accent outline-none"
    >
      {state.message}
    </p>
  );
}

/** Values echoed back on error, the failing field focused and marked. */
function useAffiliateForm(action: AffiliateAction) {
  const [state, formAction, isPending] = useActionState(action, initialAffiliateFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else errorRef.current?.focus();
  }, [state]);

  const errorField = state.status === "error" && !isPending ? state.field : null;
  return {
    state,
    formRef,
    errorRef,
    formAction,
    isPending,
    valueOf: (name: string, stored: string): string =>
      state.status === "error" ? (state.values[name] ?? stored) : stored,
    fieldStatus: (field: AffiliateField): Record<string, unknown> =>
      errorField === field ? { "aria-invalid": true, "aria-describedby": ERROR_ID } : {},
  };
}

/** An affiliate's details as the form starts from them: blank for a new one, the stored ones for an edit. */
export interface AffiliateFormValues {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly rewardKind: ReferralValueKind;
  /** "200" for ₹200, "12.5" for 12.5%, "" for nothing. */
  readonly rewardValue: string;
  readonly rewardCurrency: BillingCurrency;
  /** "12" for each member's first 12 paid months, "" for every month. */
  readonly rewardCycles: string;
  readonly notes: string;
  readonly active: boolean;
}

export const BLANK_AFFILIATE: AffiliateFormValues = {
  name: "",
  email: "",
  phone: "",
  rewardKind: "amount",
  rewardValue: "",
  rewardCurrency: "INR",
  rewardCycles: "",
  notes: "",
  active: true,
};

/**
 * Creating or editing an affiliate. `editing` adds the Active switch and says Save rather than Create. Every rule is
 * enforced again in affiliate-admin, on the server.
 */
export function AffiliateForm({
  action,
  initial,
  editing,
}: {
  readonly action: AffiliateAction;
  readonly initial: AffiliateFormValues;
  readonly editing: boolean;
}): ReactElement {
  const { state, formRef, errorRef, formAction, isPending, valueOf, fieldStatus } = useAffiliateForm(action);
  const echoedKind: ReferralValueKind = valueOf("rewardKind", initial.rewardKind) === "percent" ? "percent" : "amount";
  const [rewardKind, setRewardKind] = useState<ReferralValueKind>(echoedKind);
  const echoedCurrency = (valueOf("rewardCurrency", initial.rewardCurrency) || "INR") as BillingCurrency;
  const [currency, setCurrency] = useState<BillingCurrency>(echoedCurrency);
  const percent = rewardKind === "percent";
  // They need a phone or an email, at least one: each is required while the other is blank.
  const [phoneTyped, setPhoneTyped] = useState(valueOf("phone", initial.phone));
  const [emailTyped, setEmailTyped] = useState(valueOf("email", initial.email));
  const phoneRequired = emailTyped.trim() === "";
  const emailRequired = phoneTyped.trim() === "";

  return (
    <form ref={formRef} action={formAction} noValidate className="max-w-2xl space-y-6">
      <FormMessage state={state} isPending={isPending} errorRef={errorRef} />

      <Field id="affiliate-name" label="Name" required>
        <RuleInput
          rule="personName"
          id="affiliate-name"
          name="name"
          required
          autoComplete="off"
          maxLength={120}
          defaultValue={valueOf("name", initial.name)}
          className={fieldClasses}
          {...fieldStatus("name")}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="affiliate-phone" label="Phone" hint="Phone or email, at least one." required={phoneRequired}>
          <RuleInput
            rule="phone"
            id="affiliate-phone"
            name="phone"
            type="tel"
            required={phoneRequired}
            maxLength={25}
            autoComplete="off"
            placeholder="+91 98765 43210"
            defaultValue={valueOf("phone", initial.phone)}
            onChange={(event) => setPhoneTyped(event.target.value)}
            className={fieldClasses}
            {...fieldStatus("phone")}
          />
        </Field>
        <Field id="affiliate-email" label="Email" hint="Needed for their own sign-in. Phone or email, at least one." required={emailRequired}>
          <input
            id="affiliate-email"
            name="email"
            type="email"
            required={emailRequired}
            maxLength={254}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            defaultValue={valueOf("email", initial.email)}
            onChange={(event) => setEmailTyped(event.target.value)}
            className={fieldClasses}
            {...fieldStatus("email")}
          />
        </Field>
      </div>

      <Field
        id="affiliate-reward"
        label="Earns, per paid month"
        required={percent}
        hint={
          <>
            <span className="mb-2 mt-2 flex w-fit rounded-full bg-card p-1 ring-1 ring-inset ring-line" role="radiogroup" aria-label="Earns as" key={echoedKind}>
              {(["amount", "percent"] as const).map((option) => (
                <label
                  key={option}
                  className={cn(
                    "cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300 ease-calm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                    rewardKind === option ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="rewardKind"
                    value={option}
                    defaultChecked={echoedKind === option}
                    onChange={() => setRewardKind(option)}
                    className="sr-only"
                    {...fieldStatus("rewardKind")}
                  />
                  {option === "amount" ? "Amount" : "Percentage"}
                </label>
              ))}
            </span>
            <span className="block">
              {percent ? "Of what the member pays before GST, after their discount." : "A fixed amount for each month a member pays."}
            </span>
          </>
        }
      >
        <div className="flex gap-3">
          {percent ? null : (
            // fieldClasses is full width, so the select's own width comes from this wrapper.
            <div className="w-28 shrink-0">
              <SelectField
                key={echoedCurrency}
                id="affiliate-reward-currency"
                name="rewardCurrency"
                aria-label="Paid in"
                options={CURRENCY_OPTIONS}
                defaultValue={echoedCurrency}
                onChange={(value) => setCurrency(value as BillingCurrency)}
                className={fieldClasses}
                {...fieldStatus("rewardCurrency")}
              />
            </div>
          )}
          <div className="relative min-w-0 flex-1">
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
              id="affiliate-reward"
              name="rewardValue"
              required={percent}
              pattern={FIELD_PATTERNS.amount}
              title={percent ? "A percentage like 10 or 12.5" : "An amount like 200 or 12.50"}
              autoComplete="off"
              placeholder={percent ? "10" : "200"}
              defaultValue={valueOf("rewardValue", initial.rewardValue)}
              aria-label={percent ? "Earns, percentage" : `Earns, amount in ${BILLING_CURRENCY_LABELS[currency]}`}
              className={cn(fieldClasses, percent ? "pr-10" : "pl-9")}
              {...fieldStatus("rewardValue")}
            />
          </div>
        </div>
      </Field>

      <Field
        id="affiliate-cycles"
        label="For how many paid months"
        hint="Per member. Blank is every month they pay. The member keeps their discount either way."
      >
        <div className="relative max-w-[14rem]">
          <RuleInput
            rule="digits"
            id="affiliate-cycles"
            name="rewardCycles"
            pattern={REWARD_CYCLES_PATTERN}
            title={`A whole number from 1 to ${String(MAX_REWARD_CYCLES)}, or blank for every month`}
            maxLength={String(MAX_REWARD_CYCLES).length}
            autoComplete="off"
            placeholder="Every month"
            defaultValue={valueOf("rewardCycles", initial.rewardCycles)}
            className={cn(fieldClasses, "pr-20")}
            {...fieldStatus("rewardCycles")}
          />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-0 right-4 top-2 flex items-center text-sm text-ink-soft">
            months
          </span>
        </div>
      </Field>

      <Field id="affiliate-notes" label="Notes" hint="Optional. Never bank details.">
        <textarea
          id="affiliate-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={valueOf("notes", initial.notes)}
          className={fieldClasses}
          {...fieldStatus("notes")}
        />
      </Field>

      {editing ? (
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" name="active" defaultChecked={initial.active} className={checkboxClasses} />
          Active: their codes work for new members
        </label>
      ) : null}

      <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving…">
        {editing ? "Save" : "Create affiliate"}
      </GatedSubmitButton>
    </form>
  );
}

/**
 * Recording the transfer that paid everything owed in one currency. It carries the earning ids it was drawn with, so
 * the server can refuse it if anything changed meanwhile.
 */
export function PayoutForm({
  action,
  currency,
  amount,
  earningIds,
  today,
}: {
  readonly action: AffiliateAction;
  readonly currency: BillingCurrency;
  /** The owed total, formatted, as it was when the page was drawn. */
  readonly amount: string;
  readonly earningIds: readonly string[];
  /** `YYYY-MM-DD`. */
  readonly today: string;
}): ReactElement {
  const { state, formRef, errorRef, formAction, isPending, valueOf, fieldStatus } = useAffiliateForm(action);
  // A reason is needed only when something was actually withheld.
  const [withheld, setWithheld] = useState(valueOf("withheld", ""));
  const withheldSomething = /[1-9]/.test(withheld);
  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4">
      <FormMessage state={state} isPending={isPending} errorRef={errorRef} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="earningIds" value={earningIds.join(",")} />
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field id={`payout-date-${currency}`} label="Paid on" required>
          <input
            id={`payout-date-${currency}`}
            name="paidOn"
            type="date"
            required
            max={today}
            defaultValue={valueOf("paidOn", today)}
            className={fieldClasses}
            {...fieldStatus("paidOn")}
          />
        </Field>
        <Field id={`payout-reference-${currency}`} label="Reference" required>
          <input
            id={`payout-reference-${currency}`}
            name="reference"
            required
            maxLength={100}
            placeholder="UTR or UPI reference"
            defaultValue={valueOf("reference", "")}
            className={fieldClasses}
            {...fieldStatus("reference")}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field id={`payout-withheld-${currency}`} label="Withheld" hint="Optional">
          <RuleInput
            rule="amount"
            id={`payout-withheld-${currency}`}
            name="withheld"
            pattern={FIELD_PATTERNS.amount}
            title="An amount like 200 or 12.50"
            autoComplete="off"
            placeholder="0"
            defaultValue={valueOf("withheld", "")}
            onChange={(event) => setWithheld(event.target.value)}
            className={`${fieldClasses} tabular-nums`}
            {...fieldStatus("withheld")}
          />
        </Field>
        <Field id={`payout-withheld-reason-${currency}`} label="Why" hint="TDS, a bank fee" required={withheldSomething}>
          <input
            id={`payout-withheld-reason-${currency}`}
            name="withheldReason"
            required={withheldSomething}
            maxLength={200}
            defaultValue={valueOf("withheldReason", "")}
            className={fieldClasses}
            {...fieldStatus("withheldReason")}
          />
        </Field>
      </div>
      <GatedSubmitButton className={buttonPrimary} pendingLabel="Recording…">
        Record {amount} paid
      </GatedSubmitButton>
    </form>
  );
}

/** "Cancel" beside an owed earning, for a payment that was refunded. */
export function CancelEarningButton({ action }: { readonly action: AffiliateAction }): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialAffiliateFormState);
  return (
    <form action={formAction} className="inline">
      <button type="submit" disabled={isPending} className={cn(buttonSecondary, "px-3 py-1 text-xs")}>
        {isPending ? "…" : "Cancel"}
      </button>
      {state.status === "error" && !isPending ? (
        <span role="alert" className="ml-2 text-xs text-accent">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
