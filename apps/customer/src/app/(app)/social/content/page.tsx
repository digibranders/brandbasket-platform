import type { Metadata } from "next";
import { NotBought } from "@/features/setup/components/not-bought";
import { SocialContent } from "@/features/social/components/social-screens";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Social & Ads" };

export default async function SocialContentPage() {
  const customer = await requirePaid();
  if (!customer.services.includes("social")) return <NotBought service="social" customer={customer} />;
  return <SocialContent customer={customer} />;
}
