"use client";

import Link from "next/link";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import type { InputRule } from "@fynix/shared/lib/forms/input-rules";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { echoedValue, initialStepFormState, type StepFormState } from "@/lib/onboarding/form-state";

export type StepAction = (state: StepFormState, formData: FormData) => Promise<StepFormState>;

export const STEP_FIELD_CLASSES =
  "mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-base text-ink tabular-nums transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent aria-[invalid=true]:border-accent-deep";

/** The same field a size down (less padding, smaller type), for a side matter beside something larger. */
export const STEP_FIELD_COMPACT_CLASSES =
  "mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-1.5 text-[0.9375rem] text-ink tabular-nums transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent aria-[invalid=true]:border-accent-deep";

/** The server accepts a link only when it starts with https:// and has something after it (any letter case). */
export const HTTPS_LINK_PATTERN = "[Hh][Tt][Tt][Pp][Ss]://\\S.*";

export const HTTPS_LINK_TITLE = "A full link starting https://";

export type FieldStatus = { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string };

/** What the fields of a step form render from. Holds no refs, so it can be handed to child components. */
export interface StepFormControls {
  readonly errorId: string;
  readonly state: StepFormState;
  readonly isPending: boolean;
  /** The message to show now: hidden while a new attempt is being sent. */
  readonly errorMessage: string | null;
  /** The field the shown message is about, or null. */
  readonly invalidField: string | null;
  readonly fieldStatus: (name: string) => FieldStatus;
  /** What an input should start with: what was typed if a save was refused, otherwise what is saved. */
  readonly valueOf: (name: string, saved: string | null) => string;
}

export interface StepForm {
  readonly formRef: RefObject<HTMLFormElement | null>;
  readonly errorRef: RefObject<HTMLDivElement | null>;
  readonly formAction: (formData: FormData) => void;
  readonly controls: StepFormControls;
}

/**
 * The server-action form pattern every onboarding step shares, after get-started-flow: values echoed back on
 * error, the failing field focused and marked, and the message announced.
 */
export function useStepForm(action: StepAction): StepForm {
  const [state, formAction, isPending] = useActionState(action, initialStepFormState);
  const errorId = `step-form-error-${useId()}`;
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The submit button is disabled while the action runs, so focus has to be placed deliberately afterwards.
  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else errorRef.current?.focus();
  }, [state]);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const invalidField = errorMessage !== null && state.status === "error" ? state.field : null;

  return {
    formRef,
    errorRef,
    formAction,
    controls: {
      errorId,
      state,
      isPending,
      errorMessage,
      invalidField,
      fieldStatus: (name) =>
        invalidField === name ? { "aria-invalid": true, "aria-describedby": errorId } : {},
      valueOf: (name, saved) => echoedValue(state, name, saved),
    },
  };
}

interface StepFormErrorProps {
  readonly controls: StepFormControls;
  readonly errorRef: RefObject<HTMLDivElement | null>;
}

export function StepFormError({ controls, errorRef }: StepFormErrorProps): ReactElement | null {
  const { errorMessage, state } = controls;
  if (errorMessage === null) return null;
  const fixHref = state.status === "error" ? state.fixHref : undefined;
  return (
    <div
      ref={errorRef}
      id={controls.errorId}
      role="alert"
      tabIndex={-1}
      className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep outline-none"
    >
      {errorMessage}
      {fixHref === undefined ? null : (
        <>
          {" "}
          <Link href={fixHref} className="link-underline font-medium">
            Go to that step
          </Link>
        </>
      )}
    </div>
  );
}

interface StepSubmitProps {
  readonly controls: StepFormControls;
  readonly label: string;
  readonly pendingLabel: string;
  readonly children?: ReactNode;
  /** A reason to hold the button back that the fields cannot express (a step that needs an upload first). */
  readonly disabled?: boolean;
}

/**
 * The step's submit button. It stays disabled until the form's required fields hold valid values (see
 * SubmitButton), while the action runs, and for any reason the step passes in `disabled`.
 */
export function StepSubmit({ controls, label, pendingLabel, children, disabled = false }: StepSubmitProps): ReactElement {
  return (
    <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center">
      <SubmitButton disabled={disabled || controls.isPending} pendingLabel={pendingLabel} className="w-full sm:w-auto">
        {label}
      </SubmitButton>
      {children}
    </div>
  );
}

interface TextFieldProps {
  readonly controls: StepFormControls;
  readonly name: string;
  readonly label: ReactNode;
  readonly saved: string | null;
  readonly maxLength: number;
  readonly type?: "text" | "email" | "tel" | "url";
  readonly autoComplete?: string;
  readonly placeholder?: string;
  readonly hint?: ReactNode;
  readonly optional?: boolean;
  readonly className?: string;
  /** The server refuses a blank value: shows the asterisk and holds the submit button back until it is filled. */
  readonly required?: boolean;
  /** Characters the field accepts as they are typed (digits only, letters only). */
  readonly rule?: InputRule;
  /** What a finished value looks like; pair it with a `title` that says so in plain words. */
  readonly pattern?: string;
  readonly title?: string;
  readonly minLength?: number;
  readonly inputMode?: "text" | "numeric" | "decimal" | "tel" | "url" | "email" | "search";
  readonly autoCapitalize?: "none" | "sentences" | "words" | "characters";
  readonly spellCheck?: boolean;
}

export function StepTextField({
  controls,
  name,
  label,
  saved,
  maxLength,
  type = "text",
  autoComplete,
  placeholder,
  hint,
  optional = false,
  className,
  required = false,
  rule,
  pattern,
  title,
  minLength,
  inputMode,
  autoCapitalize,
  spellCheck,
}: TextFieldProps): ReactElement {
  const id = `${controls.errorId}-field-${name}`;
  const isAddress = type === "email" || type === "url";
  const shared = {
    id,
    name,
    maxLength,
    minLength,
    autoComplete,
    placeholder,
    required,
    pattern,
    title,
    inputMode,
    spellCheck: spellCheck ?? (isAddress ? false : undefined),
    autoCapitalize: autoCapitalize ?? (isAddress ? "none" : undefined),
    defaultValue: controls.valueOf(name, saved),
    className: STEP_FIELD_CLASSES,
    ...controls.fieldStatus(name),
  } as const;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? <RequiredMark /> : null}
        {optional ? <span className="font-normal text-ink-soft"> (optional)</span> : null}
      </label>
      {hint === undefined ? null : <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}
      {rule === undefined ? (
        <input {...shared} type={type} />
      ) : (
        <RuleInput {...shared} rule={rule} type={type === "email" ? "text" : type} />
      )}
    </div>
  );
}

interface TextAreaProps {
  readonly controls: StepFormControls;
  readonly name: string;
  readonly label: ReactNode;
  readonly saved: string | null;
  readonly maxLength: number;
  readonly rows?: number;
  readonly placeholder?: string;
  readonly hint?: ReactNode;
  /** The server refuses a blank value: shows the asterisk in place of "(optional)" and gates the submit button. */
  readonly required?: boolean;
}

export function StepTextArea({
  controls,
  name,
  label,
  saved,
  maxLength,
  rows = 4,
  placeholder,
  hint,
  required = false,
}: TextAreaProps): ReactElement {
  const id = `${controls.errorId}-field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? <RequiredMark /> : <span className="font-normal text-ink-soft"> (optional)</span>}
      </label>
      {hint === undefined ? null : <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}
      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        defaultValue={controls.valueOf(name, saved)}
        className={STEP_FIELD_CLASSES}
        {...controls.fieldStatus(name)}
      />
    </div>
  );
}
