"use client";

import type { OpeningHours } from "@brandbasket/shared/lib/onboarding/hours";
import { PHONE_COUNTRY_FIELD } from "@brandbasket/shared/lib/phone/fields";
import { Input, Select, Textarea, type SelectOption } from "@/ui";
import { saveBusinessItem } from "../actions";
import { FormField, ItemForm } from "./item-form";
import { HoursEditor } from "./hours-editor";
import { SectionLabel } from "./section-label";

/** The saved profile as plain strings, "" for a field never filled. */
export interface BusinessValues {
  readonly displayName: string;
  readonly tagline: string;
  readonly description: string;
  readonly email: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
  readonly serviceAreas: string;
  readonly googleBusinessUrl: string;
}

export interface BusinessFormProps {
  readonly values: BusinessValues;
  /** The saved number as it is typed in its country, and that country's code. */
  readonly phone: { readonly country: string; readonly number: string };
  readonly countries: readonly SelectOption[];
  readonly hours: readonly OpeningHours[];
  readonly readOnlyReason: string | null;
}

export function BusinessForm({ values, phone, countries, hours, readOnlyReason }: BusinessFormProps) {
  return (
    <ItemForm title="Your business" action={saveBusinessItem} readOnly={readOnlyReason !== null} {...(readOnlyReason === null ? {} : { readOnlyReason })}>
      <FormField name="displayName" label="Business name">
        <Input name="displayName" defaultValue={values.displayName} maxLength={120} autoComplete="organization" />
      </FormField>
      <FormField name="tagline" label="Tagline (optional)">
        <Input name="tagline" defaultValue={values.tagline} maxLength={120} />
      </FormField>
      <FormField name="description" label="About your business (optional)">
        <Textarea name="description" defaultValue={values.description} maxLength={600} />
      </FormField>

      <SectionLabel>How customers reach you</SectionLabel>
      {/* Two Fields, not one: a Field names every control inside it after its own name, which posted the code as "phone". */}
      <div className="flex gap-2">
        <FormField name={PHONE_COUNTRY_FIELD} label="Country code" nativeLabel={false} className="w-40 shrink-0">
          <Select name={PHONE_COUNTRY_FIELD} options={countries} defaultValue={phone.country} />
        </FormField>
        <FormField name="phone" label="Phone number" className="flex-1">
          <Input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" defaultValue={phone.number} />
        </FormField>
      </div>
      <FormField name="email" label="Email">
        <Input name="email" type="email" defaultValue={values.email} autoComplete="email" />
      </FormField>

      <SectionLabel>Where you are</SectionLabel>
      <FormField name="addressLine1" label="Address line 1">
        <Input name="addressLine1" defaultValue={values.addressLine1} maxLength={120} autoComplete="address-line1" />
      </FormField>
      <FormField name="addressLine2" label="Address line 2">
        <Input name="addressLine2" defaultValue={values.addressLine2} maxLength={120} autoComplete="address-line2" />
      </FormField>
      <FormField name="city" label="City">
        <Input name="city" defaultValue={values.city} maxLength={80} autoComplete="address-level2" />
      </FormField>
      <FormField name="region" label="State">
        <Input name="region" defaultValue={values.region} maxLength={80} autoComplete="address-level1" />
      </FormField>
      <FormField name="postalCode" label="Postal code">
        <Input name="postalCode" defaultValue={values.postalCode} maxLength={20} autoComplete="postal-code" />
      </FormField>
      <FormField name="country" label="Country">
        <Input name="country" defaultValue={values.country} maxLength={80} autoComplete="country-name" />
      </FormField>
      <FormField name="serviceAreas" label="Areas you serve">
        <Input name="serviceAreas" defaultValue={values.serviceAreas} maxLength={300} />
      </FormField>
      <FormField name="googleBusinessUrl" label="Google Business Profile link (optional)">
        <Input name="googleBusinessUrl" type="url" defaultValue={values.googleBusinessUrl} placeholder="https://" />
      </FormField>

      <SectionLabel>Opening hours</SectionLabel>
      <HoursEditor hours={hours} />
    </ItemForm>
  );
}
