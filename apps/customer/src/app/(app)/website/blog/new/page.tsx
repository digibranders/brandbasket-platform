import type { Metadata } from "next";
import { PageHeader } from "@/components";
import { createPostAction } from "@/features/blog/actions";
import { CreateForm } from "@/features/blog/components/create-form";
import { BLOG_PATH } from "@/features/blog/rules/paths";
import { POST_TITLE_MAX_LENGTH } from "@/features/blog/rules/posts";
import { redirect } from "next/navigation";
import { canWriteBlog } from "@/features/blog/server/access";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "New post" };

/** A title is all it takes to start: the editor opens straight after, with the post as a draft. */
export default async function NewPostPage() {
  const customer = await requireWebsite({ write: true });
  if (!canWriteBlog(customer)) redirect(BLOG_PATH);
  return (
    <>
      <PageHeader back={{ href: BLOG_PATH, label: "Blog" }} title="New post" />
      <CreateForm
        title="Post"
        field={{ name: "title", label: "Title", hint: "You can change it, and everything else, in the editor.", maxLength: POST_TITLE_MAX_LENGTH }}
        submitLabel="Create post"
        action={createPostAction}
      />
    </>
  );
}
