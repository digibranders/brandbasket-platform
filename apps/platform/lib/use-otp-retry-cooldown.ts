"use client";

import { useEffect, useState } from "react";
import type { OtpRetry } from "./auth-retry";

interface CooldownState {
  readonly sendScope: OtpRetry["scope"] | null;
  readonly confirmScope: OtpRetry["scope"] | null;
  readonly sendUntil: number;
  readonly confirmUntil: number;
  readonly sendSeconds: number;
  readonly confirmSeconds: number;
}

/** Limits are independent: a blocked resend does not stop the person using their existing code. */
export function useOtpRetryCooldown(): {
  readonly sendSeconds: number;
  readonly confirmSeconds: number;
  readonly begin: (retry: OtpRetry) => void;
  readonly clearPhoneLimits: () => void;
} {
  const [state, setState] = useState<CooldownState>({ sendScope: null, confirmScope: null, sendUntil: 0, confirmUntil: 0, sendSeconds: 0, confirmSeconds: 0 });
  const { sendUntil, confirmUntil } = state;
  useEffect(() => {
    if (sendUntil === 0 && confirmUntil === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setState((current) => ({
        ...current,
        sendSeconds: Math.max(0, Math.ceil((current.sendUntil - now) / 1000)),
        confirmSeconds: Math.max(0, Math.ceil((current.confirmUntil - now) / 1000)),
      }));
      if (sendUntil <= now && confirmUntil <= now) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sendUntil, confirmUntil]);

  function begin(retry: OtpRetry): void {
    const seconds = Math.max(0, Math.ceil(retry.retryAfterSeconds));
    const until = Date.now() + seconds * 1000;
    setState((current) => retry.operation === "send"
      ? { ...current, sendScope: retry.scope, sendUntil: until, sendSeconds: seconds }
      : { ...current, confirmScope: retry.scope, confirmUntil: until, confirmSeconds: seconds });
  }
  /** The limits that belong to the number or address typed: another one is not held back by them. */
  function clearPhoneLimits(): void {
    setState((current) => ({
      ...current,
      ...(current.sendScope === "phone" || current.sendScope === "email" ? { sendUntil: 0, sendSeconds: 0, sendScope: null } : {}),
      ...(current.confirmScope === "phone" || current.confirmScope === "email" ? { confirmUntil: 0, confirmSeconds: 0, confirmScope: null } : {}),
    }));
  }
  return { sendSeconds: state.sendSeconds, confirmSeconds: state.confirmSeconds, begin, clearPhoneLimits };
}
