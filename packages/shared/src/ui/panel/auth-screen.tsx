import type { ReactElement, ReactNode } from "react";
import { ContourField } from "@fynix/shared/ui/contour-field";
import { WordmarkLogo, type BrandLogo } from "@fynix/shared/ui/logo";
import { siteConfig } from "../../lib/site-config";

interface AuthScreenProps {
  readonly title: ReactNode;
  readonly lede: string;
  /** The logo to draw. */
  readonly brand: BrandLogo;
  readonly children: ReactNode;
}

/** Full-page shell for an unauthenticated screen (sign in, etc.), shared by every panel surface. */
export function AuthScreen({ title, lede, brand, children }: AuthScreenProps): ReactElement {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-5 py-5 sm:px-8 sm:py-6">
      {/* Just a few contour arcs reaching in from opposite corners: enough to place the page, not to fill it. */}
      <ContourField seed={11} rings={6} className="absolute -left-80 -top-80 -z-10 size-[48rem] text-accent/10" />
      <ContourField
        seed={29}
        rings={6}
        className="absolute -bottom-80 -right-80 -z-10 size-[48rem] text-accent/10"
      />

      <header className="flex items-center gap-4">
        {/* The logo doubles as the way back to the marketing site. */}
        <WordmarkLogo href={brand.siteUrl ?? siteConfig.url} brand={brand} />
      </header>

      <main id="main" className="grid flex-1 place-items-center py-12">
        <div className="w-full max-w-md text-center">
          <h1 className="heading-display text-[clamp(2.5rem,7vw,3.5rem)]">{title}</h1>
          <p className="mx-auto mt-4 max-w-sm text-lg leading-relaxed text-ink-soft">{lede}</p>
          {/* The form sits straight on the page background: no card around it. */}
          <div className="mt-10 text-left">{children}</div>
        </div>
      </main>
    </div>
  );
}
