import type { Metadata } from "next";
import type { ReactElement } from "react";
import { MembershipPage } from "@/components/panel/membership/membership-page";

export const metadata: Metadata = { title: "Checkout" };

interface PlanPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** The Managed Website plan's page (components/panel/membership/membership-page.tsx). */
export default function PlanPage({ searchParams }: PlanPageProps): ReactElement {
  return <MembershipPage tier="managed" searchParams={searchParams} />;
}
