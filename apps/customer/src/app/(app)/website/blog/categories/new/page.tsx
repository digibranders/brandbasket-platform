import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components";
import { CreateForm } from "@/features/blog/components/create-form";
import { BLOG_CATEGORIES_PATH } from "@/features/blog/rules/paths";
import { CATEGORY_NAME_MAX_LENGTH } from "@/features/blog/rules/taxonomy";
import { canWriteBlog } from "@/features/blog/server/access";
import { createCategoryAction } from "@/features/blog/taxonomy-actions";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "New category" };

/** A name is enough to start; the category's own page opens straight after for its description and search settings. */
export default async function NewCategoryPage() {
  const customer = await requireWebsite({ write: true });
  if (!canWriteBlog(customer)) redirect(BLOG_CATEGORIES_PATH);
  return (
    <>
      <PageHeader back={{ href: BLOG_CATEGORIES_PATH, label: "Categories" }} title="New category" />
      <CreateForm
        title="Category"
        field={{ name: "name", label: "Name", hint: "For example, Back care. It gets its own page on your website.", maxLength: CATEGORY_NAME_MAX_LENGTH }}
        submitLabel="Add category"
        action={createCategoryAction}
      />
    </>
  );
}
