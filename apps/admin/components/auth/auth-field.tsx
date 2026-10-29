"use client";

import { useState, type ReactElement } from "react";
import { Eye, EyeSlash, EnvelopeSimple, LockKey } from "@phosphor-icons/react";

interface AuthFieldProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly type: "email" | "password";
  readonly autoComplete: string;
  readonly errorId?: string;
  readonly hintId?: string;
  readonly defaultValue?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pending?: boolean;
}

export function AuthField({ id, name, label, type, autoComplete, errorId, hintId, defaultValue, minLength, maxLength, pending }: AuthFieldProps): ReactElement {
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input-wrap">
        {type === "email" ? <EnvelopeSimple size={20} aria-hidden="true" /> : <LockKey size={20} aria-hidden="true" />}
        <input
          id={id} name={name} type={type === "password" && revealed ? "text" : type}
          autoComplete={autoComplete} required readOnly={pending}
          spellCheck={false} autoCapitalize="none" value={value} onChange={(event) => setValue(event.target.value)}
          minLength={minLength} maxLength={maxLength}
          placeholder={type === "email" ? "you@brandbasket.in" : autoComplete === "new-password" ? "Create a strong password" : "Enter your password"}
          aria-invalid={errorId === undefined ? undefined : true} aria-describedby={describedBy}
          className={type === "password" ? "auth-password-input" : undefined}
        />
        {type === "password" ? (
          <button type="button" onClick={() => setRevealed((value) => !value)} aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={revealed} className="auth-reveal">
            {revealed ? <EyeSlash size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
