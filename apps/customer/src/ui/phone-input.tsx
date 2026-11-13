"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentPropsWithRef } from "react";
import { CONTROL } from "./control-styles";
import { cx } from "./cx";

export interface PhoneInputProps extends Omit<ComponentPropsWithRef<typeof BaseInput>, "type" | "className"> {
  /** The country code shown before the number. India by default. */
  readonly countryCode?: string;
  readonly className?: string;
}

/**
 * A phone number input in Indian format by default: the country code is shown, the keypad is numeric and the browser may
 * fill the number. The number is checked on the server by the action's schema with the shared phone rules
 * (@brandbasket/shared/lib/phone), never only here.
 */
export function PhoneInput({ countryCode = "+91", className, ...rest }: PhoneInputProps) {
  return (
    <div className={cx("relative", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center type-body text-ink-3">
        {countryCode}
      </span>
      <BaseInput {...rest} type="tel" inputMode="tel" autoComplete={rest.autoComplete ?? "tel-national"} className={cx(CONTROL, "w-full h-control pr-3 pl-12")} />
    </div>
  );
}
