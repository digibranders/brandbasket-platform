"use client";

import { useEffect, type ReactElement } from "react";
import { isStaleDeployError } from "@fynix/shared/lib/stale-deploy";
import { DeploymentUpdate } from "@fynix/shared/ui/panel/deployment-update";
import { reportBrowserError } from "@fynix/shared/lib/error-report";

export default function GlobalError({ error, reset }: { readonly error: Error & { readonly digest?: string }; readonly reset: () => void }): ReactElement {
  useEffect(() => {
    if (isStaleDeployError(error)) return;
    reportBrowserError(error, { app: "admin", operation: "error_boundary", route: window.location.pathname, severity: "fatal", release: process.env.NEXT_PUBLIC_FYNIX_RELEASE });
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f6efe6", color: "#2a0d10", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeContent: "center", padding: "2rem", boxSizing: "border-box" }}>
          {isStaleDeployError(error) ? <DeploymentUpdate /> : <>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "2.5rem" }}>Something went wrong.</h1>
          <p>This page didn’t load. Try again to continue.</p>
          <button type="button" onClick={reset} style={{ background: "#2a0d10", color: "#f6efe6", borderRadius: "999px", padding: "0.8rem 1.5rem", cursor: "pointer", font: "inherit", border: "none" }}>Try again</button>
          </>}
        </main>
      </body>
    </html>
  );
}

