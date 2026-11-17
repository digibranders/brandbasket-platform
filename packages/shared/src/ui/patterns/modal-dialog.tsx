"use client";

import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { useLayer } from "./use-layer";

export interface ModalDialogProps {
  /** Id of the element that names the dialog. */
  readonly labelledBy: string;
  readonly onEscape: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  /** Click on the scrim. Omit to make the scrim inert. */
  readonly onScrimClick?: () => void;
}

/**
 * A native modal `<dialog>` that mounts only while open. The browser keeps focus inside it; `useLayer` adds the shared Esc
 * stack, a Tab fallback (for engines without a real top layer) and focus return to the element that opened it.
 */
export function ModalDialog({ labelledBy, onEscape, children, className = "", onScrimClick }: ModalDialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const [opener] = useState<RefObject<HTMLElement | null>>(() => ({
    current: typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  }));

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, []);

  useLayer({ open: true, onEscape, containerRef: ref, trap: true, returnFocusTo: opener });

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(event) => event.preventDefault()}
      onClick={(event) => {
        if (onScrimClick && event.target === event.currentTarget) onScrimClick();
      }}
      className={`m-auto max-w-[calc(100vw-32px)] border-0 bg-transparent p-0 text-ink backdrop:bg-ink/40 ${className}`}
    >
      {children}
    </dialog>
  );
}
