"use client";

import type { HTMLInputAutoCompleteAttribute } from "react";
import { Field, Input, PhoneInput } from "@/ui";
import type { SectionForm } from "./use-section-form";

interface TextFieldProps {
  readonly form: SectionForm;
  readonly name: string;
  readonly label: string;
  readonly readOnly: boolean;
  readonly hint?: string;
  readonly type?: "text" | "email" | "date" | "time";
  readonly maxLength?: number;
  readonly autoComplete?: HTMLInputAutoCompleteAttribute;
  /** Spans both columns of a two-column grid. */
  readonly full?: boolean;
  /** Set for a phone number: the country code shown before it. */
  readonly dialCode?: string;
  readonly min?: string;
}

/** A labelled input bound to one value of a section form, with its hint and the server's message for it. */
export function TextField({ form, name, label, readOnly, hint, type = "text", maxLength, autoComplete, full = false, dialCode, min }: TextFieldProps) {
  const value = form.values[name] ?? "";
  const onChange = (event: { currentTarget: { value: string } }) => form.set(name, event.currentTarget.value);
  return (
    <Field label={label} name={name} hint={hint} error={form.errorOf(name)} disabled={readOnly} className={full ? "sm:col-span-2" : undefined}>
      {dialCode === undefined ? (
        <Input type={type} value={value} onChange={onChange} maxLength={maxLength} autoComplete={autoComplete} min={min} />
      ) : (
        <PhoneInput countryCode={dialCode} value={value} onChange={onChange} maxLength={maxLength} />
      )}
    </Field>
  );
}
