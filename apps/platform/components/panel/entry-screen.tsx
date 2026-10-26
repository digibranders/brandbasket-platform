import type { ReactElement, ReactNode } from "react";
import { WordmarkLogo } from "@brandbasket/shared/ui/logo";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { logoOf, type Brand } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { ENTRY_LEDE_SLOT_ID } from "@/lib/account-entry";
import styles from "./entry-panel.module.css";

/** The launch path from the Home page, in an owner's words: what happens after sign-up, ending with the website live. */
const LAUNCH_STEPS = [
  "Sign up.",
  "Book your call.",
  "Send your details.",
  "We build your website.",
  "You review it.",
  "It goes live.",
] as const;

/**
 * The navy side of the account screens from 1024px, on the dashboard's own frame where the sidebar will sit: the logo,
 * the launch path filling down once over a basket weave (entry-panel.module.css), and the website's address. Everything
 * but the logo is decoration and hidden from screen readers; the logo stays a link back to the website. Phones do not
 * get the panel.
 */
function LaunchPathPanel({ brand }: { readonly brand: Brand }): ReactElement {
  return (
    <div
      data-surface="dark"
      className="relative isolate hidden overflow-hidden text-white lg:flex lg:flex-col lg:pt-8 lg:pr-14 lg:pb-10 lg:pl-9"
    >
      <div aria-hidden="true" className={styles.art}>
        <div className={styles.weave} />
      </div>
      <WordmarkLogo href={brand.siteUrl ?? siteConfig.url} tone="light" className="self-start" brand={logoOf(brand)} />
      <div aria-hidden="true" className="my-auto py-[clamp(0.5rem,3vh,2rem)]">
        <ol className={`${styles.path} grid gap-[clamp(0.75rem,2.4vh,1.375rem)]`}>
          {LAUNCH_STEPS.map((step, index) => (
            <li
              key={step}
              className={`${styles.step} grid grid-cols-[2.75rem_1fr] items-center gap-[1.375rem] text-[clamp(1.5rem,min(3vw,5vh),2.75rem)] leading-[1.1] font-medium tracking-[-0.03em]`}
            >
              <span
                className={`${styles.mark} relative z-10 grid size-11 place-items-center rounded-full border-2 border-current text-[0.9375rem] font-semibold tracking-normal tabular-nums`}
              >
                <span>{index + 1}</span>
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-[clamp(1rem,3.5vh,2.25rem)] ml-[4.125rem] text-lg leading-relaxed text-white/70">Then we look after it, every month.</p>
      </div>
      <p aria-hidden="true" className="text-sm text-white/60">
        {new URL(brand.siteUrl).host}
      </p>
    </div>
  );
}

interface EntryScreenProps {
  readonly title: ReactNode;
  readonly lede: string;
  /** Above the title: the Sign in / Create account switch on the entry page. */
  readonly switcher?: ReactNode;
  readonly children: ReactNode;
}

/**
 * The account screens a business owner meets before the dashboard (sign in, create an account, forgot and reset
 * password, the setup link, confirming an email, restoring an account). From 1024px they sit in the dashboard's own
 * frame, one screen tall: the navy launch-path panel on the left, the form on the inset paper panel on the right. The
 * page never scrolls; a long form scrolls inside the paper panel. On a phone there is no panel and the page scrolls as
 * usual, with the logo above the form.
 */
export async function EntryScreen({ title, lede, switcher, children }: EntryScreenProps): Promise<ReactElement> {
  const brand = await requestBrand();
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:h-dvh lg:grid-cols-2 lg:grid-rows-1 lg:overflow-hidden lg:bg-dark-surface">
      <LaunchPathPanel brand={brand} />

      <main
        id="main"
        className="bg-paper px-6 pt-7 pb-14 sm:px-10 lg:m-3 lg:ml-0 lg:flex lg:overflow-y-auto lg:overscroll-contain lg:rounded-shell lg:px-12 lg:py-16"
      >
        <div className="mx-auto w-full max-w-[28rem] lg:my-auto">
          <WordmarkLogo href={brand.siteUrl ?? siteConfig.url} className="mb-8 lg:hidden" brand={logoOf(brand)} />
          {switcher}
          <h1 className="heading-display text-[1.75rem] leading-none sm:text-[2.25rem] lg:text-[3.25rem]">{title}</h1>
          <div className="mt-2 flex items-baseline justify-between gap-4 sm:mt-3">
            <p className="flex-1 text-sm leading-relaxed text-ink-soft sm:text-base lg:text-lg">{lede}</p>
            {/* Filled by a form that has a control for this line (lib/account-entry.ts ENTRY_LEDE_SLOT_ID). */}
            <span id={ENTRY_LEDE_SLOT_ID} className="shrink-0 empty:hidden" />
          </div>
          {/* The form sits straight on the page background: no card around it. */}
          <div className="mt-6 lg:mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
