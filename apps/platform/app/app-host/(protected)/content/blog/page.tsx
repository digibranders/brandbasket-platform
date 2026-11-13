import { Article } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { UnlockMorePosts } from "@/components/panel/blog-editor/unlock-more-posts";
import { BlogPostsTable } from "@/components/panel/blog-editor/blog-posts-table";
import { DARK_BUTTON } from "@/components/v2/classes";
import { ActionRow, EmptyState, PageSection } from "@/components/v2/page";
import { unlockPostsSummary } from "@/lib/billing/payment-summaries";
import { getBlogPosts } from "@/lib/server/blog";
import { getBlogUsage, isAtBlogLimit } from "@/lib/server/blog-allowance";
import { requireWebsiteClient } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Blog" };

export default async function BlogListPage(): Promise<ReactElement> {
  const customer = await requireWebsiteClient();
  const [posts, usage] = await Promise.all([getBlogPosts(), getBlogUsage(customer, customer.billing.plan)]);
  const atLimit = isAtBlogLimit(usage);

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={Article}
        title="No posts yet"
        text="Write your first post to see it listed here. It stays a draft until you publish it."
        action={
          <Link href="/content/blog/new" className={DARK_BUTTON}>
            Write your first post
          </Link>
        }
      />
    );
  }

  return (
    <>
      <ActionRow
        text={
          usage === null ? (
            "Write and publish whenever you like."
          ) : (
            <span className="tabular-nums">
              {usage.used} of {usage.allowance} posts used
              {atLimit ? ` · unlock ${usage.nextBlock.posts} more to keep writing` : null}
            </span>
          )
        }
        action={
          usage !== null && atLimit ? (
            <UnlockMorePosts posts={usage.nextBlock.posts} price={usage.nextBlock.price} summary={unlockPostsSummary(usage.nextBlock)} />
          ) : (
            <Link href="/content/blog/new" className={DARK_BUTTON}>
              New post
            </Link>
          )
        }
      />
      <PageSection id="posts" title="Posts">
        <BlogPostsTable posts={posts} />
      </PageSection>
    </>
  );
}
