import { Icon } from "@/ui";
import { cx } from "@/ui/cx";

export type StepState = "done" | "now" | "todo";

export interface Step {
  readonly label: string;
  /** Already written: "Tue 3 Nov", "By Mon 9 Nov". */
  readonly date?: string;
  readonly state: StepState;
}

const MARKER: Readonly<Record<StepState, string>> = {
  done: "border-c1 bg-c1",
  now: "border-c1 bg-accent-wash",
  todo: "border-border-control bg-surface",
};

/**
 * Where a request or a build is: Sent, Quoted, In progress, Ready to check, Done (plan 60, Stepper). Across on desktop, down
 * on phones. The current step is marked for screen readers as well as by colour.
 */
export function Stepper({ steps, label }: { readonly steps: readonly Step[]; readonly label: string }) {
  return (
    <ol aria-label={label} className="m-0 grid list-none gap-3 p-0 md:grid-flow-col md:auto-cols-fr md:gap-0">
      {steps.map((step) => (
        <li
          key={step.label}
          aria-current={step.state === "now" ? "step" : undefined}
          className={cx(
            "relative flex flex-col pl-6 type-meta md:pt-6 md:pl-0",
            "md:before:absolute md:before:inset-x-0 md:before:top-1.5 md:before:h-0.5 md:before:bg-border",
            step.state === "done" && "md:before:bg-c1",
          )}
        >
          <span aria-hidden className={cx("absolute top-0.5 left-0 size-3.5 rounded-full border-2 md:top-0", MARKER[step.state])} />
          <span className="type-sub text-ink">
            {step.label}
            {step.state === "done" ? <span className="sr-only">, done</span> : null}
          </span>
          {step.date === undefined ? null : <span>{step.date}</span>}
        </li>
      ))}
    </ol>
  );
}

export interface TimelineStep {
  readonly title: string;
  /** A date or one short line under the title. */
  readonly meta?: string;
  readonly state: StepState;
}

/** "What happens next" with dated steps, top to bottom (plan 60, TimelineSteps). */
export function TimelineSteps({ steps, label }: { readonly steps: readonly TimelineStep[]; readonly label: string }) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col p-0">
      {steps.map((step) => (
        <li
          key={step.title}
          aria-current={step.state === "now" ? "step" : undefined}
          className="relative flex gap-3 pb-4 last:pb-0 before:absolute before:top-5.5 before:bottom-0 before:left-2.25 before:w-px before:bg-border last:before:hidden"
        >
          {step.state === "done" ? (
            <Icon name="CheckCircle" className="text-pos-text" />
          ) : (
            <span aria-hidden className="flex size-4.5 shrink-0 items-center justify-center">
              <span className={cx("size-3 rounded-full border-2", MARKER[step.state])} />
            </span>
          )}
          <div className="min-w-0">
            <p className={cx("type-sub", step.state === "todo" ? "text-ink-2" : "text-ink")}>
              {step.title}
              {step.state === "done" ? <span className="sr-only">, done</span> : null}
            </p>
            {step.meta === undefined ? null : <p className="type-meta">{step.meta}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
