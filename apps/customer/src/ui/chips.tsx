"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ChipOption {
  readonly value: string;
  readonly label: ReactNode;
  /** Shown beside the label, already written for reading. */
  readonly count?: ReactNode;
}

interface SingleChoiceProps {
  readonly options: readonly ChipOption[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** Names the group for screen readers. */
  readonly "aria-label": string;
  readonly className?: string;
}

/** One pressed option at a time; pressing the pressed one keeps it (a filter is never empty). */
function choose(onValueChange: (value: string) => void) {
  return (next: string[]) => {
    const picked = next[0];
    if (picked !== undefined) onValueChange(picked);
  };
}

/** Single-select filter chips with counts, in one row that scrolls on phones (plan 60, Chips). Keep the value in the URL. */
export function Chips({ options, value, onValueChange, className, ...aria }: SingleChoiceProps) {
  return (
    <ToggleGroup
      {...aria}
      value={[value]}
      onValueChange={choose(onValueChange)}
      className={cx("flex gap-2 overflow-x-auto md:flex-wrap", className)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className="inline-flex h-chip shrink-0 items-center gap-1.5 rounded-chip border border-border bg-surface px-2.5 type-body text-ink-2 transition-colors duration-100 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-pressed:border-accent-border data-pressed:bg-surface-selected data-pressed:font-medium data-pressed:text-accent-text"
        >
          {option.label}
          {option.count === undefined ? null : <span className="text-ink-3">{option.count}</span>}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

/** Two to four exclusive views of the same thing (plan 60, Segmented). */
export function Segmented({ options, value, onValueChange, className, ...aria }: SingleChoiceProps) {
  return (
    <ToggleGroup
      {...aria}
      value={[value]}
      onValueChange={choose(onValueChange)}
      className={cx("inline-flex overflow-hidden rounded-control border border-border bg-surface", className)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className="h-control-sm border-l border-border px-3.5 type-button text-ink-2 first:border-l-0 hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-pressed:bg-surface-selected data-pressed:text-accent-text"
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
