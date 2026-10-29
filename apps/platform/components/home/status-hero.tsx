import type { ReactElement, ReactNode } from "react";
import { LIFT } from "@/components/v2/classes";
import { StatusWord, type StatusTone } from "./status-word";

/** The one status card a page opens with: where things stand in a word, a plain title, one line, and what to do about it. */
export function StatusHero({
  word,
  tone,
  title,
  children,
  actions,
  aside,
  labelId,
}: {
  readonly word: string;
  readonly tone: StatusTone;
  readonly title: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  /** A second column beside the status (the call's agenda, a preview picture). */
  readonly aside?: ReactNode;
  readonly labelId: string;
}): ReactElement {
  return (
    <section aria-labelledby={labelId} className={`${LIFT} grid gap-8 p-6 sm:p-7 ${aside === undefined ? "" : "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"}`}>
      <div className="grid content-start gap-5">
        <StatusWord tone={tone}>{word}</StatusWord>
        <div className="grid gap-2">
          <h2 id={labelId} className="font-display text-[1.875rem] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
            {title}
          </h2>
          {children === undefined ? null : <div className="max-w-[56ch] text-base leading-relaxed text-ink-2">{children}</div>}
        </div>
        {actions === undefined ? null : <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {aside === undefined ? null : <div>{aside}</div>}
    </section>
  );
}
