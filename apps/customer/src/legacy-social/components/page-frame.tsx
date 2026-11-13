import type { ReactElement, ReactNode } from "react";

/** A page's title, one line under it and its action, then its blocks one under the other: the old app's page frame, for the copied review page. */
export function PageFrame({ title, lede, action, children }: { readonly title: string; readonly lede?: string; readonly action?: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <div className="mr-auto grid w-full max-w-[97.5rem] grid-cols-[minmax(0,1fr)] gap-6 md:gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="type-title text-ink">{title}</h1>
          {lede === undefined ? null : <p className="mt-1 type-meta">{lede}</p>}
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}
