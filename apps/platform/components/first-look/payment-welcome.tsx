"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactElement } from "react";
import { useDialogOpen } from "@brandbasket/shared/ui/v2/dialog-hooks";
import { useBrand } from "@/components/panel/brand-provider";
import { DARK_BUTTON, LIFT } from "@/components/v2/classes";
import { firePoppers } from "@/components/first-look/fire-poppers";
import { wantsWelcome, withoutWelcome } from "@/lib/celebration";
import { pushPurchase, type PurchaseEvent } from "@/lib/purchase-event";
import { SERVICE_NAMES, type ServiceKey } from "@/lib/first-look";

interface PaymentWelcomeProps {
  /** The services the payment opened, in the order Overview names them. */
  readonly services: readonly ServiceKey[];
  /** The first payment, for Tag Manager (plan 59); null when it cannot be told. Reported when the welcome opens, once per payment. */
  readonly purchase?: PurchaseEvent | null;
}

/**
 * The card lifts in and each service is ticked in turn. The motion is on the card's contents, not on the dialog, so the
 * poppers' canvas stays fixed to the screen. Anyone who asked their device for less motion gets everything at once.
 */
const KEYFRAMES = `
@keyframes bb-lift { from { transform: translateY(10px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes bb-tick { from { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .bb-anim { animation: none !important; opacity: 1 !important; transform: none !important; } }
`;

const EASE = "cubic-bezier(0.22,1,0.36,1)";

/**
 * What Overview does the moment a payment has opened the plan: party poppers, and a short welcome that lists the services the
 * payment opened. It shows while the address carries `welcome=1` (lib/celebration.ts), which the payment's landing adds;
 * closing it takes that off the address, so a refresh, a shared link or the back button never replays it. Read from the
 * live address, not once: a payment lands here by a client-side redirect, when the address is not yet the new one at first render.
 * A native dialog keeps focus inside while open and gives it back on close.
 */
export function PaymentWelcome({ services, purchase = null }: PaymentWelcomeProps): ReactElement {
  const brand = useBrand();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const open = wantsWelcome(search);
  const dialog = useDialogOpen(open);
  const canvas = useRef<HTMLCanvasElement>(null);

  const close = (): void => router.replace(`${pathname}${withoutWelcome(search)}`, { scroll: false });

  useEffect(() => {
    if (!open || canvas.current === null) return;
    return firePoppers(canvas.current);
  }, [open]);

  useEffect(() => {
    if (!open || purchase === null) return;
    let notes: Storage | null = null;
    try {
      notes = window.localStorage;
    } catch {
      // Storage blocked: pushPurchase carries on without its note.
    }
    pushPurchase(window.dataLayer, notes, purchase);
  }, [open, purchase]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="payment-welcome-title"
      // Escape closes the native dialog; the address then loses its parameter. A close this component asked for finds it already gone.
      onClose={() => {
        if (open) close();
      }}
      className={`${LIFT} m-auto w-[calc(100%-2.5rem)] max-w-md overflow-visible p-0 text-ink backdrop:bg-ink/50 backdrop:backdrop-blur-sm`}
    >
      <style>{KEYFRAMES}</style>
      <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 size-full" />
      <div className="bb-anim p-8" style={{ animation: `bb-lift 0.5s ${EASE} both` }}>
        <h2 id="payment-welcome-title" className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">
          Welcome to {brand.shortName}.
        </h2>
        {services.length === 0 ? null : (
          <>
            <p className="mt-6 text-sm text-ink-2">Now yours</p>
            <ul className="mt-2 divide-y divide-line">
              {services.map((service, index) => (
                <li key={service} className="flex items-center gap-3 py-3">
                  <span
                    aria-hidden="true"
                    className="bb-anim grid size-6 shrink-0 place-items-center rounded-full bg-sage text-white"
                    style={{ animation: `bb-tick 0.5s ${EASE} both`, animationDelay: `${String(0.45 + index * 0.2)}s` }}
                  >
                    <Check size={13} weight="fill" />
                  </span>
                  <span className="text-[0.9375rem] font-medium">{SERVICE_NAMES[service]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" onClick={close} className={`${DARK_BUTTON} mt-6 w-full`}>
          Let’s go
        </button>
      </div>
    </dialog>
  );
}
