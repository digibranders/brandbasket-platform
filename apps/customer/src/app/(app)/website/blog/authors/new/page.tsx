import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components";
import { CreateForm } from "@/features/blog/components/create-form";
import { BLOG_AUTHORS_PATH } from "@/features/blog/rules/paths";
import { AUTHOR_NAME_MAX_LENGTH } from "@/features/blog/rules/taxonomy";
import { canWriteBlog } from "@/features/blog/server/access";
import { createAuthorAction } from "@/features/blog/taxonomy-actions";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "New author" };

/** A name is enough to start; the author's own page opens straight after for the rest. */
export default async function NewAuthorPage() {
  const customer = await requireWebsite({ write: true });
  if (!canWriteBlog(customer)) redirect(BLOG_AUTHORS_PATH);
  return (
    <>
      <PageHeader back={{ href: BLOG_AUTHORS_PATH, label: "Authors" }} title="New author" />
      <CreateForm
        title="Author"
        field={{ name: "name", label: "Name", hint: "Shown with the posts they write.", maxLength: AUTHOR_NAME_MAX_LENGTH }}
        submitLabel="Add author"
        action={createAuthorAction}
      />
    </>
  );
}
