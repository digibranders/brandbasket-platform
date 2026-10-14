import type { ReactElement, ReactNode } from "react";
import { ChangelogArt } from "@fynix/shared/ui/changelog-art";

/**
 * Which of the website's changelog drawings an empty screen shows. The builder is the same person in each; what
 * they are doing suits the screen: writing a note (posts), holding a nameplate (authors), arranging layers
 * (categories).
 */
export type EmptyStateArt = "care" | "name" | "stack";

/**
 * The content screens when there is nothing to list: one of the website's own changelog illustrations, one line, and
 * the way to start.
 *
 * The drawing fills its shapes with `--color-card`. Here it sits straight on the panel's paper, not on a card, so that
 * variable is pointed at paper for the drawing alone; otherwise the filled shapes show as lighter patches.
 */
export function BlogEmptyState({
  title,
  body,
  action,
  art = "care",
}: {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
  readonly art?: EmptyStateArt;
}): ReactElement {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-card border border-dashed border-ink-soft/25 px-8 py-10 text-center">
      <ChangelogArt entry={art} className="max-w-[17rem] text-ink [--color-card:var(--color-paper)]" />
      <h2 className="mt-4 font-serif text-xl text-ink">{title}</h2>
      <p className="mt-2 text-sm text-ink-soft">{body}</p>
      {action === undefined ? null : <div className="mt-6">{action}</div>}
    </div>
  );
}
