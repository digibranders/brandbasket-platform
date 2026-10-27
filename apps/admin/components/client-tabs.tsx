"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

export interface ClientTabLink {
  readonly href: string;
  readonly label: string;
}

/** The client page's tabs. The first (Overview) is current only on its own address; the others on their own path. */
export function ClientTabs({ tabs }: { readonly tabs: readonly ClientTabLink[] }): ReactElement {
  const pathname = usePathname();
  const overview = tabs[0]?.href;
  return (
    <nav aria-label="Client sections" className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => {
        const current = tab.href === overview ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-200",
              current ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
