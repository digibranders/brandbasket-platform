"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/ui";

/** A submit button that holds while its form's action runs, so a double click sends one request. */
export function PendingSubmit({ variant = "primary", children }: { readonly variant?: ButtonVariant; readonly children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} pending={pending}>
      {children}
    </Button>
  );
}
