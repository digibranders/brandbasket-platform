"use client";

import { ArrowRight, Check, Sparkle, X } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type CSSProperties, type ReactElement } from "react";
import { useDialogOpen } from "@brandbasket/shared/ui/v2/dialog-hooks";
import { useBrand } from "@/components/panel/brand-provider";
import { DARK_BUTTON, LIFT, SERVICE_DOT } from "@/components/v2/classes";
import { firePoppers } from "./fire-poppers";
import { wantsWelcome, withoutWelcome } from "@/lib/celebration";
import { SERVICE_NAMES, type ServiceKey } from "@/lib/first-look";
import styles from "./payment-welcome.module.css";

interface PaymentWelcomeProps {
  /** The services this confirmed payment opened, in Overview order. */
  readonly services: readonly ServiceKey[];
}

/** A single cached illustration is split across two layers so its lid can open independently. */
function WelcomeGift(): ReactElement {
  return (
    <div aria-hidden="true" className={styles.artwork}>
      <span className={styles.streamer} />
      <span className={`${styles.streamer} ${styles.streamerRight}`} />
      <Sparkle className={styles.sparkle} size={24} weight="fill" />
      <Sparkle className={`${styles.sparkle} ${styles.sparkleSmall}`} size={14} weight="fill" />
      <div className={styles.giftBase}>
        <Image src="/illustrations/welcome-gift.png" alt="" width={1536} height={1024} sizes="360px" loading="eager" />
      </div>
      <div className={styles.giftLid}>
        <Image src="/illustrations/welcome-gift.png" alt="" width={1536} height={1024} sizes="360px" loading="eager" />
      </div>
    </div>
  );
}

/** The existing confirmed-payment landing opens this native dialog; dismissing it consumes the welcome parameter. */
export function PaymentWelcome({ services }: PaymentWelcomeProps): ReactElement {
  const brand = useBrand();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const open = wantsWelcome(search);
  const dialog = useDialogOpen(open);
  const canvas = useRef<HTMLCanvasElement>(null);

  const dismiss = (): void => { dialog.current?.close(); };

  useEffect(() => {
    if (!open || canvas.current === null) return;
    const stop = firePoppers(canvas.current);
    // Stop drawing on native close immediately, before the URL transition completes.
    const element = dialog.current;
    element?.addEventListener("close", stop);
    return () => {
      stop();
      element?.removeEventListener("close", stop);
    };
  }, [open, dialog]);

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
          <div className={styles.card}>
            <button type="button" onClick={dismiss} aria-label="Close welcome" className={styles.close}>
              <X size={20} aria-hidden="true" />
            </button>
            <div className={styles.body}>
              <WelcomeGift />
              <div className={styles.introduction}>
                <p id="payment-welcome-confirmation" className="flex items-center justify-center gap-2 text-[0.9375rem] font-medium text-ok">
                  <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-ok text-white">
                    <Check size={13} weight="bold" />
                  </span>
                  Payment successful
                </p>
                <h2 id="payment-welcome-title" className={`${styles.title} mt-3 font-display font-semibold`}>
                  Welcome to <span className="block">{brand.shortName}.</span>
                </h2>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2 sm:text-base">Your next chapter starts here.</p>
              </div>
              {services.length > 0 ? (
                <section aria-labelledby="payment-welcome-services" className="mt-7">
                  <h3 id="payment-welcome-services" className="text-[0.9375rem] font-semibold">Now yours</h3>
                  <ul className="mt-2 divide-y divide-line">
                    {services.map((service, index) => (
                      <li key={service} className={`${styles.service} flex items-center gap-3 py-3.5`} style={{ "--reveal-delay": `${String(750 + index * 130)}ms` } as CSSProperties}>
                        <span aria-hidden="true" className={`size-2 shrink-0 rounded-xs ${SERVICE_DOT[service]}`} />
                        <span className="min-w-0 flex-1 text-[0.9375rem] font-medium">{SERVICE_NAMES[service]}</span>
                        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-ok-wash text-ok">
                          <Check size={13} weight="bold" />
                        </span>
                      </li>
                    ))}
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
