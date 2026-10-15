"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { SearchIcon, SettingsIcon, SignOutIcon } from "@fynix/shared/ui/icons";
import { avatarInitials } from "@/lib/avatar";

interface TopPillProps {
  readonly userName: string;
  readonly userEmail: string;
  /** The app's sign-out server action. */
  readonly signOut: () => Promise<void>;
}

/**
 * Search and the account menu, in one glass pill at the top right. Search finds leads, as it always has; on phones
 * it becomes a button to the Leads page, which has its own search field.
 */
export function TopPill({ userName, userEmail, signOut }: TopPillProps): ReactElement {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent): void {
      if (wrapperRef.current !== null && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="glass flex items-center gap-1 rounded-full p-1.5">
        <form action="/leads" role="search" className="hidden sm:block">
          <label htmlFor="console-search" className="sr-only">
            Search leads
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-paper/80" />
            <input
              id="console-search"
              name="q"
              type="search"
              placeholder="Search leads"
              className="w-56 rounded-full bg-white/10 py-2 pl-10 pr-4 text-sm text-paper transition-[width] duration-300 ease-calm placeholder:text-paper/80 focus:w-72 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
          </div>
        </form>
        <Link
          href="/leads"
          aria-label="Search leads"
          className="grid size-9 place-items-center rounded-full text-paper/80 hover:bg-white/10 hover:text-paper sm:hidden"
        >
          <SearchIcon className="size-4" />
        </Link>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Account: ${userName}`}
          onClick={() => setOpen((value) => !value)}
          className="grid size-9 place-items-center rounded-full bg-paper text-[0.7rem] font-bold text-ink transition-transform duration-300 ease-calm hover:scale-105"
        >
          {avatarInitials(userName)}
        </button>
      </div>

      {open ? (
        <div
          id={menuId}
          role="region"
          aria-label="Account"
          className="glass glass-dense focus-strip absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 rounded-3xl p-2 shadow-[0_24px_60px_-24px_rgba(42,13,16,0.6)]"
        >
          <div className="px-4 pb-3 pt-3">
            <p className="font-serif text-lg leading-tight">{userName}</p>
            <p className="mt-0.5 truncate text-sm text-paper/65">{userEmail}</p>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-paper/85 transition-colors duration-300 ease-calm hover:bg-white/10 hover:text-paper"
          >
            <SettingsIcon className="size-4" />
            Settings
          </Link>
          <form action={signOut} className="border-t border-white/10 pt-2">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-paper/85 transition-colors duration-300 ease-calm hover:bg-white/10 hover:text-paper"
            >
              <SignOutIcon className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
