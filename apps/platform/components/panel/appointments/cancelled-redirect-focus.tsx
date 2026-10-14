"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * A successful Cancel closes the details panel by navigating back to the plain grid view with a transient
 * `?closed=cancelled` marker (see booking-details-panel.tsx's CancelForm) -- the confirmation itself is rendered
 * server-side, right by the "Cancelled this week" heading (see the appointments page), since that's the one place
 * both the announcement and the just-cancelled row are guaranteed to already be in the DOM together. This
 * component's whole job is the two things that have to happen client-side: move focus to that heading (a plain
 * server render can't do that -- there's nothing to "move" focus from), and strip the marker from the URL once it
 * has, so refreshing or navigating back doesn't repeat the announcement.
 */
export function CancelledRedirectFocus({ headingId }: { readonly headingId: string }): null {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (searchParams.get("closed") !== "cancelled") return;
    handled.current = true;

    document.getElementById(headingId)?.focus();

    const next = new URLSearchParams(searchParams);
    next.delete("closed");
    const query = next.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`);
  }, [searchParams, router, pathname, headingId]);

  return null;
}
