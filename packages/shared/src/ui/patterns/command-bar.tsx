"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { patternButtonSecondary } from "./button-classes";
import { useConfirmRun, type ConfirmCopy } from "./confirm-copy";
import { ModalDialog } from "./modal-dialog";
import { AlertGlyph, SearchGlyph } from "./pattern-icons";
import { useShortcuts } from "./use-shortcuts";

export type CommandGroup = "recent" | "go" | "action" | "client" | "enquiry" | "request" | "invoice" | "payment" | "email";
export type CommandMode = "all" | "actions" | "requestRef";

export interface CommandItem {
  readonly id: string;
  readonly group: CommandGroup;
  readonly title: string;
  /** Never an email body. */
  readonly subtitle?: string;
  readonly icon?: ReactNode;
  /** `g t`, `Logged export`. */
  readonly hint?: string;
  readonly href?: string;
  readonly run?: () => void;
  readonly disabledReason?: string;
  readonly confirm?: ConfirmCopy;
}

export interface CommandBarProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Go to and Actions: always available, filtered locally. */
  readonly staticItems: readonly CommandItem[];
  readonly search: (term: string, mode: CommandMode) => Promise<readonly CommandItem[]>;
  /** Browser storage only, no server data. */
  readonly recent: readonly CommandItem[];
  /** Opens an item's href. Default is `window.location.assign`, or a new tab with Ctrl or Cmd Enter. */
  readonly onNavigate?: (href: string, newTab: boolean) => void;
  readonly placeholder?: string;
}

export const GROUP_LABELS: Readonly<Record<CommandGroup, string>> = {
  recent: "Recent",
  go: "Go to",
  action: "Actions",
  client: "Clients",
  enquiry: "Enquiries",
  request: "Requests",
  invoice: "Invoices",
  payment: "Payments",
  email: "Emails",
};

const GROUP_ORDER: readonly CommandGroup[] = ["recent", "go", "action", "client", "enquiry", "request", "invoice", "payment", "email"];

export const SEARCH_DEBOUNCE_MS = 150;

/** Groups items in display order and returns them flat, so the keyboard index and the screen order always agree. */
export function orderItems(items: readonly CommandItem[]): readonly CommandItem[] {
  return GROUP_ORDER.flatMap((group) => items.filter((item) => item.group === group));
}

/** Splits `text` around the first case-insensitive match of `term`, for the match mark. */
export function splitMatch(text: string, term: string): readonly { readonly text: string; readonly match: boolean }[] {
  if (term === "") return [{ text, match: false }];
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at === -1) return [{ text, match: false }];
  return [
    { text: text.slice(0, at), match: false },
    { text: text.slice(at, at + term.length), match: true },
    { text: text.slice(at + term.length), match: false },
  ].filter((part) => part.text !== "");
}

export function matchesTerm(item: CommandItem, term: string): boolean {
  const needle = term.toLowerCase();
  return item.title.toLowerCase().includes(needle) || (item.subtitle ?? "").toLowerCase().includes(needle);
}

/**
 * CommandBar: one overlay for search, go to and actions, opened with Ctrl K or Cmd K. A combobox: focus stays in the input
 * and `aria-activedescendant` points at the highlighted option. `>` shows actions only, `#` searches request references,
 * and Backspace on an empty field leaves the mode. Esc clears the text, then closes.
 */
export function CommandBar({ open, onOpenChange, staticItems, search, recent, onNavigate, placeholder = "Search clients, requests, invoices, or type a command" }: CommandBarProps): ReactElement | null {
  useShortcuts([{ id: "command-bar", keys: "mod+k", label: "Open the command bar", group: "Anywhere", allowInField: true, run: () => onOpenChange(!open) }]);
  if (!open) return null;
  return <CommandBarDialog onOpenChange={onOpenChange} staticItems={staticItems} search={search} recent={recent} onNavigate={onNavigate} placeholder={placeholder} />;
}

type DialogProps = Omit<CommandBarProps, "open"> & { readonly placeholder: string };

function CommandBarDialog({ onOpenChange, staticItems, search, recent, onNavigate, placeholder }: DialogProps): ReactElement {
  const uid = useId();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<CommandMode>("all");
  const [remote, setRemote] = useState<readonly CommandItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [active, setActive] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const confirmRun = useConfirmRun();
  const term = text.trim();

  useEffect(() => {
    if (term === "" || mode === "actions") {
      setRemote([]);
      setStatus("idle");
      return undefined;
    }
    let stale = false;
    setStatus("loading");
    const timer = setTimeout(() => {
      search(term, mode).then(
        (found) => {
          if (stale) return;
          setRemote(found);
          setStatus("idle");
        },
        () => {
          if (stale) return;
          setRemote([]);
          setStatus("error");
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [term, mode, search, attempt]);

  const visible = useMemo<readonly CommandItem[]>(() => {
    if (mode === "requestRef") return orderItems(remote);
    if (mode === "actions") return orderItems(staticItems.filter((item) => item.group === "action" && (term === "" || matchesTerm(item, term))));
    if (term === "") return orderItems([...recent, ...staticItems]);
    return orderItems([...staticItems.filter((item) => matchesTerm(item, term)), ...remote]);
  }, [mode, term, staticItems, recent, remote]);

  useEffect(() => setActive(0), [visible.length, term, mode]);

  const close = useCallback((): void => onOpenChange(false), [onOpenChange]);

  const run = (item: CommandItem, newTab: boolean): void => {
    if (item.disabledReason !== undefined) return;
    const go = (): void => {
      close();
      if (item.href !== undefined) {
        if (onNavigate) onNavigate(item.href, newTab);
        else if (newTab) window.open(item.href, "_blank", "noopener");
        else window.location.assign(item.href);
      } else item.run?.();
    };
    confirmRun.request(item.confirm, go);
  };

  const onEscape = (): void => {
    if (text !== "") setText("");
    else if (mode !== "all") setMode("all");
    else close();
  };

  const onChange = (value: string): void => {
    if (mode === "all" && text === "" && value.startsWith(">")) {
      setMode("actions");
      setText(value.slice(1));
    } else if (mode === "all" && text === "" && value.startsWith("#")) {
      setMode("requestRef");
      setText(value.slice(1));
    } else setText(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (visible.length > 0) setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + visible.length) % visible.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = visible[active];
      if (item) run(item, event.ctrlKey || event.metaKey);
    } else if (event.key === "Backspace" && text === "" && mode !== "all") {
      event.preventDefault();
      setMode("all");
    }
  };

  const listId = `${uid}-list`;
  const titleId = `${uid}-title`;
  const optionId = (index: number): string => `${uid}-opt-${index}`;
  const showEmpty = status === "idle" && visible.length === 0 && term !== "";

  const headings = visible.map((item, index) => (index === 0 || visible[index - 1]?.group !== item.group ? GROUP_LABELS[item.group] : null));

  return (
    <>
      <ModalDialog labelledBy={titleId} onEscape={onEscape} onScrimClick={close} className="mt-[12vh] w-[640px]">
        <div className="motion-pop w-full overflow-hidden rounded-[20px] border border-border bg-surface shadow-dialog">
          <h2 id={titleId} className="sr-only">
            Command bar
          </h2>
          <div className="flex h-14 items-center gap-2.5 border-b border-border px-4 focus-within:shadow-[inset_0_-2px_0_var(--color-ink)]">
            <span className="text-ink-3">
              <SearchGlyph />
            </span>
            {mode !== "all" ? <span className="rounded-[6px] bg-surface-hover px-2 py-0.5 font-mono text-xs text-ink">{mode === "actions" ? ">" : "#"}</span> : null}
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={visible[active] ? optionId(active) : undefined}
              aria-label="Command bar"
              value={text}
              placeholder={placeholder}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              className="h-full min-w-0 flex-1 bg-transparent font-sans text-base text-ink outline-none placeholder:text-ink-3"
            />
            <kbd className="rounded-[6px] border border-border bg-surface-hover px-1.5 font-mono text-xs text-ink">Esc</kbd>
          </div>
          <div id={listId} role="listbox" aria-label="Suggestions" className="max-h-[360px] overflow-auto p-2">
            {status === "loading" ? (
              <div role="status" aria-label="Searching" className="grid gap-2.5 px-2.5 py-2">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="motion-pulse h-9 rounded-[8px] bg-surface-hover" />
                ))}
              </div>
            ) : null}
            {status === "error" ? (
              <div role="alert" className="grid justify-items-center gap-3 px-4 py-6 text-center">
                <span className="flex items-center gap-2 font-sans text-sm text-neg-text">
                  <AlertGlyph />
                  Search did not load. Nothing was changed.
                </span>
                <button type="button" onClick={() => setAttempt((count) => count + 1)} className={patternButtonSecondary}>
                  Try again
                </button>
              </div>
            ) : null}
            {showEmpty ? <p className="px-4 py-6 text-center font-sans text-sm text-ink-2">{`No results for "${term}".`}</p> : null}
            {status !== "error"
              ? visible.map((item, index) => {
                  const heading = headings[index];
                  const isActive = index === active;
                  return (
                    <div key={`${item.group}:${item.id}`} role="presentation">
                      {heading ? (
                        <div role="presentation" className="px-2.5 pb-1 pt-2 font-sans text-xs font-semibold leading-4 text-ink-3">
                          {heading}
                        </div>
                      ) : null}
                      <div
                        id={optionId(index)}
                        role="option"
                        aria-selected={isActive}
                        aria-disabled={item.disabledReason !== undefined || undefined}
                        onMouseMove={() => setActive(index)}
                        onClick={() => run(item, false)}
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-1.5 font-sans text-sm leading-5 aria-disabled:cursor-not-allowed aria-disabled:text-ink-3 ${isActive ? "bg-surface-hover" : ""}`}
                      >
                        {item.icon ? <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-hover text-ink-2">{item.icon}</span> : null}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">
                            {splitMatch(item.title, term).map((part, at) =>
                              part.match ? (
                                <mark key={at} className="rounded-[3px] bg-accent-wash text-inherit">
                                  {part.text}
                                </mark>
                              ) : (
                                <span key={at}>{part.text}</span>
                              ),
                            )}
                          </span>
                          {item.disabledReason ? (
                            <span className="block truncate text-xs leading-4 text-ink-3">{item.disabledReason}</span>
                          ) : item.subtitle ? (
                            <span className="block truncate text-xs leading-4 text-ink-3">{item.subtitle}</span>
                          ) : null}
                        </span>
                        {item.hint ? <span className="font-mono text-xs text-ink-3">{item.hint}</span> : null}
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
          <div className="flex flex-wrap gap-4 border-t border-border px-4 py-2.5 font-sans text-xs leading-4 text-ink-3">
            <span>Up and Down move</span>
            <span>Enter opens</span>
            <span>Ctrl Enter opens in a new tab</span>
            <span>{">"} actions</span>
            <span># request</span>
          </div>
        </div>
      </ModalDialog>
      {confirmRun.dialog}
    </>
  );
}
