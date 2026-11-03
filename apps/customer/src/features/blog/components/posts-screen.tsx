import Link from "next/link";
import { PanelData, PanelError } from "@/components";
import { formatDate, formatMoney, formatOutOf, formatQuantity } from "@/lib/format";
import type { Loaded } from "@/lib/loaded";
import { LinkButton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import { BLOG_NEW_PATH, BLOG_PATH, postPath } from "../rules/paths";
import { isAtBlogLimit, type BlogPostSummary, type BlogUsage } from "../rules/posts";
import { BlogFrame, PublishStateBadge } from "./blog-frame";
import { UnlockPostsButton } from "./unlock-posts-button";

export interface PostsScreenProps {
  readonly posts: Loaded<readonly BlogPostSummary[]>;
  readonly usage: Loaded<BlogUsage | null>;
  readonly canWrite: boolean;
  readonly hasPages: boolean;
  readonly now: Date;
}

/**
 * "12 of 100 posts used." Every post counts, drafts included, until it is deleted. At the limit it says what the next block
 * costs. No plan: no line, as no limit applies.
 */
function usageLine(usage: BlogUsage | null): string | null {
  if (usage === null) return null;
  const used = `${formatOutOf(usage.used, usage.allowance)} posts used.`;
  const { posts, amountCents, currency } = usage.nextBlock;
  return isAtBlogLimit(usage) ? `${used} Unlock ${posts} more for ${formatMoney(amountCents, currency)} to keep writing.` : used;
}

/** The blog's posts, newest edited first, with what the plan allows. At the limit the way to unlock more replaces New post. */
export function PostsScreen({ posts, usage, canWrite, hasPages, now }: PostsScreenProps) {
  const atLimit = usage.ok && isAtBlogLimit(usage.data);
  const action = !canWrite ? undefined : atLimit ? (
    <UnlockPostsButton />
  ) : (
    <LinkButton href={BLOG_NEW_PATH} variant="primary" icon="Plus">
      New post
    </LinkButton>
  );
  const line = usage.ok ? usageLine(usage.data) : null;

  return (
    <BlogFrame current={BLOG_PATH} hasPages={hasPages} actions={action}>
      {usage.ok ? null : (
        <div className="mb-4">
          <PanelError failure={usage.error} what="how many posts your plan has left" />
        </div>
      )}
      <PanelData
        title="Posts"
        data={posts}
        what="your posts"
        flush
        meta={(rows) => (rows.length === 0 ? undefined : formatQuantity(rows.length, "post"))}
        isEmpty={(rows) => rows.length === 0}
        empty={{
          icon: "FileText",
          title: "No posts yet",
          description: "Your posts appear here. A new post stays a draft until you publish it.",
          ...(canWrite && !atLimit ? { action: <LinkButton href={BLOG_NEW_PATH}>Write your first post</LinkButton> } : {}),
        }}
        footer={line === null ? undefined : line}
      >
        {(rows) => (
          <Table>
              <TableHead>
                <TableHeader>Title</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader hideOnPhone>Published</TableHeader>
                <TableHeader hideOnPhone>Category</TableHeader>
                <TableHeader hideOnPhone>Last edited</TableHeader>
              </TableHead>
              <TableBody>
                {rows.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="font-medium text-ink">
                      <Link href={postPath(post.id)}>{post.title === "" ? "Untitled post" : post.title}</Link>
                    </TableCell>
                    <TableCell>
                      <PublishStateBadge state={post.publishState} />
                    </TableCell>
                    <TableCell hideOnPhone>{post.status === "published" && post.publishedAt !== null ? formatDate(new Date(post.publishedAt), now) : "Not published"}</TableCell>
                    <TableCell hideOnPhone>{post.categoryName ?? "No category"}</TableCell>
                    <TableCell hideOnPhone>{formatDate(new Date(post.updatedAt), now)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
          </Table>
        )}
      </PanelData>
    </BlogFrame>
  );
}
