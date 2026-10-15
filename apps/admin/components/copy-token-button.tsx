"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { CopyIcon, TickIcon } from "@fynix/shared/ui/icons";

interface CopyTokenButtonProps {
  /** What goes on the clipboard. Never spoken or shown by this button: it is a secret. */
  readonly value: string;
  /** What is being copied, for the button's name: "site token". */
  readonly what: string;
}

const CONFIRMATION_MS = 2000;

/**
 * The older way to copy, for a browser that refuses the clipboard API (an insecure page, an embedded view): put the text in
 * an off-screen box, select it and copy the selection. It only works inside the press that asked for it, which is where it runs.
 */
function copyBySelection(value: string): boolean {
  const box = document.createElement("textarea");
  box.value = value;
  box.setAttribute("readonly", "");
  box.style.position = "fixed";
  box.style.top = "-1000px";
  document.body.appendChild(box);
  box.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(box);
  }
}

/**
 * An icon button that copies a secret to the clipboard. It says "Copied" in words for screen readers as well as with the
 * tick, and says so if the browser refuses; the value itself is never read out, only copied.
 */
export function CopyTokenButton({ value, what }: CopyTokenButtonProps): ReactElement {
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
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Clipboard access is refused in insecure contexts and by some browsers: try the older way, and if that fails too the
      // value is still on screen to select, which the button says.
      setState(copyBySelection(value) ? "copied" : "failed");
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), CONFIRMATION_MS);
  }

  return (
    <>
      {state === "failed" ? (
        <span aria-hidden="true" className="self-center text-xs text-ink-soft">
          Couldn’t copy. Select it instead.
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy the ${what}`}
        title={state === "copied" ? "Copied" : `Copy the ${what}`}
        className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors duration-300 ease-calm hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {state === "copied" ? <TickIcon className="size-4 text-[#3d7a4a]" /> : <CopyIcon className="size-4" />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? `The ${what} was copied` : state === "failed" ? `Couldn’t copy. Select the ${what} and copy it.` : ""}
      </span>
    </>
  );
}
