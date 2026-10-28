"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { currentTab, WEBSITE_TABS } from "@/lib/website/tabs";

/** The three tabs. A client child only for the path; it imports nothing from the server. */
export function WebsiteTabs(): ReactElement {
  const current = currentTab(usePathname());
  return (
    <nav aria-label="Your website" className="overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex gap-6 whitespace-nowrap">
        {WEBSITE_TABS.map((tab) => {
          const here = tab === current;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={here ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 py-2.5 text-sm font-semibold transition-colors duration-200",
                  here ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
