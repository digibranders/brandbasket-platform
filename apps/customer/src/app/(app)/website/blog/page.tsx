import type { Metadata } from "next";
import { PostsScreen } from "@/features/blog/components/posts-screen";
import { loadHasPages, loadPosts, loadUsage } from "@/features/blog/loader";
import { canWriteBlog } from "@/features/blog/server/access";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "Blog" };

/** The blog's posts and what the plan allows. Viewers read; the write controls are hidden from them. */
export default async function BlogPage() {
  const customer = await requireWebsite();
  const now = new Date();
  const [posts, usage, hasPages] = await Promise.all([loadPosts(customer, now), loadUsage(customer), loadHasPages(customer)]);
  return <PostsScreen posts={posts} usage={usage} canWrite={canWriteBlog(customer)} hasPages={hasPages} now={now} />;
}
