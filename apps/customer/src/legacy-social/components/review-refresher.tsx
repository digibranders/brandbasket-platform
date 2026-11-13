"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How often the review page asks again while a job is running. */
const POLL_MS = 5000;

/** Keeps the review page fresh while something is being written or drawn, so the result appears without a reload. Draws nothing. */
export function ReviewRefresher({ active }: { readonly active: boolean }): null {
  const router = useRouter();
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
