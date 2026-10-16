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
} from "@fynix/shared/ui/icons";
import { cn } from "@fynix/shared/lib/cn";
import { formatStepNumber } from "@fynix/shared/lib/format";
import { TOUR_STAGE_LABELS, type TourStageState } from "@/lib/plan-tour";

interface FeaturePreviewProps {
  /** Where each of the six stages stands. See tourStageStates. */
  readonly states: readonly TourStageState[];
  /** Before the first payment, stages not yet started say "Live once you pay": the payment is what starts them. */
  readonly locked: boolean;
}

interface Stage {
  readonly title: string;
  readonly body: string;
  readonly icon: ReactNode;
}

const ICON = "size-6";

function stagesFor(): readonly Stage[] {
  return [
    {
      title: "Tell us about your business",
      body: "Services, hours and photos.",
      icon: <DocumentIcon className={ICON} />,
    },
    {
      title: "We design it",
      body: "Built around your business.",
      icon: <PaletteIcon className={ICON} />,
    },
    {
      title: "We build it",
      body: "Five pages, made for phones.",
      icon: <CodeIcon className={ICON} />,
    },
    {
      title: "You review it",
      body: "Two rounds of changes included.",
      icon: <UsersIcon className={ICON} />,
    },
    {
      title: "We put it live",
      body: "On your domain, looked after monthly.",
      icon: <RocketIcon className={ICON} />,
    },
    {
      title: "We keep it fresh",
      body: "Ask for changes any time.",
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
export function FeaturePreview({ states, locked }: FeaturePreviewProps): ReactElement {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stagesFor().map((stage, index) => {
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
