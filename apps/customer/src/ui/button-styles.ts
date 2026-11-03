import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control border type-button no-underline transition-[background-color,border-color,box-shadow,transform] duration-100 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:cursor-not-allowed data-disabled:active:translate-y-0";

const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  primary: "border-primary bg-primary text-on-primary shadow-primary hover:border-primary-hover hover:bg-primary-hover",
  secondary: "border-border-button bg-surface text-ink shadow-button hover:border-border-button-hover hover:bg-surface-hover",
  ghost: "border-transparent bg-transparent text-ink-2 hover:bg-surface-hover",
  danger: "border-neg-border bg-surface text-neg-text hover:bg-neg-wash",
};

// Disabled looks the same for every variant (mock: .btn:disabled), except a pending button, which keeps its look.
const DISABLED = "data-disabled:border-border data-disabled:bg-surface-disabled data-disabled:text-ink-disabled data-disabled:shadow-none";

const SIZES: Readonly<Record<ButtonSize, string>> = {
  sm: "h-control-sm px-2.5",
  md: "h-control px-3.5",
  lg: "h-control-lg px-4",
};

/** The classes of a button, for the Button and LinkButton primitives only. */
export function buttonClasses(variant: ButtonVariant, size: ButtonSize, options: { readonly pending?: boolean } = {}): string {
  return cx(BASE, VARIANTS[variant], SIZES[size], options.pending === true ? "cursor-progress" : DISABLED);
}
