import type { ReactElement, ReactNode } from "react";
import { cn } from "@firstfold/shared/lib/cn";

interface NoticeProps {
  /** "ok" confirms something worked; "problem" means it didn't and says what to do. */
  readonly tone: "ok" | "problem";
  readonly children: ReactNode;
  readonly className?: string;
}

/** The result of an action, as one line under the header: a dot and a sentence, no banner box. */
export function Notice({ tone, children, className }: NoticeProps): ReactElement {
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-3 border-l-2 py-1 pl-4 text-[0.95rem] leading-relaxed",
        tone === "ok" ? "border-[#3d7a4a] text-ink" : "border-accent text-accent",
        className,
      )}
    >
      {children}
    </p>
  );
}
