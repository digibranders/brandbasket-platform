"use client";

import { useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { decideBatchAction, decidePosterAction, drawBatchAction } from "@/legacy-social/review-actions";
import { LIFT, SECTION_TITLE } from "@/legacy-social/classes";
import type { BatchWeek, Poster, TopicNetwork, WrittenBatch, WrittenPost } from "@/legacy-social/lib/social/ai";
import { CHANNEL_PLATFORMS, dayLabel, PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { MAX_CAPTION_LENGTH } from "@/legacy-social/lib/social/new-post";
import type { ReviewCard, ReviewGroup } from "@/legacy-social/lib/social/review-cards";
import { ChannelLogo } from "./channel-logo";
import { imageUrl, pictureWord, PosterTile } from "./poster-tile";
import { SMALL_DARK, SMALL_WHITE } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

const STATE_WORDS = { pending: "Not decided", kept: "Kept", dropped: "Dropped" } as const;

/** Where one week of a plan stands, in the customer's words. */
const WEEK_WORDS: Readonly<Record<BatchWeek["state"], string>> = {
  waiting: "Open: keep or drop, then draw",
  drawing: "Drawing its pictures",
  drawn: "Drawn, choices are final",
  not_drawn: "No picture was made: change or drop the topics, then draw again",
  lapsed: "Passed before its pictures were drawn",
  empty: "No posts could be written for this week",
};

/** The customer's words for where one channel's picture stands when it is not drawn yet. Null when there is nothing to say (it has a picture, or it is told elsewhere). */
export function pictureStateWords(state: TopicNetwork): string | null {
  const name = PLATFORM_NAMES[state.network];
  switch (state.pictureState) {
    case "needs_connection":
      return `Connect ${name} to get a picture for it.`;
    case "waiting":
      return state.drawsOn === undefined ? `${name}: the picture is drawn when you press the draw button for this week.` : `${name}: the picture is drawn on ${dayLabel(state.drawsOn, { weekday: "long", day: "numeric", month: "long" })}.`;
    case "drawing":
      return `${name}: drawing the picture now.`;
    case "limit_reached":
      return `${name}: no pictures are left this week. It is drawn as soon as there is room.`;
    default:
      return null;
  }
}

const dayWords = (day: string): string => dayLabel(day, { weekday: "short", day: "numeric", month: "short" });

const weekTitle = (week: BatchWeek): string => `Week of ${dayLabel(week.from, { day: "numeric", month: "short" })} to ${dayLabel(week.to, { day: "numeric", month: "short" })}`;

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
  const [editingHeadline, setEditingHeadline] = useState(false);
  const [headlineDraft, setHeadlineDraft] = useState("");
  // The posting service says in its own words when a headline is too weak to be drawn.
  const weakHeadline = post.advice !== null && /^weak headline/i.test(post.advice);
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
          <textarea id={`words-${batch.id}-${post.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} className="w-full rounded-lg border border-ink-2/65 bg-surface px-3 py-2.5 text-[0.875rem] leading-relaxed text-ink" />
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
        <p className="whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed text-ink">{words}</p>
      )}
      {post.notDrawn === null ? null : (
        <p role="status" className="rounded-lg bg-warn-wash px-3 py-2 text-xs font-semibold text-warn">
          No picture was made for this post. {post.notDrawn.message}
        </p>
      )}
      {post.notDrawn !== null && post.notDrawn.code === "HEADLINE_TOO_WEAK" ? null : weakHeadline ? (
        <p role="status" className="rounded-lg bg-warn-wash px-3 py-2 text-xs font-semibold text-warn">
          This headline is weak, so no picture will be drawn for it. Change the headline or drop the post. {post.advice}
        </p>
      ) : post.advice === null ? null : (
        <p className="text-xs text-ink-3">{post.advice}</p>
      )}
      {editingHeadline ? (
        <div className="grid gap-2">
          <label htmlFor={`headline-${batch.id}-${post.id}`} className="text-xs font-semibold text-ink-2">
            Headline (it is printed on the picture)
          </label>
          <input id={`headline-${batch.id}-${post.id}`} type="text" value={headlineDraft} maxLength={120} onChange={(event) => setHeadlineDraft(event.target.value)} className="h-10 w-full rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || headlineDraft.trim() === ""}
              onClick={() => run(decideBatchAction, { batchId: batch.id, postId: post.id, action: "edit-headline", headline: headlineDraft }, () => setEditingHeadline(false))}
              className={SMALL_WHITE}
            >
              Save headline
            </button>
            <button type="button" onClick={() => setEditingHeadline(false)} className={SMALL_WHITE}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {locked || editing || editingHeadline ? null : (
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
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setHeadlineDraft(post.headline);
              setEditingHeadline(true);
            }}
            className={SMALL_WHITE}
          >
            Change the headline
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
        <h3 className="min-w-0 break-words type-section text-ink">{card.headline}</h3>
        {written === null ? null : (
          <span className="text-xs font-semibold text-ink-2">
            {STATE_WORDS[written.state]}
            {written.edited ? ", changed by you" : ""}
          </span>
        )}
      </div>
      {written === null || group.batch === null ? null : <Words batch={group.batch} post={written} locked={asked} />}
      <Pictures card={card} reasons={reasons} asked={asked} onNotice={onNotice} />
      {written?.state !== "kept" ? null : (
        <ul className="grid gap-0.5">
          {card.states.flatMap((state) => {
            const words = pictureStateWords(state);
            return words === null ? [] : [<li key={state.network} className="text-xs text-ink-2">{words}</li>];
          })}
        </ul>
      )}
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
        const weeks = batch?.weeks ?? null;
        return (
          <div key={group.batchId} className={cn(LIFT, "grid gap-4 p-5")}>
            {weeks === null || batch === null ? (
              <>
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
              </>
            ) : (
              <>
                {weeks.map((week) => {
                  const cards = group.cards.filter((card) => week.postIds.includes(card.postId));
                  // A week being drawn or drawn is final, except a kept topic that got no picture: that one is open again.
                  const weekAsked = week.state === "drawing" || week.state === "drawn";
                  const keptHere = batch.posts.filter((post) => week.postIds.includes(post.id) && post.state === "kept").length;
                  const missing = week.notDrawn.filter((entry) => batch.posts.some((post) => post.id === entry.postId && post.state === "kept")).length;
                  return (
                    <section key={week.from} aria-label={weekTitle(week)} className="grid gap-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                        <h3 className="type-section text-ink">{weekTitle(week)}</h3>
                        <span className="text-xs font-semibold text-ink-2">{WEEK_WORDS[week.state]}</span>
                      </div>
                      <ul className="grid gap-3">
                        {cards.map((card) => (
                          <PostCard key={card.key} group={group} card={card} reasons={reasons} asked={weekAsked && card.written?.notDrawn == null} onNotice={setNotice} />
                        ))}
                      </ul>
                      {week.missingDays.length === 0 ? null : (
                        <p role="status" className="rounded-lg bg-warn-wash px-3 py-2 text-xs font-semibold text-warn">
                          {week.state === "empty" ? "No posts could be written for this week." : `No post could be written for ${week.missingDays.map(dayWords).join(", ")}.`}
                        </p>
                      )}
                      {week.state !== "not_drawn" && week.notDrawn.length === 0 ? null : (
                        <div className="flex flex-wrap items-center gap-3">
                          <button type="button" disabled={draw.pending || missing === 0} onClick={() => draw.run(drawBatchAction, { batchId: batch.id, week: week.from, retry: "1" })} className={SMALL_DARK}>
                            {draw.pending ? "Asking" : "Draw the missing pictures"}
                          </button>
                          <span className="text-[0.84375rem] text-ink-2">
                            {missing} {missing === 1 ? "post has" : "posts have"} no picture yet. Change the headline or the words, or drop it, then draw again. Posts that have pictures stay as they are.
                          </span>
                        </div>
                      )}
                      {week.state !== "waiting" ? null : (
                        <div className="flex flex-wrap items-center gap-3">
                          <button type="button" disabled={draw.pending || keptHere === 0} onClick={() => draw.run(drawBatchAction, { batchId: batch.id, week: week.from })} className={SMALL_DARK}>
                            {draw.pending ? "Asking" : "Draw this week's pictures"}
                          </button>
                          <span className="text-[0.84375rem] text-ink-2">{keptHere} of {week.postIds.length} kept. Once you ask, this week's choices are final. The other weeks stay open.</span>
                        </div>
                      )}
                    </section>
                  );
                })}
                {/* A picture whose post is in no week (which should not happen) is still shown, so nothing is hidden. */}
                {group.cards.some((card) => !weeks.some((week) => week.postIds.includes(card.postId))) ? (
                  <ul className="grid gap-3">
                    {group.cards
                      .filter((card) => !weeks.some((week) => week.postIds.includes(card.postId)))
                      .map((card) => (
                        <PostCard key={card.key} group={group} card={card} reasons={reasons} asked onNotice={setNotice} />
                      ))}
                  </ul>
                ) : null}
              </>
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
