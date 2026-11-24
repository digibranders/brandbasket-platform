import { isStaleDeployError } from "./stale-deploy";

/** What a form says when its request never got an answer (network drop, server fault). */
export const DROPPED_ACTION_MESSAGE = "Something went wrong on our side. Your answers are still here, press Save to try again.";

function readString(error: object, key: "digest" | "name" | "message"): string | undefined {
  const value: unknown = (error as Readonly<Record<string, unknown>>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * True for a rejection a form can recover from by showing a message. Framework control flow (redirect, not found) and a
 * request to an action the new deployment no longer has are not drops: they must reach their own handler.
 */
export function isRecoverableDrop(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;
  if (readString(error, "digest")?.startsWith("NEXT_") === true) return false;
  const name = readString(error, "name");
  const message = readString(error, "message");
  return !isStaleDeployError({ ...(name === undefined ? {} : { name }), ...(message === undefined ? {} : { message }) });
}

/**
 * Wraps a server action so a rejected or dropped request becomes the form's own failure state instead of an error screen
 * that unmounts the form. `onDropped` builds that state in the shape the form already reads.
 */
export function guardAction<S, A extends readonly unknown[]>(
  action: (...args: A) => Promise<S>,
  onDropped: (message: string, ...args: A) => S,
): (...args: A) => Promise<S> {
  return async (...args: A): Promise<S> => {
    try {
      return await action(...args);
    } catch (error) {
      if (!isRecoverableDrop(error)) throw error;
      return onDropped(DROPPED_ACTION_MESSAGE, ...args);
    }
  };
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isField(element: Element): element is Field {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

/**
 * Puts what was sent back into a form that React reset after the action ended. Text, selects and text areas get their
 * value, ticks get their state. Passwords, files and hidden fields are left alone.
 */
export function restoreFormValues(form: HTMLFormElement, sent: FormData): void {
  for (const field of Array.from(form.elements).filter(isField)) {
    if (field.name === "") continue;
    const values = sent.getAll(field.name).filter((value): value is string => typeof value === "string");
    if (field instanceof HTMLInputElement) {
      if (field.type === "password" || field.type === "file" || field.type === "hidden") continue;
      if (field.type === "checkbox" || field.type === "radio") {
        field.checked = values.includes(field.value);
        continue;
      }
    }
    if (values[0] !== undefined && field.value !== values[0]) field.value = values[0];
  }
}
