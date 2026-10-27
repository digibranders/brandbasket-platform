"use client";

import { CaretLeft, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { cn } from "@brandbasket/shared/lib/cn";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import type { InputRule } from "@brandbasket/shared/lib/forms/input-rules";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { DARK_BUTTON_SHAPE, SOFT_BUTTON } from "@/components/v2/classes";
import { onboardingStepHref, stepBefore, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import { echoedValue, initialStepFormState, type StepFormState } from "@/lib/onboarding/form-state";

export type StepAction = (state: StepFormState, formData: FormData) => Promise<StepFormState>;

export const STEP_FIELD_CLASSES =
  "mt-1.5 block w-full rounded-control border border-ink-2/65 bg-surface px-3.5 py-2.5 text-base text-ink transition-colors duration-200 placeholder:text-ink-2/80 focus:border-ink aria-[invalid=true]:border-error md:text-sm";

/** The same field a size down (less padding, smaller type), for a side matter beside something larger. */
export const STEP_FIELD_COMPACT_CLASSES =
  "mt-1.5 block w-full rounded-control border border-ink-2/65 bg-surface px-3 py-1.5 text-base text-ink transition-colors duration-200 placeholder:text-ink-2/80 focus:border-ink aria-[invalid=true]:border-error md:text-[0.8125rem]";

/** A field's label, and the line of help under it. */
export const STEP_LABEL_CLASSES = "block text-[0.8125rem] font-semibold text-ink";
export const STEP_HINT_CLASSES = "mt-0.5 text-[0.8125rem] leading-relaxed text-ink-2";

/** The padding of a step's fields inside the card, above its sticky footer. */
export const STEP_BODY_CLASSES = "grid gap-6 px-5 py-6 md:px-8 md:py-7";

/** The asterisk after a required field's label, in the accent so it is easy to find. */
export function Required(): ReactElement {
  return <RequiredMark className="text-rattan-ink" />;
}

/** A group of fields inside a step's card: a title, then the fields, with a hairline between one group and the next. */
export function StepGroup({ title, hint, children }: { readonly title: string; readonly hint?: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <div className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <fieldset className="grid min-w-0 gap-5">
        <legend className="mb-4 p-0 font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{title}</legend>
        {hint === undefined ? null : <p className="-mt-1 text-[0.8125rem] leading-relaxed text-ink-2">{hint}</p>}
        {children}
      </fieldset>
    </div>
  );
}

/** The server accepts a link only when it starts with https:// and has something after it (any letter case). */
export const HTTPS_LINK_PATTERN = "[Hh][Tt][Tt][Pp][Ss]://\\S.*";

export const HTTPS_LINK_TITLE = "A full link starting https://";

export type FieldStatus = { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string };

/** What the fields of a step form render from. Holds no refs, so it can be handed to child components. */
export interface StepFormControls {
  readonly errorId: string;
  /** The form draws a refused field's message under the field (InlineError); otherwise StepFormError shows it. */
  readonly inline: boolean;
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
export function useStepForm(action: StepAction, { inline = false }: { readonly inline?: boolean } = {}): StepForm {
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
      inline,
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

/** The message of a refused save, drawn under the field it is about (see InlineError); StepFormError steps aside while one is on show. */
export function InlineError({ controls, match }: { readonly controls: StepFormControls; readonly match: string | RegExp }): ReactElement | null {
  const { errorMessage, invalidField, inline } = controls;
  if (!inline || errorMessage === null || invalidField === null) return null;
  if (typeof match === "string" ? match !== invalidField : !match.test(invalidField)) return null;
  return (
    <p data-inline-error="" role="alert" className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] font-semibold leading-snug text-error">
      <WarningCircle size={16} weight="fill" aria-hidden="true" className="mt-px shrink-0" />
      <span>{errorMessage}</span>
    </p>
  );
}

/**
 * The message for the form as a whole, or for a field that has no place of its own to show it. A form with the
 * `group/step` class hides it while an InlineError is on show; the field still points at it (aria-describedby), and a
 * hidden element can be a description, so the message is read once, by the alert under the field.
 */
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
      className="flex items-start gap-2 rounded-lg bg-sunken px-4 py-3 text-sm font-semibold text-error outline-none group-has-[[data-inline-error]]/step:hidden"
    >
      <WarningCircle size={18} weight="fill" aria-hidden="true" className="mt-px shrink-0" />
      <p>
        {errorMessage}
        {fixHref === undefined ? null : (
          <>
            {" "}
            <Link href={fixHref} className="font-semibold text-ink underline underline-offset-4">
              Go to that step
            </Link>
          </>
        )}
      </p>
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
  /** A soft fill instead of the dark button, for a second form on a screen that already has its one dark button. */
  readonly soft?: boolean;
}

/**
 * The step's submit button. It stays disabled until the form's required fields hold valid values (see
 * SubmitButton), while the action runs, and for any reason the step passes in `disabled`.
 */
export function StepSubmit({ controls, label, pendingLabel, children, disabled = false, soft = false }: StepSubmitProps): ReactElement {
  return (
    <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center">
      <SubmitButton disabled={disabled || controls.isPending} pendingLabel={pendingLabel} className={cn(DARK_BUTTON_SHAPE, soft && "bg-sunken! text-ink! hover:bg-line!", "w-full sm:w-auto")}>
        {label}
      </SubmitButton>
      {children}
    </div>
  );
}

interface StepFooterProps {
  readonly controls: StepFormControls;
  readonly label: string;
  readonly pendingLabel: string;
  /** The step this footer closes: Back goes to the one before it, and the first step has no Back. */
  readonly step: OnboardingStepKey;
  /** A short line between the buttons, hidden on a phone. */
  readonly note?: string;
  /** A reason to hold the button back that the fields cannot express (a step that needs an upload first). */
  readonly disabled?: boolean;
}

/**
 * The bar at the foot of a step's card: Back on the left, the save button on the right, in view while the fields scroll.
 * It must sit inside the form, so the button knows when the form is complete and when it is running. On a phone it sits
 * above the tab bar.
 */
export function StepFooter({ controls, label, pendingLabel, step, note, disabled = false }: StepFooterProps): ReactElement {
  const previous = stepBefore(step);
  return (
    <div className="sticky bottom-[calc(2.875rem+max(0.5rem,env(safe-area-inset-bottom)))] z-10 flex items-center gap-3 rounded-b-lift border-t border-line bg-surface px-5 py-3 md:px-8 lg:bottom-0">
      {previous === null ? null : (
        <Link href={onboardingStepHref(previous)} className={cn(SOFT_BUTTON, "h-11! px-4!")}>
          <CaretLeft size={16} aria-hidden="true" />
          Back
        </Link>
      )}
      {note === undefined ? null : <p className="hidden min-w-0 flex-1 text-xs text-ink-2 sm:block">{note}</p>}
      <SubmitButton disabled={disabled || controls.isPending} pendingLabel={pendingLabel} className={cn(DARK_BUTTON_SHAPE, "ml-auto")}>
        {label}
      </SubmitButton>
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
      <label htmlFor={id} className={STEP_LABEL_CLASSES}>
        {label}
        {required ? <Required /> : null}
        {optional ? <span className="font-medium text-ink-2"> (optional)</span> : null}
      </label>
      {hint === undefined ? null : <p className={STEP_HINT_CLASSES}>{hint}</p>}
      {rule === undefined ? (
        <input {...shared} type={type} />
      ) : (
        <RuleInput {...shared} rule={rule} type={type === "email" ? "text" : type} />
      )}
      <InlineError controls={controls} match={name} />
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
      <label htmlFor={id} className={STEP_LABEL_CLASSES}>
        {label}
        {required ? <Required /> : <span className="font-medium text-ink-2"> (optional)</span>}
      </label>
      {hint === undefined ? null : <p className={STEP_HINT_CLASSES}>{hint}</p>}
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
      <InlineError controls={controls} match={name} />
    </div>
  );
}
