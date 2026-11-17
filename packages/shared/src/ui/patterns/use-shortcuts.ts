"use client";

import { useEffect, useRef } from "react";

/**
 * The console keyboard registry (notes-console-v2-patterns.md section 2). One list of `Shortcut`s feeds both the handlers
 * (`useShortcuts`) and the help dialog (`ShortcutHelp`), so the two cannot drift.
 *
 * Key syntax: `j`, `?`, `.`, `shift+j`, `shift+f10`, `mod+k` (Ctrl or Cmd), and two key sequences written with a space
 * (`g t`). Letters are lowercase; Shift is written only for letters and named keys.
 */
export type ShortcutGroup = "Lists" | "Go to" | "Anywhere";

export interface Shortcut {
  readonly id: string;
  readonly keys: string;
  readonly label: string;
  readonly group: ShortcutGroup;
  readonly run: (event: KeyboardEvent) => void;
  /** Fires while focus is in a field or a dialog is open. Only `mod+k` needs this. */
  readonly allowInField?: boolean;
  /** Left out of the registry's matching and shown disabled nowhere; use it to scope a shortcut to a screen. */
  readonly enabled?: boolean;
}

/** The second key of a sequence must land within this window. */
export const SEQUENCE_WINDOW_MS = 1200;

const NAMED_KEYS: Readonly<Record<string, string>> = { " ": "space" };

/** Turns a keyboard event into the spec string the registry uses, or null for a bare modifier or an Alt chord. */
export function eventToSpec(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string | null {
  if (event.altKey) return null;
  const raw = NAMED_KEYS[event.key] ?? event.key;
  if (raw === "Control" || raw === "Meta" || raw === "Shift" || raw === "Alt") return null;
  const isLetter = raw.length === 1 && raw.toLowerCase() !== raw.toUpperCase();
  const isNamed = raw.length > 1;
  const key = raw.toLowerCase();
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("mod");
  if (event.shiftKey && (isLetter || isNamed)) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

export interface PendingKey {
  readonly spec: string;
  readonly at: number;
}

export interface ResolveResult {
  readonly match: Shortcut | null;
  readonly pending: PendingKey | null;
}

/** Matches one key press against the registry, handling two key sequences. Pure, so it is tested without a DOM. */
export function resolveShortcut(
  shortcuts: readonly Shortcut[],
  spec: string,
  pending: PendingKey | null,
  now: number,
  options: { readonly inField: boolean },
): ResolveResult {
  const usable = shortcuts.filter((s) => s.enabled !== false && (!options.inField || s.allowInField === true));
  if (pending && now - pending.at <= SEQUENCE_WINDOW_MS) {
    const full = `${pending.spec} ${spec}`;
    const sequence = usable.find((s) => s.keys === full);
    if (sequence) return { match: sequence, pending: null };
  }
  const single = usable.find((s) => s.keys === spec);
  if (single) return { match: single, pending: null };
  const startsSequence = usable.some((s) => s.keys.startsWith(`${spec} `));
  return { match: null, pending: startsSequence ? { spec, at: now } : null };
}

/** True when typing should win over a single key shortcut: a text field, a select, or editable content. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "file"].includes(type);
  }
  return false;
}

/** True while a modal layer owns the keyboard (a native dialog, or an element marked as a modal dialog). */
export function isModalOpen(doc: Document = document): boolean {
  return doc.querySelector("dialog[open], [role='dialog'][aria-modal='true']") !== null;
}

/** Wires the registry to the document. Single keys skip fields and open dialogs; `allowInField` shortcuts do not. */
export function useShortcuts(shortcuts: readonly Shortcut[], enabled = true): void {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;
  const pending = useRef<PendingKey | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const spec = eventToSpec(event);
      if (spec === null) return;
      const inField = isTypingTarget(event.target) || isModalOpen();
      const result = resolveShortcut(latest.current, spec, pending.current, Date.now(), { inField });
      pending.current = result.pending;
      if (result.match) {
        event.preventDefault();
        result.match.run(event);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** Display labels for a spec: `mod+k` becomes Ctrl K, `g t` becomes g then t. */
export function formatKeys(keys: string): readonly string[] {
  return keys.split(" ").map((chunk) =>
    chunk
      .split("+")
      .map((part, _index, all) => (part === "mod" ? "Ctrl" : part === "shift" ? "Shift" : part === "space" ? "Space" : part.length > 1 || all.length > 1 ? part.toUpperCase() : part))
      .join(" "),
  );
}
