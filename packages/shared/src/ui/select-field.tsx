"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChevronDownIcon, SearchIcon, TickIcon } from "./icons";
import { cn } from "../lib/cn";
import { placeDropdown } from "../lib/dropdown-placement";
import { matchTypeahead, moveActive, type ListboxMove } from "../lib/listbox";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** A heading the option sits under. Options sharing one should be next to each other in the list. */
  readonly group?: string;
}

/** The form's error wiring for a field, as the other inputs in each form already compute it. */
type FieldStatus = { readonly "aria-invalid"?: boolean | "true" | "false"; readonly "aria-describedby"?: string };

interface SelectFieldProps extends FieldStatus {
  /** The trigger's id. A visible `<label htmlFor>` pointing here names the field for screen readers. */
  readonly id: string;
  /** Submitted with the form. Leave out for a dropdown that only drives the page (a filter, a sort). */
  readonly name?: string;
  readonly options: readonly SelectOption[];
  /** Controlled value. Pair with onChange. */
  readonly value?: string;
  /** Starting value when uncontrolled; a form reset returns to it. */
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  /** Shown while no option is chosen. */
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  /** The id of the form this belongs to, when it is rendered outside it. */
  readonly form?: string;
  /** Adds a filter box to the list. On by default for a list long enough to need it. */
  readonly searchable?: boolean;
  /** What the closed trigger shows for the chosen option (the phone field shows a flag and dial code). */
  readonly renderValue?: (option: SelectOption) => ReactNode;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  /** The trigger's look: pass the same classes as the form's other fields. */
  readonly className?: string;
  /** The wrapper's classes, for a dropdown that sits in a row. */
  readonly wrapperClassName?: string;
}

/** A list longer than this gets a filter box unless the caller says otherwise. */
const SEARCH_THRESHOLD = 10;
/** Letters typed within this long of each other count as one word for jumping to an option. */
const TYPEAHEAD_RESET_MS = 600;

const MOVE_KEYS: Readonly<Record<string, ListboxMove>> = {
  ArrowDown: "next",
  ArrowUp: "previous",
  Home: "first",
  End: "last",
  PageDown: "last",
  PageUp: "first",
};

/** Feature-tested once: the top layer keeps the list above dialogs and out of any clipping parent. */
function supportsPopover(element: HTMLElement): boolean {
  return typeof element.showPopover === "function";
}

/** An option with its place in the full list, which ids and the active highlight refer to. */
interface Entry {
  readonly option: SelectOption;
  readonly index: number;
}

interface Section {
  readonly group: string | undefined;
  readonly entries: readonly Entry[];
}

/** Runs of neighbouring options under the same heading. */
function sectionsOf(entries: readonly Entry[]): readonly Section[] {
  const sections: { group: string | undefined; entries: Entry[] }[] = [];
  for (const entry of entries) {
    const last = sections.at(-1);
    if (last !== undefined && last.group === entry.option.group) last.entries.push(entry);
    else sections.push({ group: entry.option.group, entries: [entry] });
  }
  return sections;
}

function matchesFilter(option: SelectOption, needle: string): boolean {
  return needle === "" || option.label.toLocaleLowerCase().includes(needle);
}

/**
 * A single-choice dropdown drawn in Fynix Digital's style instead of the operating system's menu, used for every choice
 * list in the dashboard and console. It follows the WAI-ARIA select-only combobox pattern: a button that opens a
 * listbox, with the highlighted option announced through aria-activedescendant. Arrows, Home and End move; Enter or
 * Space choose; Escape closes; typing jumps to an option, or filters it when the list has a search box.
 *
 * The list opens in the browser's top layer, positioned against the trigger: below it, or above when the window has
 * more room there, never wider than 20rem or taller than 18rem, and never past the window's edges. The top layer
 * keeps it clear of clipping parents and stacking order, and it stays inside the trigger's DOM so it still works in
 * a modal dialog, which makes everything outside itself inert.
 *
 * The value goes to the form in a visually hidden input that carries `required`, so the browser's constraint
 * validation (and the submit gate) treats this exactly like the native select it replaces.
 */
export function SelectField({
  id,
  name,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Choose",
  required = false,
  disabled = false,
  form,
  searchable = options.length > SEARCH_THRESHOLD,
  renderValue,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  className,
  wrapperClassName,
}: SelectFieldProps): ReactElement {
  const listId = useId();
  const optionId = (index: number): string => `${listId}-option-${String(index)}`;
  const [ownValue, setOwnValue] = useState(defaultValue);
  const current = value ?? ownValue;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const pickedByUser = useRef(false);
  /** The list's content width, measured once per opening so filtering or scrolling never makes it jump. */
  const naturalWidth = useRef(0);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((option) => option.value === current);
  const selected = options[selectedIndex] ?? null;

  const visible = useMemo((): readonly Entry[] => {
    const needle = query.trim().toLocaleLowerCase();
    return options.flatMap((option, index) => (matchesFilter(option, needle) ? [{ option, index }] : []));
  }, [options, query]);
  const enabled = useMemo(() => visible.filter(({ option }) => option.disabled !== true).map(({ index }) => index), [visible]);
  const sections = useMemo(() => sectionsOf(visible), [visible]);

  const move = useCallback(
    (from: number, step: ListboxMove): number => {
      const position = enabled.indexOf(from);
      return enabled[moveActive(position, step, enabled.length)] ?? -1;
    },
    [enabled],
  );

  function openList(highlight?: number): void {
    if (disabled) return;
    setQuery("");
    setActive(highlight ?? (selectedIndex !== -1 && options[selectedIndex]?.disabled !== true ? selectedIndex : (enabled[0] ?? -1)));
    setOpen(true);
  }

  const close = useCallback((returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  function choose(index: number): void {
    const option = options[index];
    if (option === undefined || option.disabled === true) return;
    if (option.value !== current) {
      pickedByUser.current = true;
      if (value === undefined) setOwnValue(option.value);
      onChange?.(option.value);
    }
    close(true);
  }

  // Tell the form a choice was made, as a native select would, so listeners such as the submit gate re-check.
  useEffect(() => {
    if (!pickedByUser.current) return;
    pickedByUser.current = false;
    valueRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
    valueRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [current]);

  // A form reset returns an uncontrolled dropdown to where it started, as it does every other field.
  useEffect(() => {
    const owner = valueRef.current?.form;
    if (owner === null || owner === undefined || value !== undefined) return;
    const restore = (): void => setOwnValue(defaultValue);
    owner.addEventListener("reset", restore);
    return () => owner.removeEventListener("reset", restore);
  }, [defaultValue, value]);

  const place = useCallback((): void => {
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    const list = listRef.current;
    if (trigger === null || popup === null || list === null) return;
    const box = trigger.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) {
      // The trigger has scrolled out of sight; a list left floating would point at nothing.
      setOpen(false);
      return;
    }
    // The filter box, padding and border around the options. The options' full height is their scrollHeight, which
    // reading leaves the list's scroll position alone.
    const chrome = popup.offsetHeight - list.clientHeight;
    const placement = placeDropdown({
      trigger: { top: box.top, bottom: box.bottom, left: box.left, width: box.width },
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      list: { width: naturalWidth.current, height: chrome + list.scrollHeight },
    });
    popup.style.left = `${String(placement.left)}px`;
    popup.style.width = `${String(placement.width)}px`;
    popup.style.maxWidth = `${String(placement.width)}px`;
    popup.style.top = placement.side === "below" ? `${String(placement.offset)}px` : "auto";
    popup.style.bottom = placement.side === "above" ? `${String(placement.offset)}px` : "auto";
    list.style.maxHeight = `${String(Math.max(0, placement.maxHeight - chrome))}px`;
  }, []);

  // Open and place the list in the top layer before the browser paints it, so it never flashes in the wrong spot.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (popup === null) return;
    if (open) {
      if (supportsPopover(popup) && !popup.matches(":popover-open")) popup.showPopover();
      popup.style.width = "max-content";
      popup.style.maxWidth = "none";
      naturalWidth.current = popup.offsetWidth;
      place();
      if (searchable) searchRef.current?.focus();
    } else if (supportsPopover(popup) && popup.matches(":popover-open")) {
      popup.hidePopover();
    }
  }, [open, place, searchable]);

  // Re-place on a filter change (the list's height changes) and keep the highlighted option in view.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, visible.length]);

  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${listId}-option-${String(active)}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  // While open: a press outside closes the list, and a scroll or resize moves it with its trigger.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const follow = (event: Event): void => {
      // Scrolling the options themselves moves nothing else.
      if (event.target instanceof Node && popupRef.current?.contains(event.target) === true) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) !== true) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
    };
  }, [open, place]);

  function jumpTo(key: string): void {
    const now = Date.now();
    typed.current = { text: now - typed.current.at > TYPEAHEAD_RESET_MS ? key : typed.current.text + key, at: now };
    const from = open ? active : selectedIndex;
    const match = matchTypeahead(options.map((option) => option.label), typed.current.text, from);
    if (match === -1 || options[match]?.disabled === true) return;
    if (open) setActive(match);
    else choose(match);
  }

  /** Keys shared by the trigger and the search box while the list is open. */
  function listKeys(event: KeyboardEvent<HTMLElement>): boolean {
    const step = MOVE_KEYS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      setActive(move(active, step));
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation(); // Closes the list, not the dialog it sits in.
      close(true);
      return true;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return true;
    }
    return false;
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const plainLetter = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (!open) {
      const step = MOVE_KEYS[event.key];
      if (step !== undefined || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openList(step === undefined ? undefined : move(selectedIndex, step));
      } else if (plainLetter) {
        jumpTo(event.key);
      }
      return;
    }
    if (listKeys(event)) return;
    if (event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (plainLetter) {
      jumpTo(event.key);
    }
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    listKeys(event);
  }

  const triggerContent = selected === null ? null : (renderValue?.(selected) ?? selected.label);

  return (
    <div ref={rootRef} className={cn("relative", wrapperClassName)}>
      {/* The submitted value. Visually hidden rather than type="hidden" so `required` takes part in validation. */}
      <input
        ref={valueRef}
        type="text"
        name={name}
        form={form}
        value={current}
        required={required}
        disabled={disabled}
        onChange={() => undefined}
        onFocus={() => triggerRef.current?.focus()}
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="sr-only"
      />
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-required={required || undefined}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-activedescendant={open && !searchable && active >= 0 ? optionId(active) : undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={cn("text-left disabled:cursor-not-allowed disabled:opacity-60", className)}
      >
        {/* The layout lives on this span, so a caller's display class on the button (block, inline-flex) cannot break it. */}
        <span className="flex w-full min-w-0 items-center justify-between gap-2">
          <span className={cn("min-w-0 truncate", triggerContent === null && "text-ink-soft/70")}>
            {triggerContent ?? placeholder}
          </span>
          <ChevronDownIcon
            className={cn("size-4 shrink-0 text-ink-soft transition-transform duration-200 ease-calm", open && "rotate-180")}
          />
        </span>
      </button>

      <div
        ref={popupRef}
        popover="manual"
        hidden={!open}
        // data-lenis-prevent lets the wheel scroll this list instead of the website's smooth scroller.
        data-lenis-prevent
        className="fixed z-[70] m-0 flex flex-col overflow-hidden rounded-control border border-line bg-card p-1.5 text-sm text-ink shadow-[0_18px_40px_-18px_rgba(42,13,16,0.35)]"
      >
        {searchable ? (
          <div className="relative mb-1.5 shrink-0">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-label="Filter the options"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={active >= 0 ? optionId(active) : undefined}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                const next = event.target.value;
                const needle = next.trim().toLocaleLowerCase();
                setQuery(next);
                setActive(options.findIndex((option) => option.disabled !== true && matchesFilter(option, needle)));
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Type to filter"
              className="block w-full rounded-lg border border-line bg-paper py-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink-soft/80 focus:border-accent focus-visible:outline-none"
            />
          </div>
        ) : null}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={ariaLabelledBy ?? id}
          tabIndex={-1}
          className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
        >
          {visible.length === 0 ? (
            <p className="px-3 py-2 text-ink-soft">Nothing matches.</p>
          ) : (
            sections.map((section, sectionIndex) => {
              const items = section.entries.map(({ option, index }) => {
                const isSelected = option.value === current;
                const isDisabled = option.disabled === true;
                return (
                  <div
                    key={`${option.value}-${String(index)}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isDisabled || undefined}
                    onPointerMove={() => (isDisabled ? undefined : setActive(index))}
                    // Focus stays on the trigger or search box; the click then chooses.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(index)}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-lg px-3 py-2 break-words",
                      isDisabled ? "cursor-not-allowed text-ink-soft/60" : "cursor-pointer",
                      index === active && !isDisabled && "bg-paper-deep",
                      isSelected && "font-medium text-accent-deep",
                    )}
                  >
                    <span className="min-w-0">{option.label}</span>
                    {isSelected ? <TickIcon className="mt-0.5 size-4 shrink-0 text-accent-deep" /> : null}
                  </div>
                );
              });
              if (section.group === undefined) return <div key={`ungrouped-${String(sectionIndex)}`}>{items}</div>;
              const headingId = `${listId}-group-${String(sectionIndex)}`;
              return (
                <div key={headingId} role="group" aria-labelledby={headingId}>
                  <div
                    id={headingId}
                    role="presentation"
                    className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft"
                  >
                    {section.group}
                  </div>
                  {items}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
