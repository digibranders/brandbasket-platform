"use client";

import { useEffect, type ReactElement } from "react";
import { reportBoundaryError } from "@/lib/report-boundary-error";
import { isStaleDeployError } from "@firstfold/shared/lib/stale-deploy";
import { DeploymentUpdate } from "@firstfold/shared/ui/panel/deployment-update";
import { Button } from "@firstfold/shared/ui/panel/button";
import { WordmarkLogo } from "@firstfold/shared/ui/logo";
import { useBrand } from "@/components/panel/brand-provider";
import { logoOf } from "@/lib/brand";

interface DashboardErrorProps {
  /** Message text is redacted in production and may hold internals, so only the digest is shown. */
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps): ReactElement {
  const brand = useBrand();
  useEffect(() => {
    if (isStaleDeployError(error)) return;
    reportBoundaryError(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh flex-col px-5 py-5 sm:px-8 sm:py-6">
      <header>
        <WordmarkLogo href="/" brand={logoOf(brand)} />
      </header>
      <main id="main" className="grid flex-1 place-items-center py-12">
        {isStaleDeployError(error) ? <DeploymentUpdate brandName={brand.name} /> : <div className="w-full max-w-md">
          <h1 className="heading-display text-[clamp(2.5rem,7vw,3.5rem)]">
            Something went <em>wrong.</em>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            This page didn’t load. Try again, and if it keeps happening, tell us and
            we’ll look into it.
          </p>
          <Button type="button" onClick={reset} className="mt-8 w-full">
            Try again
          </Button>
          {error.digest === undefined ? null : (
            <p className="mt-6 text-sm text-ink-soft">Reference: {error.digest}</p>
          )}
        </div>}
      </main>
    </div>
  );
}
