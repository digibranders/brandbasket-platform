import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import { SearchView } from "@/components/search/search-view";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSearch } from "@/lib/server/search";
import { loadTodo } from "@/lib/server/todo";
import { setupAsks } from "@/lib/setup-asks";

export const metadata: Metadata = { title: "Local SEO + AEO" };

export default async function SearchPage(): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  // Search is for paid accounts; the home page tells the rest what is next.
  if (!billing.hasAccess) redirect("/");
  const [data, todo] = await Promise.all([loadSearch(tenant, new Date()), loadTodo(tenant)]);
  // A business that did not buy Search sees Your plan instead.
  if (data === null) redirect(ADD_ONS_PATH);
  return <SearchView data={data} setup={setupAsks(todo.items, todo.answers, "search")} />;
}
