"use client";

import { List, MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { AccountBar } from "@brandbasket/shared/ui/panel/account-bar";
import { WordmarkLogo, type BrandLogo } from "@brandbasket/shared/ui/logo";
import { isCurrent, linkIsCurrent, type RailSection } from "@/lib/rail";
import { CommandSearch } from "./command-search";
import type { AccountMenu } from "./rail";
import { RailIconMark } from "./rail-icon";

interface PhoneBarsProps {
  readonly sections: readonly RailSection[];
  readonly logo: BrandLogo;
  readonly menu: AccountMenu;
  readonly signOut: () => Promise<void>;
}

/** Below `lg`: a light top bar (logo, search), a tab bar with the first section and Menu, and the Menu sheet. */
export function PhoneBars({ sections, logo, menu, signOut }: PhoneBarsProps): ReactElement {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const tabs = sections[0]?.links ?? [];

  useEffect(() => {
    const element = sheet.current;
    if (element === null) return;
    if (menuOpen && !element.open) element.showModal();
    if (!menuOpen && element.open) element.close();
  }, [menuOpen]);

  return (
    <>
      <header className="flex items-center justify-between bg-bg px-5 pb-2 pt-3 lg:hidden">
        <WordmarkLogo href="/" brand={logo} />
        <button type="button" onClick={() => setSearching(true)} aria-label="Search" className="grid size-10 place-items-center rounded-full text-ink transition-colors duration-200 hover:bg-sunken">
          <MagnifyingGlass size={22} aria-hidden="true" />
        </button>
      </header>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((link) => {
          const current = linkIsCurrent(link, pathname);
          return (
            <Link key={link.href} href={link.href} aria-current={isCurrent(pathname, link.href) ? "page" : undefined} className={cn("grid justify-items-center gap-0.5 text-[0.6875rem] font-semibold", current ? "text-ink" : "text-ink-2")}>
              <RailIconMark name={link.icon} current={current} />
              {link.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMenuOpen(true)} className="grid justify-items-center gap-0.5 text-[0.6875rem] font-semibold text-ink-2">
          <List size={18} aria-hidden="true" />
          Menu
        </button>
      </nav>

      <dialog
        ref={sheet}
        onClose={() => setMenuOpen(false)}
        onClick={(event) => {
          // The dialog has no padding, so a click that lands on the dialog itself is a click on the dimmed backdrop.
          if (event.target === event.currentTarget) setMenuOpen(false);
        }}
        aria-label="Menu"
        className="m-0 ml-auto h-dvh max-h-none w-[min(20rem,100%)] bg-bg p-0 text-ink backdrop:bg-ink/30"
      >
        <div
          className="flex h-full flex-col gap-1 px-4 py-4"
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a[href]") !== null) setMenuOpen(false);
          }}
        >
          <div className="flex items-center justify-between pb-2">
            <WordmarkLogo href="/" brand={logo} />
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid size-10 place-items-center rounded-full hover:bg-sunken">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {sections.map((section) => (
            <nav key={section.label ?? "main"} aria-label={section.label ?? "Main"} className="grid gap-0.5">
              {section.label === null ? null : <p className="px-3 pb-1 pt-3 text-xs text-ink-2">{section.label}</p>}
              {section.links.flatMap((link) => [link, ...(link.children ?? []).map((child) => ({ ...child, icon: link.icon }))]).map((target) => (
                <Link key={target.href + target.label} href={target.href} aria-current={isCurrent(pathname, target.href) ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", isCurrent(pathname, target.href) ? "bg-sunken font-semibold" : "text-ink")}>
                  <RailIconMark name={target.icon} current={isCurrent(pathname, target.href)} />
                  {target.label}
                </Link>
              ))}
            </nav>
          ))}
          <div className="mt-auto">
            <AccountBar signOut={signOut} {...menu} dark={false} />
          </div>
        </div>
      </dialog>

      <CommandSearch sections={sections} open={searching} onClose={() => setSearching(false)} />
    </>
  );
}
