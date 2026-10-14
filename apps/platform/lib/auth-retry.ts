/** Browser-safe retry facts, carried from the budget which actually blocked the request. */
export interface OtpRateLimit {
  readonly scope: "network" | "phone" | "email" | "global";
  readonly retryAfterSeconds: number;
}

export interface OtpRetry extends OtpRateLimit {
  readonly operation: "send" | "confirm";
}

export function otpLimitMessage(limit: OtpRateLimit, operation: OtpRetry["operation"]): string {
  const seconds = Math.max(1, Math.ceil(limit.retryAfterSeconds));
  const count = seconds < 60 ? seconds : Math.ceil(seconds / 60);
  const unit = seconds < 60 ? "second" : "minute";
  const wait = `Try again in ${count} ${unit}${count === 1 ? "" : "s"}.`;
  if (limit.scope === "global") return `Code delivery is temporarily busy. ${wait}`;
  const scope = limit.scope === "network" ? "from this network" : limit.scope === "email" ? "for this email address" : "for this number";
  return `Too many code ${operation === "send" ? "requests" : "checks"} ${scope}. ${wait}`;
}
