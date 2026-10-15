import type { ReactElement } from "react";
import { ArrowIcon } from "@fynix/shared/ui/icons";
import { ExternalButtonLink } from "@fynix/shared/ui/panel/button";

interface SetupCallCardProps {
  /** Where the call is booked: opens in a new tab, so the setup the customer is in the middle of stays where it is. */
  readonly href: string;
}

/**
 * The other way to set up: a short call, instead of the steps below. A customer who would rather fill the steps in
 * themselves just carries on, so this asks nothing of them; a customer who is stuck, or does not want to write about their
 * own business, can book a time. It is a plain link to the booking page, with no booking system behind it.
 */
export function SetupCallCard({ href }: SetupCallCardProps): ReactElement {
  return (
    <section
      aria-labelledby="setup-call"
      className="mt-6 flex flex-col gap-4 rounded-card border border-line bg-paper-deep px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-6"
    >
      <div className="min-w-0">
        <h2 id="setup-call" className="text-base font-semibold text-ink">
          Want to set this up together?
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">
          Fill in the steps below yourself, or book a short call and we will go through it with you.
        </p>
      </div>
      <ExternalButtonLink href={href} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm" className="group self-start sm:self-auto">
        Book a call
        <span className="sr-only"> (opens in a new tab)</span>
        <ArrowIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
      </ExternalButtonLink>
    </section>
  );
}
