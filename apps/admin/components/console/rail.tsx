"use client";

import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { WordmarkLogo, type BrandLogo } from "@brandbasket/shared/ui/logo";
import { currentHref, type ConsoleRailLink, type RailCounts } from "@/lib/console-rail";
import { RailAccount, RailNav } from "./rail-nav";

export interface RailProps {
  readonly links: readonly ConsoleRailLink[];
  readonly counts: RailCounts;
  readonly userName: string;
  readonly signOut: () => Promise<void>;
  readonly logo: BrandLogo;
}

/** The dark rail from `lg` up: logo, the six items with their counts, and the signed-in member at the foot. Search and the bell sit in the top bar. */
export function Rail({ links, counts, userName, signOut, logo }: RailProps): ReactElement {
  const pathname = usePathname();
  return (
    <aside data-surface="dark" className="sticky top-0 z-20 hidden h-dvh w-[14.75rem] shrink-0 flex-col gap-1 overflow-y-auto bg-[#23242A] px-3 py-4 text-white lg:flex">
      <div className="px-2.5">
        <WordmarkLogo href="/" tone="light" brand={logo} />
      </div>
      <p className="px-2.5 pb-3 text-xs text-white/60">Console · staff only</p>
      <RailNav links={links} counts={counts} current={currentHref(links, pathname)} tone="dark" />
      <div className="mt-auto pt-3">
        <RailAccount userName={userName} signOut={signOut} tone="dark" />
      </div>
    </aside>
  );
}
