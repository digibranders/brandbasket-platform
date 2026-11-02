import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { DARK_BUTTON, LIFT, SOFT_BUTTON } from "@/components/v2/classes";
import { askAboutHref } from "@/lib/website/tabs";

/** The live website's address in large type, with the two things to do with it: visit it, or ask for an update. */
export function LiveCard({ hostname }: { readonly hostname: string }): ReactElement {
  const href = safeExternalHref(`https://${hostname}`);
  return (
    <section aria-labelledby="live-title" className={cn(LIFT, "grid content-start gap-4 p-5 md:p-7")}>
      <h2 id="live-title" className="text-[0.9375rem] text-ink-2">
        Your website
      </h2>
      <p className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">{hostname}</p>
      <div className="flex flex-wrap gap-3">
        {href === null ? null : (
          <a href={href} target="_blank" rel="noopener noreferrer" className={DARK_BUTTON}>
            <ArrowSquareOut size={18} aria-hidden="true" />
            Visit your website
          </a>
        )}
        <Link href={askAboutHref("")} className={SOFT_BUTTON}>
          Request an update
        </Link>
      </div>
    </section>
  );
}
