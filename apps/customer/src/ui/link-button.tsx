import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-styles";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

export interface LinkButtonProps extends Omit<ComponentProps<typeof Link>, "children"> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: IconName;
  readonly children: ReactNode;
}

/** A link styled as a button: for navigation, never for an action. */
export function LinkButton({ variant = "secondary", size = "md", icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link {...rest} className={cx(buttonClasses(variant, size), className)}>
      {icon === undefined ? null : <Icon name={icon} size="sm" />}
      {children}
    </Link>
  );
}
