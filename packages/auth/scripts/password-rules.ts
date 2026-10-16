import { passwordPolicyProblem } from "../src/password-policy";

// ASCII control characters (0x00-0x1f) and DEL (0x7f). A password built from raw terminal input can pick
// these up when the user leans on an arrow key or another key that a hidden prompt cannot render as text.
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

/**
 * Pure validation for a freshly typed password and its confirmation, shared by the interactive prompt
 * and its tests. Staff are held to the same rule as customers (src/password-policy.ts). Returns an error
 * message describing the first problem found, or `null` when the password is acceptable.
 */
export function validateNewPassword(password: string, confirmation: string): string | null {
  const problem = passwordPolicyProblem(password);
  if (problem !== null) {
    return problem;
  }
  if (CONTROL_CHARACTERS.test(password)) {
    return "The password contains control characters (for example arrow keys). Type it again.";
  }
  if (password !== confirmation) {
    return "The passwords don't match.";
  }
  return null;
}
