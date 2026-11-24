"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { browserHost, startRefreshing } from "@brandbasket/shared/lib/refresh-while-visible";

const REFRESH_MS = 60_000;

/** Draws nothing. Re-runs the console's server loaders on focus and every minute while the page is visible, so the bell stays current without a websocket. Mounted once, in the shell. */
export function StaffBellRefresh(): null {
  const router = useRouter();
  useEffect(() => startRefreshing(() => router.refresh(), browserHost(window, document), REFRESH_MS), [router]);
  return null;
}
