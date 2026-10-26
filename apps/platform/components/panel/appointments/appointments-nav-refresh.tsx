"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Keeps the sidebar's "Appointments · N" badge from going stale while the customer stays on one page: it's read
 * once, at the request that rendered the current route, and never updates on its own after a request arrives
 * from the business's own site or from a teammate in another tab. Refreshes the current route (re-runs the
 * server components with fresh data, same as `router.refresh()` anywhere else in this app) whenever the tab
 * regains focus or becomes visible again, and on a 60s timer while it stays visible -- not while backgrounded, so
 * a hidden tab isn't polling for nothing.
 *
 * Renders nothing. Mount only when Appointments is switched on (see AppShell, components/v2/app-shell.tsx; the v2 shell no longer mounts it) -- there's no badge to keep
 * fresh otherwise, and this would just be a pointless timer.
 */
export function AppointmentsNavRefresh(): null {
  const router = useRouter();

  useEffect(() => {
    const refresh = (): void => router.refresh();

    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = (): void => {
      if (interval !== null) return;
      interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    };
    const stopInterval = (): void => {
      if (interval === null) return;
      clearInterval(interval);
      interval = null;
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") {
        stopInterval();
        return;
      }
      refresh();
      startInterval();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (document.visibilityState === "visible") startInterval();

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopInterval();
    };
  }, [router]);

  return null;
}
