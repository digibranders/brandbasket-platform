"use client";

import type { ReactElement } from "react";
import { useFormStatus } from "react-dom";
import { buttonSecondary } from "@/components/console/buttons";

interface IssueInvoiceButtonProps {
  /** Names the payment for a screen reader, since a page can list several of these buttons. */
  readonly label: string;
}

/**
 * The submit button of the "Issue invoice" form. While the invoice is being issued it is disabled and says so, so a
 * second press cannot ask for a second invoice. The form still posts without JavaScript: this only adds the waiting state.
 */
export function IssueInvoiceButton({ label }: IssueInvoiceButtonProps): ReactElement {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} aria-label={pending ? undefined : label} className={buttonSecondary}>
      {pending ? "Issuing…" : "Issue invoice"}
    </button>
  );
}
