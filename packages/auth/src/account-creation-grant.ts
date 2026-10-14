import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";

interface AccountCreationGrant {
  readonly email: string;
}

const grants = new AsyncLocalStorage<AccountCreationGrant>();
const emailSchema = z.email();

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Runs `work` with permission to create an account for `email`. Nothing else can create accounts.
 * Declared `async` so a malformed email rejects the returned promise instead of throwing synchronously.
 */
export async function withAccountCreationGrant<T>(email: string, work: () => Promise<T>): Promise<T> {
  // Validate before lowercasing: a Kelvin sign ("K", U+212A) is only valid ASCII once lowercased, so
  // validating the original input rejects it instead of silently granting a different-looking email.
  if (!emailSchema.safeParse(email.trim()).success) {
    throw new Error("Account creation grants need a valid email address.");
  }
  const normalised = normaliseEmail(email);
  return grants.run({ email: normalised }, work);
}

export function hasAccountCreationGrant(email: string): boolean {
  const grant = grants.getStore();
  return grant !== undefined && grant.email === normaliseEmail(email);
}
