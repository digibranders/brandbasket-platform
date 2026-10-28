"use client";

import { useEffect, type ReactElement } from "react";
import { isStaleDeployError } from "@brandbasket/shared/lib/stale-deploy";
import { DeploymentUpdate } from "@brandbasket/shared/ui/panel/deployment-update";
import { reportBrowserError } from "@brandbasket/shared/lib/error-report";

export default function GlobalError({ error, reset }: { readonly error: Error & { readonly digest?: string }; readonly reset: () => void }): ReactElement {
  useEffect(() => {
    if (isStaleDeployError(error)) return;
    reportBrowserError(error, { app: "admin", operation: "error_boundary", route: window.location.pathname, severity: "fatal", release: process.env.NEXT_PUBLIC_BRANDBASKET_RELEASE });
  }, [error]);
  return (
    <html lang="en">
      {/* The root layout and its stylesheet are replaced here, so the console's paper and ink (theme.css, data-app="console") are repeated inline. */}
      <body style={{ margin: 0, background: "#f6f5f2", color: "#15161a", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeContent: "center", gap: "0.75rem", padding: "2rem", boxSizing: "border-box" }}>
          {isStaleDeployError(error) ? <DeploymentUpdate /> : <>
          <h1 style={{ margin: 0, fontWeight: 600, fontSize: "1.625rem", letterSpacing: "-0.035em" }}>Something went wrong.</h1>
          <p style={{ margin: 0, color: "#4e5057" }}>This page didn’t load. Try again to continue.</p>
          <button type="button" onClick={reset} style={{ justifySelf: "start", background: "#15161a", color: "#f6f5f2", borderRadius: "0.75rem", padding: "0.6rem 1.1rem", cursor: "pointer", font: "inherit", fontWeight: 600, border: "none" }}>Try again</button>
          </>}
        </main>
      </body>
    </html>
  );
}

