import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

export interface SocialTabsProps {
  readonly current: "posts" | "analytics";
  /** True once an Instagram, Facebook or Google account is connected: only then are there numbers to show. */
  readonly hasNumbers: boolean;
}

const TAB = "-mb-px no-underline border-b-2 px-3.5 py-2 text-[0.875rem] font-semibold";

/** Posts and Analytics, one line under the page title, so the header keeps only its buttons. Analytics is greyed, with the reason, until an account is connected. */
export function SocialTabs({ current, hasNumbers }: SocialTabsProps): ReactElement {
  return (
    <nav aria-label="Social media" className="flex flex-wrap items-center gap-1 border-b border-line">
      <Link href="/social" aria-current={current === "posts" ? "page" : undefined} className={cn(TAB, current === "posts" ? "border-rattan-text text-ink" : "border-transparent text-ink-2")}>
        Posts
      </Link>
      {hasNumbers ? (
        <Link href="/social/analytics" aria-current={current === "analytics" ? "page" : undefined} className={cn(TAB, current === "analytics" ? "border-rattan-text text-ink" : "border-transparent text-ink-2")}>
          Analytics
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(TAB, "border-transparent text-ink-3 opacity-70")}>
          Analytics
          <span className="ml-2 text-[0.6875rem] font-normal">Connect an account first</span>
        </span>
      )}
    </nav>
  );
}
