/*
 * The forms on Settings, Privacy. Browser-safe: the form components and the server actions share these states and limits.
 * The server (lib/server/nominee.ts) is what parses and checks the number.
 */

export const PRIVACY_SETTINGS_PATH = "/settings/privacy";
export const PRIVACY_EXPORT_PATH = "/settings/privacy/export";
export const NOMINEE_NAME_MAX_LENGTH = 120;
export const NOMINEE_PHONE_MAX_LENGTH = 40;

export type NomineeFormField = "name" | "phone";

/** Naming a nominee. `saved` and `cleared` stay on the form so it can say so. */
export type NomineeFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly field: NomineeFormField | null }
  | { readonly status: "saved" }
  | { readonly status: "cleared" };

export const initialNomineeState: NomineeFormState = { status: "idle" };
