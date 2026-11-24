"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { patternButtonPrimary, patternButtonSecondary } from "./button-classes";
import { AlertGlyph, CloseGlyph } from "./pattern-icons";
import { useLayer } from "./use-layer";
import { isTypingTarget } from "./use-shortcuts";

export interface SidePanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Names the object; also the panel's accessible name and where focus lands on open. */
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly state?: "ready" | "loading" | "error";
  readonly onRetry?: () => void;
  readonly children: ReactNode;
  /** The one primary of the screen while the panel is open. */
  readonly primary?: { readonly label: string; readonly onRun: () => void; readonly disabledReason?: string; readonly busy?: boolean };
  readonly secondary?: ReactNode;
  /** Where focus goes on close. Default is whatever opened the panel. */
  readonly returnFocusTo?: RefObject<HTMLElement | null>;
  /** `j` (1) and `k` (-1) with focus outside a field: step to the next or previous row and swap the content. */
  readonly onStep?: (direction: 1 | -1) => void;
}

const SHEET_QUERY = "(max-width: 1099px)";

function subscribeSheet(callback: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const list = window.matchMedia(SHEET_QUERY);
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
}

/** True below 1100px, where the panel is a full sheet with a scrim and a focus trap. */
export function useIsSheet(): boolean {
  return useSyncExternalStore(
    subscribeSheet,
    () => typeof window.matchMedia === "function" && window.matchMedia(SHEET_QUERY).matches,
    () => false,
  );
}

const URL_EVENT = "bb:urlparam";

/** The panel keeps its own URL: `?open=<id>`. Written with `history.replaceState`, so closing never reloads. */
export function useUrlParam(name = "open"): readonly [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    (callback) => {
      window.addEventListener("popstate", callback);
      window.addEventListener(URL_EVENT, callback);
      return () => {
        window.removeEventListener("popstate", callback);
        window.removeEventListener(URL_EVENT, callback);
      };
    },
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
  const set = useCallback(
    (next: string | null): void => {
      const url = new URL(window.location.href);
      if (next === null) url.searchParams.delete(name);
      else url.searchParams.set(name, next);
      window.history.replaceState(window.history.state, "", url);
      window.dispatchEvent(new Event(URL_EVENT));
    },
    [name],
  );
  return [value, set];
}

/**
 * SidePanel: an overlay layer, not a second raised surface. 480px from the right at 1100px and up (a complementary region:
 * focus may leave it), a full sheet below with a scrim and a trapped focus. Esc closes it and focus returns to the opener.
 */
export function SidePanel({ open, onClose, title, subtitle, state = "ready", onRetry, children, primary, secondary, returnFocusTo, onStep }: SidePanelProps): ReactElement {
  const sheet = useIsSheet();
  const ref = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useLayer({ open, onEscape: onClose, containerRef: ref, trap: sheet, returnFocusTo });

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.target as HTMLElement).closest("dialog")) return;
    if (event.key === "j") onStep?.(1);
    else if (event.key === "k") onStep?.(-1);
    else if (event.key === "e" && primary && state === "ready" && !primary.busy && primary.disabledReason === undefined) primary.onRun();
    else return;
    event.preventDefault();
  };

  const primaryDisabled = state !== "ready" || primary?.busy === true || primary?.disabledReason !== undefined;

  return (
    <>
      {sheet && open ? <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[55] bg-ink/40" /> : null}
      <aside
        ref={ref}
        role={sheet ? "dialog" : "complementary"}
        aria-modal={sheet ? true : undefined}
        aria-label={title}
        aria-hidden={open ? undefined : true}
        onKeyDown={onKeyDown}
        className={`fixed inset-y-0 right-0 z-[60] flex w-[480px] max-w-full flex-col border-l border-border bg-surface shadow-hero transition-transform duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none max-[1099px]:border-l-0 ${open ? "visible translate-x-0" : "invisible translate-x-full"}`}
      >
        {open ? (
          <>
            <header className="flex items-start gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 ref={headingRef} tabIndex={-1} className="font-display text-[17px] font-semibold leading-6 text-ink outline-none">
                  {title}
                </h2>
                {subtitle ? <div className="font-sans text-[13px] leading-5 text-ink-3">{subtitle}</div> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={sheet ? "Back to list" : "Close panel"}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-ink-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[860px]:size-11"
              >
                <CloseGlyph />
              </button>
            </header>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 font-sans text-[13.5px] leading-5 text-ink">
              {state === "loading" ? (
                <div role="status" aria-label="Loading detail" className="flex flex-col gap-3">
                  <div className="motion-pulse h-14 rounded-[6px] bg-surface-hover" />
                  <div className="motion-pulse h-3 w-4/5 rounded-[6px] bg-surface-hover" />
                  <div className="motion-pulse h-3 w-3/5 rounded-[6px] bg-surface-hover" />
                </div>
              ) : state === "error" ? (
                <div role="alert" className="flex flex-col items-center gap-3 py-4 text-center">
                  <span className="flex size-10 items-center justify-center rounded-full bg-neg-wash text-neg-text">
                    <AlertGlyph />
                  </span>
                  {onRetry ? (
                    <button type="button" onClick={onRetry} className={patternButtonSecondary}>
                      Try again
                    </button>
                  ) : null}
                  {children}
                </div>
              ) : (
                children
              )}
            </div>
            {primary || secondary ? (
              <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
                {secondary}
                {primary ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!primaryDisabled) primary.onRun();
                    }}
                    aria-disabled={primaryDisabled || undefined}
                    aria-busy={primary.busy || undefined}
                    disabled={state !== "ready" || primary.busy === true}
                    title={primary.disabledReason}
                    className={`${patternButtonPrimary} max-[1099px]:flex-1`}
                  >
                    {primary.label}
                  </button>
                ) : null}
              </footer>
            ) : null}
          </>
        ) : null}
      </aside>
    </>
  );
}
