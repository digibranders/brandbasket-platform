"use client";

import type { ReactElement } from "react";
import { useFormStatus } from "react-dom";

/**
 * The quiet way out of the membership's payment page: a line of text, not a second button beside Pay. It reads its own
 * form's state, so a second press while the dashboard opens does nothing.
 */
export function FreeListingButton(): ReactElement {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="link-underline text-sm text-ink-soft disabled:opacity-55">
      {pending ? "Opening your dashboard…" : "Continue with the free listing instead"}
    </button>
  );
}
