"use client";

import { useActionState, type ReactNode } from "react";
import { Banner, Button, type ButtonVariant } from "@/ui";
import { continueToCheckoutAction, toggleServiceAction } from "../actions";

interface BasketButtonProps {
  readonly services: string;
  readonly variant: ButtonVariant;
  readonly size?: "sm" | "md";
  readonly disabled?: boolean;
  readonly "aria-label"?: string;
  readonly children: ReactNode;
}

/** Continue to checkout, and Skip for now: both finish the questions and open the checkout on the basket. */
export function ContinueButton({ services, variant, size = "md", children }: BasketButtonProps) {
  const [state, action, pending] = useActionState(continueToCheckoutAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="services" value={services} />
      <Button type="submit" variant={variant} size={size} pending={pending}>
        {children}
      </Button>
      {state !== null && !state.ok && !pending ? <Banner tone="neg">{state.message}</Banner> : null}
    </form>
  );
}

/** Adds or removes one service on the summary. The last one cannot be removed. */
export function ToggleServiceButton({ services, toggle, variant, disabled, children, ...aria }: BasketButtonProps & { readonly toggle: string }) {
  const [state, action, pending] = useActionState(toggleServiceAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="services" value={services} />
      <input type="hidden" name="toggle" value={toggle} />
      <Button type="submit" variant={variant} size="sm" pending={pending} disabled={disabled} aria-label={aria["aria-label"]}>
        {children}
      </Button>
      {state !== null && !state.ok && !pending ? <Banner tone="neg">{state.message}</Banner> : null}
    </form>
  );
}
