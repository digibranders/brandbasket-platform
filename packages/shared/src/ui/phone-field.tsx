"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { RuleInput } from "./forms/rule-input";
import { SelectField } from "./select-field";
import { cn } from "../lib/cn";
import { phoneDigitsMessage } from "../lib/forms/input-rules";
import { MAX_PHONE_LENGTH, PHONE_COUNTRY_FIELD, type PhoneCountryOption } from "../lib/phone/fields";

/** The error wiring each form already computes for its own inputs. */
export type PhoneFieldStatus = { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string };

/** What the field holds: the chosen country code and the number as typed. */
export interface PhoneFieldValue {
  readonly country: string;
  readonly number: string;
}

/** "roomy" matches the Get started and Add lead fields; "compact" matches the onboarding step fields. */
export type PhoneFieldSize = "roomy" | "compact";

interface PhoneFieldProps {
  /** The number input's id. The form's visible label points here; the select gets `${id}-country`. */
  readonly id: string;
  /** Every selectable country, built on the server. */
  readonly countries: readonly PhoneCountryOption[];
  /** The country to show: what was sent after a refused submit, or a saved number's country. May be blank. */
  readonly country: string;
  /** Used when `country` is blank or not in the list. The server only passes a code that is. */
  readonly defaultCountry: string;
  /** What the number input starts with. */
  readonly number: string;
  readonly size: PhoneFieldSize;
  readonly required?: boolean;
  /** Locks both inputs while the form is being sent: the number turns read-only and the dropdown stops opening. */
  readonly disabled?: boolean;
  readonly numberStatus: PhoneFieldStatus;
  readonly countryStatus: PhoneFieldStatus;
  /** Spacing from the label, which differs per form. Wraps the field and its length message. */
  readonly className?: string;
  /** What the number input posts as. Defaults to "phone"; a form with a second number (the patient register's
   * second phone) names it apart so both can sit in one form. */
  readonly numberName?: string;
  /** What the country select posts as. Defaults to PHONE_COUNTRY_FIELD, for the same reason as `numberName`. */
  readonly countryName?: string;
  /** Called with both values whenever either changes, for a form that keeps what was typed (the sign-up form's steps). */
  readonly onChange?: (value: PhoneFieldValue) => void;
}

const SIZES: Record<PhoneFieldSize, { readonly frame: string; readonly country: string; readonly number: string }> = {
  roomy: { frame: "rounded-2xl", country: "gap-2 rounded-l-2xl pl-4 pr-3", number: "px-4 py-3" },
  compact: {
    frame: "rounded-xl has-[[aria-invalid=true]]:border-accent-deep",
    country: "gap-1.5 rounded-l-xl pl-3 pr-2.5",
    number: "px-3 py-2.5",
  },
};

/**
 * A country code dropdown joined to a phone number input, styled as one field. The closed dropdown shows a compact
 * flag and dial code while its list shows full names with a filter box. The number takes digits and the characters
 * people group them with, and holds the form back while its digit count cannot fit the chosen country, saying so once
 * the person leaves the field. The server validates both values again with libphonenumber.
 */
export function PhoneField(props: PhoneFieldProps): ReactElement {
  const known = props.countries.some((option) => option.code === props.country);
  const startCountry = known ? props.country : props.defaultCountry;
  // React resets the form after an action settles, and a select only honours defaultValue on mount, so a new
  // starting country remounts the control with it.
  return <PhoneFieldControl key={startCountry} {...props} startCountry={startCountry} />;
}

function PhoneFieldControl({
  id,
  countries,
  startCountry,
  number,
  size,
  required = false,
  disabled = false,
  numberStatus,
  countryStatus,
  className,
  numberName = "phone",
  countryName = PHONE_COUNTRY_FIELD,
  onChange,
}: PhoneFieldProps & { readonly startCountry: string }): ReactElement {
  const [selected, setSelected] = useState(startCountry);
  const [entry, setEntry] = useState(number);
  const [touched, setTouched] = useState(false);
  const numberRef = useRef<HTMLInputElement>(null);
  const byCode = useMemo(() => new Map(countries.map((option) => [option.code, option])), [countries]);
  const options = useMemo(
    () => countries.map((country) => ({ value: country.code, label: `${country.flag} ${country.name} (${country.dialCode})` })),
    [countries],
  );
  const option = byCode.get(selected);
  const sizing = SIZES[size];
  const messageId = `${id}-length`;
  const lengthMessage = option === undefined ? null : phoneDigitsMessage(entry, option.digits);
  const showMessage = touched && lengthMessage !== null;

  // Holds the form back while the digit count cannot be a number of the chosen country. The server checks fully.
  useEffect(() => {
    numberRef.current?.setCustomValidity(lengthMessage ?? "");
  }, [lengthMessage]);

  // A form reset returns the number to where it started, as it would an uncontrolled input.
  useEffect(() => {
    const form = numberRef.current?.form;
    if (form === null || form === undefined) return;
    const restore = (): void => {
      setEntry(number);
      setTouched(false);
    };
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, [number]);

  const describedBy = [numberStatus["aria-describedby"], showMessage ? messageId : undefined].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <div
        className={cn(
          "flex items-stretch border border-ink-soft/65 bg-paper text-base text-ink transition-colors duration-300 ease-calm focus-within:border-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-highlight-deep",
          sizing.frame,
          showMessage && "border-accent-deep",
        )}
      >
        <SelectField
          id={`${id}-country`}
          name={countryName}
          options={options}
          value={selected}
          onChange={(code) => {
            setSelected(code);
            onChange?.({ country: code, number: entry });
          }}
          required={required}
          disabled={disabled}
          aria-label="Country code"
          aria-invalid={countryStatus["aria-invalid"]}
          aria-describedby={countryStatus["aria-describedby"]}
          renderValue={() => (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden="true">{option?.flag}</span>
              <span className="tabular-nums">{option?.dialCode}</span>
            </span>
          )}
          wrapperClassName="flex shrink-0 border-r border-line"
          className={cn(
            "h-full cursor-pointer bg-transparent transition-colors duration-300 ease-calm hover:bg-paper-deep focus-visible:bg-paper-deep focus-visible:outline-none",
            sizing.country,
          )}
        />
        <RuleInput
          ref={numberRef}
          rule="phone"
          id={id}
          name={numberName}
          type="tel"
          autoComplete="tel-national"
          required={required}
          readOnly={disabled}
          maxLength={MAX_PHONE_LENGTH}
          placeholder={option?.example ?? undefined}
          value={entry}
          onChange={(event) => {
            const typed = event.currentTarget.value;
            setEntry(typed);
            onChange?.({ country: selected, number: typed });
          }}
          onBlur={() => setTouched(true)}
          className={cn(
            "block w-full min-w-0 flex-1 bg-transparent tabular-nums placeholder:text-ink-soft/80 focus-visible:outline-none",
            sizing.number,
          )}
          aria-invalid={numberStatus["aria-invalid"] ?? (showMessage || undefined)}
          aria-describedby={describedBy === "" ? undefined : describedBy}
        />
      </div>
      {showMessage ? (
        <p id={messageId} className="mt-1.5 text-sm text-accent-deep">
          {lengthMessage}
        </p>
      ) : null}
    </div>
  );
}
