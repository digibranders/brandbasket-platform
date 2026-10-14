"use client";

import { useActionState, useEffect, useRef, type ComponentProps, type ReactElement, type ReactNode } from "react";
import type { BillingDetailsField } from "@firstfold/shared/lib/billing/billing-details-form";
import type { BillingDetailsStart } from "@firstfold/shared/lib/billing/billing-details-start";
import { INDIA_STATES } from "@firstfold/shared/lib/directory/india-states";
import type { PhoneCountryOption } from "@firstfold/shared/lib/phone/fields";
import { FIELD_PATTERNS, type InputRule } from "@firstfold/shared/lib/forms/input-rules";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@firstfold/shared/ui/forms/submit-gate";
import { PhoneField } from "@firstfold/shared/ui/phone-field";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { INITIAL_STAFF_BILLING_DETAILS_STATE, type StaffBillingDetailsState } from "@/lib/billing-details-form-state";

interface BillingDetailsFormProps {
  readonly businessId: string;
  /** What each field starts with: the saved details, or else the business name and its onboarding address. */
  readonly start: BillingDetailsStart;
  /** Every country the phone field offers, built on the server. */
  readonly phoneCountries: readonly PhoneCountryOption[];
  readonly action: (state: StaffBillingDetailsState, formData: FormData) => Promise<StaffBillingDetailsState>;
}

type FieldStatus = { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string };

const ID_PREFIX = "billing-";

const STATE_OPTIONS: readonly SelectOption[] = INDIA_STATES.map((option) => ({ value: option.code, label: option.name }));

interface TextFieldAttributes
  extends Partial<Pick<ComponentProps<"input">, "autoComplete" | "autoCapitalize" | "spellCheck" | "pattern" | "title">> {
  /** Only free-text fields pick a type; a field with a rule is always plain text. */
  readonly type?: "text" | "email";
  readonly maxLength: number;
  readonly hint?: string;
  readonly required?: boolean;
  /** Filters what can be typed; leave out for free text. */
  readonly rule?: InputRule;
}

/**
 * A client's billing details, corrected by staff with the rules the customer's own form uses (the action runs the same
 * parser). One refusal at a time, shown under its field, with everything typed kept.
 */
export function BillingDetailsForm({ businessId, start, phoneCountries, action }: BillingDetailsFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, INITIAL_STAFF_BILLING_DETAILS_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "error") return;
    const target = formRef.current?.elements.namedItem(state.field) ?? null;
    if (target instanceof HTMLElement) target.focus();
  }, [state]);

  const error = state.status === "error" && !isPending ? state : null;
  const saved = state.status === "saved" && !isPending;
  // After a refusal the fields show what was typed; otherwise what is saved (or, with nothing saved, the onboarding data).
  const valueOf = (name: BillingDetailsField): string => (state.status === "error" ? (state.values[name] ?? "") : start[name]);

  function fieldStatus(field: BillingDetailsField): FieldStatus {
    return error?.field === field ? { "aria-invalid": true, "aria-describedby": `${ID_PREFIX}${field}-error` } : {};
  }

  function problemFor(field: BillingDetailsField): ReactElement | null {
    if (error?.field !== field) return null;
    return (
      <p id={`${ID_PREFIX}${field}-error`} role="alert" className="mt-2 border-l-2 border-accent py-1 pl-4 text-sm text-accent">
        {error.message}
      </p>
    );
  }

  function text(field: Exclude<BillingDetailsField, "stateCode" | "phoneCountry" | "phone">, label: ReactNode, attributes: TextFieldAttributes): ReactElement {
    const { hint, rule, required = false, type, ...inputAttributes } = attributes;
    const common = {
      id: `${ID_PREFIX}${field}`,
      name: field,
      defaultValue: valueOf(field),
      required,
      ...inputAttributes,
      className: fieldClasses,
      ...fieldStatus(field),
    };
    return (
      <div>
        <label htmlFor={`${ID_PREFIX}${field}`} className={labelClasses}>
          {label}
          {required ? <RequiredMark /> : null}
        </label>
        {hint === undefined ? null : <p className={hintClasses}>{hint}</p>}
        {rule === undefined ? <input type={type} {...common} /> : <RuleInput rule={rule} {...common} />}
        {problemFor(field)}
      </div>
    );
  }

  const optional = <span className="font-normal text-ink-soft">(optional)</span>;
  const stateValue = valueOf("stateCode");
  const phoneProblem = error?.field === "phone" ? "phone" : error?.field === "phoneCountry" ? "phoneCountry" : null;

  return (
    <form ref={formRef} action={formAction} noValidate className="max-w-xl space-y-6">
      <input type="hidden" name="businessId" value={businessId} />

      {text("legalName", "Legal name", {
        required: true,
        maxLength: 200,
        autoComplete: "off",
        hint: "As it appears on their GST registration, in English letters.",
      })}
      {text("gstin", <>GSTIN {optional}</>, {
        rule: "code",
        pattern: FIELD_PATTERNS.gstin,
        title: "15 characters, like 27AAPFU0939F1ZV",
        maxLength: 15,
        spellCheck: false,
        autoComplete: "off",
        hint: "15 characters. Leave it blank if they are not registered for GST.",
      })}
      {text("addressLine1", "Address line 1", { required: true, maxLength: 200, autoComplete: "off" })}
      {text("addressLine2", <>Address line 2 {optional}</>, { maxLength: 200, autoComplete: "off" })}

      <div className="grid gap-6 sm:grid-cols-2">
        {text("city", "City", { required: true, maxLength: 100, autoComplete: "off" })}
        {text("postalCode", "Pincode", {
          required: true,
          rule: "digits",
          pattern: FIELD_PATTERNS.pincode,
          title: "6 digits, not starting with 0",
          maxLength: 6,
          autoComplete: "off",
        })}
      </div>

      <div>
        <label htmlFor={`${ID_PREFIX}stateCode`} className={labelClasses}>
          State
          <RequiredMark />
        </label>
        {/* Keyed by its value: the dropdown starts from defaultValue only on mount, and React resets the form after an action. */}
        <SelectField
          key={stateValue}
          id={`${ID_PREFIX}stateCode`}
          name="stateCode"
          required
          options={STATE_OPTIONS}
          defaultValue={stateValue}
          placeholder="Choose a state"
          className={fieldClasses}
          {...fieldStatus("stateCode")}
        />
        {problemFor("stateCode")}
      </div>

      {text("email", <>Billing email {optional}</>, {
        type: "email",
        maxLength: 254,
        spellCheck: false,
        autoCapitalize: "none",
        autoComplete: "off",
        hint: "Where invoices and billing questions go. Blank means the account’s own email.",
      })}

      <div>
        <label htmlFor={`${ID_PREFIX}phone`} className={labelClasses}>
          Phone {optional}
        </label>
        <PhoneField
          id={`${ID_PREFIX}phone`}
          countries={phoneCountries}
          country={valueOf("phoneCountry")}
          defaultCountry={start.phoneCountry}
          number={valueOf("phone")}
          size="roomy"
          numberStatus={fieldStatus("phone")}
          countryStatus={fieldStatus("phoneCountry")}
          className="mt-2"
        />
        {phoneProblem === null ? null : problemFor(phoneProblem)}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving…">
          Save billing details
        </GatedSubmitButton>
        {/* Mounted from the start, so the word is announced when it arrives. */}
        <p role="status" className="text-sm text-ink-soft empty:hidden">
          {saved ? "Saved." : ""}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-ink-soft">
        Changes apply to invoices issued from now on. Issued invoices stay as they are.
      </p>
    </form>
  );
}
