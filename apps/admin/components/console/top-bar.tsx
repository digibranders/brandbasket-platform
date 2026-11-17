"use client";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useState, type ReactElement } from "react";
import type { StaffBellView } from "@/lib/staff-bell";
import { GlobalSearch } from "./global-search";
import { StaffBell } from "./staff-bell";

interface TopBarProps {
  readonly bell: StaffBellView;
}

/** The desktop top bar: the command bar field, which also owns the ⌘K key, and the notifications bell. Phones use the phone bar. */
export function TopBar({ bell }: TopBarProps): ReactElement {
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  return (
    <header className="sticky top-0 z-10 hidden items-center gap-3 rounded-t-[14px] border-b border-line bg-surface px-8 py-3 lg:flex">
      <button
        type="button"
        onClick={openSearch}
        className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-[0.625rem] bg-sunken px-3 text-left text-[0.875rem] text-ink-2 transition-colors duration-200 hover:bg-line"
      >
        <MagnifyingGlass size={16} aria-hidden="true" />
        Search clients, requests, invoices
        <kbd className="ml-auto rounded-md bg-surface px-1.5 font-figure text-[0.6875rem]">⌘K</kbd>
      </button>
      <span className="ml-auto">
        <StaffBell view={bell} tone="light" />
      </span>
      <GlobalSearch open={searching} onClose={() => setSearching(false)} onShortcut={openSearch} />
    </header>
  );
}
