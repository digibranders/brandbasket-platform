"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { CopyIcon, TickIcon } from "@brandbasket/shared/ui/icons";

interface CopyCodeButtonProps {
  readonly code: string;
}

const CONFIRMATION_MS = 2000;

/** Copies a code to the clipboard. Says "Copied" in words as well as with the tick, and "Press and hold to copy" if the browser refuses. */
export function CopyCodeButton({ code }: CopyCodeButtonProps): ReactElement {
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
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex items-center gap-2 rounded-full bg-paper-deep px-4 py-2 text-sm font-medium text-ink transition-colors duration-300 ease-calm hover:bg-accent-pale hover:text-accent-deep"
      >
        {state === "copied" ? <TickIcon className="size-4" /> : <CopyIcon className="size-4" />}
        {state === "copied" ? "Copied" : "Copy code"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? `Code ${code} copied` : state === "failed" ? "Couldn’t copy. Select the code and copy it." : ""}
      </span>
    </>
  );
}
