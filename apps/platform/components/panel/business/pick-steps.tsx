"use client";

import { useId, useState, type ReactElement, type ReactNode } from "react";
import { SearchIcon } from "@fynix/shared/ui/icons";
import { filterOptions, type PickOption } from "@/lib/listing-address";

/*
 * The question-by-question pickers of the Business profile's Listing tab (district, area, category): one question
 * open at a time, a closed one reduced to its answer and a way to change it, and long lists narrowed by typing.
 */

export const OPTION_CLASSES =
  "w-full rounded-control px-3 py-2 text-left text-[0.9375rem] transition-colors duration-300 ease-calm hover:bg-paper-deep aria-pressed:bg-ink aria-pressed:text-paper";
export const PILL_CLASSES =
  "rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors duration-300 ease-calm hover:bg-paper-deep aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper";

export interface StepProps {
  readonly number: number;
  readonly question: string;
  /** What was picked, shown on the closed step. */
  readonly answer: string | null;
  readonly open: boolean;
  /** An earlier step has not been answered yet, so this one cannot be opened. */
  readonly locked: boolean;
  readonly onChange: () => void;
  readonly children: ReactNode;
}

/** One question. Closed, it is a single line: the answer and a way to change it. */
export function Step({ number, question, answer, open, locked, onChange, children }: StepProps): ReactElement {
  return (
    <section className={`border-t border-line py-5 ${locked ? "opacity-45" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="panel-section flex items-baseline gap-3">
          <span aria-hidden="true" className="w-4 font-serif tabular-nums text-accent">
            {number}
          </span>
          {question}
        </h2>
        {open || answer === null ? null : (
          <p className="ml-auto flex items-baseline gap-4 text-[0.9375rem]">
            <span className="font-medium">{answer}</span>
            <button type="button" onClick={onChange} className="link-underline text-sm text-ink-soft">
              Change<span className="sr-only"> {question}</span>
            </button>
          </p>
        )}
      </div>
      {open ? <div className="mt-4 pl-7">{children}</div> : null}
    </section>
  );
}

export interface OptionListProps {
  /** What one of these is called, and several: "category", "categories". */
  readonly noun: string;
  readonly plural: string;
  /** Put the cursor in the search box as the list appears. Off for the first list on a fresh page, so a phone's
   * keyboard does not cover the page before the owner has read it. */
  readonly focusSearch: boolean;
  readonly options: readonly PickOption[];
  readonly selected: string | null;
  readonly onPick: (option: PickOption) => void;
}

/** A long list to pick one from: type to narrow it, tap a name. Enter picks when one name is left. */
export function OptionList({ noun, plural, focusSearch, options, selected, onPick }: OptionListProps): ReactElement {
  const [typed, setTyped] = useState("");
  const searchId = useId();
  const shown = filterOptions(options, typed);
  const only = shown.length === 1 ? shown[0] : undefined;

  return (
    <>
      <div className="relative max-w-sm">
        <label htmlFor={searchId} className="sr-only">
          Search for your {noun}
        </label>
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <input
          id={searchId}
          type="search"
          autoFocus={focusSearch}
          autoComplete="off"
          value={typed}
          placeholder={`Search ${options.length} ${plural}`}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            // Enter must never submit the form from here: it picks the one name left, or does nothing.
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (only !== undefined) onPick(only);
          }}
          className="block w-full rounded-full border border-ink-soft/50 bg-white py-1.5 pl-10 pr-4 text-sm text-ink transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent"
        />
      </div>
      {shown.length === 0 ? (
        <p role="status" className="mt-4 text-sm text-ink-soft">
          No {noun} matches &ldquo;{typed.trim()}&rdquo;.
        </p>
      ) : (
        <ul aria-label={`Choose your ${noun}`} className="mt-3 grid max-h-80 gap-x-4 gap-y-0.5 overflow-y-auto overscroll-contain sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((option) => (
            <li key={option.value}>
              <button type="button" aria-pressed={option.value === selected} onClick={() => onPick(option)} className={OPTION_CLASSES}>
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
