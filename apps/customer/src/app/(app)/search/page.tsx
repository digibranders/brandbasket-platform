import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SearchScreen } from "@/features/search/components/search-screen";
import { requirePaid } from "@/lib/guards";

// Never plain "Search": that is the name of the search box (plan 60, section 12).
export const metadata: Metadata = { title: "Local SEO + AEO" };

export default async function SearchPage() {
  const customer = await requirePaid();
  // Local SEO + AEO is no longer sold: there is nothing to offer a business without it.
  if (!customer.services.includes("search")) redirect("/");
  return <SearchScreen customer={customer} />;
}
