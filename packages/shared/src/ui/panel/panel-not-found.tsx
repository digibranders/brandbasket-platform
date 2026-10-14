import Link from "next/link";
import type { ReactElement } from "react";
import { WordmarkLogo, type BrandLogo } from "@fynix/shared/ui/logo";

interface PanelNotFoundProps {
  /** The logo to draw. */
  readonly brand: BrandLogo;
}

export function PanelNotFound({ brand }: PanelNotFoundProps): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col px-5 py-5 sm:px-8 sm:py-6">
      <header>
        <WordmarkLogo href="/" brand={brand} />
      </header>
      <main id="main" className="grid flex-1 place-items-center py-12 text-center">
        <div className="max-w-md">
          <h1 className="heading-display text-[clamp(2.5rem,7vw,3.5rem)]">
            Nothing <em>here.</em>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            That page doesn’t exist. It may have moved, or the link might have a typo.
          </p>
          <Link href="/" className="link-underline mt-8 inline-block">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
