import { redirect } from "next/navigation";
import { loadPost, loadWebsiteUrl } from "@/features/blog/loader";
import { BLOG_PATH, isDocId, postPath } from "@/features/blog/rules/paths";
import { blogPreviewUrl } from "@/features/blog/server/preview";
import { serverEnv } from "@/lib/env";
import { requireWebsite } from "@/lib/guards";

/**
 * "Preview on my website": signs a 30 minute link for this post and sends the customer to their own site's preview page. A
 * GET the editor opens in a new tab, so no popup blocker is involved. A post that is not the business's own goes back to the
 * list; with no website address on file there is nothing to open, so back to the editor.
 */
export async function GET(_request: Request, context: { readonly params: Promise<{ readonly id: string }> }): Promise<never> {
  const customer = await requireWebsite();
  const { id } = await context.params;
  if (!isDocId(id)) redirect(BLOG_PATH);
  const [post, websiteUrl] = await Promise.all([loadPost(customer, id, new Date()), loadWebsiteUrl(customer)]);
  // A failed read goes to the editor, which shows the error; a post that is not the business's own goes to the list.
  if (!post.ok) redirect(postPath(id));
  if (post.data === null) redirect(BLOG_PATH);
  if (!websiteUrl.ok || websiteUrl.data === null) redirect(postPath(id));
  // The auth secret, as on the platform: its preview endpoint verifies with the same secret and a key derived for this use only.
  redirect(blogPreviewUrl(serverEnv().BETTER_AUTH_SECRET, websiteUrl.data, { businessId: customer.businessId, postId: post.data.id }, new Date()));
}
