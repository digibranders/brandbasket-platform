"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { CrownIcon, HeartIcon, TickIcon } from "@fynix/shared/ui/icons";
import { Button } from "@fynix/shared/ui/panel/button";
import { useBrand } from "@/components/panel/brand-provider";
import { firePoppers } from "@/components/panel/fire-poppers";
import { wantsWelcome, withoutWelcome } from "@/lib/celebration";
import type { MembershipTier } from "@/lib/membership";

interface PaymentCelebrationProps {
  readonly tier: MembershipTier;
}

/** What each plan holds, in the order the sign-up page lists it: the list the pop-up ticks off. */
const HOLDS: Readonly<Record<MembershipTier, readonly string[]>> = {
  care: ["Free listing", "Website", "Hosting and upkeep", "OyeChats chatbot"],
  premium: ["Free listing", "Website", "Hosting and upkeep", "OyeChats chatbot", "Appointments", "Social media and ads"],
};

/** What a plan holds under a brand: without "Free listing" where the brand does not sell the listing. */
function holdsFor(tier: MembershipTier, showsListing: boolean): readonly string[] {
  return showsListing ? HOLDS[tier] : HOLDS[tier].filter((item) => item !== "Free listing");
}

/**
 * The sheet unfolds in two folds from the top, the headline first and then what the plan holds, each item ticked in
 * turn. Switched off for anyone who asked their device for less motion: everything is simply there.
 */
const KEYFRAMES = `
@keyframes fy-unfold { from { transform: rotateX(-92deg); opacity: 0; } to { transform: rotateX(0); opacity: 1; } }
@keyframes fy-pop { from { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .fy-anim { animation: none !important; opacity: 1 !important; transform: none !important; } }
`;

const EASE = "cubic-bezier(0.22,1,0.36,1)";

function subscribeToNothing(): () => void {
  // Only "are we in the browser yet" is read, and that never changes once it is true.
  return () => undefined;
}

/**
 * What the dashboard does the moment a payment has opened the plan: party poppers, and a short welcome to the brand
 * that lists what the plan holds. It shows while the address carries `welcome=1` (lib/celebration.ts), which the
 * payment's landing adds; closing it takes that off the address, so a refresh, a shared link or the back button
 * after that never replays it. Read from the live address, not once: a payment lands here by a client-side redirect,
 * when the address is not yet the new one at first render.
 */
export function PaymentCelebration({ tier }: PaymentCelebrationProps): ReactElement | null {
  const brand = useBrand();
  const showsListing = brand.showsListing;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const open = wantsWelcome(search);
  // False on the server and in the first browser render, so the two agree; true after, when the portal may be drawn.
  const inBrowser = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);

  const close = useCallback((): void => {
    router.replace(`${pathname}${withoutWelcome(search)}`, { scroll: false });
  }, [router, pathname, search]);

  // What is on screen: the address asks for it, and the browser is here to draw it into the page's body. The poppers
  // must start on this, not on `open` alone: the canvas does not exist until the portal has been drawn, a render after
  // the address first says so, so an effect that fired on `open` alone would find no canvas and quietly draw nothing.
  const visible = open && inBrowser;

  useEffect(() => {
    if (!visible) return;
    dialog.current?.focus();
    const stop = canvas.current === null ? () => undefined : firePoppers(canvas.current);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      stop();
      document.removeEventListener("keydown", onKey);
    };
  }, [visible, close]);

  if (!visible) return null;
  const holds = holdsFor(tier, showsListing);
  // Drawn into the page's own body, not where it is mounted: the dashboard's working panel clips what it holds to itself,
  // which would leave the sidebar outside the dimming and the blur.
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <style>{KEYFRAMES}</style>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-[#15110f]/60 backdrop-blur-sm"
      />
      <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-y-auto p-5">
        <div
          ref={dialog}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-celebration-title"
          className="pointer-events-auto relative my-auto w-full max-w-md overflow-hidden rounded-shell bg-paper shadow-[0_30px_80px_-30px_rgba(42,13,16,0.55)] outline-none [perspective:900px]"
        >
          <div
            className="fy-anim bg-dark-surface px-8 py-8 text-center text-paper"
            style={{ animation: `fy-unfold 0.7s ${EASE} both`, transformOrigin: "top" }}
          >
            {tier === "premium" ? <CrownIcon className="mx-auto size-8 fill-gold/40 text-gold" /> : <HeartIcon className="mx-auto size-8 text-paper" />}
            <h2 id="payment-celebration-title" className="heading-display mt-3 text-4xl [&_em]:text-amber">
              Welcome to <em>{brand.shortName}.</em>
            </h2>
          </div>
          <div className="fy-anim px-8 py-6" style={{ animation: `fy-unfold 0.7s ${EASE} both`, animationDelay: "0.35s", transformOrigin: "top" }}>
            <p className="text-sm text-ink-soft">Now yours</p>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {holds.map((item, index) => (
                <li key={item} className="flex items-center gap-4 py-3">
                  <span
                    className="fy-anim grid size-7 shrink-0 place-items-center rounded-full bg-success text-paper"
                    style={{ animation: `fy-pop 0.5s ${EASE} both`, animationDelay: `${String(0.8 + index * 0.25)}s` }}
                  >
                    <TickIcon className="size-4" />
                  </span>
                  <span className="text-[0.9375rem] font-medium">{item}</span>
                </li>
              ))}
            </ul>
            <Button type="button" onClick={close} className="mt-6 w-full">
              Let’s go
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
