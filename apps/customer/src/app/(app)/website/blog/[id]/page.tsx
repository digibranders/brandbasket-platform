import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Panel, PanelError } from "@/components";
import { createAuthorInlineAction, createCategoryInlineAction, deletePostAction, duplicatePostAction, removeCoverImageAction, savePostAction } from "@/features/blog/actions";
import { PostEditor } from "@/features/blog/components/post-editor";
import { loadPost, loadTaxonomyOptions, loadWebsiteUrl } from "@/features/blog/loader";
import { isDocId } from "@/features/blog/rules/paths";
import { canWriteBlog } from "@/features/blog/server/access";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "Edit post" };

/** One post in the editor. A missing post and another business's post are the same 404; a failed read shows its error. */
export default async function PostPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
  const customer = await requireWebsite();
  const { id } = await params;
  if (!isDocId(id)) notFound();
  const [post, options, websiteUrl] = await Promise.all([loadPost(customer, id, new Date()), loadTaxonomyOptions(customer), loadWebsiteUrl(customer)]);
  if (post.ok && post.data === null) notFound();
  const failure = !post.ok ? post.error : !options.ok ? options.error : null;
  if (failure !== null || !post.ok || post.data === null || !options.ok) {
    return <Panel title="Post">{failure === null ? null : <PanelError failure={failure} what="this post" />}</Panel>;
  }
  return (
    <PostEditor
      // A different post (after Duplicate) starts the editor fresh rather than carrying this one's state.
      key={post.data.id}
      post={post.data}
      // Without a website address there is nothing to preview on; the address preview then uses a stand-in.
      websiteUrl={websiteUrl.ok ? websiteUrl.data : null}
      categories={options.data.categories}
      authors={options.data.authors}
      canWrite={canWriteBlog(customer)}
      save={savePostAction}
      duplicate={duplicatePostAction}
      remove={deletePostAction}
      removeCover={removeCoverImageAction}
      createCategory={createCategoryInlineAction}
      createAuthor={createAuthorInlineAction}
    />
  );
}
