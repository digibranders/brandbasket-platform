"use client";

import { useActionState } from "react";
import { Button } from "@/ui";
import { keepPlanAction, restoreAccountAction } from "../actions";

/** Restore my account. */
export function RestoreButton() {
  const [, action, pending] = useActionState(restoreAccountAction, null);
  return (
    <form action={action}>
      <Button type="submit" variant="primary" pending={pending}>
        Restore my account
      </Button>
    </form>
  );
}

/** Keep my plan: opens the payment window for a new mandate. */
export function KeepPlanButton() {
  const [, action, pending] = useActionState(keepPlanAction, null);
  return (
    <form action={action}>
      <Button type="submit" pending={pending}>
        {pending ? "Opening…" : "Keep my plan"}
      </Button>
    </form>
  );
}
