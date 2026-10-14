import { redirect } from "next/navigation";
import { getBlogPost } from "@/lib/server/blog";
import { blogPreviewUrl, getOwnWebsiteUrl } from "@/lib/server/blog-preview-link";
import { requireCustomerAccess } from "@/lib/server/customer-access";

/**
 * "Preview on my website": signs a 30-minute link for this post and sends the customer to their own site's preview
 * page. A GET the edit page links to with target="_blank", so the new tab opens on the click itself and no popup
 * blocker is involved.
 *
 * getBlogPost returns null for a post of another business as well as a missing one, so nobody can sign a link for a
 * post that is not theirs. With no website address on file there is nothing to open; back to the editor.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/app-host/content/blog/[postId]/preview">,
): Promise<never> {
  const { tenant } = await requireCustomerAccess();
  const { postId } = await context.params;

  const post = await getBlogPost(postId);
  if (post === null) redirect("/content/blog");

  const websiteUrl = await getOwnWebsiteUrl(tenant);
  if (websiteUrl === null) redirect(`/content/blog/${post.id}`);

  redirect(blogPreviewUrl(websiteUrl, tenant.businessId, post.id, new Date()));
}
