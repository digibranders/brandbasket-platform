import type { ReactElement, ReactNode } from "react";
import {
  CodeIcon,
  DocumentIcon,
  LockIcon,
  PaletteIcon,
  RefreshIcon,
  RocketIcon,
  TickIcon,
  UsersIcon,
} from "@firstfold/shared/ui/icons";
import { cn } from "@firstfold/shared/lib/cn";
import { formatStepNumber } from "@firstfold/shared/lib/format";
import { TOUR_STAGE_LABELS, type TourStageState } from "@/lib/plan-tour";

interface FeaturePreviewProps {
  /** Where each of the six stages stands. See tourStageStates. */
  readonly states: readonly TourStageState[];
  /** Before the first payment, stages not yet started say "Live once you pay": the payment is what starts them. */
  readonly locked: boolean;
  /** How changes and blog posts are charged, already in the customer's currency. See changesNote. */
  readonly changesNote: string;
}

interface Stage {
  readonly title: string;
  readonly body: string;
  readonly icon: ReactNode;
}

const ICON = "size-6";

function stagesFor(changesNote: string): readonly Stage[] {
  return [
    {
      title: "Tell us about your business",
      body: "Your services, opening hours, photos and the words for your pages.",
      icon: <DocumentIcon className={ICON} />,
    },
    {
      title: "We design it",
      body: "A design built around your business, not a template.",
      icon: <PaletteIcon className={ICON} />,
    },
    {
      title: "We build it",
      body: "A five-page website, written with you, built for phones first.",
      icon: <CodeIcon className={ICON} />,
    },
    {
      title: "You review it",
      body: "You see it first. Two rounds of changes are included.",
      icon: <UsersIcon className={ICON} />,
    },
    {
      title: "We put it live",
      body: "On your own domain, secure and looked after every month.",
      icon: <RocketIcon className={ICON} />,
    },
    {
      title: "We keep it fresh",
      body: `Ask for changes any time. ${changesNote}`,
      icon: <RefreshIcon className={ICON} />,
    },
  ];
}

function StageChip({ state, locked }: { readonly state: TourStageState; readonly locked: boolean }): ReactElement | null {
  if (state === "not-started") {
    // Before payment, what's still to come is waiting on it; after payment there's nothing to flag.
    if (!locked) return null;
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-paper-deep px-3 py-1 text-xs text-ink-soft">
        <LockIcon className="size-3" />
        Live once you pay
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs",
        state === "done" && "bg-ink text-paper",
        (state === "in-progress" || state === "ongoing") && "bg-accent-pale text-accent-deep",
        state === "paused" && "bg-paper-deep text-ink-soft",
      )}
    >
      <span aria-hidden="true">
        {state === "done" ? (
          <TickIcon className="size-3" />
        ) : (
          <span className={cn("block size-1.5 rounded-full", state === "paused" ? "bg-ink-soft" : "bg-accent")} />
        )}
      </span>
      {TOUR_STAGE_LABELS[state]}
    </span>
  );
}

/**
 * The home screen's tour of what the plan includes, in the order it happens, with where each stage stands. The
 * stages come from the same project status as the next-step card above, so the two always agree.
 */
export function FeaturePreview({ states, locked, changesNote }: FeaturePreviewProps): ReactElement {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stagesFor(changesNote).map((stage, index) => {
        const state = states[index] ?? "not-started";
        return (
          <li key={stage.title} className="flex flex-col rounded-card border border-line bg-card p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-4">
                <span aria-hidden="true" className="font-serif text-3xl tabular-nums text-accent-deep">
                  {formatStepNumber(index)}
                </span>
                <span aria-hidden="true" className="text-accent-deep">
                  {stage.icon}
                </span>
              </span>
              <StageChip state={state} locked={locked} />
            </div>
            <h3 className="mt-5 font-serif text-xl">{stage.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-soft">{stage.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
