"use client";

import { useEffect, useId, useRef, type ReactElement } from "react";
import { clientBrandName } from "../../lib/deployment-brand";
import { reloadForDeploymentUpdate } from "../../lib/stale-deploy";

/** Inline styles also work when a global error replaces the app's stylesheet. */
/** `brandName` is the product the page belongs to: the product's. */
export function DeploymentUpdate({ brandName = clientBrandName() }: { readonly brandName?: string } = {}): ReactElement {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);

  return (
    <div role="alert" aria-labelledby={headingId} style={{ maxWidth: "32rem" }}>
      <h1 ref={headingRef} id={headingId} tabIndex={-1} style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "2.5rem", lineHeight: 1.2 }}>
        {brandName} was updated. Reload to continue.
      </h1>
      <p style={{ marginTop: "1rem", lineHeight: 1.6 }}>This submission was not saved. Enter your details again after reloading.</p>
      <button type="button" onClick={reloadForDeploymentUpdate} style={{ marginTop: "1.5rem", background: "#2a0d10", color: "#f6efe6", borderRadius: "999px", padding: "0.8rem 1.5rem", cursor: "pointer", font: "inherit", border: "none" }}>
        Reload page
      </button>
    </div>
  );
}
