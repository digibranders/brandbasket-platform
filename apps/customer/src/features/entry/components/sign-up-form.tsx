"use client";

import { PASSWORD_MIN_LENGTH, PASSWORD_RULE } from "@brandbasket/auth/password-policy";
import { OTP_LENGTH } from "@brandbasket/shared/lib/appointments/otp";
import { HOME_COUNTRY } from "@brandbasket/shared/lib/countries";
import { INDIA_STATES } from "@brandbasket/shared/lib/directory/india-states";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { PHONE_COUNTRY_FIELD } from "@brandbasket/shared/lib/phone/fields";
import { currencyForCountry } from "@brandbasket/shared/lib/pricing";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Banner, Button, Checkbox, Field, Input, PhoneInput, Select, type SelectOption } from "@/ui";
import { signUpAction, type SignUpResult } from "../actions";
import { NEXT_FIELD, SIGN_IN_PATH, withInviteReturn } from "../rules/account-entry";
import { LEGAL_LINKS } from "../rules/brand";
import { AGREE_FIELD, AGREE_VALUE, JOIN_BUSINESS_NAME_MAX_LENGTH, JOIN_NAME_MAX_LENGTH, START_FIELD } from "../rules/join-form";
import type { StartPrefill } from "../rules/start-token";
import { PasswordInput } from "./password-input";
import { TurnstileWidget } from "./turnstile";
import { useOtpRetryCooldown } from "./use-otp-retry-cooldown";

/** A country code the mobile number may have, built on the server. */
export interface PhoneCountryChoice {
  readonly code: string;
  readonly label: string;
  readonly dialCode: string;
}

export interface SignUpFormProps {
  readonly siteKey: string | null;
  /** The services the link chose, catalogue ids, sent with the form so checkout opens on them. */
  readonly services: readonly string[];
  /** Those services named ("Managed Website and Local SEO + AEO") and priced in each currency by the server. */
  readonly basket: { readonly name: string; readonly prices: Readonly<Record<MoneyCurrency, string | null>> };
  /** False while the local bypass is on (EMAIL_CODE_BYPASS): the details step then promises no real check. */
  readonly confirmsCodes: boolean;
  readonly countries: readonly SelectOption[];
  readonly phoneCountries: readonly PhoneCountryChoice[];
  /** The code the number opens on: the visitor's country when it can be told, otherwise India. */
  readonly defaultPhoneCountry: string;
  /** The ad landing page's details: only the opening values of name, email and mobile, all editable. */
  readonly prefill: StartPrefill | null;
  /** The sealed token that named an ad, sent back so the account keeps which ad it came from; null when it named none. */
  readonly startToken: string | null;
  /** The invite page to return to after signing up (already checked by the page), or null. */
  readonly next?: string | null;
}

const STATE_OPTIONS: readonly SelectOption[] = [...INDIA_STATES]
  .sort((a, b) => a.name.localeCompare(b.name, "en"))
  .map((state) => ({ value: state.code, label: state.name }));

/**
 * Creating an account, in two steps on one form: the owner's details, then the code we email to their address. Every value
 * is held here, so the code step sends the details again with the code and a refused send leaves the form as it was.
 * "Change email" returns to the details, and "Send a new code" sends them again without a code. Ported from apps/platform
 * components/panel/join-form.tsx; Brandbasket sells one plan, so the old plan question is never shown.
 */
export function SignUpForm({ siteKey, services, basket, confirmsCodes, countries, phoneCountries, defaultPhoneCountry, prefill, startToken, next = null }: SignUpFormProps) {
  const cooldown = useOtpRetryCooldown();
  const run = async (previous: SignUpResult | null, formData: FormData): Promise<SignUpResult> => {
    const result = await signUpAction(previous, formData);
    if (!result.ok && result.retry !== undefined) cooldown.begin(result.retry);
    return result;
  };
  const [state, formAction, pending] = useActionState(run, null);

  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState(() => prefill?.name.trim().slice(0, JOIN_NAME_MAX_LENGTH) ?? "");
  const [email, setEmail] = useState(() => prefill?.email ?? "");
  // India first: the product is sold there. The state is never filled in for the owner.
  const [country, setCountry] = useState<string>(HOME_COUNTRY);
  const [stateCode, setStateCode] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(() => (prefill !== null && /^\d{10}$/.test(prefill.phone) ? HOME_COUNTRY : defaultPhoneCountry));
  const [phone, setPhone] = useState(() => (prefill !== null && /^\d{10}$/.test(prefill.phone) ? prefill.phone : ""));
  const [password, setPassword] = useState("");
  // Never ticked for the owner: agreeing to the Terms and Privacy Notice is their own act (DPDP Act s.6).
  const [agreed, setAgreed] = useState(false);
  /** The code belongs to the code step that asked for it. */
  const [codeEntry, setCodeEntry] = useState({ otpId: "", value: "" });
  /** The result the owner moved on from with "Change email": its code step and error are left behind. */
  const [left, setLeft] = useState<SignUpResult | null>(null);

  const otp = state === null || state === left ? null : state.ok ? state.data.otp : state.otp;
  const error = state !== null && !state.ok && state !== left && !pending ? state.message : null;
  const code = otp !== null && codeEntry.otpId === otp.otpId ? codeEntry.value : "";
  const dialCode = phoneCountries.find((option) => option.code === phoneCountry)?.dialCode ?? "";
  const price = basket.prices[currencyForCountry(country)];

  const carried = (
    <>
      <input type="hidden" name="choice" value="managed" />
      {services.length === 0 ? null : <input type="hidden" name="services" value={services.join(",")} />}
      {startToken === null ? null : <input type="hidden" name={START_FIELD} value={startToken} />}
      {next === null ? null : <input type="hidden" name={NEXT_FIELD} value={next} />}
    </>
  );
  const errorBanner = error === null ? null : <Banner tone="neg">{error}</Banner>;

  if (otp !== null) {
    return (
      <form action={formAction} noValidate className="flex flex-col gap-4">
        {carried}
        {/* The details again: nothing about the owner is kept on the server until the code is confirmed. */}
        <input type="hidden" name="businessName" value={businessName} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="country" value={country} />
        {country === HOME_COUNTRY ? <input type="hidden" name="stateCode" value={stateCode} /> : null}
        <input type="hidden" name={PHONE_COUNTRY_FIELD} value={phoneCountry} />
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="password" value={password} />
        {agreed ? <input type="hidden" name={AGREE_FIELD} value={AGREE_VALUE} /> : null}
        <input type="hidden" name="otpId" value={otp.otpId} />

        <p role="status" className="type-body text-ink-2">
          {otp.confirmRequired
            ? `We emailed a ${OTP_LENGTH}-digit code to ${otp.emailHint}. It works for 10 minutes. Nothing there? Check your spam folder.`
            : `Test mode: enter any ${OTP_LENGTH} digits to continue with ${otp.emailHint}.`}
        </p>
        <Field label="Code" name="code">
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={OTP_LENGTH + 2}
            pattern={`[0-9]{${OTP_LENGTH}}`}
            value={code}
            onChange={(event) => setCodeEntry({ otpId: otp.otpId, value: event.target.value })}
            className="type-mono"
          />
        </Field>
        {errorBanner}
        <TurnstileWidget siteKey={siteKey} action="join" resetKey={state} />
        <Button type="submit" variant="primary" size="lg" pending={pending} disabled={cooldown.confirmSeconds > 0}>
          {otp.confirmRequired ? "Verify and continue" : "Continue"}
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* With the bypass on there is nothing to send again. */}
          {otp.confirmRequired ? (
            <Button type="submit" variant="ghost" size="sm" name="resend" value="1" formNoValidate disabled={pending || cooldown.sendSeconds > 0}>
              {cooldown.sendSeconds > 0 ? `Send a new code in ${cooldown.sendSeconds}s` : "Send a new code"}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setLeft(state)}>
            Change email
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {carried}
      <p className="type-body text-ink-3">
        Signing up for <span className="text-ink">{basket.name}</span>
        {price === null ? null : ` · ${price}`}
      </p>
      <Field label="Business name" name="businessName">
        <Input name="businessName" required autoComplete="organization" maxLength={JOIN_BUSINESS_NAME_MAX_LENGTH} value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
      </Field>
      <Field label="Your name" name="name">
        <Input name="name" required autoComplete="name" maxLength={JOIN_NAME_MAX_LENGTH} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Email" name="email" hint={confirmsCodes ? "You sign in with it. We’ll email it a code now." : "You sign in with it."}>
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          placeholder="you@yourbusiness.com"
          value={email}
          onChange={(event) => {
            cooldown.clearAddressLimits();
            setEmail(event.target.value);
          }}
        />
      </Field>
      <Field label="Country" nativeLabel={false}>
        <Select name="country" required options={countries} value={country} onValueChange={(next) => setCountry(next ?? HOME_COUNTRY)} />
      </Field>
      {country === HOME_COUNTRY ? (
        <Field label="State" nativeLabel={false} hint="Used for GST on your invoices.">
          <Select name="stateCode" required options={STATE_OPTIONS} placeholder="Choose your state" value={stateCode} onValueChange={(next) => setStateCode(next ?? "")} />
        </Field>
      ) : null}
      <Field label="Mobile number" nativeLabel={false}>
        <div className="flex gap-2">
          <Select
            name={PHONE_COUNTRY_FIELD}
            aria-label="Country code"
            options={phoneCountries.map((option) => ({ value: option.code, label: option.label }))}
            value={phoneCountry}
            onValueChange={(next) => setPhoneCountry(next ?? defaultPhoneCountry)}
            className="w-32 shrink-0"
          />
          <PhoneInput name="phone" aria-label="Mobile number" required countryCode={dialCode} value={phone} onChange={(event) => setPhone(event.target.value)} className="flex-1" />
        </div>
      </Field>
      <Field label="Choose a password" name="password" hint={PASSWORD_RULE}>
        <PasswordInput name="password" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
      </Field>
      <Checkbox
        name={AGREE_FIELD}
        value={AGREE_VALUE}
        required
        checked={agreed}
        onCheckedChange={setAgreed}
        label={
          <>
            I agree to the{" "}
            <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer">
              Terms
            </a>{" "}
            and the{" "}
            <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer">
              Privacy Notice
            </a>
            .
          </>
        }
      />
      {errorBanner}
      <TurnstileWidget siteKey={siteKey} action="join" resetKey={state} />
      <Button type="submit" variant="primary" size="lg" pending={pending} disabled={cooldown.sendSeconds > 0}>
        {confirmsCodes ? "Email me a code" : "Continue"}
      </Button>
      <p className="text-center type-meta">You pay on the next page.</p>
      <p className="text-center type-meta">
        Already have an account? <Link href={withInviteReturn(SIGN_IN_PATH, next)}>Sign in</Link>
      </p>
    </form>
  );
}
