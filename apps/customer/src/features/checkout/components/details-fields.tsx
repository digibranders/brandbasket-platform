"use client";

import { HOME_COUNTRY } from "@brandbasket/shared/lib/countries";
import { PHONE_COUNTRY_FIELD } from "@brandbasket/shared/lib/phone/fields";
import Link from "next/link";
import { useState } from "react";
import { INDIA_STATE_OPTIONS } from "@/features/entry/rules/india-state-options";
import { JOIN_BUSINESS_NAME_MAX_LENGTH, JOIN_NAME_MAX_LENGTH } from "@/features/entry/rules/join-form";
import type { StartPrefill } from "@/features/entry/rules/start-token";
import type { FieldErrors } from "@/lib/action-result";
import { Checkbox, Field, Input, Select, type SelectOption } from "@/ui";

/*
 * Business Details: who is paying, how to reach them and, for India, the state and an optional GSTIN with its billing address
 * (docs/design/checkout-one-screen.html). A visitor outside India is asked for neither the state nor a GSTIN, whatever phone
 * code they pick: the country is the visitor's own, read by the server. There is no password and no code; every refusal
 * comes back by the field's name and shows under it. Fields are not controlled: the screen sends the form by hand, so a
 * refusal never resets what was typed.
 */

const GSTIN_LENGTH = 15;
const PINCODE_LENGTH = 6;

interface DetailsFieldsProps {
  /** Whether the visitor is in India: the state and the GSTIN are asked only then. */
  readonly inIndia: boolean;
  readonly errors: FieldErrors | undefined;
  /** The email has an account already: Sign in and Forgot password are offered under it. */
  readonly accountExists: boolean;
  readonly phoneCountries: readonly { readonly code: string; readonly label: string }[];
  readonly defaultPhoneCountry: string;
  /** The ad landing page's details: opening values only, all editable. */
  readonly prefill: StartPrefill | null;
  /** The details were sent and the account opened with them: they are shown, no longer editable. */
  readonly locked: boolean;
}

export function DetailsFields({ inIndia, errors, accountExists, phoneCountries, defaultPhoneCountry, prefill, locked }: DetailsFieldsProps) {
  const [businessName, setBusinessName] = useState("");
  const [hasGstin, setHasGstin] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState(prefill !== null && /^\d{10}$/.test(prefill.phone) ? HOME_COUNTRY : defaultPhoneCountry);
  const phoneOptions: readonly SelectOption[] = phoneCountries.map((option) => ({ value: option.code, label: option.label }));
  const gst = inIndia && hasGstin;

  return (
    <article className="rounded-panel border border-border bg-surface p-5 shadow-card md:p-7 lg:col-span-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <h2 className="type-section text-ink sm:col-span-2">Business Details</h2>

        <Field label="Your name" name="name" error={errors?.name}>
          <Input name="name" readOnly={locked} autoComplete="name" maxLength={JOIN_NAME_MAX_LENGTH} defaultValue={prefill?.name.trim().slice(0, JOIN_NAME_MAX_LENGTH) ?? ""} />
        </Field>
        <Field label="Business name" name="businessName" error={errors?.businessName}>
          <Input name="businessName" readOnly={locked} autoComplete="organization" maxLength={JOIN_BUSINESS_NAME_MAX_LENGTH} value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
        </Field>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Field label="Email" name="email" error={errors?.email} hint={accountExists ? undefined : "You sign in with it."}>
            <Input name="email" readOnly={locked} type="email" autoComplete="email" maxLength={254} placeholder="you@yourbusiness.com" defaultValue={prefill?.email ?? ""} />
          </Field>
          {accountExists ? (
            <p className="type-meta">
              <Link href="/login">Sign in</Link> to continue, or <Link href="/forgot-password">Forgot password</Link>.
            </p>
          ) : null}
        </div>
        {/* Two Fields, not one: a Field names every control inside it after its own name. */}
        <div className="flex gap-2">
          <Field label="Country code" nativeLabel={false} className="w-32 shrink-0">
            <Select name={PHONE_COUNTRY_FIELD} disabled={locked} options={phoneOptions} value={phoneCountry} onValueChange={(next) => setPhoneCountry(next ?? defaultPhoneCountry)} />
          </Field>
          <Field label="Mobile number" name="phone" error={errors?.phone} className="flex-1">
            <Input name="phone" readOnly={locked} type="tel" inputMode="tel" autoComplete="tel-national" defaultValue={prefill !== null && /^\d{10}$/.test(prefill.phone) ? prefill.phone : ""} />
          </Field>
        </div>

        {inIndia ? (
          <>
            <Field label="State" name="stateCode" nativeLabel={false} error={errors?.stateCode} hint="Used for GST on your invoices.">
              <Select name="stateCode" disabled={locked} options={INDIA_STATE_OPTIONS} placeholder="Choose your state" />
            </Field>
            <div className="flex flex-col gap-1 sm:pt-6">
              <Checkbox name="hasGstin" disabled={locked} value="on" checked={hasGstin} onCheckedChange={setHasGstin} label="My business has a GSTIN" />
              {errors?.hasGstin === undefined ? null : <p className="type-meta text-neg-text">{errors.hasGstin}</p>}
              <p className="type-meta">
                {hasGstin
                  ? "Your invoice will be made out to your registered name and GSTIN, so you can claim input tax credit."
                  : `Not registered for GST? No problem: your invoice will be made out to ${businessName.trim() === "" ? "your business name" : businessName.trim()}.`}
              </p>
            </div>
          </>
        ) : null}

        {gst ? (
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <Field label="GSTIN" name="gstin" error={errors?.gstin} hint="15 characters, on your GST registration certificate.">
              <Input name="gstin" readOnly={locked} maxLength={GSTIN_LENGTH} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Legal business name" name="legalName" error={errors?.legalName} hint="As it appears on your GST registration, in English letters.">
              <Input name="legalName" readOnly={locked} maxLength={JOIN_BUSINESS_NAME_MAX_LENGTH} autoComplete="organization" />
            </Field>
            <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="mb-3 type-sub text-ink">Billing address</legend>
              <Field label="Address line 1" name="addressLine1" error={errors?.addressLine1}>
                <Input name="addressLine1" readOnly={locked} maxLength={JOIN_BUSINESS_NAME_MAX_LENGTH} autoComplete="address-line1" />
              </Field>
              <Field label="Address line 2 (optional)" name="addressLine2" error={errors?.addressLine2}>
                <Input name="addressLine2" readOnly={locked} maxLength={JOIN_BUSINESS_NAME_MAX_LENGTH} autoComplete="address-line2" />
              </Field>
              <Field label="Pincode" name="postalCode" error={errors?.postalCode}>
                <Input name="postalCode" readOnly={locked} inputMode="numeric" maxLength={PINCODE_LENGTH} autoComplete="postal-code" />
              </Field>
              <Field label="City" name="city" error={errors?.city}>
                <Input name="city" readOnly={locked} maxLength={100} autoComplete="address-level2" />
              </Field>
            </fieldset>
          </div>
        ) : null}
      </div>
    </article>
  );
}
