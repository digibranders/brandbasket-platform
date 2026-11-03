"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { CONTROL, OPTION, POPUP, controlWidth } from "./control-styles";
import { cx } from "./cx";
import { Icon } from "./icon";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly options: readonly SelectOption[];
  readonly value?: string | null;
  readonly defaultValue?: string | null;
  readonly onValueChange?: (value: string | null) => void;
  /** Submitted with the form under this name. */
  readonly name?: string;
  /** Shown when nothing is chosen. Never the label: wrap the Select in a Field with nativeLabel={false}. */
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  /** Only when there is no Field label. */
  readonly "aria-label"?: string;
  readonly className?: string;
}

export function Select({ options, value, defaultValue, onValueChange, name, placeholder, disabled, required, className, ...aria }: SelectProps) {
  return (
    <BaseSelect.Root
      items={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next)}
      name={name}
      disabled={disabled}
      required={required}
    >
      <BaseSelect.Trigger
        aria-label={aria["aria-label"]}
        className={cx(CONTROL, controlWidth(className), "flex h-control items-center justify-between gap-2 pr-2 pl-3 text-left", className)}
      >
        <BaseSelect.Value placeholder={placeholder} className="truncate data-placeholder:text-ink-muted" />
        <BaseSelect.Icon className="text-ink-3">
          <Icon name="CaretUpDown" size="sm" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-50">
          <BaseSelect.Popup className={cx(POPUP, "min-w-(--anchor-width)")}>
            <BaseSelect.List className="max-h-(--available-height) overflow-y-auto">
              {options.map((option) => (
                <BaseSelect.Item key={option.value} value={option.value} className={cx(OPTION, "pr-8")}>
                  <BaseSelect.ItemText className="flex-1">{option.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="text-accent-text">
                    <Icon name="Check" size="sm" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
