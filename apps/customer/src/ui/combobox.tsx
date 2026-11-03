"use client";

import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { CONTROL, OPTION, POPUP } from "./control-styles";
import { cx } from "./cx";
import { Icon } from "./icon";
import type { SelectOption } from "./select";

export interface ComboboxProps {
  readonly options: readonly SelectOption[];
  readonly value?: SelectOption | null;
  readonly defaultValue?: SelectOption | null;
  readonly onValueChange?: (value: SelectOption | null) => void;
  /** Submitted with the form under this name (the option's value). */
  readonly name?: string;
  readonly placeholder?: string;
  /** Said when nothing matches what was typed. */
  readonly emptyText: string;
  /** The accessible name of the button that opens the list. */
  readonly openLabel: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
}

/** A text input that filters a list of options. Use Select when there are fewer than about ten options. */
export function Combobox({ options, value, defaultValue, onValueChange, name, placeholder, emptyText, openLabel, disabled, id, className }: ComboboxProps) {
  return (
    <BaseCombobox.Root
      items={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next)}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      name={name}
      disabled={disabled}
    >
      <BaseCombobox.InputGroup className={cx("relative", className)}>
        <BaseCombobox.Input id={id} placeholder={placeholder} className={cx(CONTROL, "w-full h-control pr-10 pl-3")} />
        <BaseCombobox.Trigger
          aria-label={openLabel}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-3 outline-none focus-visible:text-ink"
        >
          <Icon name="CaretUpDown" size="sm" />
        </BaseCombobox.Trigger>
      </BaseCombobox.InputGroup>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner sideOffset={4} className="z-50">
          <BaseCombobox.Popup className={cx(POPUP, "w-(--anchor-width)")}>
            <BaseCombobox.Empty className="px-2.5 py-2 type-meta empty:hidden">{emptyText}</BaseCombobox.Empty>
            <BaseCombobox.List className="max-h-(--available-height) overflow-y-auto">
              {(option: SelectOption) => (
                <BaseCombobox.Item key={option.value} value={option} className={cx(OPTION, "pr-8")}>
                  <span className="flex-1">{option.label}</span>
                  <BaseCombobox.ItemIndicator className="text-accent-text">
                    <Icon name="Check" size="sm" />
                  </BaseCombobox.ItemIndicator>
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}
