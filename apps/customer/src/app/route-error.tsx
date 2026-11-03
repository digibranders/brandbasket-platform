"use client";

import { isStaleDeployError } from "@brandbasket/shared/lib/stale-deploy";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { DeploymentUpdate } from "@/features/shell/components/deployment-update";
import { Banner, Button } from "@/ui";

/** The fields isStaleDeployError reads, when the thrown value has them. */
function errorFields(error: unknown): { readonly name?: string; readonly message?: string } {
  return error instanceof Error ? { name: error.name, message: error.message } : {};
}

/**
 * What an error boundary shows: what failed, that the data is safe, and Try again (plan 60, section 13). The error goes to
 * Sentry from here, because an error boundary catches it before the browser SDK would see it. A form posted to an action
 * the new deployment no longer has is not a fault: it gets the "was updated, reload" notice and is not reported (PARITY,
 * shell behaviour 7).
 */
export function RouteError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  const stale = isStaleDeployError(errorFields(error));
  useEffect(() => {
    if (!stale) Sentry.captureException(error);
  }, [error, stale]);
  if (stale) return <DeploymentUpdate />;
  return (
    <Banner tone="neg" action={<Button size="sm" onClick={retry}>Try again</Button>}>
      <strong className="font-semibold">We could not load this page.</strong> Your data is safe. Check your connection and try again.
    </Banner>
  );
}
