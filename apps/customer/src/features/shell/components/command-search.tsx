"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type KeyboardEvent } from "react";
import { Dialog, Icon, Input } from "@/ui";
import { cx } from "@/ui/cx";
import { NEW_REQUEST, searchNav, type NavTarget } from "../rules";

export interface CommandSearchProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly targets: readonly NavTarget[];
}

/**
 * Search over the app's pages, opened with Command or Control K (plan 60, section 15). Ported from apps/platform
 * command-search.tsx: arrows wrap, Home and End move only while the box is empty, Enter opens the highlighted page.
 */
export function CommandSearch({ open, onOpenChange, targets }: CommandSearchProps) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = searchNav(targets, query);
  const highlighted = Math.min(active, Math.max(0, results.length - 1));

  const close = (next: boolean) => {
    if (!next) {
      setQuery("");
      setActive(0);
    }
    onOpenChange(next);
  };

  const go = (target: NavTarget | undefined) => {
    if (target === undefined) return;
    close(false);
    router.push(target.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = results.length - 1;
    if (event.key === "ArrowDown") setActive(highlighted >= last ? 0 : highlighted + 1);
    else if (event.key === "ArrowUp") setActive(highlighted <= 0 ? last : highlighted - 1);
    else if (event.key === "Home" && query === "") setActive(0);
    else if (event.key === "End" && query === "") setActive(last);
    else if (event.key === "Enter") go(results[highlighted]);
    else return;
    event.preventDefault();
  };

  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <Dialog open={open} onOpenChange={close} title="Search">
      <div className="relative">
        <Icon name="MagnifyingGlass" size="sm" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <Input
          role="combobox"
          aria-label="Search pages"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results.length === 0 ? undefined : optionId(highlighted)}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="pl-10"
        />
      </div>
      {results.length === 0 ? (
        <p role="status" className="type-body text-ink-3">
          Nothing matches that.
        </p>
      ) : (
        <ul id={listId} role="listbox" aria-label="Pages" className="-mx-2 m-0 flex list-none flex-col p-0">
          {results.map((target, index) => (
            <li
              key={target.href}
              id={optionId(index)}
              role="option"
              aria-selected={index === highlighted}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(target)}
              className={cx("flex h-8 cursor-pointer items-center gap-2.5 rounded-badge px-2.5 type-table text-ink", index === highlighted && "bg-surface-hover")}
            >
              <Icon name={target.href === NEW_REQUEST.href ? "Plus" : "ArrowRight"} size="sm" className="text-ink-3" />
              {target.label}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
