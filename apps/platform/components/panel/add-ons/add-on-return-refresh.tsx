"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RETURN_REFRESH_DELAYS_MS } from "@/lib/billing/add-on-return-refresh";

interface AddOnReturnRefreshProps {
  /** True while the page, shown right after a return from paying, probably lacks what the payment changes. */
  readonly waiting: boolean;
}

/**
 * Asks the server for the page again, about 3 and then about 8 seconds after a return from Razorpay, because the webhook
 * that records the payment can arrive after the customer does. It stops there: no polling beyond those two, and none at
 * all once the redrawn page no longer needs to wait. Draws nothing.
 */
export function AddOnReturnRefresh({ waiting }: AddOnReturnRefreshProps): null {
  const router = useRouter();
  useEffect(() => {
    if (!waiting) return;
    const timers = RETURN_REFRESH_DELAYS_MS.map((delay) => window.setTimeout(() => router.refresh(), delay));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [waiting, router]);
  return null;
}
