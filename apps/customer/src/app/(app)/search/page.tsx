import type { Metadata } from "next";
import { SearchScreen } from "@/features/search/components/search-screen";
import { NotBought } from "@/features/setup/components/not-bought";
import { requirePaid } from "@/lib/guards";

// Never plain "Search": that is the name of the search box (plan 60, section 12).
export const metadata: Metadata = { title: "Local SEO + AEO" };

export default async function SearchPage() {
  const customer = await requirePaid();
  if (!customer.services.includes("search")) return <NotBought service="search" customer={customer} />;
  return <SearchScreen customer={customer} />;
}
