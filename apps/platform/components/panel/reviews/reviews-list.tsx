import type { ReactElement } from "react";
import type { OwnerReview } from "@fynix/db";
import { cn } from "@fynix/shared/lib/cn";
import { StarIcon } from "@fynix/shared/ui/icons";
import { displayPhone } from "@fynix/shared/server/phone-display";
import { LocalDateTime } from "@fynix/shared/ui/panel/local-date-time";
import type { PanelFormAction } from "@/components/panel/form/panel-form";
import { OwnerReplyControls, OwnerTag, PostReplyForm } from "./reply-forms";

const STARS = [1, 2, 3, 4, 5] as const;

/** A rating as five stars, the earned ones filled; its words for screen readers. */
function Stars({ rating }: { readonly rating: number }): ReactElement {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${String(rating)} out of 5 stars`}>
      {STARS.map((star) => (
        <StarIcon key={star} className={cn("size-4", star <= rating ? "fill-current text-accent" : "text-line")} />
      ))}
    </span>
  );
}

/**
 * The reviewer's number, shown only when they ticked that this business may contact them about the review (N14). The
 * Terms limit its use to resolving that review, so the line says so where the number is.
 */
function ReviewerContact({ phone }: { readonly phone: string }): ReactElement {
  const shown = displayPhone(phone);
  return (
    <p className="mt-3 max-w-prose text-sm text-ink-soft">
      Happy to hear from you about this review:{" "}
      {shown.href === null ? (
        <span className="font-semibold tabular-nums text-ink">{shown.text}</span>
      ) : (
        <a href={shown.href} className="link-underline font-semibold tabular-nums text-ink">
          {shown.text}
        </a>
      )}
      . Use it only to resolve this review: no offers, and nothing in return for changing or removing it.
    </p>
  );
}

interface ReviewsListProps {
  readonly reviews: readonly OwnerReview[];
  readonly postAction: PanelFormAction;
  readonly editAction: PanelFormAction;
  readonly removeAction: PanelFormAction;
}

/**
 * One page of the business's reviews, newest first, split by hairlines. Each one reads as it does on the public page:
 * who, how many stars, when, what they said (and their number, if they agreed to be contacted), and then the conversation
 * under it, with the owner's own answers tagged.
 * A review nobody has answered has its reply box open; an answered one keeps a quiet "Reply again".
 */
export function ReviewsList({ reviews, postAction, editAction, removeAction }: ReviewsListProps): ReactElement {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {reviews.map((review) => (
        <li key={review.id} className="py-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Stars rating={review.rating} />
            <span className="font-semibold">{review.displayName}</span>
            <span className="text-[0.8125rem] tabular-nums text-ink-soft">
              <LocalDateTime iso={review.createdAt.toISOString()} variant="timestamp" />
            </span>
            {review.needsReply ? (
              <span className="rounded-full border border-accent px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-accent">
                Needs a reply
              </span>
            ) : null}
          </div>
          {review.text === null ? null : <p className="mt-2 max-w-prose whitespace-pre-line text-sm">{review.text}</p>}
          {review.contactPhone === null ? null : <ReviewerContact phone={review.contactPhone} />}

          {review.comments.length === 0 ? null : (
            <ul className="mt-4 max-w-prose space-y-4 border-l border-line pl-5">
              {review.comments.map((comment) => (
                <li key={comment.id}>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold">{comment.displayName}</span>
                    {comment.byOwner ? <OwnerTag /> : null}
                    <span className="text-[0.8125rem] tabular-nums text-ink-soft">
                      <LocalDateTime iso={comment.createdAt.toISOString()} variant="timestamp" />
                      {comment.editedAt === null ? null : <span> · edited</span>}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{comment.text}</p>
                  {comment.canEdit ? (
                    <OwnerReplyControls commentId={comment.id} text={comment.text} editAction={editAction} removeAction={removeAction} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 max-w-prose">
            <PostReplyForm reviewId={review.id} action={postAction} first={review.needsReply} />
          </div>
        </li>
      ))}
    </ul>
  );
}
