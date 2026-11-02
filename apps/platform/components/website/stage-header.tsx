import Link from "next/link";
import type { ReactElement } from "react";
import { StatusWord } from "@/components/home/status-word";
import { DARK_BUTTON } from "@/components/v2/classes";
import type { StageChip } from "@/lib/website/history";
import type { ProgressView } from "@/lib/website/progress-view";

/** Where the stage's headline begins: what is happening, in a word beside it, and the one way forward when the customer owes a step. */
export function StageHeader({ view, chip }: { readonly view: ProgressView; readonly chip: StageChip | null }): ReactElement {
  return (
    <div className="grid justify-items-start gap-3">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">{view.title}</h2>
        {chip === null ? null : <StatusWord tone={chip.tone}>{chip.label}</StatusWord>}
      </div>
      {view.line === null ? null : <p className="max-w-2xl text-base leading-relaxed text-ink-2">{view.line}</p>}
      {view.kind === "kickoff" ? (
        <Link href="/" className={DARK_BUTTON}>
          See your kickoff
        </Link>
      ) : null}
      {view.kind === "setup" ? (
        <Link href="/onboarding" className={DARK_BUTTON}>
          Carry on setting up
        </Link>
      ) : null}
    </div>
  );
}
