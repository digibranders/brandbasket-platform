"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type RefObject,
} from "react";
import { echoedValue, initialPanelFormState, type PanelFormState } from "@/lib/panel-form-state";

export type PanelFormAction = (state: PanelFormState, formData: FormData) => Promise<PanelFormState>;

export type FieldStatus = { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string };

/**
 * Shared by every text and date input on a panel form, so each one doesn't repeat the same class string.
 *
 * The edge is ink-soft at 65% (3.5:1 on paper): a field's boundary is how you find it, so it needs the 3:1 non-text
 * minimum, which the `line` hairline (1.3:1) does not reach. Placeholders are ink-soft at 80% (5.0:1), the one
 * faded text the app allows, so an example never reads as a value already typed. `tabular-nums` keeps typed
 * phone numbers, times and dates even.
 */
export const FIELD_CLASSES =
  "mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-sm text-ink tabular-nums transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent aria-[invalid=true]:border-accent-deep";

/** The last calendar date `isIsoDate` (packages/shared/src/lib/calendar/local-date.ts) accepts, so a date picker
 * never offers something the server would refuse anyway. */
export const MAX_DATE = "2100-12-31";

export interface PanelFormControls {
  readonly state: PanelFormState;
  readonly isPending: boolean;
  /** The error to show now: hidden while a new attempt is in flight. */
  readonly errorMessage: string | null;
  /** The field the shown error is about, or null. */
  readonly invalidField: string | null;
  /** True right after a save this form owns has gone through, so it can show "Saved." */
  readonly saved: boolean;
  /** The id `PanelFormStatus`'s text renders under, unique to this form instance so several of these forms can
   * sit on one page without colliding ids. */
  readonly errorId: string;
  readonly fieldStatus: (name: string) => FieldStatus;
  /** What an input should start with: what was typed if a save was refused, otherwise `fallback` (the saved
   * value, or a default). React resets an uncontrolled field to its rendered `defaultValue` once the action that
   * owns it settles, so a refused save must render from this rather than from `fallback` directly, or the
   * customer's own typing would vanish along with the error. */
  readonly valueOf: (name: string, fallback: string) => string;
}

export interface PanelForm {
  readonly formRef: RefObject<HTMLFormElement | null>;
  /** Where focus goes after a refusal with no field to blame, and what `PanelFormStatus` renders into. Kept apart
   * from `controls` (rather than a field on it) because `controls` is read for plain values all over each panel's
   * render, and mixing a ref into the same object trips `react-hooks/refs`'s "controls could itself be a ref"
   * heuristic on every one of those reads. */
  readonly statusRef: RefObject<HTMLParagraphElement | null>;
  readonly formAction: (formData: FormData) => void;
  readonly controls: PanelFormControls;
}

interface PanelFormGroupValue {
  /** The form (by its `errorId`) submitted most recently inside this group, or null before any submit. */
  readonly latest: string | null;
  readonly claim: (formId: string) => void;
}

const PanelFormGroupContext = createContext<PanelFormGroupValue | null>(null);

/**
 * The server-action form pattern every panel form on a customer dashboard page shares: an error shown right by the
 * field it's about, with focus moved there, and "Saved." after a successful write. Unlike
 * lib/onboarding/step-form.tsx's useStepForm, a save here never redirects, so "saved" is a state this form can
 * settle into, not just "idle" or "error" -- and a refused save must redraw its fields exactly as typed rather
 * than losing them, so `valueOf` echoes back `state.values` the same way `lib/onboarding/form-state.ts`'s
 * `echoedValue` does for onboarding.
 */
export function usePanelForm(action: PanelFormAction): PanelForm {
  const [state, dispatch, isPending] = useActionState(action, initialPanelFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const errorId = useId();
  const group = useContext(PanelFormGroupContext);

  // The submit button is disabled while the action runs, so focus has to be placed deliberately afterwards.
  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else statusRef.current?.focus();
  }, [state]);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const invalidField = errorMessage !== null && state.status === "error" ? state.field : null;
  const saved = state.status === "saved" && !isPending && (group === null || group.latest === errorId);
  const formAction = (formData: FormData): void => {
    group?.claim(errorId);
    dispatch(formData);
  };

  return {
    formRef,
    statusRef,
    formAction,
    controls: {
      state,
      isPending,
      errorMessage,
      invalidField,
      saved,
      errorId,
      fieldStatus: (name) => (invalidField === name ? { "aria-invalid": true, "aria-describedby": errorId } : {}),
      valueOf: (name, fallback) => echoedValue(state, name, fallback),
    },
  };
}

/**
 * "Saved." once a save goes through, or the error next to the field it's about. Stays mounted as one
 * `aria-live="polite"` region at all times -- only its text changes -- because a region that only sometimes exists
 * is announced unreliably; an element already in the page when its text changes is what assistive tech picks up
 * consistently.
 *
 * `statusRef` is optional so a caller with no fallback-focus target of its own (see `usePanelForm`'s `statusRef`)
 * can still render this: it then falls back to a ref of its own, private to this instance. `savedText` says more
 * than "Saved." when the form has something to add, such as what the save changes.
 */
export function PanelFormStatus({
  controls,
  statusRef,
  savedText = "Saved.",
}: {
  readonly controls: PanelFormControls;
  readonly statusRef?: RefObject<HTMLParagraphElement | null>;
  readonly savedText?: string;
}): ReactElement {
  const ownRef = useRef<HTMLParagraphElement>(null);
  const isError = controls.errorMessage !== null;
  return (
    <p
      ref={statusRef ?? ownRef}
      id={controls.errorId}
      role="status"
      aria-live="polite"
      tabIndex={-1}
      className={isError ? "text-sm text-accent-deep outline-none" : "text-sm text-ink-soft outline-none"}
    >
      {isError ? controls.errorMessage : controls.saved ? savedText : ""}
    </p>
  );
}
