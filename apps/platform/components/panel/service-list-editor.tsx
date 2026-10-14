"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@fynix/shared/ui/panel/button";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { PlusIcon } from "@fynix/shared/ui/icons";
import { MAX_SERVICES, type ServiceInput } from "@/lib/onboarding/content-form";
import type { MoneyCurrency } from "@fynix/shared/lib/money";

interface Row {
  /** React key only; never sent. Rows are numbered by position when the form is submitted. */
  readonly id: number;
  /** The saved service this row edits, posted as services.{position}.id so the save keeps it; null for a new row. */
  readonly serviceId: string | null;
  readonly name: string;
  readonly summary: string;
  readonly price: string;
}

/** An example price in the customer's own currency; a US customer shown "From ₹2,000" reads it as a mistake. */
const PRICE_PLACEHOLDERS: Readonly<Record<MoneyCurrency, string>> = { USD: "From $30", INR: "From ₹2,000" };

interface ServiceListEditorProps {
  readonly currency: MoneyCurrency | null;
  readonly initial: readonly ServiceInput[];
  /** The form field an error is about, e.g. "services.2.name". */
  readonly invalidField: string | null;
  readonly errorId: string;
}

interface EditorState {
  readonly rows: readonly Row[];
  /** Keys for rows added later; kept in state so rendering stays pure. */
  readonly nextId: number;
}

function rowFrom(id: number, service?: ServiceInput): Row {
  return {
    id,
    serviceId: service?.id ?? null,
    name: service?.name ?? "",
    summary: service?.summary ?? "",
    price: service?.priceText ?? "",
  };
}

const FIELD_CLASSES =
  "mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-base tabular-nums transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";
const SMALL_BUTTON =
  "rounded-full px-3 py-1.5 text-xs text-ink-soft transition-colors duration-300 ease-calm hover:bg-paper-deep hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * Add, remove and reorder services. Each row posts as services.{position}.name|summary|price, plus
 * services.{position}.id for a saved service, so reordering and editing keep each service's identity.
 */
export function ServiceListEditor({ initial, invalidField, errorId, currency }: ServiceListEditorProps): ReactElement {
  const [state, setState] = useState<EditorState>(() => {
    const rows = initial.length > 0 ? initial.map((service, index) => rowFrom(index, service)) : [rowFrom(0)];
    return { rows, nextId: rows.length };
  });
  const { rows } = state;
  // The server drops a row left completely blank and needs at least one service, so a name is only required where
  // its row has other text, or where no row has a name yet (then the first one must).
  const anyName = rows.some((row) => row.name.trim() !== "");

  function setRows(change: (current: readonly Row[]) => readonly Row[]): void {
    setState((current) => ({ ...current, rows: change(current.rows) }));
  }

  function addRow(): void {
    setState((current) => ({ rows: [...current.rows, rowFrom(current.nextId)], nextId: current.nextId + 1 }));
  }

  function update(id: number, patch: Partial<Omit<Row, "id" | "serviceId">>): void {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function move(index: number, by: -1 | 1): void {
    setRows((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const reordered = [...current];
      const [row] = reordered.splice(index, 1);
      if (row !== undefined) reordered.splice(target, 0, row);
      return reordered;
    });
  }

  function invalid(name: string): { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string } {
    return invalidField === name ? { "aria-invalid": true, "aria-describedby": errorId } : {};
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium">Your services</legend>
      <p className="mt-1 text-sm text-ink-soft">The things customers come to you for. Add as many as you like, up to {MAX_SERVICES}.</p>

      <ol className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <li key={row.id} className="rounded-control border border-line bg-paper/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.8125rem] font-medium tabular-nums text-ink-soft">Service {index + 1}</span>
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className={SMALL_BUTTON}>
                  Move up
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  className={SMALL_BUTTON}
                >
                  Move down
                </button>
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((candidate) => candidate.id !== row.id))}
                  disabled={rows.length === 1}
                  className={SMALL_BUTTON}
                >
                  Remove
                </button>
              </span>
            </div>

            {row.serviceId === null ? null : (
              <input type="hidden" name={`services.${index}.id`} value={row.serviceId} />
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
              <label className="block text-sm">
                Name
                <RequiredMark />
                <input
                  name={`services.${index}.name`}
                  value={row.name}
                  required={row.summary.trim() !== "" || row.price.trim() !== "" || (!anyName && index === 0)}
                  onChange={(event) => update(row.id, { name: event.target.value })}
                  maxLength={80}
                  placeholder="Teeth whitening"
                  className={FIELD_CLASSES}
                  {...invalid(`services.${index}.name`)}
                />
              </label>
              <label className="block text-sm">
                Price <span className="text-ink-soft">(optional)</span>
                <input
                  name={`services.${index}.price`}
                  value={row.price}
                  onChange={(event) => update(row.id, { price: event.target.value })}
                  maxLength={60}
                  placeholder={currency === null ? "Optional" : PRICE_PLACEHOLDERS[currency]}
                  className={FIELD_CLASSES}
                  {...invalid(`services.${index}.price`)}
                />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              A sentence about it <span className="text-ink-soft">(optional)</span>
              <input
                name={`services.${index}.summary`}
                value={row.summary}
                onChange={(event) => update(row.id, { summary: event.target.value })}
                maxLength={240}
                className={FIELD_CLASSES}
                {...invalid(`services.${index}.summary`)}
              />
            </label>
          </li>
        ))}
      </ol>

      <Button type="button" size="sm" variant="secondary" onClick={addRow} disabled={rows.length >= MAX_SERVICES} className="mt-3">
        <PlusIcon className="size-4" />
        Add another service
      </Button>
    </fieldset>
  );
}
