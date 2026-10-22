import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { CategoryEditor } from "@/components/panel/blog-editor/category-editor";
import { getOwnWebsiteUrl } from "@/lib/server/blog-preview-link";
import { getBlogCategory } from "@/lib/server/blog-taxonomy";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

export const metadata: Metadata = { title: "Category" };

/** "https://www.asterphysio.com" → "asterphysio.com". */
function hostOf(websiteUrl: string | null): string | null {
  if (websiteUrl === null) return null;
  try {
    return new URL(websiteUrl).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** A missing category and another business's category both give the same 404. */
export default async function CategoryPage({
  params,
}: {
  readonly params: Promise<{ readonly categoryId: string }>;
}): Promise<ReactElement> {
  const { categoryId } = await params;
  const { tenant } = await requireWebsiteClient();
  const [category, websiteUrl] = await Promise.all([getBlogCategory(categoryId), getOwnWebsiteUrl(tenant)]);
  if (category === null) notFound();

  return (
    <>
      <h1 className="sr-only">{category.name}</h1>
      <CategoryEditor
        key={category.id}
        category={category}
        siteHost={hostOf(websiteUrl)}
        save={saveCategoryAction}
        remove={deleteCategoryAction}
      />
    </>
  );
}
