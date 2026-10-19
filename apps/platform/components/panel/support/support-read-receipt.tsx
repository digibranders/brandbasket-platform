"use client";

import { useEffect } from "react";
import { acknowledgeSupportReplies } from "@/app/app-host/(support)/support/actions";

/** A prefetched server render must not clear replies the customer has not opened. */
export function SupportReadReceipt({ ticketId, messageId }: { readonly ticketId: string; readonly messageId: string }): null {
  useEffect(() => {
    let sent = false;
    let active = true;
    const acknowledge = (): void => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      void acknowledgeSupportReplies(ticketId, messageId).then((saved) => {
        if (active && saved) window.dispatchEvent(new Event("brandbasket:support-read"));
      }).catch(() => undefined);
    };
    acknowledge();
    document.addEventListener("visibilitychange", acknowledge);
    return () => { active = false; document.removeEventListener("visibilitychange", acknowledge); };
  }, [ticketId, messageId]);
  return null;
}
