import Link from "next/link";
import type { ReactElement } from "react";
import { PageSection } from "@/components/v2/page";
import { SOFT_BUTTON } from "@/components/v2/classes";
import type { AddressCardView } from "@/lib/website/address";

/** The web address, shown only when it needs a step from the customer or the site is live on its own domain. */
export function AddressCard({ view }: { readonly view: AddressCardView }): ReactElement {
  return (
    <PageSection id="address" title="Web address">
      <div className="grid justify-items-start gap-2">
        <p className="font-semibold text-ink">{view.hostname}</p>
        <span className="w-fit rounded-md bg-sunken px-2 py-0.5 text-xs font-semibold text-ink">{view.chip}</span>
        {view.line === null ? null : <p className="text-[0.8125rem] leading-relaxed text-ink-2">{view.line}</p>}
        {view.showHow ? (
          <Link href="/domain" className={SOFT_BUTTON}>
            Show me how
          </Link>
        ) : null}
      </div>
    </PageSection>
  );
}
