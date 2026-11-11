import type { ReactElement } from "react";
import { PageSection } from "@/components/v2/page";
import type { AdsPanel } from "@/lib/social/ads";

const FIGURE = "font-figure font-semibold tabular-nums text-ink";

/** The month's ad figures in plain numbers: each row is left out when its figure is not known. */
export function AdsSection({ ads, month }: { readonly ads: AdsPanel; readonly month: string }): ReactElement {
  return (
    <PageSection id="ads" title={`Ads in ${month}`}>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-3 text-[0.84375rem]">
        {ads.spent === null ? null : (
          <>
            <dt className="text-ink-2">Spent</dt>
            <dd className={FIGURE}>{ads.spent}</dd>
            {ads.percent === null ? null : (
              <dd aria-hidden="true" className="col-span-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                <span className="block h-full rounded-full bg-ink" style={{ width: `${ads.percent}%` }} />
              </dd>
            )}
          </>
        )}
        {ads.enquiries === null ? null : (
          <>
            <dt className="text-ink-2">Enquiries from ads</dt>
            <dd className={FIGURE}>{ads.enquiries}</dd>
          </>
        )}
        {ads.adMoney === null ? null : (
          <>
            <dt className="text-ink-2">Ad money added by us</dt>
            <dd className={FIGURE}>{ads.adMoney}</dd>
          </>
        )}
      </dl>
    </PageSection>
  );
}
