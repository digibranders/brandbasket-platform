"use client";

import { useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { decideBatchAction, decidePosterAction, drawBatchAction } from "@/app/app-host/(protected)/social/review/actions";
import { LIFT, SECTION_TITLE } from "@/components/v2/classes";
import type { Poster, WrittenBatch, WrittenPost } from "@/lib/social/ai";
import { CHANNEL_PLATFORMS, PLATFORM_NAMES, type ChannelPlatform } from "@/lib/social/auto";
import { MAX_CAPTION_LENGTH } from "@/lib/social/new-post";
import type { ReviewCard, ReviewGroup } from "@/lib/social/review-cards";
import { ChannelLogo } from "./channel-logo";
import { imageUrl, pictureWord, PosterTile } from "./poster-tile";
import { SMALL_DARK, SMALL_WHITE } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

const STATE_WORDS = { pending: "Not decided", kept: "Kept", dropped: "Dropped" } as const;

interface WordsProps {
  readonly batch: WrittenBatch;
  readonly post: WrittenPost;
  readonly locked: boolean;
}

/** The words of one written post, on a tab for each network, with the customer's choices: keep, drop, change the words. */
function Words({ batch, post, locked }: WordsProps): ReactElement {
  const { pending, error, run } = useReviewAction();
  // The first network of the page's own order, so the words open on Instagram, not on whichever network was written last.
  const networks = CHANNEL_PLATFORMS.filter((one) => batch.networks.includes(one));
  const [network, setNetwork] = useState<ChannelPlatform | undefined>(networks[0]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const words = network === undefined ? post.caption : (post.captions[network] ?? post.caption);
  const rule = network === undefined ? undefined : batch.rules[network];
  const limit = rule?.maxCaption ?? MAX_CAPTION_LENGTH;
  const dropped = post.state === "dropped";
  return (
    <>
      {networks.length > 1 ? (
        <div role="group" aria-label="Words for" className="flex flex-wrap gap-1.5">
          {networks.map((one) => (
            <button
              key={one}
              type="button"
              aria-pressed={network === one}
              onClick={() => {
                setNetwork(one);
                setEditing(false);
              }}
              className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold", network === one ? "bg-surface text-ink shadow-sm" : "text-ink-2")}
            >
              <ChannelLogo platform={one} small />
              {PLATFORM_NAMES[one]}
            </button>
          ))}
        </div>
      ) : null}
      {editing ? (
        <div className="grid gap-2">
          <label htmlFor={`words-${batch.id}-${post.id}`} className="sr-only">
            Words for {network === undefined ? "all networks" : PLATFORM_NAMES[network]}
          </label>
          <textarea id={`words-${batch.id}-${post.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} className="w-full rounded-lg border border-ink-2/65 bg-surface px-3 py-2.5 text-[0.9375rem] leading-relaxed text-ink" />
          <p className={cn("text-xs", draft.length > limit ? "font-semibold text-error" : "text-ink-3")}>
            {draft.length} of {limit}
            {rule?.recommendedMin != null && rule.recommendedMax != null ? `. Around ${rule.recommendedMin} to ${rule.recommendedMax} characters reads best.` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || draft.trim() === "" || draft.length > limit}
              onClick={() => run(decideBatchAction, { batchId: batch.id, postId: post.id, action: "edit", caption: draft, ...(network === undefined ? {} : { network }) }, () => setEditing(false))}
              className={SMALL_WHITE}
            >
              Save words
            </button>
            <button type="button" onClick={() => setEditing(false)} className={SMALL_WHITE}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-ink">{words}</p>
      )}
      {post.advice === null ? null : <p className="text-xs text-ink-3">{post.advice}</p>}
      {locked || editing ? null : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || post.state === "kept"} onClick={() => run(decideBatchAction, { batchId: batch.id, postId: post.id, action: "keep" })} className={SMALL_WHITE}>
            {post.state === "kept" ? "Kept" : "Keep"}
          </button>
          <button type="button" disabled={pending || dropped} onClick={() => run(decideBatchAction, { batchId: batch.id, postId: post.id, action: "drop" })} className={SMALL_WHITE}>
            {dropped ? "Dropped" : "Drop"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setDraft(words);
              setEditing(true);
            }}
            className={SMALL_WHITE}
          >
            Change the words
          </button>
        </div>
      )}
      {error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {error}
        </p>
      )}
    </>
  );
}

interface PicturesProps {
  readonly card: ReviewCard;
  readonly reasons: readonly string[];
  /** True once the pictures of this post's batch were asked for. */
  readonly asked: boolean;
  readonly onNotice: (message: string) => void;
}

/**
 * The pictures of one post, on its own card. While they are being drawn the card says so; once they exist it lists each network's
 * picture with where it stands, and "View pictures" opens them in place to look at, approve, change the words of, or send back.
 */
function Pictures({ card, reasons, asked, onNotice }: PicturesProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const all = useReviewAction(onNotice);
  const approvable = card.pictures.filter((poster) => poster.status === "pending");
  if (card.pictures.length === 0) {
    if (!asked || card.written?.state !== "kept") return null;
    return (
      <div role="status" className="grid gap-2 border-t border-line pt-3">
        <p className="text-[0.84375rem] font-semibold text-ink">Drawing your pictures</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-c-growth" />
        </div>
        <p className="text-xs text-ink-3">They will appear here when they are ready.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 border-t border-line pt-3">
      <div className={cn("flex flex-wrap items-center gap-3", open ? "justify-end" : "justify-between")}>
        {/* The strip is for looking at a post from afar. Once the pictures are open they are the thing to look at, so it goes. */}
        {open ? null : (
          <ul className="flex flex-wrap gap-3" aria-label="Pictures of this post">
            {card.pictures.map((poster) => (
              <li key={poster.id} className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                {/* The picture is served by social-auto through our own route, which Next's image optimiser cannot reach. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(poster.id)} alt="" className="size-10 rounded-md bg-surface object-cover" />
                <span className="grid">
                  <span className="inline-flex items-center gap-1 text-ink">
                    <ChannelLogo platform={poster.network} small />
                    {PLATFORM_NAMES[poster.network]}
                  </span>
                  <span>{pictureWord(poster)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {approvable.length > 1 ? (
            <button type="button" disabled={all.pending} onClick={() => all.run(decidePosterAction, { action: "approve-topic", batchId: card.batchId, postId: card.postId })} className={SMALL_DARK}>
              Approve all {approvable.length}
            </button>
          ) : null}
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={SMALL_WHITE}>
            {open ? "Hide pictures" : card.pictures.length > 1 ? "View pictures" : "View picture"}
          </button>
        </div>
      </div>
      {open ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {card.pictures.map((poster: Poster) => (
            <PosterTile key={poster.id} poster={poster} reasons={reasons} onNotice={onNotice} />
          ))}
        </ul>
      ) : null}
      {all.error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {all.error}
        </p>
      )}
    </div>
  );
}

interface CardProps {
  readonly group: ReviewGroup;
  readonly card: ReviewCard;
  readonly reasons: readonly string[];
  readonly asked: boolean;
  readonly onNotice: (message: string) => void;
}

/** One post idea: its headline and where it stands, its words and choices while it is being decided, and its pictures once there are some. */
function PostCard({ group, card, reasons, asked, onNotice }: CardProps): ReactElement {
  const written = card.written;
  const dropped = written?.state === "dropped";
  return (
    <li className={cn("grid gap-3 rounded-xl bg-sunken p-4", dropped && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-display text-[0.9375rem] font-semibold text-ink">{card.headline}</h3>
        {written === null ? null : (
          <span className="text-xs font-semibold text-ink-2">
            {STATE_WORDS[written.state]}
            {written.edited ? ", changed by you" : ""}
          </span>
        )}
      </div>
      {written === null || group.batch === null ? null : <Words batch={group.batch} post={written} locked={asked} />}
      <Pictures card={card} reasons={reasons} asked={asked} onNotice={onNotice} />
    </li>
  );
}

interface PostsPanelProps {
  readonly groups: readonly ReviewGroup[];
  /** The batches whose pictures were already asked for: their choices are final, and the pictures are on their way. */
  readonly drawing?: readonly string[];
  readonly reasons: readonly string[];
}

/**
 * The customer's posts, one card for each idea. A card holds the words for each network while the post is being decided, then the
 * pictures drawn for it, so a post is looked at in one place. Asking for the pictures is the one dark button of a batch, once; the
 * drawing is shown on the cards of the posts that were kept.
 */
export function PostsPanel({ groups, drawing = [], reasons }: PostsPanelProps): ReactElement {
  const draw = useReviewAction();
  // What the last choice means for a post, kept here because a picture moves between states when it is approved or its words change.
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section aria-labelledby="posts-title" className="grid gap-4">
      <div className="min-w-0">
        <h2 id="posts-title" className={SECTION_TITLE}>
          Your posts
        </h2>
        <p className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">Keep the posts you like, drop the others, and change any words. We only draw pictures for the posts you keep, so nothing is spent on the rest. Nothing goes out until you approve its picture.</p>
      </div>
      {notice === null ? null : (
        <p role="status" className="rounded-xl bg-warn-wash px-4 py-3 text-[0.84375rem] font-semibold text-warn">
          {notice}
        </p>
      )}
      {groups.length === 0 ? <p className="text-[0.84375rem] text-ink-2">No posts are waiting for you.</p> : null}
      {groups.map((group) => {
        const asked = drawing.includes(group.batchId);
        const batch = group.batch;
        const kept = batch === null ? 0 : batch.posts.filter((post) => post.state === "kept").length;
        return (
          <div key={group.batchId} className={cn(LIFT, "grid gap-4 p-5")}>
            <ul className="grid gap-3">
              {group.cards.map((card) => (
                <PostCard key={card.key} group={group} card={card} reasons={reasons} asked={asked} onNotice={setNotice} />
              ))}
            </ul>
            {batch === null ? null : (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <button type="button" disabled={draw.pending || kept === 0 || asked} onClick={() => draw.run(drawBatchAction, { batchId: batch.id })} className={SMALL_DARK}>
                  {draw.pending ? "Asking" : asked ? "Drawing your pictures" : "Draw my pictures"}
                </button>
                <span className="text-[0.84375rem] text-ink-2">
                  {asked ? `${kept} of ${batch.posts.length} kept, and final. Each picture appears on its post.` : `${kept} of ${batch.posts.length} kept. Once you ask, these choices are final.`}
                </span>
              </div>
            )}
            {draw.error === null ? null : (
              <p role="alert" className="text-[0.84375rem] font-semibold text-error">
                {draw.error}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
