import type { MoneyCurrency } from "../money";

/** The two kinds of website a build can be (owner, 2026-11-27). The kind sets the build fee and the website's monthly price. */
export const WEBSITE_KINDS = ["b2b", "ecommerce"] as const;
export type WebsiteKind = (typeof WEBSITE_KINDS)[number];

export const WEBSITE_KIND_LABELS: Readonly<Record<WebsiteKind, string>> = { b2b: "B2B website", ecommerce: "Ecommerce store" };

export function isWebsiteKind(value: string): value is WebsiteKind {
  return (WEBSITE_KINDS as readonly string[]).includes(value);
}

const MINOR = 100;

/** Website Management a month, GST inside the rupee price. Mirrors brandbasket-website lib/pricing.ts: change both together. */
const MONTHLY: Readonly<Record<WebsiteKind, Readonly<Record<MoneyCurrency, number>>>> = {
  b2b: { INR: 2_999 * MINOR, USD: 59 * MINOR },
  ecommerce: { INR: 3_999 * MINOR, USD: 99 * MINOR },
};

/** The one-time build fee before any deal discount, GST inside the rupee price. Mirrors the website too. */
const BUILD_FEE: Readonly<Record<WebsiteKind, Readonly<Record<MoneyCurrency, number>>>> = {
  b2b: { INR: 35_000 * MINOR, USD: 1_200 * MINOR },
  ecommerce: { INR: 65_000 * MINOR, USD: 4_500 * MINOR },
};

export function websiteMonthlyCents(kind: WebsiteKind, currency: MoneyCurrency): number {
  return MONTHLY[kind][currency];
}

export function websiteBuildFeeCents(kind: WebsiteKind, currency: MoneyCurrency): number {
  return BUILD_FEE[kind][currency];
}
