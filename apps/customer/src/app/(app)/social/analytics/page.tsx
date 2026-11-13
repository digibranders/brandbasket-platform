import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NotBought } from "@/features/setup/components/not-bought";
import { SocialAnalytics } from "@/features/social/analytics/components/analytics-screen";
import { channelFrom, postingServiceSettings, rangeFrom } from "@/features/social/analytics/rules";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Analytics" };

interface AnalyticsPageProps {
  readonly searchParams: Promise<{ readonly range?: string | readonly string[]; readonly channel?: string | readonly string[] }>;
}

export default async function SocialAnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const customer = await requirePaid();
  if (!customer.services.includes("social")) return <NotBought service="social" customer={customer} />;
  // No posting service on this server: there is nothing to read, and the tab is not drawn either.
  if (postingServiceSettings(process.env) === null) notFound();
  const { range, channel } = await searchParams;
  return <SocialAnalytics customer={customer} range={rangeFrom(range)} channel={channelFrom(channel)} />;
}
