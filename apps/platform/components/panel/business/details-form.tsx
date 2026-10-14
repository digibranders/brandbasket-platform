"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import type { OpeningHours } from "@firstfold/shared/lib/onboarding/hours";
import { FIELD_PATTERNS } from "@firstfold/shared/lib/forms/input-rules";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";
import { HoursEditor } from "@/components/panel/hours-editor";
import { BUSINESS_ADDRESS_MAX_LENGTH } from "@/lib/business-name";
import {
  BUSINESS_ABOUT_MAX_LENGTH,
  BUSINESS_ABOUT_MAX_WORDS,
  countWords,
  limitWords,
  initialBusinessDetailsFormState,
  WHATSAPP_SAME_VALUE,
  type BusinessDetailsFormState,
} from "@/lib/business-details-fields";
import {
  EMAIL_MAX_LENGTH,
  YES_VALUE,
} from "@/lib/business-profile-fields";
import { JOIN_BUSINESS_NAME_MAX_LENGTH } from "@/lib/join-form";
import { LISTING_WEBSITE_MAX_LENGTH } from "@/lib/listing-website";
import { MAPS_LINK_MAX_LENGTH } from "@/lib/maps-link";
import { SOCIAL_LABELS, SOCIAL_LINK_MAX_LENGTH, type SocialNetwork } from "@/lib/social-link";

/** What the form opens with: the saved details, written as the owner reads them. */
export interface DetailsValues {
  readonly businessName: string;
  readonly address: string;
  readonly phone: string;
  readonly whatsappSame: boolean;
  readonly whatsapp: string;
  readonly maps: string;
  readonly directionsNote: string;
  readonly website: string;
  readonly email: string;
  readonly gstNumber: string;
  readonly instagram: string;
  readonly facebook: string;
  readonly linkedin: string;
  readonly about: string;
  readonly establishedYear: string;
  readonly serviceArea: string;
  readonly holidayHours: string;
  readonly open24x7: boolean;
  readonly hours: readonly OpeningHours[];
}

const SOCIAL_FIELDS: readonly SocialNetwork[] = ["instagram", "facebook", "linkedin"];

interface DetailsFormProps {
  readonly action: (state: BusinessDetailsFormState, formData: FormData) => Promise<BusinessDetailsFormState>;
  readonly initial: DetailsValues;
  /** The save button's words: "Save and continue" while setting up, "Save" once live. */
  readonly submitLabel: string;
  /** The areas the service-area list offers, from the directory's catalog. */
  readonly serviceAreas: readonly string[];
  /**
   * The business is a claim on one the directory already had: its name and number are the directory's (shown, not
   * editable) and its address is not asked for, so what the owner fills in here is the rest of its page.
   */
  readonly claimed?: boolean;
}

const ERROR_ID = "details-error";
const INPUT_CLASSES =
  "mt-1 block w-full rounded-control border border-ink-soft/50 bg-white px-3 py-1.5 text-sm text-ink transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent aria-invalid:border-accent";
const LABEL_CLASSES = "block text-[0.8125rem] font-medium text-ink-soft";
const HINT_CLASSES = "mt-1 text-xs text-ink-soft";

interface FieldProps {
  readonly id: string;
  readonly label: string;
  /** The server refuses this field blank, so the label carries the asterisk. */
  readonly required?: boolean;
  readonly hint?: ReactNode;
  readonly children: ReactNode;
}

function Field({ id, label, required = false, hint, children }: FieldProps): ReactElement {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASSES}>
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {children}
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className={HINT_CLASSES}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * The Identity tab: the business's name, address, phone, WhatsApp (the phone by default), directions as a Google Maps
 * link, website, opening hours and a few words about it. Every value is held here, so a refused save leaves the form
 * as it was.
 */
export function DetailsForm({ action, initial, submitLabel, serviceAreas, claimed = false }: DetailsFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialBusinessDetailsFormState);
  const [values, setValues] = useState<DetailsValues>(initial);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const errorField = state.status === "error" && !isPending ? state.field : null;
  const describedBy = errorMessage === null ? undefined : ERROR_ID;
  const invalid = (field: string): true | undefined => (errorField === field ? true : undefined);
  const areaOptions: readonly SelectOption[] = [
    { value: "", label: "Not set" },
    ...(values.serviceArea === "" || serviceAreas.includes(values.serviceArea) ? serviceAreas : [values.serviceArea, ...serviceAreas]).map(
      (area) => ({ value: area, label: area }),
    ),
  ];
  const set = (field: keyof DetailsValues) => (event: { readonly target: { readonly value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  /**
   * Sends the form without handing it to React's form action, which clears a form's fields once the action settles:
   * a refused save would show the opening-hours choices back at "Not set" while the form still held the owner's.
   */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="mt-8 max-w-2xl space-y-7">
        <section aria-labelledby="identity-business-title" className="space-y-4">
          <h2 id="identity-business-title" className="panel-section">
            Your business
          </h2>
          {claimed ? (
            <p className="text-sm text-ink-soft">
              Your name, address and phone number come from the directory, where we checked them when we confirmed you. What you
              fill in below goes on your page.
            </p>
          ) : null}
          <Field id="details-name" label="Business name" required hint={claimed ? "From the directory." : undefined}>
            <input
              id="details-name"
              name="businessName"
              readOnly={claimed}
              required
              autoComplete="organization"
              maxLength={JOIN_BUSINESS_NAME_MAX_LENGTH}
              value={values.businessName}
              onChange={set("businessName")}
              aria-invalid={invalid("businessName")}
              aria-describedby={describedBy}
              className={`${INPUT_CLASSES} read-only:bg-paper-deep read-only:text-ink-soft`}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="details-gst" label="GST number (optional)" hint="Shown on your business page.">
              <RuleInput
                id="details-gst"
                name="gstNumber"
                rule="code"
                autoComplete="off"
                spellCheck={false}
                maxLength={15}
                pattern={FIELD_PATTERNS.gstin}
                title="15 characters, like 27AAPFU0939F1ZV"
                placeholder="27AAPFU0939F1ZV"
                value={values.gstNumber}
                onChange={set("gstNumber")}
                aria-invalid={invalid("gstNumber")}
                aria-describedby={`details-gst-hint${describedBy === undefined ? "" : ` ${describedBy}`}`}
                className={`${INPUT_CLASSES} tabular-nums`}
              />
            </Field>
            <Field id="details-year" label="Established (year)">
              <RuleInput
                id="details-year"
                name="establishedYear"
                rule="digits"
                maxLength={4}
                pattern={FIELD_PATTERNS.year}
                title="Four digits, like 2004"
                placeholder="2004"
                value={values.establishedYear}
                onChange={set("establishedYear")}
                aria-invalid={invalid("establishedYear")}
                aria-describedby={describedBy}
                className={`${INPUT_CLASSES} tabular-nums`}
              />
            </Field>
          </div>

          <Field id="details-about" label="Description" hint={`${String(countWords(values.about))} / ${String(BUSINESS_ABOUT_MAX_WORDS)} words`}>
            <textarea
              id="details-about"
              name="about"
              rows={5}
              maxLength={BUSINESS_ABOUT_MAX_LENGTH}
              placeholder="What you do, and what you're known for."
              value={values.about}
              onChange={(event) => setValues((current) => ({ ...current, about: limitWords(event.target.value, BUSINESS_ABOUT_MAX_WORDS) }))}
              aria-invalid={invalid("about")}
              aria-describedby={`details-about-hint${describedBy === undefined ? "" : ` ${describedBy}`}`}
              className={`${INPUT_CLASSES} resize-y`}
            />
          </Field>
        </section>

        <section aria-label="Where you are" className="space-y-4 border-t border-line pt-6">
          {claimed ? null : (
          <Field id="details-address" label="Address" required>
            <textarea
              id="details-address"
              name="address"
              required
              rows={3}
              autoComplete="street-address"
              maxLength={BUSINESS_ADDRESS_MAX_LENGTH}
              placeholder="Shop, building, road, area"
              value={values.address}
              onChange={set("address")}
              aria-invalid={invalid("address")}
              aria-describedby={describedBy}
              className={`${INPUT_CLASSES} resize-y`}
            />
          </Field>
          )}

          <Field id="details-area" label="Service area (optional)">
            <SelectField
              id="details-area"
              name="serviceArea"
              options={areaOptions}
              value={values.serviceArea}
              onChange={(area) => setValues((current) => ({ ...current, serviceArea: area }))}
              aria-invalid={invalid("serviceArea")}
              aria-describedby={describedBy}
              className={INPUT_CLASSES}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
          {claimed ? null : (
          <Field id="details-maps" label="Directions link" hint="Open your business in Google Maps, tap Share, then Copy link, and paste it here.">
            <input
              id="details-maps"
              name="maps"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={MAPS_LINK_MAX_LENGTH}
              placeholder="https://maps.app.goo.gl/…"
              value={values.maps}
              onChange={set("maps")}
              aria-invalid={invalid("maps")}
              aria-describedby={`details-maps-hint${describedBy === undefined ? "" : ` ${describedBy}`}`}
              className={INPUT_CLASSES}
            />
          </Field>
          )}

          {/* An older "how to find you" note is kept as it is: nothing asks for a new one, and the page never showed it. */}
          <input type="hidden" name="directionsNote" value={values.directionsNote} />
          </div>
        </section>

        <section aria-label="Contact" className="space-y-4 border-t border-line pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="details-phone" label="Phone number" required hint={claimed ? "The number we called." : undefined}>
              <RuleInput
                id="details-phone"
                name="phone"
                rule="phone"
                type="tel"
                readOnly={claimed}
                required
                autoComplete="tel"
                maxLength={40}
                placeholder="98200 00000"
                value={values.phone}
                onChange={set("phone")}
                aria-invalid={invalid("phone")}
                aria-describedby={describedBy}
                className={`${INPUT_CLASSES} tabular-nums read-only:bg-paper-deep read-only:text-ink-soft`}
              />
            </Field>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="details-whatsapp" className={LABEL_CLASSES}>
                  WhatsApp number
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    name="whatsappSame"
                    value={WHATSAPP_SAME_VALUE}
                    checked={values.whatsappSame}
                    onChange={(event) => setValues((current) => ({ ...current, whatsappSame: event.target.checked }))}
                    className="size-4 accent-accent"
                  />
                  Same as phone
                </label>
              </div>
              <RuleInput
                id="details-whatsapp"
                name="whatsapp"
                rule="phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                placeholder={values.whatsappSame ? "" : "Leave empty for none"}
                disabled={values.whatsappSame}
                value={values.whatsappSame ? values.phone : values.whatsapp}
                onChange={set("whatsapp")}
                aria-invalid={invalid("whatsapp")}
                aria-describedby={describedBy}
                className={`${INPUT_CLASSES} tabular-nums disabled:bg-paper-deep disabled:text-ink-soft`}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="details-email" label="Email (optional)">
              <input
                id="details-email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={EMAIL_MAX_LENGTH}
                placeholder="hello@yourbusiness.com"
                value={values.email}
                onChange={set("email")}
                aria-invalid={invalid("email")}
                aria-describedby={describedBy}
                className={INPUT_CLASSES}
              />
            </Field>

            <Field id="details-website" label="Website (optional)">
              <input
                id="details-website"
                name="website"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={LISTING_WEBSITE_MAX_LENGTH}
                placeholder="yourbusiness.com"
                value={values.website}
                onChange={set("website")}
                aria-invalid={invalid("website")}
                aria-describedby={describedBy}
                className={INPUT_CLASSES}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {SOCIAL_FIELDS.map((network) => (
              <Field key={network} id={`details-${network}`} label={`${SOCIAL_LABELS[network]} (optional)`}>
                <input
                  id={`details-${network}`}
                  name={network}
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={SOCIAL_LINK_MAX_LENGTH}
                  placeholder={`${network}.com/…`}
                  value={values[network]}
                  onChange={set(network)}
                  aria-invalid={invalid(network)}
                  aria-describedby={describedBy}
                  className={INPUT_CLASSES}
                />
              </Field>
            ))}
          </div>
        </section>

        <section aria-labelledby="details-hours-title" className="space-y-4 border-t border-line pt-6">
          <h2 id="details-hours-title" className="panel-section">
            Opening hours
          </h2>
          <HoursEditor initial={values.hours} invalidField={errorField} errorId={ERROR_ID} bare />

          {/* Holidays and half days are added in their own section below, one date at a time. An older one-line note is
              kept as it is until the owner replaces it. */}
          <input type="hidden" name="holidayHours" value={values.holidayHours} />

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="open24x7"
              value={YES_VALUE}
              checked={values.open24x7}
              onChange={(event) => setValues((current) => ({ ...current, open24x7: event.target.checked }))}
              className="mt-0.5 size-4 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium">Open 24×7 for emergencies</span>
              <span className="mt-0.5 block text-sm text-ink-soft">Shows an emergency badge on your page.</span>
            </span>
          </label>
        </section>

        {errorMessage === null ? null : (
          <p id={ERROR_ID} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            {errorMessage}
          </p>
        )}

        <SubmitButton disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </SubmitButton>
      </form>
    </>
  );
}
