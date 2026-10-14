"use client";

import { useActionState, useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { PhoneField } from "@fynix/shared/ui/phone-field";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@fynix/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@fynix/shared/ui/select-field";
import { BUSINESS_TYPES } from "@fynix/shared/lib/business-types";
import { EMPTY_LEAD_VALUES, initialLeadFormState, type LeadField, type LeadFormState } from "@fynix/shared/lib/lead-form-fields";
import type { PhoneCountryOption } from "@fynix/shared/lib/phone/fields";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";

interface NewLeadFormProps {
  /** Redirects to the new lead on success, so it only ever returns an error state. */
  readonly action: (state: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  /** Every country the phone field offers, built on the server. */
  readonly phoneCountries: readonly PhoneCountryOption[];
  /** The country the phone field starts on, a supported code picked on the server. */
  readonly defaultPhoneCountry: string;
}

const ERROR_ID = "new-lead-error";

const BUSINESS_TYPE_OPTIONS: readonly SelectOption[] = BUSINESS_TYPES.map((type) => ({ value: type.value, label: type.label }));

interface FieldProps {
  readonly id: string;
  readonly label: ReactNode;
  readonly required?: boolean;
  readonly children: ReactNode;
}

function Field({ id, label, required = false, children }: FieldProps): ReactElement {
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {children}
    </div>
  );
}

/** Adding a lead by hand: the same validation the public form uses, so both produce identical rows. */
export function NewLeadForm({ action, phoneCountries, defaultPhoneCountry }: NewLeadFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialLeadFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else errorRef.current?.focus();
  }, [state]);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const errorField: LeadField | null = state.status === "error" ? state.field : null;
  const values = state.status === "error" ? state.values : EMPTY_LEAD_VALUES;

  function fieldStatus(field: LeadField): { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string } {
    if (errorMessage === null || errorField !== field) return {};
    return { "aria-invalid": true, "aria-describedby": ERROR_ID };
  }

  return (
    <form ref={formRef} action={formAction} noValidate className="max-w-2xl space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="new-lead-name" label="Their name" required>
          <RuleInput
            rule="personName"
            id="new-lead-name"
            name="name"
            required
            autoComplete="off"
            maxLength={120}
            defaultValue={values.name}
            className={fieldClasses}
            {...fieldStatus("name")}
          />
        </Field>

        <Field id="new-lead-business" label="Business name" required>
          <input
            id="new-lead-business"
            name="businessName"
            required
            maxLength={120}
            defaultValue={values.businessName}
            className={fieldClasses}
            {...fieldStatus("businessName")}
          />
        </Field>

        <Field id="new-lead-email" label="Email" required>
          <input
            id="new-lead-email"
            name="email"
            type="email"
            required
            spellCheck={false}
            autoCapitalize="none"
            maxLength={254}
            defaultValue={values.email}
            className={fieldClasses}
            {...fieldStatus("email")}
          />
        </Field>

        <Field id="new-lead-phone" label="Phone" required>
          <PhoneField
            id="new-lead-phone"
            countries={phoneCountries}
            country={values.phoneCountry}
            defaultCountry={defaultPhoneCountry}
            number={values.phone}
            size="roomy"
            required
            numberStatus={fieldStatus("phone")}
            countryStatus={fieldStatus("phoneCountry")}
            className="mt-2"
          />
        </Field>
      </div>

      <Field id="new-lead-type" label="Kind of business" required>
        <SelectField
          key={values.businessType}
          id="new-lead-type"
          name="businessType"
          required
          options={BUSINESS_TYPE_OPTIONS}
          defaultValue={values.businessType}
          placeholder="Select a business type"
          className={fieldClasses}
          {...fieldStatus("businessType")}
        />
      </Field>

      <Field
        id="new-lead-message"
        label={
          <>
            What they told us <span className="text-ink-soft">(optional)</span>
          </>
        }
      >
        <textarea
          id="new-lead-message"
          name="message"
          rows={4}
          maxLength={1000}
          defaultValue={values.message}
          className={fieldClasses}
          {...fieldStatus("message")}
        />
      </Field>

      {errorMessage === null ? null : (
        <p
          ref={errorRef}
          id={ERROR_ID}
          role="alert"
          tabIndex={-1}
          className="border-l-2 border-accent py-1 pl-4 text-sm text-accent outline-none"
        >
          {errorMessage}
        </p>
      )}

      <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving…">
        Add lead
      </GatedSubmitButton>
    </form>
  );
}
