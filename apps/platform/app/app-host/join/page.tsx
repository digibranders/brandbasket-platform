import { redirect } from "next/navigation";
import { entryHrefForJoin } from "@/lib/account-entry";

interface JoinPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * The old sign-up address. Everyone now signs in and signs up on one page (docs/superpowers/specs/2026-09-30-single-
 * entry-premium-design.md), but the website's "List your business" buttons and every claim link already out there
 * point here, so this sends them on to that page's Create account view with their claim and plan carried over.
 */
export default async function JoinPage({ searchParams }: JoinPageProps): Promise<never> {
  redirect(entryHrefForJoin(await searchParams));
}
