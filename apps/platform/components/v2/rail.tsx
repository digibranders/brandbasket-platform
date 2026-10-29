"use client";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import type { AccountPanel } from "@brandbasket/shared/lib/account-panel";
import { initialsOf } from "@brandbasket/shared/lib/names";
import { AccountBar, type AccountBarAccount } from "@brandbasket/shared/ui/panel/account-bar";
import { WordmarkLogo, type BrandLogo } from "@brandbasket/shared/ui/logo";
import { isCurrent, linkIsCurrent, type RailSection } from "@/lib/rail";
import { SERVICE_DOT } from "./classes";
import { CommandSearch } from "./command-search";
import { CountPill } from "./count-pill";
import { RailIconMark } from "./rail-icon";

/** What the account menu needs, the same for the sidebar and the phone menu. */
export interface AccountMenu {
  readonly account: AccountBarAccount;
  readonly panel: AccountPanel | null;
  readonly docsUrl: string;
  /** Where Help goes: the New request form. */
  readonly helpHref: string;
}

interface RailProps {
  readonly sections: readonly RailSection[];
  readonly logo: BrandLogo;
  readonly menu: AccountMenu;
  readonly businessName: string;
  readonly signOut: () => Promise<void>;
}

/** The sidebar from `lg` up: logo, the business, search, the sections, and the account at the foot. */
export function Rail({ sections, logo, menu, businessName, signOut }: RailProps): ReactElement {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  // The sidebar is display:none below lg; a dialog opened inside it would leave the page inert with nothing to see.
  const openFromShortcut = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setSearching(true);
  }, []);
  return (
    <aside className="sticky top-0 z-20 hidden h-dvh w-[16.5rem] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-3 py-4 lg:flex">
      <div className="px-2.5 pb-4 pt-1">
        <WordmarkLogo href="/" brand={logo} />
      </div>
      <div className="mx-0.5 mb-3 flex items-center gap-2.5 rounded-control border border-line px-2.5 py-2">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-rattan-wash text-xs font-bold text-rattan-ink">
          {initialsOf(businessName)}
        </span>
        <span className="min-w-0 truncate text-[0.9375rem] font-semibold text-ink">{businessName}</span>
      </div>
      <button
        type="button"
        onClick={openSearch}
        className="mx-0.5 mb-2 flex h-11 items-center gap-2 rounded-control bg-sunken px-3 text-[0.9375rem] text-ink-3 transition-colors duration-200 hover:bg-line"
      >
        <MagnifyingGlass size={18} aria-hidden="true" />
        Search
        <kbd className="ml-auto rounded-md border border-line bg-surface px-1.5 font-figure text-xs">⌘K</kbd>
      </button>
      {sections.map((section) => (
        <nav key={section.label ?? "main"} aria-label={section.label ?? "Main"} className="grid gap-0.5">
          {section.label === null ? null : <p className="px-3 pb-1 pt-4 text-[0.8125rem] font-medium text-ink-3">{section.label}</p>}
          {section.links.map((link) => {
            const current = linkIsCurrent(link, pathname);
            return (
              <Link
                key={link.href + link.label}
                href={link.href}
                aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
                className={cn(
                  "flex h-[2.625rem] items-center gap-3 rounded-lg px-3 text-[0.9375rem] transition-colors duration-200",
                  current ? "bg-sunken font-semibold text-ink" : "font-medium text-ink-2 hover:bg-sunken hover:text-ink",
                )}
              >
                <RailIconMark name={link.icon} current={current} />
                {link.label}
                <CountPill count={link.count} current={current} className="ml-auto" />
                {link.mark === undefined ? null : <span aria-hidden="true" className={cn("ml-auto size-2 rounded-[2px]", SERVICE_DOT[link.mark])} />}
              </Link>
            );
          })}
        </nav>
      ))}
      <div className="mt-auto pt-3">
        <AccountBar signOut={signOut} {...menu} dark={false} />
      </div>
      <CommandSearch sections={sections} open={searching} onClose={() => setSearching(false)} onShortcut={openFromShortcut} />
    </aside>
  );
}
