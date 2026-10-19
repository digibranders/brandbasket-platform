"use client";

import { Button } from "@brandbasket/shared/ui/panel/button";
import { useState, useTransition, type ReactElement } from "react";
import type { TaxonomyOption, TaxonomyResult } from "@/app/app-host/(protected)/content/blog/taxonomy-actions";
import { Dropdown } from "./blog-editor/dropdown";

interface TaxonomyPickerProps {
  /** The field's id, e.g. "categoryId". */
  readonly name: string;
  readonly label: string;
  readonly noneLabel: string;
  /** "New category", "New author". */
  readonly addLabel: string;
  readonly options: readonly TaxonomyOption[];
  readonly initialId: string | null;
  readonly create: (name: string) => Promise<TaxonomyResult>;
  /** The newly chosen id, or "" for none. */
  readonly onChange: (id: string) => void;
}

function byName(a: TaxonomyOption, b: TaxonomyOption): number {
  return a.name.localeCompare(b.name);
}

/**
 * A dropdown of the business's own categories (or authors) with an inline "New …" that creates one and selects it,
 * so writing a post never means leaving the editor. The new entry is saved at once; the post still needs Save.
 * Enter in the inline input adds the entry.
 */
export function TaxonomyPicker({
  name,
  label,
  noneLabel,
  addLabel,
  options,
  initialId,
  create,
  onChange,
}: TaxonomyPickerProps): ReactElement {
  const [choices, setChoices] = useState<readonly TaxonomyOption[]>(options);
  const [selected, setSelected] = useState<string>(initialId ?? "");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add(): void {
    startTransition(async () => {
      const result = await create(draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setChoices((current) =>
        current.some((choice) => choice.id === result.value.id) ? current : [...current, result.value].sort(byName),
      );
      setSelected(result.value.id);
      setDraft("");
      setError(null);
      setAdding(false);
      onChange(result.value.id);
    });
  }

  function cancel(): void {
    setAdding(false);
    setDraft("");
    setError(null);
  }

  return (
    <div>
      <label htmlFor={name} className="block text-[0.8125rem] font-semibold">
        {label}
      </label>
      <div className="mt-1.5">
        <Dropdown
          id={name}
          value={selected}
          options={[{ value: "", label: noneLabel }, ...choices.map((choice) => ({ value: choice.id, label: choice.name }))]}
          onChange={(id) => {
            setSelected(id);
            onChange(id);
          }}
        />
      </div>

      {adding ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            aria-label={addLabel}
            value={draft}
            autoFocus
            maxLength={60}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              } else if (event.key === "Escape") {
                cancel();
              }
            }}
            className="block min-w-0 flex-1 rounded-control border border-ink-soft/65 bg-paper px-3 py-2 text-sm placeholder:text-ink-soft/80"
          />
          <Button type="button" size="sm" disabled={isPending} aria-busy={isPending} onClick={add}>
            {isPending ? "Adding…" : "Add"}
          </Button>
          <Button type="button" size="sm" variant="quiet" disabled={isPending} onClick={cancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1.5 text-xs font-medium text-accent-deep transition-colors duration-300 ease-calm hover:text-ink"
        >
          + {addLabel}
        </button>
      )}

      {error === null ? null : (
        <p role="alert" className="mt-1.5 text-sm text-accent-deep">
          {error}
        </p>
      )}
    </div>
  );
}
