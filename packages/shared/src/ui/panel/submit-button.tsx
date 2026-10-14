"use client";

import { useRef, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useFormComplete } from "../forms/submit-gate";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

type SubmitButtonProps = Omit<ComponentPropsWithoutRef<"button">, "type" | "children" | "className"> & {
  readonly children: ReactNode;
  /** Shown in place of the label while the action runs. Defaults to the label, so a caller can ignore it. */
  readonly pendingLabel?: ReactNode;
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
  readonly className?: string;
};

/**
 * A submit button that knows its own form is running, and that its form is not yet complete.
 *
 * Half the dashboard's forms had no pending state at all, which meant they could be submitted twice with nothing
 * on screen to say the first press had landed. `useFormStatus` reads the enclosing form, so this has to be a child
 * of the `<form>` rather than the component that renders it. It also stays disabled until every required field is
 * filled with a value of the right shape (see useFormComplete); a `formNoValidate` button is never held back.
 */
export function SubmitButton({
  children,
  pendingLabel,
  size,
  variant,
  className,
  disabled = false,
  formNoValidate = false,
  ...rest
}: SubmitButtonProps): ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();
  const complete = useFormComplete(ref, !formNoValidate);
  return (
    <Button
      {...rest}
      ref={ref}
      type="submit"
      size={size}
      variant={variant}
      className={className}
      formNoValidate={formNoValidate}
      disabled={disabled || pending || !complete}
      aria-busy={pending}
    >
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
