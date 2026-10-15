import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { MembershipPage } from "@/components/panel/membership/membership-page";
import { offersChoice } from "@/lib/brand";
import { CARE_PATH } from "@/lib/membership";
import { requestBrand } from "@/lib/server/request-brand";

export const metadata: Metadata = { title: "Checkout" };

interface PremiumPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** The Premium membership's page (components/panel/membership/membership-page.tsx), for a brand that still sells it. Fynix sells Care only. */
export default async function PremiumPage({ searchParams }: PremiumPageProps): Promise<ReactElement> {
  if (!offersChoice(await requestBrand(), "premium")) redirect(CARE_PATH);
  return <MembershipPage tier="premium" searchParams={searchParams} />;
}
