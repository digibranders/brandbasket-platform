const UNKNOWN_CLIENT = "unknown";

/**
 * Client address for rate limiting: the first X-Forwarded-For entry, then X-Real-IP.
 * These headers are only trustworthy behind a proxy that overwrites them, as Vercel does. On a
 * self-hosted `next start`, `base-server.js` sets X-Forwarded-For only when it is absent, so a
 * client-supplied value survives — the value is client-controlled and rate limits keyed on it
 * can be bypassed by anyone who sends their own header.
 */
export function clientIpFrom(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp ? realIp : UNKNOWN_CLIENT;
}
