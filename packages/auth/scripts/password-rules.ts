import { PASSWORD_MIN_LENGTH } from "../src";

/** Staff can see every customer, so their passwords are longer than a customer's (PASSWORD_MIN_LENGTH). */
export const STAFF_PASSWORD_MIN_LENGTH = 14;

// ASCII control characters (0x00-0x1f) and DEL (0x7f). A password built from raw terminal input can pick
// these up when the user leans on an arrow key or another key that a hidden prompt cannot render as text.
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

/**
 * Pure validation for a freshly typed password and its confirmation, shared by the interactive prompt
 * and its tests. Returns an error message describing the first problem found, or `null` when the
 * password is acceptable.
 */
export function validateNewPassword(
  password: string,
  confirmation: string,
  minLength: number = PASSWORD_MIN_LENGTH,
): string | null {
  if (password.length < minLength) {
    return `The password must be at least ${minLength} characters.`;
  }
  if (CONTROL_CHARACTERS.test(password)) {
    return "The password contains control characters (for example arrow keys). Type it again.";
  }
  if (password !== confirmation) {
    return "The passwords don't match.";
  }
  return null;
}
