import { StatusChip, type StatusChipProps } from "@brandbasket/shared/ui/patterns";
import type { ReactNode } from "react";

export interface EntryScreenProps {
  readonly title: string;
  readonly lede?: ReactNode;
  /** The state of what the link or page is about (an invitation: open, expired, used), read before anything else. */
  readonly chip?: Pick<StatusChipProps, "label" | "variant">;
  /** Puts the form or the buttons in the screen's one focal card (gold top edge). The sign-up form brings its own card. */
  readonly framed?: boolean;
  readonly children: ReactNode;
}

/** One entry screen: the title, a line under it, then the form (plan 60, Entry template). */
export function EntryScreen({ title, lede, chip, framed = false, children }: EntryScreenProps) {
  return (
    <>
      <div className="flex flex-col items-start gap-2">
        {chip === undefined ? null : <StatusChip label={chip.label} variant={chip.variant} />}
        <h1 className="type-title text-ink">{title}</h1>
        {lede === undefined ? null : <p className="type-body text-ink-3">{lede}</p>}
      </div>
      {framed ? (
        <div className="flex flex-col gap-4 rounded-overlay border border-border border-t-2 border-t-accent-gold bg-surface p-6 shadow-hero sm:p-7">{children}</div>
      ) : (
        children
      )}
    </>
  );
}
