"use client";

import { MagnifyingGlass, Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { useDialogOpen, useSearchShortcut } from "@brandbasket/shared/ui/v2/dialog-hooks";
import { searchRail, type RailSection, type RailTarget } from "@/lib/rail";
import { RailIconMark } from "./rail-icon";

interface CommandSearchProps {
  readonly sections: readonly RailSection[];
  readonly open: boolean;
  readonly onClose: () => void;
  /** Opens on ⌘K or Ctrl+K. Only one search on the page listens (the rail's), so the shortcut never opens two. */
  readonly onShortcut?: () => void;
}

/** "Website: Authors" is the page Authors inside Website: the page is the name, the group the quieter line after it. */
function splitLabel(label: string): { readonly name: string; readonly group: string | null } {
  const at = label.indexOf(": ");
  return at === -1 ? { name: label, group: null } : { name: label.slice(at + 2), group: label.slice(0, at) };
}

function Result({ target, id, active, onPick, onHover }: { readonly target: RailTarget; readonly id: string; readonly active: boolean; readonly onPick: () => void; readonly onHover: () => void }): ReactElement {
  const { name, group } = splitLabel(target.label);
  return (
    <li role="option" id={id} aria-selected={active} onMouseMove={onHover}>
      <Link
        href={target.href}
        tabIndex={-1}
        onClick={onPick}
        className={cn("flex min-h-11 items-center gap-3 rounded-control px-3 py-2 text-[0.9375rem] text-ink transition-colors duration-200", active && "bg-sunken")}
      >
        <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-ink-2", active ? "bg-surface shadow-lift" : "bg-sunken")}>
          {target.icon === undefined ? <Plus size={18} /> : <RailIconMark name={target.icon} current={false} />}
        </span>
        <span className="min-w-0 truncate">
          <span className="font-medium">{name}</span>
          {group === null ? null : <span className="ml-2 text-ink-3">{group}</span>}
        </span>
      </Link>
    </li>
  );
}

/**
 * Jump to any page. A native dialog: Escape closes it, a click on the shade around it closes it, and focus returns where it was.
 * Focus stays in the search box while the arrow keys move a highlight down the list, and Enter opens the highlighted page.
 */
export function CommandSearch({ sections, open, onClose, onShortcut }: CommandSearchProps): ReactElement {
  const router = useRouter();
  const dialog = useDialogOpen(open);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = searchRail(sections, query);
  const current = Math.min(active, Math.max(0, results.length - 1));
  const optionId = (index: number): string => `${listId}-${index}`;

  useSearchShortcut(onShortcut);

  // Keep the highlighted row in view as the arrow keys move it.
  useEffect(() => {
    list.current?.querySelector(`[id="${optionId(current)}"]`)?.scrollIntoView({ block: "nearest" });
    // optionId is stable for a given list id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, results.length]);

  const close = (): void => {
    setQuery("");
    setActive(0);
    onClose();
  };

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current - 1 + results.length) % results.length);
    } else if (event.key === "Home" && query === "") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && query === "") {
      event.preventDefault();
      setActive(results.length - 1);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={close}
      // A click on the shade lands on the dialog element itself; a click inside it lands on something inside.
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
      aria-label="Search"
      className="mx-auto mt-[10vh] w-[min(34rem,calc(100%-2rem))] overflow-hidden rounded-lift bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/30"
    >
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const picked = results[current];
          if (picked === undefined) return;
          dialog.current?.close();
          router.push(picked.href);
        }}
        className="flex items-center gap-3 border-b border-line px-4"
      >
        <MagnifyingGlass size={20} aria-hidden="true" className="shrink-0 text-ink-2" />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search pages"
          aria-label="Search pages"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results.length === 0 ? undefined : optionId(current)}
          autoComplete="off"
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3"
        />
        <kbd className="hidden shrink-0 rounded-md bg-sunken px-2 py-1 font-figure text-xs text-ink-2 sm:block">Esc</kbd>
      </form>
      <ul ref={list} id={listId} role="listbox" aria-label="Pages" className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain p-2 [scrollbar-gutter:stable]">
        {results.length === 0 ? (
          <li role="presentation" className="px-3 py-6 text-center text-[0.9375rem] text-ink-2">
            Nothing matches that.
          </li>
        ) : null}
        {results.map((target, index) => (
          <Result key={`${target.href}:${target.label}`} target={target} id={optionId(index)} active={index === current} onPick={() => dialog.current?.close()} onHover={() => setActive(index)} />
        ))}
      </ul>
    </dialog>
  );
}
