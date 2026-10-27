"use client";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import type { AccountPanel } from "@brandbasket/shared/lib/account-panel";
import { AccountBar, type AccountBarAccount } from "@brandbasket/shared/ui/panel/account-bar";
import { WordmarkLogo, type BrandLogo } from "@brandbasket/shared/ui/logo";
import { isCurrent, linkIsCurrent, type RailSection } from "@/lib/rail";
import { CommandSearch } from "./command-search";
import { CountPill } from "./count-pill";
import { RailIconMark } from "./rail-icon";

/** What the account menu needs, the same for the rail and the phone menu. */
export interface AccountMenu {
  readonly account: AccountBarAccount;
  readonly panel: AccountPanel | null;
  readonly docsUrl: string;
  readonly contactEmail: string;
  readonly brandName: string;
}

interface RailProps {
  readonly sections: readonly RailSection[];
  readonly logo: BrandLogo;
  readonly menu: AccountMenu;
  readonly signOut: () => Promise<void>;
}

/** The dark rail from `lg` up: logo, search, the sections, and the account at the foot. */
export function Rail({ sections, logo, menu, signOut }: RailProps): ReactElement {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  // The rail is display:none below lg; a dialog opened inside it would leave the page inert with nothing to see.
  const openFromShortcut = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setSearching(true);
  }, []);
  return (
    <aside data-surface="dark" className="sticky top-0 z-20 hidden h-dvh w-[14.5rem] shrink-0 flex-col px-3 py-4 text-white lg:flex">
      <div className="px-2.5 pb-3">
        <WordmarkLogo href="/" tone="light" brand={logo} />
      </div>
      <button
        type="button"
        onClick={openSearch}
        className="mx-0.5 mb-2 flex items-center gap-2 rounded-[0.625rem] bg-white/[0.07] px-3 py-2 text-[0.8125rem] text-white/75 transition-colors duration-200 hover:bg-white/10"
      >
        <MagnifyingGlass size={16} aria-hidden="true" />
        Search
        <kbd className="ml-auto rounded-md bg-white/10 px-1.5 font-figure text-[0.6875rem]">⌘K</kbd>
      </button>
      {sections.map((section) => (
        <nav key={section.label ?? "main"} aria-label={section.label ?? "Main"} className="grid gap-0.5">
          {section.label === null ? null : <p className="px-3 pb-1 pt-4 text-xs text-white/60">{section.label}</p>}
          {section.links.map((link) => {
            const current = linkIsCurrent(link, pathname);
            return (
              <div key={link.href + link.label}>
                <Link
                  href={link.href}
                  aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[0.5625rem] px-3 py-2 text-[0.84375rem] transition-colors duration-200",
                    current ? "bg-white/10 font-semibold text-white" : "text-white/75 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <RailIconMark name={link.icon} current={current} />
                  {link.label}
                  <CountPill count={link.count} current={current} className="ml-auto" />
                </Link>
                {current && link.children !== undefined ? (
                  <ul className="mb-1 ml-[2.375rem] mt-0.5 grid gap-0.5">
                    {link.children.map((child) => (
                      <li key={child.href + child.label}>
                        <Link
                          href={child.href}
                          aria-current={isCurrent(pathname, child.href) ? "page" : undefined}
                          className={cn(
                            "block rounded-md px-2.5 py-1.5 text-[0.8125rem] transition-colors duration-200",
                            isCurrent(pathname, child.href) ? "text-white" : "text-white/70 hover:text-white",
                          )}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>
      ))}
      <div className="mt-auto pt-3">
        <AccountBar signOut={signOut} {...menu} dark />
      </div>
      <CommandSearch sections={sections} open={searching} onClose={() => setSearching(false)} onShortcut={openFromShortcut} />
    </aside>
  );
}
