import { netOfGstCents } from "./billing/net-of-gst";

/** What the ad results table says of a campaign word that was not in the address. */
const NONE = "(none)";

export interface AdKey {
  readonly source: string;
  readonly medium: string;
  readonly campaign: string;
  readonly content: string;
}

/** One row of the ad results (plan 59): how many people the ads brought to each step, and the money from those who paid. */
export interface AdFunnelRow extends AdKey {
  /** People who left their details on the ad landing page. */
  readonly leads: number;
  /** Accounts opened by someone who came from the ad. */
  readonly accounts: number;
  /** Of those accounts, how many made their first payment. */
  readonly paid: number;
  /** The first payments' money without GST, in paise and in cents; the two currencies are never added together. */
  readonly revenueInrCents: number;
  readonly revenueUsdCents: number;
}

const word = (value: string | null | undefined): string => {
  const text = value?.trim().toLowerCase();
  return text ? text : NONE;
};

const keyOf = (key: AdKey): string => [key.source, key.medium, key.campaign, key.content].join("\u0000");

/**
 * The campaign words on a lead the ad landing page sent to the console (`startMessage` in brandbasket-website/lib/platform-leads.ts:
 * "Ad landing page. Going to payment. utm_source=meta, utm_campaign=diwali"), lower case. Null for a lead that did not come from that page.
 */
export function parseAdsMessage(message: string | null): AdKey | null {
  if (message === null || !message.startsWith("Ad landing page")) return null;
  const read = (name: string): string => word(new RegExp(`(?:^|[ ,])${name}=([^,]*)`).exec(message)?.[1]);
  return { source: read("utm_source"), medium: read("utm_medium"), campaign: read("utm_campaign"), content: read("utm_content") };
}

export interface AdFunnelInput {
  readonly leads: readonly { readonly message: string | null }[];
  readonly accounts: readonly { readonly businessId: string; readonly utmSource: string | null; readonly utmMedium: string | null; readonly utmCampaign: string | null; readonly utmContent: string | null }[];
  /** Each business's first payment. A business listed twice counts once, by its first entry. */
  readonly firstPayments: readonly { readonly businessId: string; readonly currency: "INR" | "USD"; readonly amountCents: number; readonly gstCents: number | null }[];
}

/** The ad results (plan 59): one row per source, medium, campaign and content, the best first. Pure. */
export function buildAdFunnel(input: AdFunnelInput): AdFunnelRow[] {
  const rows = new Map<string, { key: AdKey; leads: number; accounts: number; paid: number; revenueInrCents: number; revenueUsdCents: number }>();
  const row = (key: AdKey) => {
    const id = keyOf(key);
    let found = rows.get(id);
    if (found === undefined) {
      found = { key, leads: 0, accounts: 0, paid: 0, revenueInrCents: 0, revenueUsdCents: 0 };
      rows.set(id, found);
    }
    return found;
  };

  for (const lead of input.leads) {
    const key = parseAdsMessage(lead.message);
    if (key !== null) row(key).leads += 1;
  }

  const firstPayment = new Map<string, AdFunnelInput["firstPayments"][number]>();
  for (const payment of input.firstPayments) if (!firstPayment.has(payment.businessId)) firstPayment.set(payment.businessId, payment);

  for (const account of input.accounts) {
    const target = row({ source: word(account.utmSource), medium: word(account.utmMedium), campaign: word(account.utmCampaign), content: word(account.utmContent) });
    target.accounts += 1;
    const payment = firstPayment.get(account.businessId);
    if (payment === undefined) continue;
    target.paid += 1;
    const net = netOfGstCents(payment);
    if (payment.currency === "INR") target.revenueInrCents += net;
    else target.revenueUsdCents += net;
  }

  return [...rows.values()]
    .map(({ key, ...counts }) => ({ ...key, ...counts }))
    .sort((a, b) => b.paid - a.paid || b.accounts - a.accounts || b.leads - a.leads || keyOf(a).localeCompare(keyOf(b)));
}
