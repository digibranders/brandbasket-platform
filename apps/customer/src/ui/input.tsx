"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentPropsWithRef } from "react";
import { CONTROL, controlWidth } from "./control-styles";
import { cx } from "./cx";

export type InputProps = Omit<ComponentPropsWithRef<typeof BaseInput>, "className"> & { readonly className?: string };

/** A text input. Inside a Field it takes the label, hint and error from it. */
/** Inputs whose browser picker should open on a click anywhere in the box, not only on its small icon. */
const PICKER_TYPES: ReadonlySet<string> = new Set(["time", "date", "datetime-local", "month", "week"]);

export function Input({ className, onClick, ...rest }: InputProps) {
  return (
    <BaseInput
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        const input = event.currentTarget;
        if (event.defaultPrevented || input.disabled || input.readOnly || !PICKER_TYPES.has(input.type)) return;
        try {
          input.showPicker();
        } catch {
          // Some browsers refuse outside a direct click or in a frame; the field still works by typing.
        }
      }}
      className={cx(CONTROL, controlWidth(className), "h-control px-3", className)}
    />
  );
}
