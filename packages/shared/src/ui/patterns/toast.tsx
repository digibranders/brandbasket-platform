"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactElement } from "react";
import { AlertGlyph, CloseGlyph, UndoGlyph } from "./pattern-icons";
import { useShortcuts, type Shortcut } from "./use-shortcuts";

export interface ToastInput {
  /** Names the object: "Marked <business> contacted". */
  readonly message: string;
  readonly tone?: "info" | "error";
  /** Its presence gives the Undo button and the longer time. */
  readonly undo?: () => Promise<void>;
  readonly retry?: () => void;
  /** Default 4000, 10000 with undo, and none for an error. */
  readonly durationMs?: number;
  /** Shown after a successful undo. Default "Undone". */
  readonly undoneMessage?: string;
}

export interface ToastItem extends ToastInput {
  readonly id: string;
  readonly tone: "info" | "error";
  readonly busy: boolean;
}

export const PLAIN_TOAST_MS = 4000;
export const UNDO_TOAST_MS = 10000;
export const MAX_VISIBLE_TOASTS = 3;

export function toastDuration(input: ToastInput): number | null {
  if (input.durationMs !== undefined) return input.durationMs;
  if (input.tone === "error") return null;
  return input.undo ? UNDO_TOAST_MS : PLAIN_TOAST_MS;
}

let items: readonly ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit(next: readonly ToastItem[]): void {
  items = next;
  for (const listener of listeners) listener();
}

/**
 * The toast store. A module level store (read with `useSyncExternalStore`) means no provider: `useToast()` works anywhere in
 * the tree and `<ToastRegion />` is mounted once in the layout.
 */
export const toastStore = {
  show(input: ToastInput): string {
    counter += 1;
    const id = `toast-${counter}`;
    emit([...items, { ...input, id, tone: input.tone ?? "info", busy: false }]);
    return id;
  },
  dismiss(id: string): void {
    emit(items.filter((item) => item.id !== id));
  },
  /** Runs the toast's undo. The confirming toast that follows carries no Undo of its own (no undo of an undo). */
  async runUndo(id: string): Promise<void> {
    const item = items.find((candidate) => candidate.id === id);
    if (!item?.undo || item.busy) return;
    emit(items.map((candidate) => (candidate.id === id ? { ...candidate, busy: true } : candidate)));
    try {
      await item.undo();
      toastStore.dismiss(id);
      toastStore.show({ message: item.undoneMessage ?? "Undone" });
    } catch {
      toastStore.dismiss(id);
      toastStore.show({ message: "Undo did not work. Nothing was changed.", tone: "error" });
    }
  },
  /** The newest toast that still carries a working Undo. */
  latestUndoId(): string | null {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index] as ToastItem;
      if (item.undo && !item.busy) return item.id;
    }
    return null;
  },
  getAll(): readonly ToastItem[] {
    return items;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(): void {
    items = [];
    counter = 0;
    emit([]);
  },
};

export function useToast(): { readonly show: (input: ToastInput) => string; readonly dismiss: (id: string) => void } {
  return { show: toastStore.show, dismiss: toastStore.dismiss };
}

/** `u` undoes the newest Undo toast while it is visible. ToastRegion registers it; pass the same object to ShortcutHelp. */
export const TOAST_UNDO_SHORTCUT: Shortcut = {
  id: "toast-undo",
  keys: "u",
  label: "Undo the latest change",
  group: "Anywhere",
  run: () => {
    const id = toastStore.latestUndoId();
    if (id !== null) void toastStore.runUndo(id);
  },
};

function ToastView({ item }: { readonly item: ToastItem }): ReactElement {
  const duration = toastDuration(item);
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paused = useRef(false);

  const clear = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = (): void => {
    clear();
    if (remaining.current === null || paused.current || item.busy) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => toastStore.dismiss(item.id), remaining.current);
  };

  useEffect(() => {
    start();
    return clear;
    // The timer is armed once per toast and re-armed when its busy state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.busy]);

  const pause = (): void => {
    if (remaining.current !== null && timer.current !== null) remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    paused.current = true;
    clear();
  };
  const resume = (): void => {
    paused.current = false;
    start();
  };

  const isError = item.tone === "error";
  const action = "inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 font-sans text-[13px] font-semibold leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-[860px]:h-11";

  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resume();
      }}
      className={`motion-rise flex min-h-12 max-w-[440px] items-center gap-3 rounded-[12px] py-2 pl-4 pr-2 font-sans text-sm leading-5 shadow-hero max-[860px]:w-full max-[860px]:max-w-none ${isError ? "border border-neg-text bg-surface text-ink" : "bg-ink text-on-primary"}`}
    >
      {isError ? <span className="text-neg-text"><AlertGlyph /></span> : null}
      <span className="flex-1">{item.busy ? "Undoing..." : item.message}</span>
      {item.undo ? (
        <button
          type="button"
          disabled={item.busy}
          onClick={() => void toastStore.runUndo(item.id)}
          className={`${action} bg-on-primary/15 text-on-primary hover:bg-on-primary/25 focus-visible:outline-on-primary`}
        >
          <UndoGlyph />
          Undo
        </button>
      ) : null}
      {item.retry ? (
        <button
          type="button"
          onClick={item.retry}
          className={`${action} ${isError ? "bg-neg-wash text-neg-text hover:bg-neg-border focus-visible:outline-ink" : "bg-on-primary/15 text-on-primary hover:bg-on-primary/25 focus-visible:outline-on-primary"}`}
        >
          Try again
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => toastStore.dismiss(item.id)}
        className={`${action} w-8 justify-center px-0 max-[860px]:w-11 ${isError ? "text-neg-text hover:bg-neg-wash focus-visible:outline-ink" : "text-on-primary hover:bg-on-primary/15 focus-visible:outline-on-primary"}`}
      >
        <CloseGlyph />
      </button>
    </div>
  );
}

/**
 * Mount once in the protected layout. Plain toasts are announced politely and errors assertively. At most three show; the
 * rest wait behind them. The Undo timer pauses on hover and on focus inside the toast.
 */
export function ToastRegion(): ReactElement {
  const all = useSyncExternalStore(toastStore.subscribe, toastStore.getAll, toastStore.getAll);
  useShortcuts([TOAST_UNDO_SHORTCUT]);
  const shown = all.slice(-MAX_VISIBLE_TOASTS);
  const hidden = all.length - shown.length;
  const polite = shown.filter((item) => item.tone !== "error");
  const errors = shown.filter((item) => item.tone === "error");

  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-[80] flex flex-col items-start gap-2 max-[860px]:inset-x-4 max-[860px]:bottom-4 max-[860px]:items-stretch [&>*]:pointer-events-auto">
      {hidden > 0 ? <p className="font-mono text-xs text-ink-3">{`and ${hidden} more`}</p> : null}
      <div aria-live="polite" role="status" className="flex flex-col gap-2 max-[860px]:items-stretch">
        {polite.map((item) => (
          <ToastView key={item.id} item={item} />
        ))}
      </div>
      <div aria-live="assertive" role="alert" className="flex flex-col gap-2 max-[860px]:items-stretch">
        {errors.map((item) => (
          <ToastView key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
