import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

interface NoticeProps {
  /** "ok" confirms something worked; "problem" means it didn't and says what to do. */
  readonly tone: "ok" | "problem";
  readonly children: ReactNode;
  readonly className?: string;
}

/** The result of an action, as one line under the header: a rule at the left and a sentence, no banner box. */
export function Notice({ tone, children, className }: NoticeProps): ReactElement {
  return (
    <p
      role="status"
      className={cn("flex items-start gap-3 border-l-2 py-1 pl-4 text-sm leading-relaxed", tone === "ok" ? "border-sage text-ink" : "border-error text-error", className)}
    >
      {children}
    </p>
  );
}
