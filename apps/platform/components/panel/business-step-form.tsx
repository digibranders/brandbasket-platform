"use client";

import type { ReactElement } from "react";
import { HoursEditor } from "@/components/panel/hours-editor";
import { PhoneField } from "@brandbasket/shared/ui/phone-field";
import {
  HTTPS_LINK_PATTERN,
  HTTPS_LINK_TITLE,
  InlineError,
  STEP_BODY_CLASSES,
  STEP_LABEL_CLASSES,
  StepFooter,
  StepFormError,
  StepGroup,
  StepTextArea,
  StepTextField,
  useStepForm,
  type StepAction,
} from "@/components/panel/step-form";
import type { BusinessStepInput, OpeningHours } from "@brandbasket/shared/lib/onboarding/business-fields";
import { PHONE_COUNTRY_FIELD, type PhoneCountryOption } from "@brandbasket/shared/lib/phone/fields";

export type SavedBusinessProfile = { readonly [Key in keyof BusinessStepInput["profile"]]: string | null };

interface BusinessStepFormProps {
  readonly action: StepAction;
  readonly profile: SavedBusinessProfile;
  readonly hours: readonly OpeningHours[];
  /** Every country the phone field offers, built on the server. */
  readonly phoneCountries: readonly PhoneCountryOption[];
  /**
   * The country the phone field starts on, a supported code picked on the server: the saved number's country when
   * it has one. `profile.phone` is then that number in its national layout.
   */
  readonly defaultPhoneCountry: string;
}

/** Step 01: who the business is, how to reach it, and when it is open. */
export function BusinessStepForm({
  action,
  profile,
  hours,
  phoneCountries,
  defaultPhoneCountry,
}: BusinessStepFormProps): ReactElement {
  const { formRef, errorRef, formAction, controls } = useStepForm(action, { inline: true });

  return (
    <form ref={formRef} action={formAction} noValidate className="group/step">
      <div className={STEP_BODY_CLASSES}>
        <StepGroup title="About the business">
          <StepTextField
            controls={controls}
            name="displayName"
            label="Business name"
            saved={profile.displayName}
            maxLength={120}
            autoComplete="organization"
            required
          />
          <StepTextField
            controls={controls}
            name="tagline"
            label="A one-line tagline"
            saved={profile.tagline}
            maxLength={120}
            placeholder="Gentle family dentistry in Thane"
            optional
          />
          <StepTextArea
            controls={controls}
            name="description"
            label="A short description"
            hint="What you do and who you do it for, in your own words. Up to 600 characters."
            saved={profile.description}
            maxLength={600}
          />
        </StepGroup>

        <StepGroup title="How customers reach you" hint="These go on your website. Add a phone number, an email, or both.">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="field-phone" className={STEP_LABEL_CLASSES}>
                Public phone<span className="font-medium text-ink-2"> (optional)</span>
              </label>
              <PhoneField
                id="field-phone"
                countries={phoneCountries}
                country={controls.valueOf(PHONE_COUNTRY_FIELD, defaultPhoneCountry)}
                defaultCountry={defaultPhoneCountry}
                number={controls.valueOf("phone", profile.phone)}
                size="compact"
                numberStatus={controls.fieldStatus("phone")}
                countryStatus={controls.fieldStatus(PHONE_COUNTRY_FIELD)}
                className="mt-1.5 [&>div:first-child]:bg-surface"
              />
              <InlineError controls={controls} match={/^(phone|phoneCountry)$/} />
            </div>
            <StepTextField
              controls={controls}
              name="email"
              label="Public email"
              type="email"
              saved={profile.email}
              maxLength={254}
              autoComplete="email"
              placeholder="hello@yourbusiness.com"
              optional
            />
          </div>
          <StepTextField
            controls={controls}
            name="googleBusinessUrl"
            label="Your Google Business Profile link"
            type="url"
            saved={profile.googleBusinessUrl}
            maxLength={500}
            placeholder="https://"
            pattern={HTTPS_LINK_PATTERN}
            title={HTTPS_LINK_TITLE}
            optional
          />
        </StepGroup>

        <StepGroup title="Where you are">
          <div className="grid gap-5 sm:grid-cols-2">
            <StepTextField
              controls={controls}
              name="addressLine1"
              label="Address line 1"
              saved={profile.addressLine1}
              maxLength={120}
              autoComplete="address-line1"
              optional
            />
            <StepTextField
              controls={controls}
              name="addressLine2"
              label="Address line 2"
              saved={profile.addressLine2}
              maxLength={120}
              autoComplete="address-line2"
              optional
            />
            <StepTextField
              controls={controls}
              name="city"
              label="City"
              saved={profile.city}
              maxLength={80}
              autoComplete="address-level2"
              optional
            />
            <StepTextField
              controls={controls}
              name="region"
              label="State or region"
              saved={profile.region}
              maxLength={80}
              autoComplete="address-level1"
              optional
            />
            <StepTextField
              controls={controls}
              name="postalCode"
              label="Postal code"
              saved={profile.postalCode}
              maxLength={20}
              autoComplete="postal-code"
              optional
            />
            <StepTextField
              controls={controls}
              name="country"
              label="Country"
              saved={profile.country}
              maxLength={80}
              autoComplete="country-name"
              optional
            />
          </div>
          <StepTextField
            controls={controls}
            name="serviceAreas"
            label="Areas you serve"
            hint="Neighbourhoods, towns or regions, if you travel to customers or want to be found there."
            saved={profile.serviceAreas}
            maxLength={300}
            placeholder="Thane, Mulund, Ghodbunder Road"
            optional
          />
        </StepGroup>

        <div className="border-t border-line pt-6">
          <HoursEditor
            initial={hours}
            invalidField={controls.invalidField}
            errorId={controls.errorId}
            renderError={(day) => <InlineError controls={controls} match={new RegExp(`^hours\\.${String(day)}\\.`)} />}
          />
        </div>

        <StepFormError controls={controls} errorRef={errorRef} />
      </div>
      <StepFooter controls={controls} step="business" label="Save and continue" pendingLabel="Saving…" note="Saved when you continue." />
    </form>
  );
}
