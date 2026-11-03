import type { BillingCurrency } from "@brandbasket/db";
import { PageHeader, PanelData } from "@/components";
import { formatMoney } from "@/lib/format";
import type { Loaded } from "@/lib/loaded";
import { LinkButton } from "@/ui";
import type { WebsiteOffer } from "../rules/not-bought";
import { ADD_WEBSITE_HREF } from "../rules/paths";

/** The price line: the shared package price, GST said once for rupees and never beside dollars. */
function priceLine(offer: WebsiteOffer, currency: BillingCurrency): string {
  const price = `${formatMoney(offer.netCents, currency)} ${offer.unit}`;
  const discount = offer.offerCents > 0 ? " with your package discount" : "";
  return currency === "INR" ? `${price}${discount}, including GST.` : `${price}${discount}.`;
}

/** Website for a business without the Managed Website (plan 61, Service not bought): what it does, what it costs, Add to plan. No preview of a dashboard. */
export function NotBoughtScreen({ offer, currency, canAdd }: { readonly offer: Loaded<WebsiteOffer>; readonly currency: BillingCurrency; readonly canAdd: boolean }) {
  return (
    <>
      <PageHeader title="Website" />
      <PanelData data={offer} title="Managed Website" what="the price of the Managed Website">
        {(data) => (
          <div className="flex max-w-reading flex-col gap-3">
            <p className="type-body text-ink">Before they visit you, they visit your website. We build yours and keep it running, every month.</p>
            <p className="type-body text-ink-3">{data.included}</p>
            <p className="type-sub text-ink">{priceLine(data, currency)}</p>
            {canAdd ? (
              <div>
                <LinkButton href={ADD_WEBSITE_HREF} variant="primary" icon="Plus">
                  Add to plan
                </LinkButton>
              </div>
            ) : null}
          </div>
        )}
      </PanelData>
    </>
  );
}
