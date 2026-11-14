import type { ReactElement } from "react";

/**
 * The card shown while something is being written or drawn in the background: a thin line along its top edge with one short stretch
 * sliding across it, the title, and a line to say the customer can leave. It says nothing about steps, because the page updates itself.
 */
export function WorkingNote({ title }: { readonly title: string }): ReactElement {
  return (
    <div role="status" className="relative overflow-hidden rounded-xl bg-surface px-4 pt-5 pb-4 ring-1 ring-line">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-sunken">
        <div className="animate-job-slide absolute inset-y-0 w-[30%] bg-ink" />
      </div>
      <p className="text-[0.875rem] font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-[0.84375rem] text-ink-2">You can leave this page. They will be here when you are back.</p>
    </div>
  );
}
