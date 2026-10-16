/**
 * The rule every new password must meet, for customers and staff alike. Dependency-free so browser forms can import
 * it (`@fynix/auth/password-policy`) and show the same rule the server enforces in create-auth.ts.
 *
 * It applies only where a password is chosen: sign-up, setup, reset and change. Signing in, and confirming a current
 * password, accept whatever the account already has, so passwords set under the older length-only rule keep working.
 */

export const PASSWORD_MIN_LENGTH = 8;
/** Better Auth's own upper bound (its default maxPasswordLength). */
export const PASSWORD_MAX_LENGTH = 128;

/** The rule in one line, for hints beside password fields. */
export const PASSWORD_RULE = `At least ${PASSWORD_MIN_LENGTH} characters, with a letter, a number and a symbol.`;

const LETTER = /\p{L}/u;
const NUMBER = /\p{Nd}/u;
// Anything that is not a letter, a digit or whitespace: punctuation and symbols in any script.
const SYMBOL = /[^\p{L}\p{Nd}\s]/u;

/** The first thing wrong with a new password, said so the person can fix it, or `null` when it meets the rule. */
export function passwordPolicyProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return "That password is too long.";
  if (!LETTER.test(password)) return "Add at least one letter.";
  if (!NUMBER.test(password)) return "Add at least one number.";
  if (!SYMBOL.test(password)) return "Add at least one symbol, such as ! # or @.";
  return null;
}
