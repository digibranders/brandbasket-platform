"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

export interface CheckboxProps {
  /** Visible text beside the box; it names the checkbox. */
  readonly label: ReactNode;
  readonly name?: string;
  readonly value?: string;
  readonly checked?: boolean;
  readonly defaultChecked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly className?: string;
}

/** An 18px checkbox with its label; the whole row is the target. */
export function Checkbox({ label, name, value, checked, defaultChecked, onCheckedChange, disabled, required, className }: CheckboxProps) {
  return (
    <label className={cx("flex min-h-control items-start gap-2.5 py-2 type-body text-ink md:py-0", disabled && "text-ink-disabled", className)}>
      <BaseCheckbox.Root
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(next) => onCheckedChange?.(next)}
        disabled={disabled}
        required={required}
        className="mt-px flex size-4.5 shrink-0 items-center justify-center rounded-badge border border-border-control bg-surface text-on-primary transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:border-primary data-checked:bg-primary data-disabled:border-border data-disabled:bg-surface-disabled"
      >
        <BaseCheckbox.Indicator className="flex data-unchecked:hidden">
          <Icon name="Check" size="sm" className="size-3.5" />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>{label}</span>
    </label>
  );
}
