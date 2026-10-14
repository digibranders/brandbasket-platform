import type { ReactElement, ReactNode } from "react";

interface StatCardProps {
  readonly icon: ReactNode;
  readonly value: number;
  readonly label: string;
}

/** A count with an icon, used in the stat rows along the top of the staff console's lists. */
export function StatCard({ icon, value, label }: StatCardProps): ReactElement {
  return (
    <div className="flex items-center gap-4 rounded-card border border-line bg-card px-5 py-4">
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-pale text-accent-deep"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-serif text-3xl leading-none">{value}</span>
        <span className="mt-1 block truncate text-sm text-ink-soft">{label}</span>
      </span>
    </div>
  );
}
