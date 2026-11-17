"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { patternButtonSecondary } from "./button-classes";
import { useConfirmRun, type ConfirmCopy } from "./confirm-copy";
import { DotsGlyph } from "./pattern-icons";
import { useLayer } from "./use-layer";

export interface RowActionItem {
  readonly id: string;
  /** A plain verb. */
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onSelect: () => void;
  readonly confirm?: ConfirmCopy;
  /** The item stays focusable and shows this text so the reason can be read. */
  readonly disabledReason?: string;
  /** Red, and must be last. */
  readonly destructive?: boolean;
  /** A shortcut hint shown at the right of the item, such as `e`. */
  readonly hint?: string;
}

export interface RowVerb {
  readonly label: string;
  readonly onRun: () => void;
  readonly busy?: boolean;
  /** What the verb says while it runs ("Sending"). Defaults to the label. */
  readonly busyLabel?: string;
  readonly disabledReason?: string;
  readonly confirm?: ConfirmCopy;
}

export interface RowActionsProps {
  readonly verb?: RowVerb;
  /** Five at most; a sixth throws in development so the menu never turns into a settings page. */
  readonly items: readonly RowActionItem[];
  readonly busy?: boolean;
  /** Default "More actions". */
  readonly menuLabel?: string;
  /** Controlled open state, so a list can open the menu from the keyboard. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export const MAX_ROW_ACTION_ITEMS = 5;

/** Index after moving `delta` steps through `count` items, wrapping at both ends. */
export function wrapIndex(current: number, delta: number, count: number): number {
  if (count === 0) return -1;
  return (current + delta + count) % count;
}

/** The next item whose label starts with `char`, searching after `from` and wrapping; -1 when none. */
export function typeaheadIndex(labels: readonly string[], from: number, char: string): number {
  const needle = char.toLowerCase();
  for (let step = 1; step <= labels.length; step += 1) {
    const index = (from + step + labels.length) % labels.length;
    if ((labels[index] ?? "").toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

const MENU_ITEM =
  "flex min-h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left font-sans text-[13.5px] leading-5 text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink max-[860px]:min-h-11 aria-disabled:cursor-not-allowed aria-disabled:text-ink-3 aria-disabled:hover:bg-transparent";

/**
 * RowActions: one visible verb plus a three dot menu. The menu is a `menu` with roving focus (arrows, Home, End, type-ahead),
 * opens with focus on the first enabled item, and Esc or Tab closes it and returns focus to the dots.
 */
export function RowActions({ verb, items, busy = false, menuLabel = "More actions", open, onOpenChange }: RowActionsProps): ReactElement {
  if (items.length > MAX_ROW_ACTION_ITEMS && process.env.NODE_ENV !== "production") {
    throw new Error(`RowActions takes at most ${MAX_ROW_ACTION_ITEMS} items, got ${items.length}.`);
  }
  const destructiveAt = items.findIndex((item) => item.destructive);
  if (destructiveAt !== -1 && destructiveAt !== items.length - 1 && process.env.NODE_ENV !== "production") {
    throw new Error("RowActions: a destructive item must be last.");
  }

  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const dotsRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const skipRestore = useRef(false);
  const [position, setPosition] = useState<{ readonly top: number; readonly right: number } | null>(null);
  const confirmRun = useConfirmRun();

  const setOpen = (next: boolean): void => {
    if (open === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };

  useLayer({ open: isOpen, onEscape: () => setOpen(false), containerRef: menuRef, trap: false, returnFocusTo: dotsRef, skipRestore });

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    const rect = dotsRef.current?.getBoundingClientRect();
    if (rect) {
      const menuHeight = items.length * 40 + 12;
      const below = rect.bottom + 4;
      const top = below + menuHeight > window.innerHeight && rect.top - menuHeight - 4 > 0 ? rect.top - menuHeight - 4 : below;
      setPosition({ top, right: Math.max(8, window.innerWidth - rect.right) });
    } else {
      setPosition({ top: 0, right: 8 });
    }
    const first = items.findIndex((item) => item.disabledReason === undefined);
    menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']")[Math.max(first, 0)]?.focus();
    // items identity changes on every parent render; opening is what moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const close = (): void => setOpen(false);
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || dotsRef.current?.contains(target)) return;
      skipRestore.current = true;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
    // setOpen reads the latest props through closure on each render of this effect's dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const rowBusy = busy || verb?.busy === true;

  const runVerb = (): void => {
    if (!verb || rowBusy || verb.disabledReason !== undefined) return;
    confirmRun.request(verb.confirm, verb.onRun);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = wrapIndex(current, 1, nodes.length);
    else if (event.key === "ArrowUp") next = wrapIndex(current < 0 ? 0 : current, -1, nodes.length);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = nodes.length - 1;
    else if (event.key === "Tab") {
      event.preventDefault();
      setOpen(false);
      return;
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") {
      next = typeaheadIndex(items.map((item) => item.label), current, event.key);
    } else return;
    event.preventDefault();
    nodes[next]?.focus();
  };

  const selectItem = (item: RowActionItem): void => {
    if (item.disabledReason !== undefined) return;
    setOpen(false);
    confirmRun.request(item.confirm, item.onSelect);
  };

  const separatorBefore = destructiveAt > 0 ? destructiveAt : -1;

  return (
    <span className="inline-flex items-center gap-1">
      {verb ? (
        <button
          type="button"
          onClick={runVerb}
          aria-disabled={verb.disabledReason !== undefined || undefined}
          aria-busy={rowBusy || undefined}
          disabled={rowBusy}
          title={verb.disabledReason}
          className={patternButtonSecondary}
        >
          {rowBusy ? `${verb.busyLabel ?? verb.label}...` : verb.label}
        </button>
      ) : null}
      <button
        ref={dotsRef}
        type="button"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={rowBusy || items.length === 0}
        onClick={() => setOpen(!isOpen)}
        className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-2 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 max-[860px]:size-11"
      >
        <DotsGlyph />
      </button>
      {isOpen ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
          style={position ? { position: "fixed", top: position.top, right: position.right } : undefined}
          className="motion-pop z-40 min-w-56 rounded-[12px] border border-border bg-surface p-1 text-left shadow-hero"
        >
          {items.map((item, index) => (
            <span key={item.id} className="block">
              {index === separatorBefore ? <span role="separator" className="mx-1.5 my-1 block h-px bg-border" /> : null}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabledReason !== undefined || undefined}
                onClick={() => selectItem(item)}
                className={`${MENU_ITEM} ${item.destructive ? "text-neg-text" : ""}`}
              >
                {item.icon}
                <span className="flex flex-col">
                  <span>{item.label}</span>
                  {item.disabledReason ? <span className="text-xs leading-4 text-ink-3">{item.disabledReason}</span> : null}
                </span>
                {item.hint ? <kbd className="ml-auto rounded-[6px] border border-border bg-surface-hover px-1.5 font-mono text-xs text-ink">{item.hint}</kbd> : null}
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {confirmRun.dialog}
    </span>
  );
}
