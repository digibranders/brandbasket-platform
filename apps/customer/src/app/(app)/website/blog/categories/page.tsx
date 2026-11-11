import type { Metadata } from "next";
import { CategoriesScreen } from "@/features/blog/components/taxonomy-screens";
import { loadCategories, loadHasPages } from "@/features/blog/loader";
import { canWriteBlog } from "@/features/blog/server/access";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const customer = await requireWebsite();
  const now = new Date();
  const [categories, hasPages] = await Promise.all([loadCategories(customer, now), loadHasPages(customer)]);
  return <CategoriesScreen rows={categories} canWrite={canWriteBlog(customer)} hasPages={hasPages} now={now} />;
}
