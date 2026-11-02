import Link from "next/link";
import type { ReactElement } from "react";
import type { StaffRole } from "@brandbasket/db";
import { cn } from "@brandbasket/shared/lib/cn";
import { tabsFor } from "@/lib/console-rail";

interface SectionTabsProps {
  readonly role: StaffRole;
  /** The address of the page showing the strip: it picks the menu item's tabs and the current one. */
  readonly page: string;
}

/** The tab strip shared by the pages of one menu item, directly under their header. Shows only pages the role may open. */
export function SectionTabs({ role, page }: SectionTabsProps): ReactElement | null {
  const tabs = tabsFor(role, page);
  if (tabs === null) return null;
  return (
    <nav aria-label={tabs.label} className="mt-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {tabs.pages.map((tab) => {
        const current = tab.href === page;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              // The current mark is an inset shadow, not a border pulled down over the rule: a child that overflows by a pixel
              // makes the scrolling bar grow a vertical scrollbar.
              "whitespace-nowrap px-3 py-2.5 text-sm font-semibold transition-colors duration-200",
              current ? "text-ink shadow-[inset_0_-2px_0_0_var(--color-ink)]" : "text-ink-2 hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
