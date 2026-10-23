import type { ReactElement, ReactNode } from "react";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import { LocalDate, LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { cn } from "@brandbasket/shared/lib/cn";

interface LaunchPathProps {
  /** When the first payment was confirmed; null when it is not known. */
  readonly paidAtIso: string | null;
  /** Whether the kickoff call is booked. */
  readonly booked: boolean;
  /** The call's start once the booking page has reported it. */
  readonly callStartsAtIso: string | null;
}

type StepState = "done" | "now" | "next";

interface Step {
  readonly title: string;
  readonly note: ReactNode;
  readonly state: StepState;
}

/**
 * The six steps from payment to a live website, beside the kickoff call while the customer is setting up (option A, owner's
 * pick, 2026-10-23). Only the first three can be done or current on Home: once the setup is sent, Home shows the project instead.
 */
export function LaunchPath({ paidAtIso, booked, callStartsAtIso }: LaunchPathProps): ReactElement {
  const steps: readonly Step[] = [
    { title: "Payment received", note: paidAtIso === null ? "Done" : <LocalDate iso={paidAtIso} />, state: "done" },
    {
      title: "Kickoff call",
      note: !booked ? "Pick a time that suits you" : callStartsAtIso === null ? "Booked" : <LocalDateTime iso={callStartsAtIso} />,
      state: booked ? "done" : "now",
    },
    { title: "Send your details", note: "4 short steps, saved as you go", state: booked ? "now" : "next" },
    { title: "We build your website", note: "Pages, words and photos, made for you", state: "next" },
    { title: "You review it", note: "Ask for changes before it goes live", state: "next" },
    { title: "Your website is live", note: "On your own domain", state: "next" },
  ];

  return (
    <section aria-labelledby="launch-path-heading" className="rounded-shell border border-line p-6 sm:p-7">
      <h2 id="launch-path-heading" className="panel-section">
        Your launch path
      </h2>
      <ol className="mt-5">
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <li key={step.title} aria-current={step.state === "now" ? "step" : undefined} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3.5">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold tabular-nums",
                    step.state === "done" && "bg-ink text-paper",
                    step.state === "now" && "bg-accent-pale text-highlight-deep shadow-[inset_0_0_0_2px_var(--color-highlight)]",
                    step.state === "next" && "text-ink-soft shadow-[inset_0_0_0_1.5px_var(--color-line)]",
                  )}
                >
                  {step.state === "done" ? <TickIcon className="size-4" /> : index + 1}
                </span>
                {last ? null : <span aria-hidden="true" className={cn("my-1 w-0.5 min-h-4 grow", step.state === "done" ? "bg-ink" : "bg-line")} />}
              </div>
              <div className={cn(last ? "pb-0" : "pb-5")}>
                <p className="mt-0.5 text-[0.9375rem] font-medium text-ink">
                  {step.title}
                  <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "now" ? " (now)" : ""}</span>
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-ink-soft tabular-nums">{step.note}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
