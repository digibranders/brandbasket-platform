import Link from "next/link";
import type { ReactElement } from "react";
import { TickIcon } from "@firstfold/shared/ui/icons";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId, ProfileTabView } from "@/lib/business-profile";

interface ProfileTabsProps {
  readonly tabs: readonly ProfileTabView[];
  readonly current: ProfileTabId;
}

/**
 * The Business profile's tabs, in the order a new business fills them in. Plain links, so the address always says which
 * tab is open and each works before any script has loaded. A finished tab carries a tick in place of its number; the
 * open one is underlined in burgundy. The row wraps onto a second line when it must, so it never scrolls sideways.
 */
export function ProfileTabs({ tabs, current }: ProfileTabsProps): ReactElement {
  return (
    <nav aria-label="Business profile" className="mt-6">
      <ol className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
        {tabs.map((tab, index) => {
          const active = tab.id === current;
          return (
            <li key={tab.id}>
              <Link
                href={profileHref(tab.id)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex min-h-10 items-center gap-2 border-b-2 pb-2 pt-1 text-sm transition-colors duration-300 ease-calm ${
                  active ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-ink-soft hover:text-ink"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-5 place-items-center rounded-full text-[0.6875rem] tabular-nums ${
                    tab.done ? "bg-accent text-paper" : active ? "bg-ink text-paper" : "ring-[1.5px] ring-inset ring-ink-soft/50"
                  }`}
                >
                  {tab.done ? <TickIcon className="size-3" /> : index + 1}
                </span>
                {tab.label}
                {tab.done ? <span className="sr-only"> (done)</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
