"use client";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { searchRail, type RailSection } from "@/lib/rail";

interface CommandSearchProps {
  readonly sections: readonly RailSection[];
  readonly open: boolean;
  readonly onClose: () => void;
  /** Opens on ⌘K or Ctrl+K. Only one search on the page listens (the rail's), so the shortcut never opens two. */
  readonly onShortcut?: () => void;
}

/** Jump to any page. A native dialog: Escape closes it and focus returns where it was. */
export function CommandSearch({ sections, open, onClose, onShortcut }: CommandSearchProps): ReactElement {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const results = searchRail(sections, query);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (onShortcut === undefined) return;
    const listen = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onShortcut();
      }
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, [onShortcut]);

  const close = (): void => {
    setQuery("");
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      onClose={close}
      aria-label="Search"
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100%-2rem))] overflow-hidden rounded-lift bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/30"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const first = results[0];
          if (first === undefined) return;
          close();
          router.push(first.href);
        }}
        className="flex items-center gap-2 border-b border-line px-4"
      >
        <MagnifyingGlass size={18} aria-hidden="true" className="text-ink-2" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages"
          aria-label="Search pages"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-2"
        />
      </form>
      <ul className="max-h-[50vh] overflow-y-auto py-1">
        {results.length === 0 ? <li className="px-4 py-3 text-sm text-ink-2">Nothing matches that.</li> : null}
        {results.map((target) => (
          <li key={`${target.href}:${target.label}`}>
            <Link
              href={target.href}
              onClick={close}
              className="block px-4 py-2.5 text-sm transition-colors duration-200 hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-offset-[-2px]"
            >
              {target.label}
            </Link>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
