"use client";

import { Input, Select, Textarea } from "@/ui";
import { saveSetupItem } from "../actions";
import type { SetupField } from "../setup-rules";
import { FormField, ItemForm } from "./item-form";

export interface SetupFormProps {
  readonly itemKey: "accounts" | "budget" | "areas";
  readonly title: string;
  readonly fields: readonly SetupField[];
  /** Starting values by field name, "" when nothing is saved. */
  readonly values: Readonly<Record<string, string>>;
  /** Set for someone who may look but not change (a viewer): the answers show, nothing saves. */
  readonly readOnlyReason: string | null;
}

/** One Social & Ads or Local SEO + AEO answer, drawn from the item's field list. We never ask for a password. */
export function SetupForm({ itemKey, title, fields, values, readOnlyReason }: SetupFormProps) {
  return (
    <ItemForm title={title} action={saveSetupItem} readOnly={readOnlyReason !== null} {...(readOnlyReason === null ? {} : { readOnlyReason })}>
      <input type="hidden" name="key" value={itemKey} />
      {fields.map((field) => (
        <FormField key={field.name} name={field.name} label={field.label} {...(field.hint === undefined ? {} : { hint: field.hint })} nativeLabel={field.kind !== "select"}>
          {field.kind === "textarea" ? (
            <Textarea name={field.name} defaultValue={values[field.name] ?? ""} {...(field.placeholder === undefined ? {} : { placeholder: field.placeholder })} />
          ) : field.kind === "select" ? (
            <Select name={field.name} options={field.options ?? []} defaultValue={values[field.name] || "not_yet"} />
          ) : (
            <Input
              name={field.name}
              defaultValue={values[field.name] ?? ""}
              {...(field.inputMode === undefined ? {} : { inputMode: field.inputMode })}
              {...(field.placeholder === undefined ? {} : { placeholder: field.placeholder })}
            />
          )}
        </FormField>
      ))}
    </ItemForm>
  );
}
