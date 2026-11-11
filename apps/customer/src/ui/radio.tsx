"use client";

import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface RadioGroupProps {
  readonly name?: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly disabled?: boolean;
  readonly required?: boolean;
  /** Names the group when no visible heading does; otherwise pass aria-labelledby. */
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly className?: string;
  /** Radio items, or RadioCard items. */
  readonly children: ReactNode;
}

/** One choice from a few. Arrow keys move between the options. */
export function RadioGroup({ name, value, defaultValue, onValueChange, disabled, required, className, children, ...aria }: RadioGroupProps) {
  return (
    <BaseRadioGroup
      {...aria}
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(String(next))}
      disabled={disabled}
      required={required}
      className={cx("flex flex-col gap-1", className)}
    >
      {children}
    </BaseRadioGroup>
  );
}

const DOT =
  "mt-px flex size-4.5 shrink-0 items-center justify-center rounded-full border border-border-control bg-surface transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:border-primary data-disabled:border-border data-disabled:bg-surface-disabled";

export interface RadioProps {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

/** An 18px radio with its label. Use inside RadioGroup. */
export function Radio({ value, label, disabled }: RadioProps) {
  return (
    <label className={cx("flex min-h-control items-start gap-2.5 py-2 type-body text-ink md:py-0", disabled && "text-ink-disabled")}>
      <BaseRadio.Root value={value} disabled={disabled} className={DOT}>
        <BaseRadio.Indicator className="size-2.5 rounded-full bg-primary data-unchecked:hidden" />
      </BaseRadio.Root>
      <span>{label}</span>
    </label>
  );
}

export interface RadioCardProps {
  readonly value: string;
  readonly label: ReactNode;
  /** One sentence on what choosing it means. */
  readonly description: ReactNode;
  readonly disabled?: boolean;
}

/** A choice with a sentence, such as the request type (plan 60, RadioCards). Use inside RadioGroup. */
export function RadioCard({ value, label, description, disabled }: RadioCardProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border bg-surface p-3 transition-colors duration-100 hover:bg-surface-hover has-data-checked:border-accent-border has-data-checked:bg-surface-selected has-data-disabled:cursor-not-allowed has-data-disabled:text-ink-disabled">
      <BaseRadio.Root value={value} disabled={disabled} className={DOT}>
        <BaseRadio.Indicator className="size-2.5 rounded-full bg-primary data-unchecked:hidden" />
      </BaseRadio.Root>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="type-sub">{label}</span>
        <span className="type-meta">{description}</span>
      </span>
    </label>
  );
}
