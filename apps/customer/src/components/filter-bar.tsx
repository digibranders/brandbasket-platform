"use client";

import { debounce, parseAsString, useQueryState } from "nuqs";
import { Chips, Icon, Input, type ChipOption } from "@/ui";

export interface FilterBarProps {
  /** Names the chips for screen readers: "Status". */
  readonly label: string;
  readonly options: readonly ChipOption[];
  /** The chip that means "no filter". It is left out of the URL. */
  readonly defaultValue: string;
  /** The query parameter of the chips. */
  readonly param?: string;
  /** A search box beside the chips, kept in `?q=`. */
  readonly search?: { readonly label: string; readonly param?: string };
  /**
   * False (the default) re-renders the page's server components on every change, so the loader filters. True keeps it in
   * the browser, for a client component that filters rows it already has.
   */
  readonly shallow?: boolean;
}

/** Filter chips above a table with an optional search box, both in the URL (plan 60, FilterBar). */
export function FilterBar({ label, options, defaultValue, param = "filter", search, shallow = false }: FilterBarProps) {
  const [value, setValue] = useQueryState(param, parseAsString.withDefault(defaultValue).withOptions({ shallow, clearOnDefault: true }));
  const [query, setQuery] = useQueryState(
    search?.param ?? "q",
    parseAsString.withDefault("").withOptions({ shallow, clearOnDefault: true, limitUrlUpdates: debounce(300) }),
  );
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <Chips aria-label={label} options={options} value={value} onValueChange={(next) => void setValue(next)} className="md:flex-1" />
      {search === undefined ? null : (
        <div className="relative md:w-64">
          <Icon name="MagnifyingGlass" size="sm" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <Input type="search" aria-label={search.label} value={query} onChange={(event) => void setQuery(event.target.value)} className="pl-10" />
        </div>
      )}
    </div>
  );
}
