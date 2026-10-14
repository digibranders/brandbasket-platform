/** The shape of a booking OTP everyone agrees on. Generating and hashing the actual code happen on the platform
 * server (they need a secret and a CSPRNG), not here -- this only holds the constants and the format check both
 * the server and the client site's OTP input need to share. */
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 600;
export const OTP_MAX_ATTEMPTS = 5;

const OTP_CODE = new RegExp(`^[0-9]{${OTP_LENGTH}}$`);

/** True for exactly OTP_LENGTH ASCII digits -- what a real OTP code always looks like, before it's checked against
 * a hash. */
export function isOtpCode(value: string): boolean {
  return OTP_CODE.test(value);
}
