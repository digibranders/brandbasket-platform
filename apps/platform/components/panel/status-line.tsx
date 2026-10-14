import type { ReactElement, ReactNode } from "react";

export type StatusTone = "done" | "waiting" | "stopped" | "quiet";

const STATUS_DOTS: Readonly<Record<StatusTone, string>> = {
  done: "bg-emerald-600",
  waiting: "bg-gold-deep",
  stopped: "bg-accent",
  // An open ring: settled, nothing to do.
  quiet: "ring-[1.5px] ring-inset ring-ink-soft/65",
};

/** One line of where something stands, led by a dot in the state's colour. */
export function StatusLine({ tone, children }: { readonly tone: StatusTone; readonly children: ReactNode }): ReactElement {
  return (
    <p className="flex items-center gap-2.5 text-[0.9375rem] font-medium">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${STATUS_DOTS[tone]}`} />
      {/* One flex item, so the words and the dates inside keep their own spacing. */}
      <span>{children}</span>
    </p>
  );
}
