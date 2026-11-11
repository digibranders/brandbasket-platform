"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-styles";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

export interface ButtonProps extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** One per screen state (plan 60, principle 3). Default secondary. */
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Keeps the width and shows a spinner in the label's place; the button stays focusable but does nothing. */
  readonly pending?: boolean;
  readonly icon?: IconName;
  /** Fits one line, three words at most. */
  readonly children: ReactNode;
}

export function Button({ variant = "secondary", size = "md", pending = false, icon, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <BaseButton
      {...rest}
      type={type}
      disabled={disabled === true || pending}
      focusableWhenDisabled={pending}
      aria-busy={pending || undefined}
      className={cx(buttonClasses(variant, size, { pending }), className)}
    >
      <span className={cx("inline-flex items-center gap-1.5", pending && "invisible")}>
        {icon === undefined ? null : <Icon name={icon} size="sm" />}
        {children}
      </span>
      {pending ? <Icon name="SpinnerGap" size="sm" className="absolute animate-spin" /> : null}
    </BaseButton>
  );
}
