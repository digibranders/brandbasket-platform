import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { DARK_BUTTON } from "@/components/v2/classes";

export interface HomeAttentionItem {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly href: string;
}

/** A line that ends like a sentence, whatever the source wrote. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * Does BrandBasket need anything from the customer? One card either way: the single thing that is needed, most blocking
 * first (never a list, never a count), or the calm line saying nothing is. Only real asks arrive here.
 */
export function Attention({ items }: { readonly items: readonly HomeAttentionItem[] }): ReactElement {
  const [first, ...rest] = items;
  if (first === undefined) {
    return (
      <section aria-label="What we need from you" className="flex items-center gap-4 rounded-lift bg-surface px-5 py-4 shadow-lift">
        <CheckCircle size={28} weight="fill" aria-hidden="true" className="shrink-0 text-ok" />
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Nothing needed from you right now</h2>
          <p className="text-[0.9375rem] text-ink-2">If that changes, it shows here and we email you.</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="What we need from you" className="flex flex-wrap items-center gap-4 rounded-lift border border-rattan/40 bg-rattan-wash px-5 py-4">
      <WarningCircle size={28} weight="fill" aria-hidden="true" className="shrink-0 text-rattan-ink" />
      <div className="min-w-[14rem] flex-1">
        <h2 className="font-display text-base font-semibold text-ink">We need one thing from you</h2>
        <p className="text-[0.9375rem] text-ink-2">
          {sentence(first.label)} {sentence(first.hint)}
          {rest.length === 0 ? "" : ` ${rest.length === 1 ? "One more is" : `${rest.length} more are`} waiting after it.`}
        </p>
      </div>
      <Link href={first.href} className={DARK_BUTTON}>
        Open it
      </Link>
    </section>
  );
}
