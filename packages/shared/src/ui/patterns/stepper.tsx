import type { ReactElement } from "react";

export interface StepItem {
  readonly id: string;
  readonly label: string;
}

export interface StepperProps {
  readonly steps: readonly StepItem[];
  /** 0-based index of the currently active step. */
  readonly activeIndex: number;
  readonly className?: string;
}

/**
 * Stepper: numbered circles joined by a hairline.
 * Done is sage with a check, current is gold filled, upcoming is outlined.
 * Line fill transition 320ms, disabled under reduced motion.
 */
export function Stepper({
  steps,
  activeIndex,
  className = "",
}: StepperProps): ReactElement {
  return (
    <nav
      aria-label="Progress"
      className={`flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5 ${className}`}
    >
      {steps.map((step, idx) => {
        const isDone = idx < activeIndex;
        const isActive = idx === activeIndex;
        const isUpcoming = idx > activeIndex;

        return (
          <div key={step.id} className="flex flex-1 items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-semibold transition-colors duration-300 ${
                  isDone
                    ? "border border-pos-text bg-pos-wash text-pos-text"
                    : isActive
                      ? "border border-accent-gold bg-accent-gold text-white"
                      : "border border-border bg-surface text-ink-3"
                }`}
                aria-current={isActive ? "step" : undefined}
              >
                {isDone ? (
                  <svg className="h-4 w-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                    <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span>{idx + 1}</span>
                )}
              </span>
              <span
                className={`font-sans text-[13.5px] whitespace-nowrap ${
                  isDone
                    ? "font-semibold text-pos-text"
                    : isActive
                      ? "font-semibold text-ink"
                      : "font-medium text-ink-2"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 ? (
              <div
                className={`hidden h-[1px] flex-1 transition-colors duration-300 sm:block ${
                  isDone ? "bg-pos-text" : "bg-border"
                }`}
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
