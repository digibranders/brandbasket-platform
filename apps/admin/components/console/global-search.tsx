"use client";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useDialogOpen, useSearchShortcut } from "@brandbasket/shared/ui/v2/dialog-hooks";
import { SEARCH_KIND_LABELS, SEARCH_KINDS, type SearchHit } from "@/lib/console-search-kinds";

/** How long typing must pause before a search is sent. */
const DEBOUNCE_MS = 200;
const MIN_TERM = 2;

interface GlobalSearchProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Opens on ⌘K or Ctrl+K. Only the rail's search listens, so the shortcut never opens two. */
  readonly onShortcut?: () => void;
}

/** Search everything: clients, enquiries, requests and invoice numbers. A native dialog, so Escape closes it. */
export function GlobalSearch({ open, onClose, onShortcut }: GlobalSearchProps): ReactElement {
  const router = useRouter();
  const dialog = useDialogOpen(open);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<readonly SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [failed, setFailed] = useState(false);

  useSearchShortcut(onShortcut);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const search = (value: string): void => {
    setQuery(value);
    if (timer.current !== null) clearTimeout(timer.current);
    const term = value.trim();
    if (term.length < MIN_TERM) {
      latest.current += 1;
      setHits([]);
      setSearched(false);
      setFailed(false);
      return;
    }
    timer.current = setTimeout(() => {
      latest.current += 1;
      const mine = latest.current;
      void fetch("/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: term }), cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Search failed with ${response.status}`);
          return (await response.json()) as { readonly hits: readonly SearchHit[] };
        })
        .then((body) => {
          if (mine !== latest.current) return;
          setHits(body.hits);
          setSearched(true);
          setFailed(false);
        })
        .catch(() => {
          if (mine !== latest.current) return;
          setHits([]);
          setSearched(true);
          setFailed(true);
        });
    }, DEBOUNCE_MS);
  };

  const close = (): void => {
    latest.current += 1;
    setQuery("");
    setHits([]);
    setSearched(false);
    setFailed(false);
    onClose();
  };

  const groups = SEARCH_KINDS.map((kind) => ({ kind, hits: hits.filter((hit) => hit.kind === kind) })).filter((group) => group.hits.length > 0);

  return (
    <dialog
      ref={dialog}
      onClose={close}
      aria-label="Search everything"
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100%-2rem))] overflow-hidden rounded-lift bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/30"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const first = groups[0]?.hits[0];
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
          onChange={(event) => search(event.target.value)}
          placeholder="Clients, enquiries, requests or invoice numbers"
          aria-label="Search everything"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-2"
        />
      </form>
      <div className="max-h-[50vh] overflow-y-auto pb-2">
        {failed ? (
          <p role="alert" className="px-4 py-3 text-sm text-error">
            Search is not working right now. Try again.
          </p>
        ) : null}
        {!failed && searched && groups.length === 0 ? <p className="px-4 py-3 text-sm text-ink-2">Nothing matches that.</p> : null}
        {groups.map((group) => (
          <section key={group.kind} aria-label={SEARCH_KIND_LABELS[group.kind]}>
            <p className="px-4 pb-1 pt-3 text-xs font-semibold text-ink-2">{SEARCH_KIND_LABELS[group.kind]}</p>
            <ul>
              {group.hits.map((hit) => (
                <li key={hit.href + hit.label}>
                  <Link href={hit.href} onClick={close} className="block px-4 py-2 transition-colors duration-200 hover:bg-sunken focus-visible:bg-sunken">
                    <span className="block text-sm font-semibold">{hit.label}</span>
                    <span className="block text-xs text-ink-2">{hit.sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </dialog>
  );
}
