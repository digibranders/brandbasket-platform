"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Banner, Button } from "@/ui";

/**
 * What an error boundary shows: what failed, that the data is safe, and Try again (plan 60, section 13). The error goes to
 * Sentry from here, because an error boundary catches it before the browser SDK would see it.
 */
export function RouteError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <Banner tone="neg" action={<Button size="sm" onClick={retry}>Try again</Button>}>
      <strong className="font-semibold">We could not load this page.</strong> Your data is safe. Check your connection and try again.
    </Banner>
  );
}
