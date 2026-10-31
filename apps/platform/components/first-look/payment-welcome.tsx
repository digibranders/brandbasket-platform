"use client";

import { ArrowRight, Browser, Check, MapPin, Megaphone, X } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type CSSProperties, type ReactElement, type RefObject } from "react";
import { useDialogOpen } from "@brandbasket/shared/ui/v2/dialog-hooks";
import { useBrand } from "@/components/panel/brand-provider";
import { DARK_BUTTON, LIFT } from "@/components/v2/classes";
import { firePoppers } from "./fire-poppers";
import { wantsWelcome, withoutWelcome } from "@/lib/celebration";
import { pushPurchase, type PurchaseEvent } from "@/lib/purchase-event";
import { SERVICE_NAMES, type ServiceKey } from "@/lib/first-look";
import styles from "./payment-welcome.module.css";

interface PaymentWelcomeProps {
  /** The services this confirmed payment opened, in Overview order. */
  readonly services: readonly ServiceKey[];
  /** The first payment, for Tag Manager (plan 59); null when it cannot be told. Reported when the welcome opens, once per payment. */
  readonly purchase?: PurchaseEvent | null;
}

const SERVICE_ICONS = { website: Browser, social: Megaphone, search: MapPin } as const;

/** Paper outside the card keeps the settled composition as celebratory as the approved concept. */
const BACKDROP_PAPER = [
  [12, 17, -28], [24, 9, -16], [8, 47, 32], [19, 64, -32], [27, 83, 16],
  [77, 12, 28], [88, 29, -35], [81, 48, 18], [92, 65, -18], [77, 82, 32],
  [15, 34, 45], [85, 92, -25], [6, 76, -32], [94, 18, 36],
] as const;

/** The illustration follows the approved concept; the upper and lower layers reveal independently. */
function WelcomeGift({ artwork }: { readonly artwork: RefObject<HTMLDivElement | null> }): ReactElement {
  return (
    <div ref={artwork} aria-hidden="true" className={styles.artwork}>
      <div className={styles.giftBase}>
        <Image src="/illustrations/welcome-celebration.png" alt="" width={1536} height={1024} sizes="(max-width: 640px) 110vw, 520px" loading="eager" />
      </div>
      <div className={styles.giftLid}>
        <Image src="/illustrations/welcome-celebration.png" alt="" width={1536} height={1024} sizes="(max-width: 640px) 110vw, 520px" loading="eager" />
      </div>
    </div>
  );
}

/** The existing confirmed-payment landing opens this native dialog; dismissing it consumes the welcome parameter. */
export function PaymentWelcome({ services, purchase = null }: PaymentWelcomeProps): ReactElement {
  const brand = useBrand();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const open = wantsWelcome(search);
  const dialog = useDialogOpen(open);
  const canvas = useRef<HTMLCanvasElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const artwork = useRef<HTMLDivElement>(null);

  const dismiss = (): void => { dialog.current?.close(); };

  useEffect(() => {
    if (!open || canvas.current === null) return;
    title.current?.focus({ preventScroll: true });
    const stop = firePoppers(canvas.current);
    // Stop drawing on native close immediately, before the URL transition completes.
    const element = dialog.current;
    element?.addEventListener("close", stop);
    return () => {
      stop();
      element?.removeEventListener("close", stop);
    };
  }, [open, dialog]);

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
      aria-describedby="payment-welcome-confirmation"
      onClose={() => {
        if (open) router.replace(`${pathname}${withoutWelcome(search)}`, { scroll: false });
      }}
      className={`${LIFT} ${styles.dialog} text-ink backdrop:bg-ink/50`}
    >
      {open ? (
        <>
          <canvas ref={canvas} aria-hidden="true" className={styles.confetti} />
          <div aria-hidden="true" className={styles.paperScene}>
            {BACKDROP_PAPER.map(([left, top, rotation], index) => (
              <span key={index} className={styles.paper} style={{ left: `${String(left)}%`, top: `${String(top)}%`, rotate: `${String(rotation)}deg` }} />
            ))}
          </div>
          <div className={styles.card}>
            <button type="button" onClick={dismiss} aria-label="Close welcome" className={styles.close}>
              <X size={20} aria-hidden="true" />
            </button>
            <WelcomeGift artwork={artwork} />
            <div className={styles.body} onScroll={(event) => {
              // Let the overflowing illustration travel with its content instead of covering rows on short screens.
              artwork.current?.style.setProperty("--body-scroll", `${String(event.currentTarget.scrollTop)}px`);
            }}>
              <div className={styles.introduction}>
                <p id="payment-welcome-confirmation" className="flex items-center justify-center gap-2 text-[0.9375rem] font-semibold text-ok">
                  <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-ok text-white">
                    <Check size={13} weight="bold" />
                  </span>
                  Payment successful
                </p>
                <h2 ref={title} tabIndex={-1} id="payment-welcome-title" className={`${styles.title} font-display`}>
                  Welcome to <span className="block">{brand.shortName}.</span>
                </h2>
                <p className={`${styles.subtitle} text-ink-2`}>Your next chapter starts here.</p>
              </div>
              {services.length > 0 ? (
                <section aria-labelledby="payment-welcome-services" className={styles.services}>
                  <h3 id="payment-welcome-services" className="text-lg font-semibold">Now yours</h3>
                  <ul className="mt-2 divide-y divide-line">
                    {services.map((service, index) => {
                      const ServiceIcon = SERVICE_ICONS[service];
                      return (
                        <li key={service} className={`${styles.service} flex items-center gap-4`} style={{ "--reveal-delay": `${String(750 + index * 130)}ms` } as CSSProperties}>
                          <span aria-hidden="true" className={styles.serviceIcon}><ServiceIcon size={24} /></span>
                          <span className="min-w-0 flex-1 text-[0.9375rem] font-medium">{SERVICE_NAMES[service]}</span>
                          <span aria-hidden="true" className="grid size-[1.125rem] shrink-0 place-items-center rounded-full bg-ok text-white">
                            <Check size={12} weight="bold" />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
            <div className={styles.footer}>
              <button type="button" onClick={dismiss} className={`${DARK_BUTTON} h-12! w-full hover:bg-ink-raised`}>
                Let’s go <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
