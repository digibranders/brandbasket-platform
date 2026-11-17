"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactElement, type RefObject } from "react";
import { patternButtonSecondary } from "./button-classes";
import { AlertGlyph, CloseGlyph, SearchGlyph } from "./pattern-icons";
import { isTypingTarget } from "./use-shortcuts";

export interface FilterOption {
  readonly id: string;
  readonly label: string;
  /** null means the count failed to load and shows "?". */
  readonly count?: number | null;
  readonly tone?: "late";
}

export interface FilterEcho {
  readonly id: string;
  readonly label: string;
  readonly onRemove: () => void;
}

export interface FilterBarProps {
  /** Names the pill group for screen readers. */
  readonly label?: string;
  readonly options: readonly FilterOption[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly search?: { readonly value: string; readonly onChange: (value: string) => void; readonly placeholder: string };
  /** Active filters shown as removable chips under the bar. */
  readonly echoes?: readonly FilterEcho[];
  /** `loading` keeps the labels and disables the pills until the counts arrive. */
  readonly state?: "ready" | "loading" | "error" | "disabled";
  readonly onRetry?: () => void;
  /** Pins under the page header while the list scrolls. Default true. */
  readonly sticky?: boolean;
  /** Where focus goes on a second Esc in the search field (normally the table). */
  readonly returnFocusTo?: RefObject<HTMLElement | null>;
}

function countLabel(option: FilterOption, loading: boolean): string | null {
  if (loading) return "...";
  if (option.count === undefined) return null;
  return option.count === null ? "?" : String(option.count);
}

/**
 * FilterBar: filter pills with counts, a search field and the active filters echoed as chips. Pills are one tab stop with
 * Left and Right moving between them. `/` focuses the search from anywhere on the page (not while typing). In the field,
 * Esc clears the text and a second Esc returns focus to the list.
 */
export function FilterBar({ label = "Filter", options, value, onChange, search, echoes = [], state = "ready", onRetry, sticky = true, returnFocusTo }: FilterBarProps): ReactElement {
  const searchRef = useRef<HTMLInputElement>(null);
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const loading = state === "loading";
  const disabled = state === "disabled" || loading;

  useEffect(() => {
    if (!search || disabled) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "/" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [search, disabled]);

  const onPillKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const enabled = pillRefs.current.filter((node): node is HTMLButtonElement => node !== null && !node.disabled);
    const at = enabled.indexOf(pillRefs.current[index] as HTMLButtonElement);
    const next = enabled[(at + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
    next?.focus();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Escape" || !search) return;
    event.preventDefault();
    if (search.value !== "") search.onChange("");
    else {
      event.currentTarget.blur();
      returnFocusTo?.current?.focus();
    }
  };

  // Roving tabindex: the selected pill is the tab stop, or the first when none is selected.
  const stop = Math.max(0, options.findIndex((option) => option.id === value));

  return (
    <div
      className={`grid gap-2.5 rounded-[14px] border border-border bg-surface px-3 py-2.5 shadow-card ${sticky ? "sticky top-0 z-20" : ""}`}
      aria-busy={loading || undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={label} className="flex gap-1 max-[860px]:w-full max-[860px]:overflow-x-auto max-[860px]:pb-0.5">
          {options.map((option, index) => {
            const pressed = option.id === value;
            const count = countLabel(option, loading);
            return (
              <button
                key={option.id}
                ref={(node) => {
                  pillRefs.current[index] = node;
                }}
                type="button"
                aria-pressed={pressed}
                disabled={disabled}
                tabIndex={index === stop ? 0 : -1}
                onClick={() => onChange(option.id)}
                onKeyDown={(event) => onPillKeyDown(event, index)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-sans text-[13px] font-medium transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 max-[860px]:h-11 ${pressed ? "bg-ink text-on-primary" : "text-ink-2 hover:bg-surface-hover hover:text-ink"}`}
              >
                {option.label}
                {count !== null ? (
                  <span className={`font-mono text-xs ${pressed ? "text-on-primary/80" : option.tone === "late" ? "font-semibold text-neg-text" : "text-ink-3"}`}>{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {search ? (
          <label className="relative ml-auto min-w-[220px] max-w-80 flex-1 max-[860px]:ml-0 max-[860px]:min-w-full max-[860px]:max-w-none">
            <span className="sr-only">{search.placeholder}</span>
            <span className="pointer-events-none absolute left-2.5 top-[9px] text-ink-3 max-[860px]:top-[13px]">
              <SearchGlyph />
            </span>
            <input
              ref={searchRef}
              type="search"
              value={search.value}
              placeholder={search.placeholder}
              disabled={state === "disabled"}
              onChange={(event) => search.onChange(event.target.value)}
              onKeyDown={onSearchKeyDown}
              className="h-9 w-full rounded-[8px] border border-field bg-surface pl-[34px] pr-8 font-sans text-sm text-ink placeholder:text-ink-3 hover:border-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:bg-surface-hover max-[860px]:h-11"
            />
            <kbd className="pointer-events-none absolute right-2 top-2 rounded-[6px] border border-border bg-surface-hover px-1.5 font-mono text-xs text-ink max-[860px]:hidden">/</kbd>
          </label>
        ) : null}
      </div>
      {echoes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {echoes.map((echo) => (
            <span key={echo.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-hover pl-3 pr-1 font-sans text-xs font-semibold text-ink">
              {echo.label}
              <button
                type="button"
                aria-label={`Remove filter ${echo.label}`}
                onClick={echo.onRemove}
                onKeyDown={(event) => {
                  if (event.key === "Backspace") {
                    event.preventDefault();
                    echo.onRemove();
                  }
                }}
                className="inline-flex size-6 items-center justify-center rounded-full hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
              >
                <CloseGlyph className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {state === "error" ? (
        <div role="alert" className="flex items-center gap-2.5 rounded-[10px] bg-neg-wash px-3 py-2 font-sans text-[13px] leading-5 text-neg-text">
          <AlertGlyph />
          <span>Some counts could not be read. The list still works.</span>
          {onRetry ? (
            <button type="button" onClick={onRetry} className={`${patternButtonSecondary} ml-auto`}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
