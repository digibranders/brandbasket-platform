"use client";

import type { ReactElement } from "react";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, type SupportCategory } from "@brandbasket/shared/lib/support";
import { cn } from "@brandbasket/shared/lib/cn";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";

export interface SupportCategorySelectProps {
  readonly id: string;
  readonly value: SupportCategory | "";
  readonly onChange: (value: SupportCategory) => void;
  readonly disabled?: boolean;
  readonly hasError?: boolean;
  /** The server refuses a request with no category. */
  readonly required?: boolean;
  /** Id of the element that explains an error on this control. */
  readonly describedBy?: string;
}

const CATEGORY_OPTIONS: readonly SelectOption[] = SUPPORT_CATEGORIES.map((category) => ({
  value: category,
  label: SUPPORT_CATEGORY_LABELS[category],
}));

function isSupportCategory(value: string): value is SupportCategory {
  return SUPPORT_CATEGORIES.some((category) => category === value);
}

/** The category dropdown of the support request form: the shared SelectField with the form's field styling. */
export function SupportCategorySelect({
  id,
  value,
  onChange,
  disabled = false,
  hasError = false,
  required = false,
  describedBy,
}: SupportCategorySelectProps): ReactElement {
  return (
    <SelectField
      id={id}
      name="category"
      options={CATEGORY_OPTIONS}
      value={value}
      onChange={(next) => {
        if (isSupportCategory(next)) onChange(next);
      }}
      placeholder="Choose a category"
      required={required}
      disabled={disabled}
      aria-invalid={hasError || undefined}
      aria-describedby={describedBy}
      wrapperClassName="mt-1.5"
      className={cn(
        "w-full rounded-control border bg-paper px-3 py-2.5 text-sm text-ink transition-colors duration-200 ease-calm focus:outline-none",
        hasError
          ? "border-accent-deep ring-1 ring-accent-deep"
          : "border-ink-soft/65 hover:border-ink-soft focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    />
  );
}
