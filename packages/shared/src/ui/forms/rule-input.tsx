"use client";

import type { ChangeEvent, ComponentPropsWithRef, HTMLAttributes, ReactElement } from "react";
import { applyInputRule, caretAfterRule, type InputRule } from "../../lib/forms/input-rules";

type InputMode = NonNullable<HTMLAttributes<HTMLInputElement>["inputMode"]>;

/** The on-screen keyboard each rule needs: a number pad for digits, a phone pad for phones. */
const KEYBOARDS: Readonly<Record<InputRule, InputMode>> = {
  digits: "numeric",
  phone: "tel",
  amount: "decimal",
  personName: "text",
  code: "text",
};

/** Input types that report a caret. Setting one on an email or number input throws. */
const CARET_TYPES = new Set(["text", "search", "tel", "url", "password"]);

type RuleInputProps = Omit<ComponentPropsWithRef<"input">, "type"> & {
  /** What the field accepts as it is typed or pasted. */
  readonly rule: InputRule;
  readonly type?: "text" | "search" | "tel" | "url" | "password";
};

/**
 * A text input that drops characters its rule does not allow (a letter in a phone number, a space in a GSTIN) as they
 * are typed or pasted, and keeps the caret in place. Works controlled or not: the value is filtered before the
 * caller's onChange reads it. The rule is a plain name, so a server component can render this too.
 */
export function RuleInput({ rule, type = "text", inputMode, onChange, autoCapitalize, ...rest }: RuleInputProps): ReactElement {
  function filter(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const typed = input.value;
    const allowed = applyInputRule(rule, typed);
    if (allowed !== typed) {
      const caret = caretAfterRule(rule, typed, input.selectionStart ?? typed.length);
      input.value = allowed;
      if (CARET_TYPES.has(input.type)) input.setSelectionRange(caret, caret);
    }
    onChange?.(event);
  }

  return (
    <input
      {...rest}
      type={type}
      inputMode={inputMode ?? KEYBOARDS[rule]}
      autoCapitalize={autoCapitalize ?? (rule === "code" ? "characters" : undefined)}
      onChange={filter}
    />
  );
}
