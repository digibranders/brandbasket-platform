import type { Metadata } from "next";
import type { ReactElement } from "react";
import { MembershipPage } from "@/components/panel/membership/membership-page";

export const metadata: Metadata = { title: "Care plan" };

interface CarePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** The Care plan's page (components/panel/membership/membership-page.tsx). */
export default function CarePage({ searchParams }: CarePageProps): ReactElement {
  return <MembershipPage tier="care" searchParams={searchParams} />;
}
