"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";
import { Tooltip } from "./tooltip";

export interface IconButtonProps extends Omit<ComponentPropsWithRef<"button">, "children" | "aria-label"> {
  readonly icon: IconName;
  /** The accessible name, required: an icon alone says nothing to a screen reader. */
  readonly label: string;
  /** Shows the label as a tooltip on hover and focus. On by default (plan 60, section 7). */
  readonly tooltip?: boolean;
}

export function IconButton({ icon, label, tooltip = true, className, type = "button", ...rest }: IconButtonProps) {
  const button = (
    <BaseButton
      {...rest}
      type={type}
      aria-label={label}
      className={cx(
        "inline-flex size-icon-button items-center justify-center rounded-control text-ink-3 transition-colors duration-100 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:cursor-not-allowed data-disabled:text-ink-disabled data-disabled:hover:bg-transparent",
        className,
      )}
    >
      <Icon name={icon} />
    </BaseButton>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
