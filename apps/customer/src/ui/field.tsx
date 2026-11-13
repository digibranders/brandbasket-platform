"use client";

import { Field as BaseField } from "@base-ui/react/field";
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

export interface FieldProps {
  /** Always visible, above the control. A placeholder is never the label. */
  readonly label: ReactNode;
  /** The form field's name, matching an action's fieldErrors key. */
  readonly name?: string;
  /** Helper text below the control, such as where the value appears. */
  readonly hint?: ReactNode;
  /** The error below the hint. Sets aria-invalid on the control. */
  readonly error?: string;
  readonly disabled?: boolean;
  /**
   * False when the control is a button (Select, Combobox trigger): the label then names it without behaving like a
   * native label.
   */
  readonly nativeLabel?: boolean;
  readonly className?: string;
  /** One control: Input, Textarea, Select, Combobox or PhoneInput. */
  readonly children: ReactNode;
}

/** Label above, control, hint below, error below the hint (plan 60, section 14). */
export function Field({ label, name, hint, error, disabled, nativeLabel = true, className, children }: FieldProps) {
  const root = useRef<HTMLDivElement>(null);
  const hadError = useRef(error !== undefined);
  // Focus moves to the first error when a submit comes back with errors (plan 60, section 14). Only the field holding
  // the form's first invalid control acts, and never while focus already sits on an invalid control.
  useEffect(() => {
    const appeared = error !== undefined && !hadError.current;
    hadError.current = error !== undefined;
    if (!appeared || root.current === null) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.getAttribute("aria-invalid") === "true") return;
    const scope = root.current.closest("form") ?? root.current.parentElement;
    const first = scope?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (first !== null && first !== undefined && root.current.contains(first)) first.focus();
  }, [error]);

  return (
    <BaseField.Root ref={root} name={name} invalid={error !== undefined} disabled={disabled} className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <BaseField.Label nativeLabel={nativeLabel} render={nativeLabel ? undefined : <div />} className="w-fit type-sub text-ink">
        {label}
      </BaseField.Label>
      {children}
      {hint === undefined ? null : <BaseField.Description className="type-meta">{hint}</BaseField.Description>}
      {error === undefined ? null : (
        <BaseField.Error match className="flex items-center gap-1.5 type-meta text-neg-text">
          <Icon name="WarningCircle" size="sm" />
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}
