"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { patternButtonPrimary, patternButtonSecondary } from "./button-classes";
import { AlertGlyph, PencilGlyph } from "./pattern-icons";
import { toastStore } from "./toast";

export type InlineEditResult =
  | { readonly ok: true; readonly undo?: () => Promise<void> }
  | { readonly ok: false; readonly message: string };

export interface InlineEditProps {
  readonly label: string;
  readonly value: string;
  readonly onSave: (next: string) => Promise<InlineEditResult>;
  /** Returns the fix text, never a code, or null when the value is fine. */
  readonly validate?: (next: string) => string | null;
  readonly multiline?: boolean;
  /** What an empty value says: "Add a note only staff can see". */
  readonly emptyLabel?: string;
  /** Renders plain text plus this hint instead of an editor. */
  readonly readOnlyReason?: string;
  readonly inputMode?: "text" | "url";
}

/**
 * InlineEdit: the value is a real button that says "edit". Enter or click starts editing with the text selected; Enter saves
 * (Ctrl Enter in a note), Esc cancels, Tab or blur saves. A failed save keeps the typed value and the focus. When the save
 * returns an `undo`, an Undo toast follows. Never for money fields or anything that emails the customer.
 */
export function InlineEdit({ label, value, onSave, validate, multiline = false, emptyLabel, readOnlyReason, inputMode = "text" }: InlineEditProps): ReactElement {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const viewRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const cancelled = useRef(false);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (editing) {
      fieldRef.current?.focus();
      fieldRef.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      viewRef.current?.focus();
    }
  }, [editing]);

  const begin = (): void => {
    cancelled.current = false;
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const finish = (): void => {
    setEditing(false);
    setError(null);
    restoreFocus.current = true;
  };

  const save = async (): Promise<void> => {
    if (inFlight.current || cancelled.current) return;
    if (draft === value) {
      finish();
      return;
    }
    const problem = validate?.(draft) ?? null;
    if (problem !== null) {
      setError(problem);
      fieldRef.current?.focus();
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const result = await onSave(draft);
      if (result.ok) {
        if (result.undo) toastStore.show({ message: `${label} saved`, undo: result.undo });
        finish();
      } else {
        setError(result.message);
      }
    } catch {
      setError("The change did not save. Your text is kept. Try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
      if (fieldRef.current) fieldRef.current.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelled.current = true;
      finish();
    } else if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    }
  };

  if (readOnlyReason !== undefined) {
    return (
      <div className="grid gap-1">
        <span className="font-sans text-xs font-semibold leading-4 text-ink-2">{label}</span>
        <span className="font-sans text-[15px] leading-6 text-ink">{value || emptyLabel}</span>
        <span className="font-sans text-xs leading-4 text-ink-3">{readOnlyReason}</span>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="grid gap-1">
        <span className="font-sans text-xs font-semibold leading-4 text-ink-2">{label}</span>
        <button
          ref={viewRef}
          type="button"
          aria-label={`Edit ${label}`}
          onClick={begin}
          className={`group -ml-2 inline-flex min-h-9 items-center gap-2 self-start rounded-[8px] border border-transparent px-2 text-left font-sans text-[15px] leading-6 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[860px]:min-h-11 ${value ? "text-ink" : "text-ink-3"}`}
        >
          <span>{value || emptyLabel}</span>
          <span className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-[860px]:opacity-100">
            <PencilGlyph />
          </span>
        </button>
      </div>
    );
  }

  const fieldClass = `w-full rounded-[8px] border bg-surface px-3 font-sans text-sm text-ink hover:border-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:bg-surface-hover ${error ? "border-neg-text" : "border-field"}`;
  const describedBy = error ? `${id}-error` : `${id}-hint`;

  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-sans text-xs font-semibold leading-4 text-ink-2">
        {label}
      </label>
      <div className="flex items-start gap-1.5">
        {multiline ? (
          <textarea
            id={id}
            ref={fieldRef}
            rows={3}
            value={draft}
            readOnly={saving}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => void save()}
            className={`${fieldClass} py-2`}
          />
        ) : (
          <input
            id={id}
            ref={fieldRef}
            type={inputMode === "url" ? "url" : "text"}
            value={draft}
            readOnly={saving}
            aria-busy={saving || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => void save()}
            className={`${fieldClass} h-9 max-[860px]:h-11`}
          />
        )}
        <button
          type="button"
          disabled={saving}
          aria-busy={saving || undefined}
          // Keep focus in the field so the blur save does not race this click.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void save()}
          className={patternButtonPrimary}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          disabled={saving}
          onMouseDown={(event) => {
            cancelled.current = true;
            event.preventDefault();
          }}
          onClick={finish}
          className={patternButtonSecondary}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <div id={`${id}-error`} role="alert" className="flex items-start gap-1.5 font-sans text-[13px] leading-5 text-neg-text">
          <AlertGlyph />
          <span>{error}</span>
        </div>
      ) : (
        <span id={`${id}-hint`} className="font-sans text-xs leading-4 text-ink-3">
          {multiline ? "Ctrl Enter saves, Esc cancels." : "Enter saves, Esc cancels."}
        </span>
      )}
    </div>
  );
}
