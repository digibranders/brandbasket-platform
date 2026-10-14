import type { RateLimitRule } from "@fynix/db";

export interface RateLimitCheck {
  readonly key: string;
  readonly rule: RateLimitRule;
}

const FIFTEEN_MINUTES = 15 * 60;

/**
 * Sign-in limits, checked in this order and stopping at the first block, so a blocked network cannot keep
 * creating rows by cycling emails:
 * 1. per network: one address trying many accounts;
 * 2. per account from that network: password guessing;
 * 3. per account from anywhere: a high ceiling, so a stranger cannot easily lock a customer out.
 * `email` must already be normalised (trimmed, lowercase), as parseSignInForm does.
 * There is no surface in these keys: staff and customer sign-in check the same `users` accounts, and
 * keying by surface would let an attacker double their budget against one account by switching hosts.
 */
export function signInRateLimitChecks(email: string, clientIp: string): readonly RateLimitCheck[] {
  return [
    { key: `sign-in:client:${clientIp}`, rule: { limit: 20, windowSeconds: FIFTEEN_MINUTES } },
    {
      key: `sign-in:account-client:${email}:${clientIp}`,
      rule: { limit: 8, windowSeconds: FIFTEEN_MINUTES },
    },
    { key: `sign-in:account:${email}`, rule: { limit: 50, windowSeconds: FIFTEEN_MINUTES } },
  ];
}

export function retryMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
