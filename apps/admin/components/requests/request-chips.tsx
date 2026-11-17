import { StatusChip, type StatusChipVariant } from "@brandbasket/shared/ui/patterns";
import type { ReactElement } from "react";
import type { ChipVariant, RowChip } from "@/lib/requests-model";

const VARIANTS: Readonly<Record<ChipVariant, StatusChipVariant>> = { idle: "idle", waiting: "waiting", active: "active", failed: "failed" };

/** The type chip and the state chips of a request. Every chip has a word: colour is never the only sign. */
export function RequestChips({ chips, extra }: { readonly chips: readonly RowChip[]; readonly extra?: string }): ReactElement {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <StatusChip key={chip.label} label={chip.label} variant={VARIANTS[chip.variant]} />
      ))}
      {extra === undefined ? null : <StatusChip label={extra} variant="idle" />}
    </span>
  );
}
