"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, type ReactElement } from "react";
import { CommandBar, useShortcuts, type CommandItem, type CommandMode } from "@brandbasket/shared/ui/patterns";
import { ACTION_ITEMS, addRecent, EMPTY_STATE_ITEMS, goToItems, hitsForMode, hitToItem, parseRecent, RECENT_STORAGE_KEY } from "@/lib/console-command-items";
import type { SearchHit } from "@/lib/console-search-kinds";

const MIN_TERM = 2;

interface GlobalSearchProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Opens on Ctrl K, Cmd K and `/`. Only the rail's instance passes it, so the keys never open two bars. */
  readonly onShortcut?: () => void;
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(RECENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string): void {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, value);
  } catch {
    // Storage can be blocked; Recent is a convenience, so it simply stays empty.
  }
}

/**
 * The console's command bar: Go to, Actions, Recent and the six search kinds. Search is the same `POST /search` as before,
 * so each search is still written to the access log. Recent lives only in this browser and holds links and labels staff
 * already saw.
 */
export function GlobalSearch({ open, onClose, onShortcut }: GlobalSearchProps): ReactElement | null {
  const router = useRouter();
  const seen = useRef(new Map<string, CommandItem>());
  const staticItems = useMemo(() => [...goToItems(), ...ACTION_ITEMS], []);

  // The phone bar's instance has no shortcut, so it mounts the bar only while open and never listens for keys.
  useShortcuts(
    [{ id: "command-bar-slash", keys: "/", label: "Search", group: "Anywhere", run: () => onShortcut?.() }],
    onShortcut !== undefined,
  );

  // Read each time the bar opens, so what another tab opened shows up. Closed means nothing is read.
  const recent = useMemo<readonly CommandItem[]>(() => (open ? parseRecent(readStored()) : []), [open]);

  const search = useCallback(async (term: string, mode: CommandMode): Promise<readonly CommandItem[]> => {
    if (term.length < MIN_TERM) return [];
    const response = await fetch("/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: term }), cache: "no-store" });
    if (!response.ok) throw new Error(`Search failed with ${response.status}`);
    const body = (await response.json()) as { readonly hits: readonly SearchHit[] };
    const items = hitsForMode(body.hits, mode).map(hitToItem);
    for (const item of items) if (item.href !== undefined) seen.current.set(item.href, item);
    return items;
  }, []);

  const onNavigate = useCallback(
    (href: string, newTab: boolean): void => {
      const item = seen.current.get(href);
      if (item !== undefined) writeStored(addRecent(readStored(), item));
      if (newTab) window.open(href, "_blank", "noopener");
      else router.push(href);
    },
    [router],
  );

  const onOpenChange = useCallback(
    (next: boolean): void => {
      if (next) onShortcut?.();
      else onClose();
    },
    [onClose, onShortcut],
  );

  if (!open && onShortcut === undefined) return null;
  return <CommandBar open={open} onOpenChange={onOpenChange} staticItems={staticItems} search={search} recent={recent} onNavigate={onNavigate} emptyItems={EMPTY_STATE_ITEMS} />;
}
