"use client";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactElement } from "react";
import type { StaffRole } from "@brandbasket/db";
import { WordmarkLogo, type BrandLogo } from "@brandbasket/shared/ui/logo";
import { currentHref, type ConsoleRailSection, type RailCounts } from "@/lib/console-rail";
import { GlobalSearch } from "./global-search";
import { RailAccount, RailNav } from "./rail-nav";

export interface RailProps {
  readonly sections: readonly ConsoleRailSection[];
  readonly counts: RailCounts;
  readonly userName: string;
  readonly role: StaffRole;
  readonly signOut: () => Promise<void>;
  readonly logo: BrandLogo;
}

/** The dark rail from `lg` up: logo, search, the sections with their counts, and the account at the foot. */
export function Rail({ sections, counts, userName, role, signOut, logo }: RailProps): ReactElement {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  return (
    <aside data-surface="dark" className="sticky top-0 z-20 hidden h-dvh w-[14.75rem] shrink-0 flex-col gap-1 overflow-y-auto px-3 py-4 text-white lg:flex">
      <div className="px-2.5">
        <WordmarkLogo href="/" tone="light" brand={logo} />
      </div>
      <p className="px-2.5 pb-2 text-xs text-white/60">Console · staff only</p>
      <button
        type="button"
        onClick={openSearch}
        className="mx-0.5 mb-2 flex items-center gap-2 rounded-[0.625rem] bg-white/[0.07] px-3 py-2 text-[0.8125rem] text-white/75 transition-colors duration-200 hover:bg-white/10"
      >
        <MagnifyingGlass size={16} aria-hidden="true" />
        Search everything
        <kbd className="ml-auto rounded-md bg-white/10 px-1.5 font-figure text-[0.6875rem]">⌘K</kbd>
      </button>
      <RailNav sections={sections} counts={counts} current={currentHref(sections, pathname)} tone="dark" />
      <div className="mt-auto pt-3">
        <RailAccount userName={userName} role={role} signOut={signOut} tone="dark" />
      </div>
      <GlobalSearch open={searching} onClose={() => setSearching(false)} onShortcut={openSearch} />
    </aside>
  );
}
