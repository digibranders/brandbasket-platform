import type { ReactElement } from "react";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";

interface TestCheckoutFormProps {
  /** Confirms the payment on the server; it redirects when done. */
  readonly action: () => Promise<void>;
  readonly amount: string;
  readonly cancelHref: string;
  /** The button's whole label. "Pay <amount>" by default; a checkout that charges nothing now says just Confirm. */
  readonly submitLabel?: string;
}

/** The test checkout's two choices. Pay is disabled while it confirms, so a double click sends one request. */
export function TestCheckoutForm({ action, amount, cancelHref, submitLabel }: TestCheckoutFormProps): ReactElement {
  return (
    <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <SubmitButton className="w-full sm:w-auto" pendingLabel="Confirming…">{submitLabel ?? `Pay ${amount}`}</SubmitButton>
      <ButtonLink href={cancelHref} variant="secondary" className="w-full sm:w-auto">
        Cancel
      </ButtonLink>
    </form>
  );
}
