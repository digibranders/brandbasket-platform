import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Panel, PanelError } from "@/components";
import { CategoryEditor } from "@/features/blog/components/taxonomy-editors";
import { loadCategory, loadWebsiteUrl } from "@/features/blog/loader";
import { siteHost } from "@/features/blog/rules/address";
import { isDocId } from "@/features/blog/rules/paths";
import { canWriteBlog } from "@/features/blog/server/access";
import { deleteCategoryAction, saveCategoryAction } from "@/features/blog/taxonomy-actions";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "Category" };

/** A missing category and another business's category are the same 404; a failed read shows its error. */
export default async function CategoryPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
  const customer = await requireWebsite();
  const { id } = await params;
  if (!isDocId(id)) notFound();
  const [category, websiteUrl] = await Promise.all([loadCategory(customer, id, new Date()), loadWebsiteUrl(customer)]);
  if (!category.ok) {
    return (
      <Panel title="Category">
        <PanelError failure={category.error} what="this category" />
      </Panel>
    );
  }
  if (category.data === null) notFound();
  return (
    <CategoryEditor
      key={category.data.id}
      category={category.data}
      host={websiteUrl.ok ? siteHost(websiteUrl.data) : null}
      canWrite={canWriteBlog(customer)}
      save={saveCategoryAction}
      remove={deleteCategoryAction}
    />
  );
}
