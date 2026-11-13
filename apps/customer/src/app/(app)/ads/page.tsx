import type { Metadata } from "next";
import { NotBought } from "@/features/setup/components/not-bought";
import { SocialAds } from "@/features/social/components/social-screens";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Paid Ads" };

export default async function AdsPage() {
  const customer = await requirePaid();
  if (!customer.services.includes("social")) return <NotBought service="social" customer={customer} />;
  return <SocialAds customer={customer} />;
}
