import { APIError, isAPIError } from "better-auth/api";

const INVALID_CREDENTIALS_CODE = "INVALID_EMAIL_OR_PASSWORD";
const WRONG_PASSWORD_CODE = "INVALID_PASSWORD";

/**
 * Better Auth reports expected failures, such as a wrong password, as APIError. `isAPIError` (from
 * better-auth's own utils) checks both the core APIError class and better-call's base class, and falls
 * back to `name === "APIError"` — a plain `instanceof` against the core class alone misses validation
 * errors, which better-call throws as its own base class.
 */
export function isAuthApiError(error: unknown): error is APIError {
  return isAPIError(error);
}

/** True only for a wrong email or password, so real faults are never shown to users as bad credentials. */
export function isInvalidCredentialsError(error: unknown): boolean {
  return isAuthApiError(error) && error.body?.code === INVALID_CREDENTIALS_CODE;
}

/** True only for the signed-in person's current password being wrong, so real faults are never shown as a typo. */
export function isWrongPasswordError(error: unknown): boolean {
  return isAuthApiError(error) && error.body?.code === WRONG_PASSWORD_CODE;
}

/** A one-time link's token that was never issued, has been used, or has run out. */
const DEAD_TOKEN_CODES: ReadonlySet<string> = new Set(["INVALID_TOKEN", "TOKEN_EXPIRED"]);

/** True only for a dead one-time token (a reset or confirmation link), so real faults are never shown as an old link. */
export function isInvalidTokenError(error: unknown): boolean {
  const code: unknown = isAuthApiError(error) ? error.body?.code : undefined;
  return typeof code === "string" && DEAD_TOKEN_CODES.has(code);
}
