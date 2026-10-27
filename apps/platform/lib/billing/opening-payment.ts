import { useEffect, useState } from "react";

/** Whether a Pay button is held, and the form result it was held against. */
export interface OpeningPayment {
  readonly held: boolean;
  readonly result: unknown;
}

/**
 * A Pay press that works leaves the page (a redirect), so the action never returns a result. The button is held from the
 * press until a result comes back, rather than only while the action is pending: pending can end a moment before the
 * browser has left, and a press in that gap would open a second payment. Returns `previous` itself when nothing changes.
 */
export function nextOpeningPayment(previous: OpeningPayment, isPending: boolean, result: unknown): OpeningPayment {
  if (!previous.held) return isPending ? { held: true, result } : previous;
  return previous.result === result ? previous : { held: false, result };
}

/** True from the press until the action answers with a refusal; a page restored from the back button is let go. */
export function useOpeningPayment(isPending: boolean, result: unknown): boolean {
  const [opening, setOpening] = useState<OpeningPayment>({ held: false, result });
  const next = nextOpeningPayment(opening, isPending, result);
  if (next !== opening) setOpening(next);

  useEffect(() => {
    const release = (event: PageTransitionEvent): void => {
      if (event.persisted) setOpening((current) => ({ held: false, result: current.result }));
    };
    window.addEventListener("pageshow", release);
    return () => window.removeEventListener("pageshow", release);
  }, []);

  return isPending || next.held;
}
