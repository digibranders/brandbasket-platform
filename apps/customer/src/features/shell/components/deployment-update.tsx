"use client";

import { clientBrandName } from "@brandbasket/shared/lib/deployment-brand";
import { reloadForDeploymentUpdate } from "@brandbasket/shared/lib/stale-deploy";
import { useEffect, useId, useRef } from "react";

/**
 * Shown instead of the error screen when the app was deployed while this page was open and a form posted to a server
 * action the new build no longer has (isStaleDeployError). The submission was not saved, so it says so and offers a
 * reload. Ported from packages/shared ui/panel/deployment-update.tsx. It takes focus so the change is announced, and uses
 * plain elements with layout only, so it still reads when the old build's stylesheet is gone.
 */
export function DeploymentUpdate() {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div role="alert" aria-labelledby={headingId} className="flex max-w-reading flex-col gap-3">
      <h1 ref={heading} id={headingId} tabIndex={-1} className="type-title outline-none">
        {clientBrandName()} was updated. Reload to continue.
      </h1>
      <p className="type-body text-ink-2">This submission was not saved. Enter your details again after reloading.</p>
      <div>
        <button
          type="button"
          onClick={reloadForDeploymentUpdate}
          className="inline-flex h-control items-center rounded-control bg-primary px-3.5 type-button text-on-primary shadow-primary hover:bg-primary-hover"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
