import { Tag } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { CategoriesTable } from "@/components/panel/blog-editor/categories-table";
import { DARK_BUTTON } from "@/components/v2/classes";
import { ActionRow, EmptyState, PageSection } from "@/components/v2/page";
import { getBlogCategoriesWithStats } from "@/lib/server/blog-taxonomy";
import { requireWebsiteClient } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Categories" };

/** Content → Categories: what posts are filed under. Each has its own page on the website, /blog/category/<name>. */
export default async function CategoriesPage(): Promise<ReactElement> {
  await requireWebsiteClient();
  const categories = await getBlogCategoriesWithStats();

  if (categories.length === 0) {
    return (
      <EmptyState
        icon={Tag}
        title="No categories yet"
        text="Group your posts by topic, so readers can find more of what they like."
        action={
          <Link href="/content/categories/new" className={DARK_BUTTON}>
            Add a category
          </Link>
        }
      />
    );
  }

  return (
    <>
      <ActionRow
        text={`${categories.length === 1 ? "1 category" : `${categories.length} categories`} · each gets its own page on your website`}
        action={
          <Link href="/content/categories/new" className={DARK_BUTTON}>
            New category
          </Link>
        }
      />
      <PageSection id="categories" title="Categories">
        <CategoriesTable categories={categories} />
      </PageSection>
    </>
  );
}
