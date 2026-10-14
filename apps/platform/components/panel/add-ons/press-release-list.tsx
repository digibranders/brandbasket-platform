import type { ReactElement } from "react";
import { addOnDate, pressReleaseStatusLabel, type PressReleaseStatus } from "@/lib/billing/add-on-copy";

export interface PressReleaseItem {
  readonly id: string;
  readonly status: PressReleaseStatus;
  /** When it was paid for; falls back to when the row was made. */
  readonly boughtAt: Date;
}

interface PressReleaseListProps {
  /** Newest first. */
  readonly items: readonly PressReleaseItem[];
}

/** Colour only backs up the words: each status says where it has got to. */
const STATUS_CLASSES: Readonly<Record<PressReleaseStatus, string>> = {
  waiting: "bg-paper-deep text-ink",
  in_progress: "bg-accent-pale text-accent-deep",
  published: "bg-ink text-paper",
};

/**
 * The customer's own press releases under the Press release row, newest first: when each was bought and where it has got
 * to. Staff set the status. With none yet it says so in one quiet line.
 */
export function PressReleaseList({ items }: PressReleaseListProps): ReactElement {
  if (items.length === 0) return <p className="text-sm text-ink-soft">No press releases yet.</p>;
  return (
    <ul aria-label="Your press releases" className="divide-y divide-line text-sm">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <span className="tabular-nums text-ink">Bought {addOnDate(item.boughtAt)}</span>
          <span className={`rounded-full px-3 py-1 text-[0.8125rem] font-medium ${STATUS_CLASSES[item.status]}`}>
            {pressReleaseStatusLabel(item.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}
