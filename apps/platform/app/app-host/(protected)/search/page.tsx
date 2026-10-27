import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import { SearchView } from "@/components/search/search-view";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSearch } from "@/lib/server/search";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  // Like To do, Search is for paid accounts; the home page tells the rest what is next.
  if (!billing.hasAccess) redirect("/");
  const data = await loadSearch(tenant, new Date());
  // A business that did not buy Search sees Your plan instead.
  if (data === null) redirect(ADD_ONS_PATH);
  return <SearchView data={data} />;
}
