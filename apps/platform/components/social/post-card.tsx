import Link from "next/link";
import type { ReactElement } from "react";
import { approvePostsAction } from "@/app/app-host/(protected)/social/actions";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { requestChangeHref } from "@/lib/requests/links";
import { dueLabel, postPosition, type PostView } from "@/lib/social/week";

interface PostCardProps {
  readonly post: PostView;
  /** Where this post sits among the waiting ones, counted from 0. */
  readonly position: number;
  /** How many posts wait. */
  readonly total: number;
  /** Whether this post is one of the waiting ones (only those say where they sit in the run). */
  readonly waiting: boolean;
  /** Offers an Approve button for this post alone. */
  readonly showApprove: boolean;
}

/** One post as it will look on Instagram and Facebook: the picture, the day, the caption, and a way to ask for a change. */
export function PostCard({ post, position, total, waiting, showApprove }: PostCardProps): ReactElement {
  return (
    <article className="grid content-start gap-2">
      {post.hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- the customer's own post, served by the app host after a row-level-security read
        <img src={`/deliverable-images/${post.id}`} alt={post.title} width={1080} height={1080} loading="lazy" className="aspect-square w-full rounded-lg bg-sunken object-cover" />
      ) : (
        <div className="grid aspect-square w-full place-items-center rounded-lg bg-sunken p-4 text-center">
          <p className="font-display text-base font-semibold leading-snug tracking-[-0.01em] text-ink">{post.title}</p>
        </div>
      )}
      <div>
        <p className="font-figure text-xs text-ink-2">{dueLabel(post.dueOn)}</p>
        {waiting && total > 1 ? <p className="font-figure text-xs text-ink-2 lg:hidden">{postPosition(position, total)}</p> : null}
      </div>
      {post.caption === null ? null : <p className="text-[0.84375rem] leading-snug text-ink">{post.caption}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={requestChangeHref(post)} className="text-[0.8125rem] font-semibold text-ink underline underline-offset-4">
          Change<span className="sr-only"> {post.title}</span>
        </Link>
        {showApprove ? (
          <form action={approvePostsAction}>
            <input type="hidden" name="ids" value={post.id} />
            <button type="submit" className={SOFT_BUTTON}>
              Approve
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
