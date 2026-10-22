"use client";

import { useActionState, type ReactElement, type ReactNode } from "react";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { initialReactivateFormState, type ReactivateFormState } from "@/lib/billing/reactivate-form";

interface ReactivatePlanProps {
  /** "Brandbasket services plan". */
  readonly planName: string;
  /** What a month takes now, tax included: the figure on the button is the figure charged. */
  readonly monthlyAmount: string;
  /** Under the price: "₹9,999 a month plus 18% GST." */
  readonly priceNote: string;
  readonly action: (state: ReactivateFormState, formData: FormData) => Promise<ReactivateFormState>;
  /** The services the customer chose to come back to, posted with the press, or null when the basket is not theirs to choose. */
  readonly services: readonly MonthlyAddOnId[] | null;
  /** The picker the customer chooses them with. */
  readonly children?: ReactNode;
}

/**
 * Billing's plan card for a customer whose plan has lapsed: what restarting costs today and the one button that does
 * it. A customer who cancelled themselves chooses their services first (`children`), and the press posts the choice. Disabled while the payment is being opened, so a double press opens one payment. A refusal is shown under it
 * and announced again each time, because the alert unmounts while the action runs.
 */
export function ReactivatePlan({ planName, monthlyAmount, priceNote, action, services, children }: ReactivatePlanProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialReactivateFormState);
  const message = state.status === "error" && !isPending ? state.message : null;

  return (
    <section aria-labelledby="reactivate-heading" className="rounded-card border border-line bg-card p-6 sm:p-7">
      <h2 id="reactivate-heading" className="panel-section text-base">
        Your plan has ended
      </h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">
        Your website and content are safe. Reactivate to bring them back from today. The months you were away aren’t
        charged.
      </p>
      {children}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-t border-line pt-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="text-sm font-semibold">{planName}</p>
            <span className="rounded-full bg-accent-pale px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-deep">
              Monthly
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">{priceNote}</p>
        </div>
        <p className="flex items-baseline gap-1.5">
          <span className="font-serif text-3xl leading-none tracking-tight tabular-nums">{monthlyAmount}</span>
          <span className="text-xs text-ink-soft">per month</span>
        </p>
      </div>

      <form action={formAction} className="mt-6">
        {services?.map((service) => <input key={service} type="hidden" name="service" value={service} />)}
        <Button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          aria-describedby={message === null ? undefined : "reactivate-error"}
          className="group"
        >
          {isPending ? "Opening payment…" : `Reactivate for ${monthlyAmount}`}
          <ArrowIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
        </Button>
        {message === null ? null : (
          <p
            id="reactivate-error"
            role="alert"
            className="mt-4 max-w-xl rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep"
          >
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
