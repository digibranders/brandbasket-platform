import type { ReactNode } from "react";

export interface EntryScreenProps {
  readonly title: string;
  readonly lede?: ReactNode;
  readonly children: ReactNode;
}

/** One entry screen: the title, a line under it, then the form (plan 60, Entry template). */
export function EntryScreen({ title, lede, children }: EntryScreenProps) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="type-title text-ink">{title}</h1>
        {lede === undefined ? null : <p className="type-body text-ink-3">{lede}</p>}
      </div>
      {children}
    </>
  );
}
