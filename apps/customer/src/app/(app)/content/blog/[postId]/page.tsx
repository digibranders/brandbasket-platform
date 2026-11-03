import { redirect } from "next/navigation";
import { postPath } from "@/features/blog/rules/paths";

/** Old address (plan 61, route map): the blog moved under Website. The destination checks access. */
export default async function MovedToPost({ params }: { readonly params: Promise<{ readonly postId: string }> }): Promise<never> {
  const { postId } = await params;
  redirect(postPath(encodeURIComponent(postId)));
}
