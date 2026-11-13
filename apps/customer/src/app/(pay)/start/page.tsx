import type { Metadata } from "next";
import { StartScreen } from "@/features/start/components/start-screen";
import { loadStart } from "@/features/start/loader";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Personalise your setup" };

/**
 * The short questions between creating an account and paying. Where the customer is lives in the address (`?q=`), and every
 * answer is saved as it is given, so a refresh or Back resumes. Only for an account that has not paid (loadStart sends a
 * member Home).
 */
export default async function StartPage({ searchParams }: { readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }) {
  const customer = await requireCustomer();
  return <StartScreen view={await loadStart(customer, await searchParams)} />;
}
