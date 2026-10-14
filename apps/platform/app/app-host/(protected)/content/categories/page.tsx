import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { BlogEmptyState } from "@/components/panel/blog-editor/blog-empty-state";
import { CategoriesTable } from "@/components/panel/blog-editor/categories-table";
import { getBlogCategoriesWithStats } from "@/lib/server/blog-taxonomy";

export const metadata: Metadata = { title: "Categories" };

/** Content → Categories: what posts are filed under. Each has its own page on the website, /blog/category/<name>. */
export default async function CategoriesPage(): Promise<ReactElement> {
  const categories = await getBlogCategoriesWithStats();
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="panel-title">Categories</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {categories.length === 1 ? "1 category" : `${categories.length} categories`} · each gets its own page on
            your website
          </p>
        </div>
        <ButtonLink href="/content/categories/new" size="sm">
          New category
        </ButtonLink>
      </div>
      <div className="mt-8">
        {categories.length === 0 ? (
          <BlogEmptyState
            art="stack"
            title="No categories yet"
            body="Group your posts by topic, so readers can find more of what they like."
            action={
              <ButtonLink href="/content/categories/new" size="sm">
                Add a category
              </ButtonLink>
            }
          />
        ) : (
          <CategoriesTable categories={categories} />
        )}
      </div>
    </>
  );
}
