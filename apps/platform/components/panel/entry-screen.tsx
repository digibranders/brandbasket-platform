import { getImageProps } from "next/image";
import type { ReactElement, ReactNode } from "react";
import { WordmarkLogo } from "@firstfold/shared/ui/logo";
import { siteConfig } from "@firstfold/shared/lib/site-config";
import { logoOf, supportEmailOf, type Brand } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { ENTRY_LEDE_SLOT_ID } from "@/lib/account-entry";
import entryPhoto from "./entry-photo.webp";
import entryPhotoPortrait from "./entry-photo-portrait.webp";

/**
 * The Sea Link at dusk, twice: the wide photo for the phone's short band, the tall one for the desktop's full-height
 * panel, each sized for its own box. A <picture> lets the browser fetch only the one it shows.
 */
function EntryPhoto(): ReactElement {
  const common = { alt: "", loading: "eager", fetchPriority: "high" } as const;
  const {
    props: { srcSet: tall },
  } = getImageProps({ ...common, src: entryPhotoPortrait, sizes: "46vw", quality: 80 });
  const {
    props: { srcSet: wide, ...rest },
  } = getImageProps({ ...common, src: entryPhoto, sizes: "100vw", quality: 75 });
  return (
    // Out of the panel's column, behind it: the logo and the line keep their places at the top and foot.
    <picture className="absolute inset-0 -z-10">
      <source media="(min-width: 1024px)" srcSet={tall} sizes="46vw" />
      {/* The art-directed photo Next documents: getImageProps gives the sources, so a plain img carries them. */}
      <img {...rest} srcSet={wide} alt="" className="size-full object-cover object-[65%_50%] lg:object-[50%_62%]" />
    </picture>
  );
}

/**
 * What a business owner is told on the Fynix sign-in: one plain line each, every one something the website really does.
 * No numbers or results are claimed.
 */
const FYNIX_POINTS = [
  { title: "Be found", line: "On Google Maps and in local search." },
  { title: "Be reached", line: "Click-to-call, WhatsApp and enquiry forms on every page." },
  { title: "Be trusted", line: "A fast, secure website that is hosted and kept up to date for you." },
] as const;

/**
 * The Fynix side of the account screens: a solid navy panel of type, no photograph. From 1024px it fills the left of
 * the screen with the headline, a line about the offer, the three points and the way to write to Fynix; on a phone it is
 * a band across the top with the logo and the headline, the form sheet drawn up over its edge.
 */
function FynixPanel({ brand }: { readonly brand: Brand }): ReactElement {
  return (
    <section
      aria-label={brand.name}
      className="relative flex flex-col bg-dark-surface px-6 pt-5 pb-12 text-white [&_:focus-visible]:outline-white lg:sticky lg:top-0 lg:h-dvh lg:px-14 lg:py-12"
    >
      <WordmarkLogo href={brand.siteUrl ?? siteConfig.url} tone="light" className="self-start" brand={logoOf(brand)} />
      <div className="mt-8 lg:mt-auto">
        <p className="font-serif text-[1.75rem] leading-[1.12] font-medium text-balance lg:text-[2.75rem] lg:leading-[1.1]">
          Your customers search before they call. <em className="block text-amber">Be the business they find.</em>
        </p>
        <p className="mt-4 hidden max-w-[38ch] text-base leading-relaxed text-white/70 lg:block">
          A professional website for your business, built free and looked after every month.
        </p>
      </div>
      <ol className="mt-8 hidden border-b border-white/15 lg:block">
        {FYNIX_POINTS.map((point, index) => (
          <li key={point.title} className="grid grid-cols-[2.25rem_1fr] gap-x-1 border-t border-white/15 py-3.5">
            <span aria-hidden="true" className="pt-0.5 text-sm text-amber tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-base leading-snug font-medium">{point.title}</p>
              <p className="mt-0.5 text-[0.9375rem] leading-normal text-white/65">{point.line}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 hidden justify-between gap-4 text-sm text-white/60 lg:flex">
        <span>For local businesses</span>
        <a href={`mailto:${supportEmailOf(brand)}`} className="underline-offset-4 hover:text-white hover:underline">
          {supportEmailOf(brand)}
        </a>
      </p>
    </section>
  );
}

/** What the brand promises, in the order the entry screen says it. */
const ENTRY_PROMISES = ["Get discovered.", "Get connected.", "Get business."] as const;

interface EntryScreenProps {
  readonly title: ReactNode;
  readonly lede: string;
  /** Above the title: the Sign in / Create account switch on the entry page. */
  readonly switcher?: ReactNode;
  readonly children: ReactNode;
}

/**
 * The account screens a business owner meets before the dashboard (sign in, create an account, forgot and reset
 * password, the setup link, confirming an email). The Sea Link at dusk, in a tall photo, sits beside the form from
 * 1024px; on a phone the wide photo is a band across the top with the form on a sheet drawn up over its edge. The
 * photo carries the logo, the way back to the website, one headline and the three promises in a row; the form side
 * carries everything else.
 */
export async function EntryScreen({ title, lede, switcher, children }: EntryScreenProps): Promise<ReactElement> {
  const brand = await requestBrand();
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[46fr_54fr]">
      {brand.id === "fynix" ? (
        <FynixPanel brand={brand} />
      ) : (
        <section
          aria-label={brand.name}
          className="relative isolate flex h-64 flex-col justify-between overflow-hidden bg-dusk px-6 pt-5 pb-12 text-white [&_:focus-visible]:outline-white lg:sticky lg:top-0 lg:h-dvh lg:px-14 lg:py-12"
        >
          <EntryPhoto />
          {/* Darker at the top for the logo and at the foot for the line; the middle keeps the photo's light. */}
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-b from-dusk/70 via-dusk/55 to-dusk/90 lg:from-dusk/60 lg:via-dusk/15 lg:to-dusk/85" />
          <WordmarkLogo href={brand.siteUrl ?? siteConfig.url} tone="light" className="self-start" brand={logoOf(brand)} />
          <div className="grid gap-3 lg:gap-5">
            <p className="font-serif text-[1.5rem] leading-[1.12] font-medium lg:text-[2.75rem]">
              Your business has already taken the first step. <em className="text-amber lg:block">Now take it online.</em>
            </p>
            {/* The three promises run across in one line, a dot between each. */}
            <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-medium whitespace-nowrap text-white/90 lg:text-[0.9375rem] lg:flex-nowrap">
              {ENTRY_PROMISES.map((promise, index) => (
                <li key={promise} className="flex items-center gap-2.5">
                  {index === 0 ? null : <span aria-hidden="true" className="size-1 rounded-full bg-amber" />}
                  {promise}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <main
        id="main"
        className="relative -mt-6 rounded-t-card bg-paper px-6 pt-7 pb-14 sm:px-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:rounded-none lg:px-12 lg:py-16"
      >
        <div className="mx-auto w-full max-w-[28rem]">
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
