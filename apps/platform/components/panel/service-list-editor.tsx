"use client";

import { Plus } from "@phosphor-icons/react/dist/ssr";
import { useState, type ReactElement, type ReactNode } from "react";
import { Required, STEP_FIELD_CLASSES, STEP_HINT_CLASSES, STEP_LABEL_CLASSES } from "@/components/panel/step-form";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { MAX_SERVICES, type ServiceInput } from "@/lib/onboarding/content-form";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";

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
  /** A message to show under a service's row (or under the list, for the index it is given), when the form refused something in it. */
  readonly renderError?: (index: number) => ReactNode;
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

const SMALL_BUTTON =
  "rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors duration-200 hover:bg-sunken hover:text-ink disabled:opacity-45 disabled:hover:bg-transparent";

/**
 * Add, remove and reorder services. Each row posts as services.{position}.name|summary|price, plus
 * services.{position}.id for a saved service, so reordering and editing keep each service's identity.
 */
export function ServiceListEditor({ initial, invalidField, errorId, currency, renderError }: ServiceListEditorProps): ReactElement {
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
      <legend className="p-0 font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">Your services</legend>
      <p className={`mt-1 ${STEP_HINT_CLASSES}`}>The things customers come to you for. Add as many as you like, up to {MAX_SERVICES}.</p>

      <ol className="mt-4 divide-y divide-line border-y border-line">
        {rows.map((row, index) => (
          <li key={row.id} className="py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-figure text-xs font-medium tabular-nums text-ink-2">Service {index + 1}</span>
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
              <label className={STEP_LABEL_CLASSES}>
                Name
                <Required />
                <input
                  name={`services.${index}.name`}
                  value={row.name}
                  required={row.summary.trim() !== "" || row.price.trim() !== "" || (!anyName && index === 0)}
                  onChange={(event) => update(row.id, { name: event.target.value })}
                  maxLength={80}
                  placeholder="Teeth whitening"
                  className={STEP_FIELD_CLASSES}
                  {...invalid(`services.${index}.name`)}
                />
              </label>
              <label className={STEP_LABEL_CLASSES}>
                Price <span className="font-medium text-ink-2">(optional)</span>
                <input
                  name={`services.${index}.price`}
                  value={row.price}
                  onChange={(event) => update(row.id, { price: event.target.value })}
                  maxLength={60}
                  placeholder={currency === null ? "Optional" : PRICE_PLACEHOLDERS[currency]}
                  className={STEP_FIELD_CLASSES}
                  {...invalid(`services.${index}.price`)}
                />
              </label>
            </div>
            <label className={`mt-3 ${STEP_LABEL_CLASSES}`}>
              A sentence about it <span className="font-medium text-ink-2">(optional)</span>
              <input
                name={`services.${index}.summary`}
                value={row.summary}
                onChange={(event) => update(row.id, { summary: event.target.value })}
                maxLength={240}
                className={STEP_FIELD_CLASSES}
                {...invalid(`services.${index}.summary`)}
              />
            </label>
            {renderError === undefined ? null : renderError(index)}
          </li>
        ))}
      </ol>

      <button type="button" onClick={addRow} disabled={rows.length >= MAX_SERVICES} className={`${SOFT_BUTTON} mt-4 h-10 px-4`}>
        <Plus size={16} aria-hidden="true" />
        Add another service
      </button>
    </fieldset>
  );
}
