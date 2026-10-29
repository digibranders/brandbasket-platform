"use client";

import { List, MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { AccountBar } from "@brandbasket/shared/ui/panel/account-bar";
import { WordmarkLogo, type BrandLogo } from "@brandbasket/shared/ui/logo";
import { isCurrent, linkIsCurrent, menuChildren, phoneTabs, type RailSection } from "@/lib/rail";
import { SERVICE_DOT } from "./classes";
import { CommandSearch } from "./command-search";
import { CountPill } from "./count-pill";
import type { AccountMenu } from "./rail";
import { RailIconMark } from "./rail-icon";

interface PhoneBarsProps {
  readonly sections: readonly RailSection[];
  readonly logo: BrandLogo;
  readonly menu: AccountMenu;
  readonly signOut: () => Promise<void>;
}

/** Below `lg`: a top bar (logo, search), a bottom tab bar (Home, the first service, Requests, Business and Menu), and the Menu sheet. */
export function PhoneBars({ sections, logo, menu, signOut }: PhoneBarsProps): ReactElement {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const tabs = phoneTabs(sections);

  useEffect(() => {
    const element = sheet.current;
    if (element === null) return;
    if (menuOpen && !element.open) element.showModal();
    if (!menuOpen && element.open) element.close();
  }, [menuOpen]);

  return (
    <>
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-1.5 lg:hidden">
        <WordmarkLogo href="/" brand={logo} />
        <button type="button" onClick={() => setSearching(true)} aria-label="Search" className="grid size-11 place-items-center rounded-full text-ink transition-colors duration-200 hover:bg-sunken">
          <MagnifyingGlass size={22} aria-hidden="true" />
        </button>
      </header>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-surface pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((link) => {
          const current = linkIsCurrent(link, pathname);
          return (
            <Link key={link.href} href={link.href} aria-current={isCurrent(pathname, link.href) ? "page" : undefined} className={cn("grid min-h-14 content-center justify-items-center gap-0.5 text-xs font-semibold", current ? "text-ink" : "text-ink-2")}>
              <span className="relative">
                <RailIconMark name={link.icon} current={current} />
                <CountPill count={link.count} current={current} className="absolute -right-3 -top-1.5" />
              </span>
              {link.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMenuOpen(true)} className="grid min-h-14 content-center justify-items-center gap-0.5 text-xs font-semibold text-ink-2">
          <List size={20} aria-hidden="true" />
          More
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
        className="m-0 ml-auto h-dvh max-h-none w-[min(21rem,100%)] bg-bg p-0 text-ink backdrop:bg-ink/30"
      >
        <div
          className="flex h-full flex-col gap-1 overflow-y-auto px-4 py-4"
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a[href]") !== null) setMenuOpen(false);
          }}
        >
          <div className="flex items-center justify-between pb-2">
            <WordmarkLogo href="/" brand={logo} />
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid size-11 place-items-center rounded-full hover:bg-sunken">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {sections.map((section) => (
            <nav key={section.label ?? "main"} aria-label={section.label ?? "Main"} className="grid gap-0.5">
              {section.label === null ? null : <p className="px-3 pb-1 pt-3 text-[0.8125rem] font-medium text-ink-3">{section.label}</p>}
              {section.links.map((link) => {
                const here = isCurrent(pathname, link.href);
                const children = menuChildren(link);
                return (
                  <div key={link.href + link.label}>
                    <Link href={link.href} aria-current={here ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-base", here ? "bg-sunken font-semibold" : "font-medium text-ink")}>
                      <RailIconMark name={link.icon} current={here} />
                      {link.label}
                      {link.mark === undefined ? null : <span aria-hidden="true" className={cn("ml-auto size-2 rounded-[2px]", SERVICE_DOT[link.mark])} />}
                    </Link>
                    {children.length === 0 ? null : (
                      <ul className="ml-[2.75rem] grid gap-0.5">
                        {children.map((child) => (
                          <li key={child.href + child.label}>
                            <Link href={child.href} aria-current={isCurrent(pathname, child.href) ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-md px-2.5 text-[0.9375rem]", isCurrent(pathname, child.href) ? "bg-sunken font-semibold text-ink" : "text-ink-2")}>
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
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
