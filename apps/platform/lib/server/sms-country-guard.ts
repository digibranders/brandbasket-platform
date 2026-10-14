import "server-only";

/**
 * The anti SMS-pumping (toll fraud) guard `requestBookingOtp` runs before any rate limit is even consumed: a
 * phone number outside `allowedCodes` (see `smsAllowedCountryCodes`, lib/server/env.ts) never reaches a real SMS
 * send, however generous the rate limits are, because pumping abuses cheap-to-request, expensive-to-send traffic
 * rather than any single budget.
 */

/** True when `phone` (E.164, e.g. "+919876543210") starts with one of `allowedCodes`' calling codes (no leading
 * "+", e.g. "91"). */
export function isPhoneCountryAllowed(phone: string, allowedCodes: readonly string[]): boolean {
  return allowedCodes.some((code) => phone.startsWith(`+${code}`));
}

/** "Indian mobile numbers" when `codes` is exactly `["91"]` (the default and by far the common case); otherwise
 * "numbers in +91, +1, ..." so an operator who widened the list still gets an accurate, if plainer, message. */
function countryWording(codes: readonly string[]): string {
  if (codes.length === 1 && codes[0] === "91") return "Indian mobile numbers";
  return `numbers in ${codes.map((code) => `+${code}`).join(", ")}`;
}

export function disallowedPhoneMessage(codes: readonly string[]): string {
  return `We can only text ${countryWording(codes)} right now.`;
}
