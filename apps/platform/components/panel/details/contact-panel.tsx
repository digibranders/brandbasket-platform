"use client";

import type { ReactElement } from "react";
import { PhoneField } from "@brandbasket/shared/ui/phone-field";
import { PHONE_COUNTRY_FIELD, type PhoneCountryOption } from "@brandbasket/shared/lib/phone/fields";
import { PanelFormStatus, usePanelForm, type PanelFormAction, type PanelFormControls } from "@/components/panel/form/panel-form";
import { DETAILS_LABEL } from "./field-classes";
import { SaveButton } from "./save-button";

/** What the form starts with: every contact fact as saved, a missing one as null. */
export interface SavedContact {
  readonly displayName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly serviceAreas: string | null;
}

interface ContactPanelProps {
  readonly contact: SavedContact;
  readonly phoneCountries: readonly PhoneCountryOption[];
  /** The country the phone field starts on: the saved number's country, else a guess from the visitor. */
  readonly defaultPhoneCountry: string;
  readonly action: PanelFormAction;
}

const INPUT =
  "mt-1.5 block w-full rounded-control border border-ink-2/65 bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-2/80 focus:border-ink aria-[invalid=true]:border-error";

interface TextFieldProps {
  readonly controls: PanelFormControls;
  readonly name: keyof SavedContact;
  readonly label: string;
  readonly saved: string | null;
  readonly maxLength: number;
  readonly optional?: boolean;
  readonly type?: "text" | "email";
  readonly autoComplete?: string;
  readonly placeholder?: string;
}

function TextField({ controls, name, label, saved, maxLength, optional = false, type = "text", autoComplete, placeholder }: TextFieldProps): ReactElement {
  const id = `contact-${name}`;
  return (
    <div>
      <label htmlFor={id} className={DETAILS_LABEL}>
        {label}
        {optional ? <span className="font-medium text-ink-2"> (optional)</span> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={!optional}
        maxLength={maxLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={controls.valueOf(name, saved ?? "")}
        className={INPUT}
        {...controls.fieldStatus(name)}
      />
    </div>
  );
}

/** The business's contact details, saved on their own: who it is, how customers reach it, where it is and where it works. */
export function ContactPanel({ contact, phoneCountries, defaultPhoneCountry, action }: ContactPanelProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  return (
    <form ref={formRef} action={formAction} className="grid gap-5">
      <TextField controls={controls} name="displayName" label="Business name" saved={contact.displayName} maxLength={120} autoComplete="organization" />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-phone" className={DETAILS_LABEL}>
            Phone<span className="font-medium text-ink-2"> (optional)</span>
          </label>
          <PhoneField
            id="contact-phone"
            countries={phoneCountries}
            country={controls.valueOf(PHONE_COUNTRY_FIELD, defaultPhoneCountry)}
            defaultCountry={defaultPhoneCountry}
            number={controls.valueOf("phone", contact.phone ?? "")}
            size="compact"
            numberStatus={controls.fieldStatus("phone")}
            countryStatus={controls.fieldStatus(PHONE_COUNTRY_FIELD)}
            className="mt-1.5 [&>div:first-child]:bg-surface"
          />
        </div>
        <TextField controls={controls} name="email" label="Email" type="email" saved={contact.email} maxLength={254} autoComplete="email" optional />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField controls={controls} name="addressLine1" label="Address line 1" saved={contact.addressLine1} maxLength={120} autoComplete="address-line1" optional />
        <TextField controls={controls} name="addressLine2" label="Address line 2" saved={contact.addressLine2} maxLength={120} autoComplete="address-line2" optional />
        <TextField controls={controls} name="city" label="City" saved={contact.city} maxLength={80} autoComplete="address-level2" optional />
        <TextField controls={controls} name="region" label="State" saved={contact.region} maxLength={80} autoComplete="address-level1" optional />
        <TextField controls={controls} name="postalCode" label="Postal code" saved={contact.postalCode} maxLength={20} autoComplete="postal-code" optional />
        <TextField controls={controls} name="country" label="Country" saved={contact.country} maxLength={80} autoComplete="country-name" optional />
      </div>
      <TextField controls={controls} name="serviceAreas" label="Areas you serve" saved={contact.serviceAreas} maxLength={300} placeholder="Thane, Mumbai, Navi Mumbai" optional />
      <div className="flex items-center gap-4">
        <SaveButton label="Save" pendingLabel="Saving…" startKey={JSON.stringify(contact)} />
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}
