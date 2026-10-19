import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { BlogEmptyState } from "@/components/panel/blog-editor/blog-empty-state";
import { BlogPostsTable } from "@/components/panel/blog-editor/blog-posts-table";
import { getBlogPosts } from "@/lib/server/blog";
import { getBlogUsage, isAtBlogLimit, type BlogUsage } from "@/lib/server/blog-allowance";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { unlockBlogPostsAction } from "./actions";

export const metadata: Metadata = { title: "Blog" };

/** "12 of 100 posts", and at the limit, the way to unlock the next block instead of a New post button. */
function UnlockMorePosts({ usage }: { readonly usage: BlogUsage }): ReactElement {
  return (
    <form action={unlockBlogPostsAction}>
      <SubmitButton size="sm" pendingLabel="Opening payment…">
        {`Unlock ${usage.nextBlock.posts} more posts · ${usage.nextBlock.price}`}
      </SubmitButton>
    </form>
  );
}

export default async function BlogListPage(): Promise<ReactElement> {
  const customer = await requireCustomerAccess();
  const [posts, usage] = await Promise.all([getBlogPosts(), getBlogUsage(customer, customer.billing.plan)]);
  const atLimit = isAtBlogLimit(usage);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="panel-title">Blog</h1>
          {usage === null ? null : (
            <p className="mt-2 text-sm tabular-nums text-ink-soft">
              {usage.used} of {usage.allowance} posts used
              {atLimit ? ` · unlock ${usage.nextBlock.posts} more to keep writing` : null}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {usage !== null && atLimit ? (
            <UnlockMorePosts usage={usage} />
          ) : (
            <ButtonLink href="/content/blog/new" size="sm">
              New post
            </ButtonLink>
          )}
        </div>
      </div>

      <div className="mt-8">
        {posts.length === 0 ? (
          <BlogEmptyState
            title="No posts yet"
            body="Write your first post to see it listed here. It stays a draft until you publish it."
            action={
              <ButtonLink href="/content/blog/new" size="sm">
                Write your first post
              </ButtonLink>
            }
          />
        ) : (
          <BlogPostsTable posts={posts} />
        )}
      </div>
    </>
  );
}
