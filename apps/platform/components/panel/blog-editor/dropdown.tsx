"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { cn } from "@firstfold/shared/lib/cn";
import { placeDropdown } from "@firstfold/shared/lib/dropdown-placement";
import { CaretGlyph, CheckGlyph } from "./icons";

export interface DropdownOption {
  readonly value: string;
  readonly label: string;
}

interface DropdownProps {
  /** The trigger's id, so a `<label htmlFor>` can name it. */
  readonly id?: string;
  /** For a dropdown with no visible label (the editor toolbar's text style). */
  readonly ariaLabel?: string;
  readonly value: string;
  readonly options: readonly DropdownOption[];
  readonly onChange: (value: string) => void;
  /** "field" is a full-width form field; "toolbar" is the compact one in the editor's toolbar. */
  readonly variant?: "field" | "toolbar";
  /**
   * Keeps whatever had focus focused while the dropdown is used with the mouse. The editor toolbar needs this: taking
   * focus would drop the text selection the chosen style applies to.
   */
  readonly keepFocus?: boolean;
}

const TRIGGER_CLASS: Readonly<Record<"field" | "toolbar", string>> = {
  field:
    "flex w-full items-center justify-between gap-2 rounded-control border border-line bg-card px-3 py-2 text-left text-sm text-ink transition-colors duration-200 ease-calm hover:border-ink-soft/40 focus-visible:border-accent",
  toolbar:
    "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink transition-colors duration-200 ease-calm hover:bg-paper-deep",
};

/** The narrowest the list gets, so a short toolbar trigger still opens a list wide enough to read. */
const MIN_LIST_WIDTH = 176;

/**
 * A select in the dashboard's own look. The browser's `<select>` opens a list drawn by the operating system, which
 * no stylesheet reaches; this one opens a cream list that belongs to the panel. It behaves like a select: click or
 * Enter/Space/arrow opens it, arrows move, Enter chooses, Escape or a click elsewhere closes it.
 *
 * The list is rendered at the end of `<body>`, not beside the trigger: the editor toolbar scrolls sideways and blurs
 * its backdrop, either of which would clip a list rendered inside it. It is placed against the trigger by
 * `placeDropdown`: below by default, above when the window has more room there (anchored by its bottom edge), never
 * taller than 18rem or wider than 20rem, and never past the window's edges. It follows the trigger when the page
 * scrolls, and closes if the trigger scrolls out of sight. A body portal is inert inside a modal `<dialog>`, so this
 * component belongs on full pages only; the editor and its taxonomy pickers are.
 */
export function Dropdown({
  id,
  ariaLabel,
  value,
  options,
  onChange,
  variant = "field",
  keepFocus = false,
}: DropdownProps): ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  /** The list's content width, measured once per opening so scrolling never makes it jump. */
  const naturalWidth = useRef(0);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex === -1 ? undefined : options[selectedIndex];

  const close = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    setActive(selectedIndex === -1 ? 0 : selectedIndex);
    setOpen(true);
  }, [selectedIndex]);

  const choose = useCallback(
    (index: number) => {
      const option = options[index];
      if (option !== undefined && option.value !== value) onChange(option.value);
      close();
    },
    [close, onChange, options, value],
  );

  const place = useCallback((): void => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (trigger === null || menu === null) return;
    const box = trigger.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) {
      // The trigger has scrolled out of sight; a list left floating would point at nothing.
      setOpen(false);
      return;
    }
    // The list's own border sits outside its scrollable content; scrollHeight is the options' full height.
    const border = menu.offsetHeight - menu.clientHeight;
    const placement = placeDropdown({
      trigger: { top: box.top, bottom: box.bottom, left: box.left, width: box.width },
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      list: { width: naturalWidth.current, height: border + menu.scrollHeight },
    });
    menu.style.left = `${String(placement.left)}px`;
    menu.style.width = `${String(placement.width)}px`;
    menu.style.maxWidth = `${String(placement.width)}px`;
    menu.style.top = placement.side === "below" ? `${String(placement.offset)}px` : "auto";
    menu.style.bottom = placement.side === "above" ? `${String(placement.offset)}px` : "auto";
    menu.style.maxHeight = `${String(placement.maxHeight)}px`;
  }, []);

  // Measure and place the list before the browser paints it, so it never flashes in the wrong spot.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || menu === null) return;
    menu.style.width = "max-content";
    menu.style.maxWidth = "none";
    naturalWidth.current = Math.max(menu.offsetWidth, MIN_LIST_WIDTH);
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${String(active)}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) === true || menuRef.current?.contains(target) === true) return;
      close();
    }
    // Scrolling the options themselves moves nothing else; any other scroll or resize moves the trigger.
    function follow(event: Event): void {
      if (event.target instanceof Node && menuRef.current?.contains(event.target) === true) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
    };
  }, [open, close, place]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(TRIGGER_CLASS[variant], "focus:outline-none")}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ""}</span>
        <CaretGlyph
          className={cn(
            "size-3.5 shrink-0 text-ink-soft transition-transform duration-200 ease-calm",
            open && "rotate-180",
          )}
        />
      </button>
      {!open
        ? null
        : createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="fixed left-0 top-0 z-[70] overflow-y-auto overflow-x-hidden rounded-control border border-line bg-card p-1.5 text-sm text-ink shadow-[0_18px_40px_-18px_rgba(42,13,16,0.35)]"
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    // Never takes focus itself: the trigger keeps it, and drives the list with the keyboard.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(index)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2",
                      index === active && "bg-paper-deep",
                      isSelected && "font-medium",
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? <CheckGlyph className="size-3.5 shrink-0 text-accent-deep" /> : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )}
    </>
  );
}
