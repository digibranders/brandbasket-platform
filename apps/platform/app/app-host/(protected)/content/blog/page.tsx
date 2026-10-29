import { Article } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { BlogPostsTable } from "@/components/panel/blog-editor/blog-posts-table";
import { DARK_BUTTON, DARK_BUTTON_SHAPE } from "@/components/v2/classes";
import { ActionRow, EmptyState, PageSection } from "@/components/v2/page";
import { getBlogPosts } from "@/lib/server/blog";
import { getBlogUsage, isAtBlogLimit, type BlogUsage } from "@/lib/server/blog-allowance";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { unlockBlogPostsAction } from "./actions";

export const metadata: Metadata = { title: "Blog" };

/** "12 of 100 posts", and at the limit, the way to unlock the next block instead of a New post button. */
function UnlockMorePosts({ usage }: { readonly usage: BlogUsage }): ReactElement {
  return (
    <form action={unlockBlogPostsAction}>
      <SubmitButton className={DARK_BUTTON_SHAPE} pendingLabel="Opening payment…">
        {`Unlock ${usage.nextBlock.posts} more posts · ${usage.nextBlock.price}`}
      </SubmitButton>
    </form>
  );
}

/** The blog's authors and categories, which have no sidebar link of their own: they are settings of the blog. */
function BlogSettingsLinks(): ReactElement {
  return (
    <span className="inline-flex gap-4 font-semibold text-ink">
      <Link href="/content/authors">Authors</Link>
      <Link href="/content/categories">Categories</Link>
    </span>
  );
}

export default async function BlogListPage(): Promise<ReactElement> {
  const customer = await requireWebsiteClient();
  const [posts, usage] = await Promise.all([getBlogPosts(), getBlogUsage(customer, customer.billing.plan)]);
  const atLimit = isAtBlogLimit(usage);

  if (posts.length === 0) {
    return (
      <>
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
        <p className="text-[0.9375rem] text-ink-2">
          Blog settings: <BlogSettingsLinks />
        </p>
      </>
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
            <UnlockMorePosts usage={usage} />
          ) : (
            <Link href="/content/blog/new" className={DARK_BUTTON}>
              New post
            </Link>
          )
        }
      />
      <PageSection id="posts" title="Posts" aside={<BlogSettingsLinks />}>
        <BlogPostsTable posts={posts} />
      </PageSection>
    </>
  );
}
