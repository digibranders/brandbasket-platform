"use client";

import { PHONE_COUNTRY_FIELD } from "@brandbasket/shared/lib/phone/fields";
import { Banner } from "@/ui";
import { saveContactAction } from "../actions";
import type { ContactView } from "../loader";
import { CONTACT_LIMITS, formSnapshot } from "../rules";
import { Section } from "./section";
import { TextField } from "./text-field";
import { useSectionForm } from "./use-section-form";

export interface ContactSectionProps {
  readonly contact: ContactView;
  readonly readOnly: boolean;
  /** Customers with a website are told it updates; others are only told it is saved. */
  readonly savedMessage: string;
  /** "PIN code" for rupee customers, "Postal code" for the rest. */
  readonly postalLabel: string;
}

const initialOf = (contact: ContactView): Record<string, string> => ({
  displayName: contact.displayName,
  phone: contact.phone,
  [PHONE_COUNTRY_FIELD]: contact.phoneCountry,
  email: contact.email,
  addressLine1: contact.addressLine1,
  addressLine2: contact.addressLine2,
  city: contact.city,
  region: contact.region,
  postalCode: contact.postalCode,
  country: contact.country,
  serviceAreas: contact.serviceAreas,
});

/** Contact details and address in one form: saved together with the SaveBar. Remounts when the saved values change. */
export function ContactSection(props: ContactSectionProps) {
  const initial = initialOf(props.contact);
  return <ContactFields key={formSnapshot(Object.entries(initial))} initial={initial} {...props} />;
}

function ContactFields({ contact, readOnly, savedMessage, postalLabel, initial }: ContactSectionProps & { readonly initial: Record<string, string> }) {
  const form = useSectionForm({ id: "business-contact", initial, action: saveContactAction, saved: savedMessage });
  return (
    <form id="business-contact" onSubmit={form.submit} noValidate>
      {form.message === undefined ? null : <Banner tone="neg" className="m-4 mb-0">{form.message}</Banner>}
      <Section title="About your business" where="Shown on your website and Google profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="displayName" label="Business name" readOnly={readOnly} maxLength={CONTACT_LIMITS.displayName} autoComplete="organization" full />
          <TextField form={form} name="phone" label="Phone" readOnly={readOnly} dialCode={contact.dialCode} maxLength={40} />
          <TextField form={form} name="email" label="Email" readOnly={readOnly} type="email" autoComplete="email" maxLength={254} />
        </div>
      </Section>
      <Section title="Address and areas" where="Shown on your website, Google profile and listings">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="addressLine1" label="Address" readOnly={readOnly} maxLength={CONTACT_LIMITS.addressLine} autoComplete="address-line1" full />
          <TextField form={form} name="addressLine2" label="Address line 2" readOnly={readOnly} maxLength={CONTACT_LIMITS.addressLine} autoComplete="address-line2" full />
          <TextField form={form} name="city" label="City" readOnly={readOnly} maxLength={CONTACT_LIMITS.city} autoComplete="address-level2" />
          <TextField form={form} name="region" label="State or region" readOnly={readOnly} maxLength={CONTACT_LIMITS.region} autoComplete="address-level1" />
          <TextField form={form} name="postalCode" label={postalLabel} readOnly={readOnly} maxLength={CONTACT_LIMITS.postalCode} autoComplete="postal-code" />
          <TextField form={form} name="country" label="Country" readOnly={readOnly} maxLength={CONTACT_LIMITS.country} autoComplete="country-name" />
          <TextField form={form} name="serviceAreas" label="Areas you serve" readOnly={readOnly} hint="Separate with commas." maxLength={CONTACT_LIMITS.serviceAreas} full />
        </div>
      </Section>
    </form>
  );
}
