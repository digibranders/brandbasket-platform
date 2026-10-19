"use client";

import { useActionState, useEffect, useRef, type ReactElement, type ReactNode } from "react";
import type { PhoneCountryOption } from "@brandbasket/shared/lib/phone/fields";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { PhoneField } from "@brandbasket/shared/ui/phone-field";
import { buttonPrimary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { TrustedMark, VerifiedMark } from "@/components/directory-tag-marks";
import type { VerificationField, VerificationFormState, VerificationValues } from "@/lib/directory-view";

interface VerifyBusinessFormProps {
  /** Redirects to the Verified list on success, so it only ever returns an error state. */
  readonly action: (state: VerificationFormState, formData: FormData) => Promise<VerificationFormState>;
  /** Every country the phone field offers, built on the server. */
  readonly phoneCountries: readonly PhoneCountryOption[];
  /** The country the phone field starts on, a supported code picked on the server. */
  readonly defaultPhoneCountry: string;
}

const ERROR_ID = "verify-business-error";
const INITIAL_STATE: VerificationFormState = { status: "idle" };
const EMPTY_VALUES: VerificationValues = { listing: "", businessName: "", phone: "", phoneCountry: "", trusted: false };

function Field({
  id,
  label,
  hint,
  required = false,
  children,
}: {
  readonly id: string;
  readonly label: ReactNode;
  readonly hint?: { readonly id: string; readonly text: ReactNode };
  readonly required?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {children}
      {hint === undefined ? null : (
        <p id={hint.id} className={hintClasses}>
          {hint.text}
        </p>
      )}
    </div>
  );
}

/**
 * Verifying a directory business: the address of its page on the website, the name to show and the number Fynix
 * confirmed, and whether to give it the Trusted tag as well. Parsed on the server (lib/directory-view.ts); a refusal points at its field and keeps what was typed.
 */
export function VerifyBusinessForm({ action, phoneCountries, defaultPhoneCountry }: VerifyBusinessFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else errorRef.current?.focus();
  }, [state]);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const errorField: VerificationField | null = state.status === "error" ? state.field : null;
  const values = state.status === "error" ? state.values : EMPTY_VALUES;

  function fieldStatus(field: VerificationField, hintId?: string): { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string } {
    if (errorMessage === null || errorField !== field) return hintId === undefined ? {} : { "aria-describedby": hintId };
    return { "aria-invalid": true, "aria-describedby": hintId === undefined ? ERROR_ID : `${ERROR_ID} ${hintId}` };
  }

  return (
    <form ref={formRef} action={formAction} noValidate className="mt-6 max-w-2xl space-y-6">
      <Field
        id="verify-listing"
        label="Business page on the website"
        required
        hint={{ id: "verify-listing-hint", text: "Paste the address from the browser, or just the path from /in/ on." }}
      >
        <input
          id="verify-listing"
          name="listing"
          type="text"
          inputMode="url"
          required
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          maxLength={2000}
          defaultValue={values.listing}
          placeholder="fynix.digital/in/mh/business/smile-dental/9f94ykmdjp"
          className={fieldClasses}
          {...fieldStatus("listing", "verify-listing-hint")}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="verify-name" label="Business name" required>
          <input
            id="verify-name"
            name="businessName"
            required
            maxLength={200}
            defaultValue={values.businessName}
            className={fieldClasses}
            {...fieldStatus("businessName")}
          />
        </Field>

        <Field
          id="verify-phone"
          label={
            <>
              Phone to show <span className="text-ink-soft">(optional)</span>
            </>
          }
          hint={{ id: "verify-phone-hint", text: "Leave it empty for “Don’t show a number”." }}
        >
          <PhoneField
            id="verify-phone"
            countries={phoneCountries}
            country={values.phoneCountry}
            defaultCountry={defaultPhoneCountry}
            number={values.phone}
            size="roomy"
            numberStatus={fieldStatus("phone", "verify-phone-hint")}
            countryStatus={fieldStatus("phoneCountry")}
            className="mt-2"
          />
        </Field>
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm font-medium">
          <input type="checkbox" name="trusted" defaultChecked={values.trusted} aria-describedby="verify-trusted-hint" className={checkboxClasses} />
          <span className="inline-flex items-center gap-2">
            Also give the Trusted tag <TrustedMark className="size-4" />
          </span>
        </label>
        <p id="verify-trusted-hint" className={`${hintClasses} ml-7`}>
          Verified <VerifiedMark className="inline size-3.5 align-text-bottom" /> is always given. Leave this empty to give only Verified.
        </p>
      </div>

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

      <GatedSubmitButton className={buttonPrimary} pendingLabel="Verifying…">
        Verify business
      </GatedSubmitButton>
    </form>
  );
}
