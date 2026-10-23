import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { BlogPostEditor } from "@/components/panel/blog-editor/blog-post-editor";
import { getBlogPost } from "@/lib/server/blog";
import { getBlogAuthors, getBlogCategories } from "@/lib/server/blog-taxonomy";
import { getOwnWebsiteUrl } from "@/lib/server/blog-preview-link";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import {
  deleteBlogPostAction,
  duplicateBlogPostAction,
  removeCoverImageAction,
  setCoverImageAction,
  updateBlogPostAction,
} from "../actions";
import { createBlogAuthorByNameAction, createBlogCategoryAction } from "../taxonomy-actions";

export const metadata: Metadata = { title: "Edit post" };

/**
 * `getBlogPost` returns `null` for both "doesn't exist" and "belongs to a different business" (see its own doc
 * comment in lib/server/blog.ts) — this page cannot and does not tell those two cases apart, so a customer probing
 * another business's post id sees the exact same 404 as a made-up one.
 */
export default async function BlogPostEditPage({
  params,
}: {
  readonly params: Promise<{ readonly postId: string }>;
}): Promise<ReactElement> {
  const { postId } = await params;
  const { tenant } = await requireWebsiteClient();
  const [post, websiteUrl, categories, authors] = await Promise.all([
    getBlogPost(postId),
    getOwnWebsiteUrl(tenant),
    getBlogCategories(),
    getBlogAuthors(),
  ]);
  if (post === null) notFound();

  return (
    <>
      <h1 className="sr-only">{post.title}</h1>
      <BlogPostEditor
        // A different post (after Duplicate, say) starts the editor fresh rather than carrying this one's state.
        key={post.id}
        post={post}
        previewHref={websiteUrl === null ? null : `/content/blog/${post.id}/preview`}
        siteUrl={websiteUrl}
        categories={categories.map(({ id, name }) => ({ id, name }))}
        authors={authors.map(({ id, name }) => ({ id, name }))}
        save={updateBlogPostAction}
        createCategory={createBlogCategoryAction}
        createAuthor={createBlogAuthorByNameAction}
        duplicate={duplicateBlogPostAction}
        remove={deleteBlogPostAction}
        setCoverImage={setCoverImageAction}
        removeCoverImage={removeCoverImageAction}
      />
    </>
  );
}
