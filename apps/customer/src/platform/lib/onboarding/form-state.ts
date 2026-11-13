/**
 * What an onboarding step's server action hands back to its form. A successful save redirects instead, so the
 * form only ever sees "idle" or an error. `values` echoes what was typed, so a refused save loses nothing.
 */
export type StepFormState =
  | { readonly status: "idle" }
  | {
      readonly status: "error";
      readonly message: string;
      /** The exact form field name the message is about, e.g. "hours.2.opens", or null for the whole form. */
      readonly field: string | null;
      readonly values: Readonly<Record<string, string>>;
      /** Where the customer can fix it, when that is another page. */
      readonly fixHref?: string;
    };

export const initialStepFormState: StepFormState = { status: "idle" };

/** Shown on every step once onboarding has been sent, and returned by any save that arrives after that. */
export const ONBOARDING_LOCKED_MESSAGE =
  "You've sent this to us, so these answers are locked. To change anything now, see Your project.";

/** Field names React adds to a server action's form data; they are not answers. */
const FRAMEWORK_FIELD = /^\$ACTION/;

/** The text the customer sent, by field name, for echoing back. Files and framework fields are left out. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string" || FRAMEWORK_FIELD.test(name)) continue;
    values[name] = value;
  }
  return values;
}

/**
 * What an input should start with: the saved value, or after a refused save exactly what was sent. A field that
 * was sent empty, or not at all, stays empty then, rather than springing back to the saved value.
 */
export function echoedValue(state: StepFormState, name: string, saved: string | null): string {
  if (state.status === "error") return state.values[name] ?? "";
  return saved ?? "";
}

export interface StepRefusal {
  readonly message: string;
  readonly field: string | null;
  readonly fixHref?: string;
}

/** The error state for a refused save, echoing back everything that was typed. */
export function refusedStepState(refusal: StepRefusal, formData: FormData): StepFormState {
  return {
    status: "error",
    message: refusal.message,
    field: refusal.field,
    values: formValues(formData),
    ...(refusal.fixHref === undefined ? {} : { fixHref: refusal.fixHref }),
  };
}
