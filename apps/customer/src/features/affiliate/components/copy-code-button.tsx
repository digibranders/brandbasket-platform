"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui";

const CONFIRMATION_MS = 2000;

/** Copies a code to the clipboard. Says "Copied" in words as well as with the icon, and tells a reader when the browser refuses. */
export function CopyCodeButton({ code }: { readonly code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      // Clipboard access is refused in some browsers and in insecure contexts: the code is still on screen to select.
      setState("failed");
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), CONFIRMATION_MS);
  }

  return (
    <>
      <Button size="sm" icon={state === "copied" ? "Check" : "Copy"} onClick={() => void copy()}>
        {state === "copied" ? "Copied" : "Copy code"}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? `Code ${code} copied` : state === "failed" ? "Could not copy. Select the code and copy it." : ""}
      </span>
    </>
  );
}
