"use client";

import { useEffect } from "react";
import { markReadAction } from "../actions";

/**
 * Marks the newest message read, once, when the tab is visible. A prefetched render must not clear replies the customer has
 * not opened, so a hidden tab waits for visibilitychange.
 */
export function ReadReceipt({ ticketId, messageId }: { readonly ticketId: string; readonly messageId: string }): null {
  useEffect(() => {
    let sent = false;
    const acknowledge = (): void => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      void markReadAction(ticketId, messageId).catch(() => undefined);
    };
    acknowledge();
    document.addEventListener("visibilitychange", acknowledge);
    return () => document.removeEventListener("visibilitychange", acknowledge);
  }, [ticketId, messageId]);
  return null;
}
