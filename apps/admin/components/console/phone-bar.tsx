"use client";

import { List, MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { WordmarkLogo } from "@brandbasket/shared/ui/logo";
import { currentHref } from "@/lib/console-rail";
import { GlobalSearch } from "./global-search";
import type { RailProps } from "./rail";
import { RailAccount, RailNav } from "./rail-nav";

/** Below `lg`: a light top bar with the logo, search and Menu; Menu opens the rail's links in a sheet. */
export function PhoneBar({ sections, counts, userName, role, signOut, logo }: RailProps): ReactElement {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = sheet.current;
    if (element === null) return;
    if (menuOpen && !element.open) element.showModal();
    if (!menuOpen && element.open) element.close();
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-bg/90 px-5 py-3 backdrop-blur lg:hidden">
        <WordmarkLogo href="/" brand={logo} />
        <span className="flex gap-1">
          <button type="button" onClick={() => setSearching(true)} aria-label="Search everything" className="grid size-10 place-items-center rounded-full text-ink transition-colors duration-200 hover:bg-sunken">
            <MagnifyingGlass size={22} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Menu" className="grid size-10 place-items-center rounded-full text-ink transition-colors duration-200 hover:bg-sunken">
            <List size={22} aria-hidden="true" />
          </button>
        </span>
      </header>

      <dialog ref={sheet} onClose={() => setMenuOpen(false)} aria-label="Menu" className="m-0 ml-auto h-dvh max-h-none w-[min(20rem,100%)] bg-bg p-0 text-ink backdrop:bg-ink/30">
        <div className="flex h-full flex-col gap-1 overflow-y-auto px-4 py-4">
          <div className="flex items-center justify-between pb-2">
            <WordmarkLogo href="/" brand={logo} />
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid size-10 place-items-center rounded-full transition-colors duration-200 hover:bg-sunken">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <RailNav sections={sections} counts={counts} current={currentHref(sections, pathname)} tone="light" onNavigate={() => setMenuOpen(false)} />
          <div className="mt-auto pt-3">
            <RailAccount userName={userName} role={role} signOut={signOut} tone="light" />
          </div>
        </div>
      </dialog>

      <GlobalSearch open={searching} onClose={() => setSearching(false)} />
    </>
  );
}
