/**
 * What a "panel form" hands back to its own `useActionState` — any server-action form on a customer dashboard page
 * that saves in place rather than redirecting away, e.g. the "Your details" page's Hours/Closures/Announcement
 * panels and the Appointments week grid and settings pages. Idle, saved and error are all states the form can be in,
 * not just idle and error, because the customer stays on the page and sees "Saved." rather than navigating off on
 * success.
 *
 * React resets an uncontrolled field back to its `defaultValue` once the form action it belongs to finishes,
 * whether the save succeeded or not. A refused save must lose nothing the customer typed, so the error state
 * carries `values` -- exactly what was submitted -- and every field renders from it afterwards, echoing back what
 * was typed. Mirrors lib/onboarding/form-state.ts's `formValues`/`echoedValue`/`StepFormState`, generalised for
 * this feature-agnostic shape. Started life as details/form-state.ts; moved here once Appointments needed the
 * same pattern, so neither feature depends on the other's page.
 */
export type PanelFormState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | {
      readonly status: "error";
      readonly message: string;
      /** The exact form field the message is about, e.g. "message" or "hours.2.opens", or null for the whole form. */
      readonly field: string | null;
      /** What was submitted, by field name, so a refused save can be redrawn exactly as typed. */
      readonly values: Readonly<Record<string, string>>;
    };

export const initialPanelFormState: PanelFormState = { status: "idle" };
export const panelFormSavedState: PanelFormState = { status: "saved" };

/** Field names React adds to a server action's form data; they are not answers. */
const FRAMEWORK_FIELD = /^\$ACTION/;

/** The text the customer sent, by field name, for echoing back after a refusal. Files and framework fields are
 * left out. Mirrors lib/onboarding/form-state.ts's `formValues`. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string" || FRAMEWORK_FIELD.test(name)) continue;
    values[name] = value;
  }
  return values;
}

/** What an input should start with: what was typed if a save was refused, otherwise `fallback` (the saved value,
 * or this field's default). Mirrors lib/onboarding/form-state.ts's `echoedValue`. */
export function echoedValue(state: PanelFormState, name: string, fallback: string): string {
  if (state.status === "error") return state.values[name] ?? "";
  return fallback;
}

export interface PanelFormProblem {
  readonly message: string;
  readonly field: string | null;
}

/** The error state for a refused save, echoing back everything that was submitted. */
export function panelFormErrorState(problem: PanelFormProblem, formData: FormData): PanelFormState {
  return { status: "error", message: problem.message, field: problem.field, values: formValues(formData) };
}
