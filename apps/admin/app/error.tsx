"use client";

import { useEffect, type ReactElement } from "react";
import { isStaleDeployError } from "@brandbasket/shared/lib/stale-deploy";
import { DeploymentUpdate } from "@brandbasket/shared/ui/panel/deployment-update";
import { reportBrowserError } from "@brandbasket/shared/lib/error-report";
import { buttonPrimary } from "@/components/console/buttons";
import { QuietFrame } from "@/components/console/quiet-frame";

interface DashboardErrorProps {
  /** Message text is redacted in production and may hold internals, so only the digest is shown. */
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps): ReactElement {
  useEffect(() => {
    if (isStaleDeployError(error)) return;
    reportBrowserError(error, { app: "admin", operation: "error_boundary", route: window.location.pathname, release: process.env.NEXT_PUBLIC_FYNIX_RELEASE });
  }, [error]);
  if (isStaleDeployError(error)) {
    return <main className="grid min-h-dvh place-items-center p-8"><DeploymentUpdate /></main>;
  }
  return (
    <QuietFrame
      title={
        <>
          Something went <em>wrong.</em>
        </>
      }
      lede="This page didn’t load. Try again, and if it keeps happening, check Automatic errors."
    >
      <div className="flex flex-col items-center gap-4 py-2">
        <button type="button" onClick={reset} className={buttonPrimary}>
          Try again
        </button>
        {error.digest === undefined ? null : <p className="text-sm text-ink-soft">Reference: {error.digest}</p>}
      </div>
    </QuietFrame>
  );
}
