import type { ReactElement, ReactNode } from "react";
import { WordmarkLogo } from "@fynix/shared/ui/logo";
import { adminBrand } from "@/lib/brand";
import { pathD } from "@/lib/journey-layout";

const CURVE = pathD(1000, 400);

interface QuietFrameProps {
  readonly title: ReactNode;
  readonly lede?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * The console's screens outside the dock: sign in, not found, something went wrong. Cream paper, the logo, and the
 * Journey's dotted path running faintly behind a single centred column.
 */
export function QuietFrame({ title, lede, children }: QuietFrameProps): ReactElement {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-paper px-5 py-5 sm:px-8 lg:px-12">
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 400"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 h-[26rem] w-full -translate-y-1/2"
      >
        <path
          d={CURVE}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="0.5 11"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <header>
        <WordmarkLogo href="/" brand={adminBrand().logo} />
      </header>
      <main id="main" className="grid flex-1 place-items-center py-12">
        <div className="w-full max-w-sm">
          <h1 className="heading-display text-center text-[clamp(2.5rem,7vw,3.5rem)] font-normal">{title}</h1>
          {lede === undefined ? null : <p className="mt-4 text-center leading-relaxed text-ink-soft">{lede}</p>}
          {children === undefined ? null : <div className="mt-10 rounded-[1.75rem] bg-paper/85 p-1 backdrop-blur-sm">{children}</div>}
        </div>
      </main>
    </div>
  );
}
