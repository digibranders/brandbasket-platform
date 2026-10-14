import Link from "next/link";
import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ReactElement, ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * One button, two sizes, three weights of emphasis.
 *
 * Before this existed every call to action was a hand-typed class string, and the dashboard had grown seven
 * different primary buttons — five paddings across four font sizes, some uppercase-tracked and some not. A button
 * that means the same thing should look the same everywhere, so the only choices left here are how big it is and
 * how much it wants to be pressed.
 */
export type ButtonSize = "sm" | "md";
export type ButtonVariant = "primary" | "secondary" | "quiet";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2.5 rounded-full font-semibold transition-colors duration-300 ease-calm cursor-pointer disabled:cursor-not-allowed disabled:opacity-55";

const SIZES: Readonly<Record<ButtonSize, string>> = {
  sm: "px-5 py-2.5 text-sm",
  md: "px-7 py-3.5 text-sm",
};

/** `quiet` carries no fill, so it needs its own padding-free footprint to sit inline with text. */
const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-ink text-paper hover:bg-accent-deep",
  secondary: "border border-line bg-card text-ink hover:bg-paper-deep",
  quiet: "text-ink-soft hover:text-ink",
};

function buttonClass(size: ButtonSize, variant: ButtonVariant, className?: string): string {
  return cn(BASE, SIZES[size], VARIANTS[variant], className);
}

interface ButtonOwnProps {
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}

type ButtonProps = ButtonOwnProps & Omit<ComponentPropsWithRef<"button">, "className" | "children"> & {
  readonly className?: string;
};

export function Button({ size = "md", variant = "primary", className, children, ...rest }: ButtonProps): ReactElement {
  return (
    <button {...rest} className={buttonClass(size, variant, className)}>
      {children}
    </button>
  );
}

type ButtonLinkProps = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children"> & { readonly className?: string };

/** The same button as a Next link, for a control that navigates rather than submits. */
export function ButtonLink({
  size = "md",
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonLinkProps): ReactElement {
  return (
    <Link {...rest} className={buttonClass(size, variant, className)}>
      {children}
    </Link>
  );
}

type ExternalButtonLinkProps = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<"a">, "className" | "children"> & { readonly className?: string };

/** For an address outside the app — a preview, the live site — where Next's client router must not take over. */
export function ExternalButtonLink({
  size = "md",
  variant = "primary",
  className,
  children,
  ...rest
}: ExternalButtonLinkProps): ReactElement {
  return (
    <a {...rest} className={buttonClass(size, variant, className)}>
      {children}
    </a>
  );
}
