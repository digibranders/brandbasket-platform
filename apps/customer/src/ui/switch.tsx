"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface SwitchProps {
  /** Names the switch. Shown beside it unless hideLabel, when it is read by screen readers only. */
  readonly label: ReactNode;
  readonly hideLabel?: boolean;
  readonly name?: string;
  readonly checked?: boolean;
  readonly defaultChecked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** An on or off setting that applies at once: 40 by 24. */
export function Switch({ label, hideLabel = false, name, checked, defaultChecked, onCheckedChange, disabled, className }: SwitchProps) {
  return (
    <label className={cx("inline-flex min-h-control items-center gap-2.5 type-body text-ink", disabled && "text-ink-disabled", className)}>
      <BaseSwitch.Root
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(next) => onCheckedChange?.(next)}
        disabled={disabled}
        className="relative flex h-6 w-10 shrink-0 items-center rounded-full bg-border-control px-[3px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:bg-primary data-disabled:bg-surface-disabled"
      >
        <BaseSwitch.Thumb className="size-4.5 rounded-full bg-surface transition-transform duration-100 data-checked:translate-x-4" />
      </BaseSwitch.Root>
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
    </label>
  );
}
