import type { Metadata } from "next";
import { NotBought } from "@/features/setup/components/not-bought";
import { connectNoticeLine } from "@/features/social/accounts/rules";
import { channelFrom, postingServiceSettings } from "@/features/social/analytics/rules";
import { SocialOverview } from "@/features/social/components/social-screens";
import { LegacySocialPage } from "@/legacy-social/components/legacy-social-page";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Social media" };

interface SocialPageProps {
  readonly searchParams: Promise<{ readonly social?: string | readonly string[]; readonly channel?: string | readonly string[] }>;
}

export default async function SocialPage({ searchParams }: SocialPageProps) {
  const customer = await requirePaid();
  if (!customer.services.includes("social")) return <NotBought service="social" customer={customer} />;
  const { social, channel } = await searchParams;
  const notice = connectNoticeLine(social, channel);
  // With a posting service the page is the old Social media page, as it was; without one, the posts and accounts staff keep in the database.
  if (postingServiceSettings(process.env) !== null) return <LegacySocialPage customer={customer} notice={notice} />;
  return <SocialOverview customer={customer} notice={notice} channel={channelFrom(channel)} />;
}
