import type { Metadata } from "next";
import type { ReactElement } from "react";
import { MembershipPage } from "@/components/panel/membership/membership-page";

export const metadata: Metadata = { title: "Premium membership" };

interface PremiumPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** The Premium membership's page (components/panel/membership/membership-page.tsx). */
export default function PremiumPage({ searchParams }: PremiumPageProps): ReactElement {
  return <MembershipPage tier="premium" searchParams={searchParams} />;
}
