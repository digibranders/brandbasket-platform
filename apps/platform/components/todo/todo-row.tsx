"use client";

import { useState, type ReactElement, type ReactNode } from "react";

interface TodoRowProps {
  /** Whether the row starts open. Only read once: a later change (a save moves the first open item) never opens or closes the row. */
  readonly initiallyOpen: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/** One To do row that expands: the page decides how it starts, the customer decides after that. */
export function TodoRow({ initiallyOpen, className, children }: TodoRowProps): ReactElement {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className={className}>
      {children}
    </details>
  );
}
