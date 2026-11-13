"use client";

import { ArrowClockwise, CalendarBlank, CaretLeft, CaretRight, Check, Plus, Prohibit, TextT, X } from "@phosphor-icons/react/dist/ssr";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { decideBatchAction, decidePosterAction, drawBatchAction, moveTopicAction, replaceTopicAction } from "@/legacy-social/review-actions";
import { REJECT_REASON_WORDS, type Poster } from "@/legacy-social/lib/social/ai";
import { CHANNEL_PLATFORMS, dayLabel, PLATFORM_HINTS, PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import type { ReviewCard, ReviewGroup } from "@/legacy-social/lib/social/review-cards";
import { cardsOfWeek, channelTodo, firstOpenWeek, flowWeeks, picturesOn, POST_TIME, weekAsked, type FlowWeek, type ReplaceState } from "@/legacy-social/lib/social/review-flow";
import { ConnectButton } from "./channels-sidebar";
import { ChannelLogo } from "./channel-logo";
import { imageUrl, pictureWord } from "./poster-tile";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";
import { useReviewAction } from "./use-review-action";
import { useTopicDrag } from "./use-topic-drag";

/** A connected account the review screen lists down its side. */
export interface ReviewChannel {
  readonly platform: ChannelPlatform;
  readonly account: string;
}

const ICON_BUTTON = "inline-grid size-7 place-items-center rounded-md border transition-colors disabled:cursor-not-allowed";
const ICON_IDLE = "border-line bg-surface text-ink hover:bg-sunken disabled:opacity-50";
const ICON_PRESSED = "border-ok bg-ok text-on-primary";
const ICON_PRESSED_MUTED = "border-ink-3 bg-ink-3 text-on-primary";
const CHIP = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

const weekTitle = (week: FlowWeek): string => (week.from === "" ? "Your posts" : `Week of ${dayLabel(week.from, { day: "numeric", month: "short" })} to ${dayLabel(week.to, { day: "numeric", month: "short" })}`);

function IconButton({ label, pressed = false, muted = false, disabled = false, onClick, children }: { readonly label: string; readonly pressed?: boolean; /** The pressed look in grey, for a choice that takes something away (drop). */ readonly muted?: boolean; readonly disabled?: boolean; readonly onClick: () => void; readonly children: ReactNode }): ReactElement {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className={cn(ICON_BUTTON, pressed ? (muted ? ICON_PRESSED_MUTED : ICON_PRESSED) : ICON_IDLE)}>
      {children}
    </button>
  );
}

/** The day and time a post goes out, as one chip. Green once the post is approved. */
function DateChip({ day, time, approved = false }: { readonly day: string | null; /** `HH:MM`; 10:00 when the posting service does not say. */ readonly time?: string | null | undefined; readonly approved?: boolean }): ReactElement | null {
  if (day === null) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.8125rem] font-semibold", approved ? "bg-ok-wash text-ok" : "bg-rattan-wash text-rattan-text")}>
      <CalendarBlank size={14} aria-hidden="true" />
      {dayLabel(day.slice(0, 10))}
      <span className="text-xs font-medium opacity-80">{time ?? POST_TIME} IST</span>
    </span>
  );
}

/** One topic of an open week: its headline, the day it goes out, and the choices as icons. */
function TopicRow({
  card,
  locked,
  replace,
  replacementsLeft,
  compact = false,
  moveDays = [],
  onMove,
  dragProps,
}: {
  readonly card: ReviewCard;
  readonly locked: boolean;
  readonly replace: ReplaceState | undefined;
  readonly replacementsLeft: number | null;
  /** A narrow card for a day column of the week. */
  readonly compact?: boolean;
  /** The days this topic may be moved to, for the day picker beside its icons; empty when it cannot move. */
  readonly moveDays?: readonly string[];
  readonly onMove?: (day: string) => void;
  /** Makes the card draggable: the pointer press that picks it up, and whether it is the one being dragged now. */
  readonly dragProps?: { readonly onPointerDown: (event: ReactPointerEvent) => void; readonly dragging: boolean };
}): ReactElement | null {
  const post = card.written;
  const { pending, error, run } = useReviewAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [moving, setMoving] = useState(false);
  const newTopic = useReviewAction();
  if (post === null) return null;
  const batchId = card.batchId;
  const kept = post.state === "kept";
  const dropped = post.state === "dropped";
  const replaced = post.replacedBy != null;
  const inputId = `headline-${batchId}-${post.id}`;
  const headline = (
    <h3 className={cn("min-w-0 break-words", compact ? "text-[0.875rem] font-semibold leading-snug" : "flex-1 basis-64 type-section", dropped ? "text-ink-3" : "text-ink")}>{post.headline}</h3>
  );
  const editor = !editing ? null : (
    <div className="grid gap-2">
      <label htmlFor={inputId} className={compact ? "sr-only" : "text-xs font-semibold text-ink-2"}>
        Headline (it is printed on the picture)
      </label>
      <div className={cn("flex gap-2", compact ? "flex-col" : "flex-wrap")}>
        <input id={inputId} type="text" value={draft} maxLength={120} onChange={(event) => setDraft(event.target.value)} className={cn("min-w-0 rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink", compact ? "h-9 w-full" : "h-10 flex-1")} />
        <div className="flex gap-2">
          <button type="button" disabled={pending || draft.trim() === ""} onClick={() => run(decideBatchAction, { batchId, postId: post.id, action: "edit-headline", headline: draft }, () => setEditing(false))} className={SMALL_DARK}>
            {compact ? "Save" : "Save headline"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={SMALL_SOFT}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
  const icons = locked ? null : (
    <>
      <IconButton label="Keep this topic" pressed={kept} disabled={pending || kept} onClick={() => run(decideBatchAction, { batchId, postId: post.id, action: "keep" })}>
        <Check size={13} weight="bold" aria-hidden="true" />
      </IconButton>
      <IconButton label="Drop this topic" pressed={dropped} muted disabled={pending || dropped} onClick={() => run(decideBatchAction, { batchId, postId: post.id, action: "drop" })}>
        <X size={13} weight="bold" aria-hidden="true" />
      </IconButton>
      <IconButton
        label="Change the headline"
        disabled={pending}
        onClick={() => {
          setDraft(post.headline);
          setEditing(true);
        }}
      >
        <TextT size={13} weight="bold" aria-hidden="true" />
      </IconButton>
      {moveDays.length === 0 || onMove === undefined ? null : (
        <IconButton label="Change the day" pressed={moving} disabled={pending} onClick={() => setMoving(!moving)}>
          <CalendarBlank size={13} weight="bold" aria-hidden="true" />
        </IconButton>
      )}
    </>
  );
  const dayPicker =
    !moving || onMove === undefined ? null : (
      <select
        aria-label="Move this topic to"
        defaultValue=""
        onChange={(event) => {
          if (event.target.value === "") return;
          setMoving(false);
          onMove(event.target.value);
        }}
        className="h-8 w-full rounded-lg border border-ink-2/65 bg-surface px-2 text-[0.8125rem] text-ink"
      >
        <option value="" disabled>
          Move to…
        </option>
        {moveDays.map((day) => (
          <option key={day} value={day}>
            {dayLabel(day)}
          </option>
        ))}
      </select>
    );
  const tags = (
    <>
      <span className={cn(CHIP, kept ? "bg-ok-wash text-ok" : "bg-neutral-wash text-ink-2")}>{kept ? "Kept" : dropped ? "Dropped" : "Not decided"}</span>
      {post.replaces == null ? null : <span className={cn(CHIP, "bg-rattan-wash text-rattan-text")}>New topic</span>}
    </>
  );
  const newTopicBlock =
    !dropped || locked ? null : replaced ? (
      <p className="text-xs text-ink-3">A new topic was written for this day. Look for it in the list.</p>
    ) : replace === "writing" ? (
      <p role="status" className="flex items-center gap-2 text-xs font-semibold text-ink-2">
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-c-growth" aria-hidden="true" />
        Writing a new topic for this day. It appears here when it is ready.
      </p>
    ) : (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          title="Write a new topic for this day"
          aria-label="Write a new topic for this day"
          disabled={newTopic.pending || replacementsLeft === 0}
          onClick={() => newTopic.run(replaceTopicAction, { batchId, postId: post.id })}
          className={cn(SMALL_SOFT, "gap-1.5")}
        >
          <Plus size={14} weight="bold" aria-hidden="true" />
          New topic
        </button>
        <span className="text-xs text-ink-3">
          {replace === "failed" ? "We could not write one this time. You can try again. " : ""}
          {replacementsLeft === null ? "" : replacementsLeft === 0 ? "No new topics are left this week." : `${replacementsLeft} left this week.`}
        </span>
        {newTopic.error === null ? null : (
          <p role="alert" className="w-full text-[0.84375rem] font-semibold text-error">
            {newTopic.error}
          </p>
        )}
      </div>
    );
  const notes = (
    <>
      {post.notDrawn === null ? null : (
        <p role="status" className="rounded-lg bg-warn-wash px-3 py-2 text-xs font-semibold text-warn">
          No picture was made for this post. {post.notDrawn.message}
        </p>
      )}
      {error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {error}
        </p>
      )}
    </>
  );
  if (compact) {
    return (
      <li
        {...(dragProps === undefined ? {} : { onPointerDown: dragProps.onPointerDown })}
        className={cn("flex min-h-44 flex-col gap-2 rounded-xl p-2.5 ring-1", kept ? "bg-surface ring-ok" : dropped ? "bg-surface-subtle ring-line" : "bg-surface ring-line", dragProps !== undefined && "cursor-grab touch-pan-x select-none", dragProps?.dragging === true && "opacity-40")}
      >
        {editing ? editor : headline}
        {dayPicker}
        {newTopicBlock}
        {notes}
        {icons === null ? null : <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">{icons}</div>}
      </li>
    );
  }
  return (
    <li className={cn("grid gap-2.5 rounded-xl bg-surface p-4 ring-1 ring-line", kept && "ring-ok", dropped && "bg-surface-subtle")}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {headline}
        <DateChip day={post.date} time={post.time} />
      </div>
      {editor}
      <div className="flex flex-wrap items-center gap-2">
        {icons}
        {tags}
        <span className="text-xs text-ink-3">Written for {CHANNEL_PLATFORMS.filter((one) => post.captions[one] !== undefined).map((one) => PLATFORM_NAMES[one]).join(", ")}</span>
      </div>
      {newTopicBlock}
      {notes}
    </li>
  );
}

/** The seven days of a week as `YYYY-MM-DD`, from its Monday. */
function daysOfWeek(monday: string): string[] {
  const start = Date.parse(`${monday}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

interface WeekGridProps {
  readonly cards: readonly ReviewCard[];
  readonly week: FlowWeek;
  readonly asked: boolean;
  readonly replacing: Readonly<Record<string, ReplaceState>>;
  /** Today in India, `YYYY-MM-DD`: a topic cannot be moved to a day that has passed or to today. Empty when not known. */
  readonly today: string;
}

const nextDay = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * The topics of a week in seven columns, Monday to Sunday: each topic sits in the column of the day it goes out, with the time by the day.
 * A topic can be dragged to another day of the week (or moved with its day picker) until the week is drawn. A week whose topics carry no
 * day, or one outside it, is listed one under the other instead, so nothing is hidden.
 */
function WeekGrid({ cards, week, asked, replacing, today }: WeekGridProps): ReactElement {
  const mover = useReviewAction();
  /** Where a topic was just moved to, shown at once while the posting service answers. */
  const [moved, setMoved] = useState<Readonly<Record<string, string>>>({});
  const { pending: moving } = mover;
  useEffect(() => {
    if (!moving) setMoved({});
  }, [moving]);
  const written = cards.filter((card) => card.written !== null);
  const days = week.from === "" ? [] : daysOfWeek(week.from);
  const placed = days.length > 0 && written.every((card) => card.written?.date != null && days.includes(card.written.date));
  const dayOf = (card: ReviewCard): string | null => moved[card.postId] ?? card.written?.date ?? null;
  const earliest = today === "" ? "" : nextDay(today);
  /** The days a topic may go to: the other days of its week, from tomorrow on, while the week is open and no move is on its way. */
  const targets = (card: ReviewCard): string[] => {
    const locked = asked && card.written?.notDrawn == null;
    if (locked || moving || !placed) return [];
    return days.filter((day) => day !== dayOf(card) && day >= earliest);
  };
  const move = (card: ReviewCard, day: string): void => {
    setMoved((current) => ({ ...current, [card.postId]: day }));
    mover.run(moveTopicAction, { batchId: card.batchId, postId: card.postId, day });
  };
  const drag = useTopicDrag({
    allowed: (key, day) => {
      const card = written.find((one) => one.key === key);
      return card !== undefined && targets(card).includes(day);
    },
    onDrop: (key, day) => {
      const card = written.find((one) => one.key === key);
      if (card !== undefined) move(card, day);
    },
  });
  const row = (card: ReviewCard, compact: boolean): ReactElement => {
    const open = targets(card);
    return <TopicRow key={card.key} card={card} compact={compact} locked={asked && card.written?.notDrawn == null} replace={replacing[card.postId]} replacementsLeft={week.replacementsLeft} moveDays={open} onMove={(day) => move(card, day)} {...(open.length > 0 && compact ? { dragProps: { onPointerDown: (event: ReactPointerEvent) => drag.begin(event, card.key, card.headline), dragging: drag.dragging === card.key } } : {})} />;
  };
  if (!placed) return <ul className="grid gap-3">{cards.map((card) => row(card, false))}</ul>;
  return (
    <div className="grid gap-2">
      {mover.error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {mover.error}
        </p>
      )}
      {mover.notice === null ? null : (
        <p role="status" className="rounded-lg bg-warn-wash px-3 py-2 text-xs font-semibold text-warn">
          {mover.notice}
        </p>
      )}
      <div className="overflow-x-auto pb-2">
        <div className="grid grid-cols-[repeat(7,minmax(9.5rem,1fr))] gap-2.5">
          {days.map((day, index) => {
            const here = written.filter((card) => dayOf(card) === day);
            const landing = drag.dragging !== null && drag.over === day;
            return (
              <div key={day} data-drop-day={day} className={cn("min-w-0 rounded-xl transition-colors", landing && "bg-rattan-wash/60 ring-2 ring-rattan-text")}>
                <p className="mb-1.5 text-[0.8125rem] font-bold leading-tight text-ink">
                  {dayLabel(day, { weekday: "short" })}
                  <span className="block text-xs font-semibold text-ink-3">
                    {dayLabel(day, { day: "numeric", month: "short" })}
                    {here.length === 0 ? "" : ` ${here[0]?.written?.time ?? POST_TIME} IST`}
                  </span>
                </p>
                {here.length === 0 ? (
                  <p className="grid min-h-44 place-items-center rounded-xl border border-dashed border-line px-2 text-center text-xs text-ink-3">{index > 4 ? "Weekend, no post" : "No post this day"}</p>
                ) : (
                  <ul className="grid gap-2">{here.map((card) => row(card, true))}</ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {drag.ghost}
    </div>
  );
}

/** Asks for the pictures of a week, after saying what it makes and what it locks. */
function DrawBar({ week, kept, total, retry }: { readonly week: FlowWeek; readonly kept: number; readonly total: number; readonly retry: boolean }): ReactElement {
  const draw = useReviewAction();
  const dialog = useRef<HTMLDialogElement>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const window = dialog.current;
    if (window === null) return;
    if (asking && !window.open) window.showModal();
    if (!asking && window.open) window.close();
  }, [asking]);
  const fields = { batchId: week.batchId, ...(week.whole ? {} : { week: week.from }), ...(retry ? { retry: "1" } : {}) };
  return (
    <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/95 px-1 py-3 backdrop-blur">
      <p className="max-w-2xl text-[0.84375rem] text-ink-2">
        {retry ? (
          <>Change the headline or drop a topic that got no picture, then draw again. Posts that have pictures stay as they are.</>
        ) : (
          <>
            <b className="text-ink">
              {kept} of {total} kept.
            </b>{" "}
            Drawing makes {kept} {kept === 1 ? "picture" : "pictures"} for each connected channel. Once you draw, this week&rsquo;s choices are final.
          </>
        )}
      </p>
      <button type="button" disabled={draw.pending || (!retry && kept === 0)} onClick={() => (retry ? draw.run(drawBatchAction, fields) : setAsking(true))} className={SMALL_DARK}>
        {draw.pending ? "Asking" : retry ? "Draw the missing pictures" : `Draw pictures for ${kept} kept`}
      </button>
      {draw.error === null ? null : (
        <p role="alert" className="w-full text-[0.84375rem] font-semibold text-error">
          {draw.error}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={`draw-title-${week.key}`}
        onCancel={(event) => {
          event.preventDefault();
          setAsking(false);
        }}
        className="m-auto w-[min(calc(100%-2rem),28rem)] rounded-2xl border-0 bg-surface p-6 text-ink shadow-[0_24px_60px_-20px_rgb(21_22_26/0.5)] backdrop:bg-[rgb(17_20_24/0.5)]"
      >
        <h3 id={`draw-title-${week.key}`} className="type-section text-ink">
          Draw pictures for {kept} kept {kept === 1 ? "topic" : "topics"}?
        </h3>
        <p className="mt-2 text-[0.875rem] text-ink-2">This makes {kept} {kept === 1 ? "picture" : "pictures"} for each connected channel.</p>
        <p className="mt-3 text-[0.875rem] text-ink-2">
          <b className="text-ink">It locks this week.</b> After you draw, you can no longer keep, drop or change the headline of any topic of this week
          {total - kept > 0 ? `, so the ${total - kept} you did not keep stay out.` : "."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={draw.pending}
            onClick={() =>
              draw.run(drawBatchAction, fields, () => {
                setAsking(false);
              })
            }
            className={SMALL_DARK}
          >
            Draw pictures
          </button>
          <button type="button" onClick={() => setAsking(false)} className={SMALL_SOFT}>
            Go back
          </button>
        </div>
      </dialog>
    </div>
  );
}

/** A post as it will look on the real account of its channel: the picture and the words, in that network's own layout. */
function PostPreview({ poster, account, day, time }: { readonly poster: Poster; readonly account: string; readonly day: string | null; readonly time: string }): ReactElement {
  const when = day === null ? "" : `${dayLabel(day.slice(0, 10))} · ${time} IST`;
  const picture = (
    // The picture is served by social-auto through our own route, which Next's image optimiser cannot reach.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl(poster.id)} alt={`Picture for ${PLATFORM_NAMES[poster.network]}: ${poster.headline}`} className="w-full bg-sunken object-cover" style={{ aspectRatio: `${poster.width} / ${poster.height}` }} />
  );
  const head = (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <ChannelLogo platform={poster.network} medium />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[0.84375rem] font-semibold text-ink" title={account}>
          {account}
        </p>
        <p className="text-xs text-ink-3">{poster.network === "linkedin" ? `Post · ${when}` : poster.network === "google" ? `Update · ${when}` : when}</p>
      </div>
    </div>
  );
  const words = <p className="whitespace-pre-wrap break-words px-3 pb-3 text-[0.84375rem] leading-relaxed text-ink">{poster.caption}</p>;
  if (poster.network === "instagram") {
    return (
      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        {head}
        {picture}
        <p className="whitespace-pre-wrap break-words px-3 py-3 text-[0.84375rem] leading-relaxed text-ink">
          <b>{account}</b> {poster.caption}
        </p>
      </div>
    );
  }
  if (poster.network === "google") {
    return (
      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        {head}
        {picture}
        <div className="pt-3">{words}</div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
      {head}
      {words}
      {picture}
    </div>
  );
}

/** One picture of the channel being looked at: its preview, where it stands, and approve, draw again, or send back. */
function PictureCard({ poster, account, day, time, reasons }: { readonly poster: Poster; readonly account: string; readonly day: string | null; readonly time: string; readonly reasons: readonly string[] }): ReactElement {
  const { pending, error, run } = useReviewAction();
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState(reasons[0] ?? "other");
  const approved = poster.status === "approved";
  const blocked = poster.status === "blocked";
  const held = poster.status === "held";
  const putAway = poster.status === "rejected" || poster.status === "expired";
  return (
    <li className="grid content-start gap-3 rounded-xl bg-sunken p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3 className="min-w-0 flex-1 basis-40 break-words text-[0.9375rem] font-semibold leading-snug text-ink">{poster.headline}</h3>
        <DateChip day={day} time={time} approved={approved} />
      </div>
      <PostPreview poster={poster} account={account} day={day} time={time} />
      {poster.notice === undefined ? null : <p className="text-xs text-ink-2">{poster.notice}</p>}
      {sendingBack ? (
        <div className="grid gap-2">
          <label htmlFor={`reason-${poster.id}`} className="text-xs font-semibold text-ink-2">
            What is wrong with it
          </label>
          <select id={`reason-${poster.id}`} value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink">
            {(reasons.length === 0 ? ["other"] : reasons).map((one) => (
              <option key={one} value={one}>
                {REJECT_REASON_WORDS[one] ?? "Something else"}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(decidePosterAction, { action: "reject", id: poster.id, reason }, () => setSendingBack(false))} className={SMALL_SOFT}>
              Send it back
            </button>
            <button type="button" onClick={() => setSendingBack(false)} className={SMALL_SOFT}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(CHIP, approved ? "bg-ok-wash text-ok" : blocked || putAway ? "bg-neutral-wash text-ink-2" : "bg-warn-wash text-warn")}>{pictureWord(poster)}</span>
          {approved ? (
            <button type="button" disabled={pending} onClick={() => run(decidePosterAction, { action: "withdraw", id: poster.id })} className={SMALL_SOFT}>
              Take back approval
            </button>
          ) : blocked || putAway ? null : (
            <button type="button" disabled={pending} onClick={() => run(decidePosterAction, { action: "approve", id: poster.id })} className={cn(SMALL_DARK, "!bg-ok hover:!bg-ok")}>
              <Check size={14} weight="bold" aria-hidden="true" />
              {held ? "Confirm again" : "Approve"}
            </button>
          )}
          {poster.canRedraw && !approved ? (
            <IconButton label="Draw this picture again" disabled={pending} onClick={() => run(decidePosterAction, { action: "redraw", id: poster.id })}>
              <ArrowClockwise size={13} weight="bold" aria-hidden="true" />
            </IconButton>
          ) : null}
          {approved || putAway ? null : blocked ? (
            <IconButton label="Put it away" disabled={pending} onClick={() => run(decidePosterAction, { action: "reject", id: poster.id, reason: "other" })}>
              <Prohibit size={13} weight="bold" aria-hidden="true" />
            </IconButton>
          ) : (
            <IconButton label="Not this one" disabled={pending} onClick={() => setSendingBack(true)}>
              <Prohibit size={13} weight="bold" aria-hidden="true" />
            </IconButton>
          )}
        </div>
      )}
      {error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {error}
        </p>
      )}
    </li>
  );
}

/** The pictures of a week on one channel, or a note that they are on their way. */
function PicturesStage({ cards, week, channel, account, reasons }: { readonly cards: readonly ReviewCard[]; readonly week: FlowWeek; readonly channel: ChannelPlatform; readonly account: string; readonly reasons: readonly string[] }): ReactElement {
  const [approvingAll, startApproving] = useTransition();
  const [approveError, setApproveError] = useState<string | null>(null);
  const pictures = picturesOn(cards, channel);
  const waiting = pictures.filter((poster) => poster.status === "pending" || poster.status === "held");
  const writtenOf = (poster: Poster) => cards.find((card) => card.postId === poster.postId)?.written ?? null;
  /** The day a picture's post goes out: what the posting service says of the picture, else of the written post. */
  const dayOf = (poster: Poster): string | null => poster.date ?? writtenOf(poster)?.date ?? null;
  const timeOf = (poster: Poster): string => poster.time ?? writtenOf(poster)?.time ?? POST_TIME;
  /** Approves the waiting pictures of this channel one after the other, and stops at the first one that is refused. */
  const approveAll = (): void => {
    setApproveError(null);
    startApproving(async () => {
      try {
        for (const poster of waiting) {
          const form = new FormData();
          form.set("action", "approve");
          form.set("id", poster.id);
          const result = await decidePosterAction(form);
          if (result.status === "error") {
            setApproveError(result.message);
            return;
          }
        }
      } catch {
        setApproveError("That did not work. Check your connection and try again.");
      }
    });
  };
  const keptWithout = cards.filter((card) => card.written?.state === "kept" && card.pictures.length === 0);
  const dropped = cards.filter((card) => card.written?.state === "dropped");
  return (
    <div className="grid gap-4">
      {pictures.length === 0 && week.state === "drawing" ? (
        <div role="status" className="grid gap-2 rounded-xl bg-surface p-4 ring-1 ring-line">
          <p className="text-[0.84375rem] font-semibold text-ink">Drawing your pictures</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-c-growth" />
          </div>
          <p className="text-xs text-ink-3">They will appear here when they are ready.</p>
        </div>
      ) : null}
      {pictures.length === 0 && week.state !== "drawing" ? <p className="rounded-xl bg-surface p-4 text-[0.84375rem] text-ink-2 ring-1 ring-line">No picture was drawn for {PLATFORM_NAMES[channel]} this week.</p> : null}
      {pictures.length === 0 ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-3">
            {waiting.length} waiting · {pictures.length - waiting.length} approved
          </span>
          {waiting.length > 1 ? (
            <button type="button" disabled={approvingAll} onClick={approveAll} className={SMALL_DARK}>
              Approve all {waiting.length} for {PLATFORM_NAMES[channel]}
            </button>
          ) : null}
        </div>
      )}
      {approveError === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {approveError}
        </p>
      )}
      <ul className="grid items-start gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {pictures.map((poster) => (
          <PictureCard key={poster.id} poster={poster} account={account} day={dayOf(poster)} time={timeOf(poster)} reasons={reasons} />
        ))}
      </ul>
      {keptWithout.length === 0 ? null : <p className="text-xs text-ink-3">Still without a picture: {keptWithout.map((card) => card.headline).join(" · ")}.</p>}
      {dropped.length === 0 ? null : <p className="text-xs text-ink-3">Dropped, nothing drawn: {dropped.map((card) => card.headline).join(" · ")}.</p>}
    </div>
  );
}

/** Every topic of a week in one table: what was chosen, and where each channel's picture stands. */
function Overview({ cards, week, channels }: { readonly cards: readonly ReviewCard[]; readonly week: FlowWeek; readonly channels: readonly ReviewChannel[] }): ReactElement {
  return (
    <div className="grid gap-3">
      <p className="text-[0.84375rem] text-ink-2">One line for each topic. Pick a channel on the left to see its posts the way they will look there.</p>
      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[0.84375rem]">
          <thead>
            <tr className="bg-sunken text-xs text-ink-2">
              <th className="px-3 py-2 font-semibold">Topic</th>
              <th className="px-3 py-2 font-semibold">Your choice</th>
              {channels.map((channel) => (
                <th key={channel.platform} className="px-3 py-2 font-semibold">
                  {PLATFORM_NAMES[channel.platform]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <tr key={card.key} className="border-t border-line align-top">
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-ink">{card.headline}</p>
                  <div className="mt-1">
                    <DateChip day={card.written?.date ?? null} time={card.written?.time} />
                  </div>
                </td>
                <td className="px-3 py-2.5 text-ink-2">{card.written === null ? "Kept" : card.written.state === "kept" ? "Kept" : card.written.state === "dropped" ? "Dropped" : "Not decided"}</td>
                {channels.map((channel) => {
                  const poster = card.pictures.find((one) => one.network === channel.platform);
                  return (
                    <td key={channel.platform} className="px-3 py-2.5 text-ink-2">
                      {poster === undefined ? (weekAsked(week) && card.written?.state === "kept" ? "Drawing" : "Not drawn") : pictureWord(poster)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Which week of the plan this is, in words, when it is this week or the next. */
function weekWhen(week: FlowWeek, today: string): string | null {
  if (today === "" || week.from === "") return null;
  if (week.from <= today && today <= week.to) return "This week";
  const nextMonday = new Date(Date.parse(`${week.from}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  return nextMonday <= today && today < week.from ? "Next week" : null;
}

/** One week at a time with an arrow either side, instead of every week laid out in a row. */
function WeekNav({ weeks, week, today, onPick }: { readonly weeks: readonly FlowWeek[]; readonly week: FlowWeek; readonly today: string; readonly onPick: (key: string) => void }): ReactElement {
  const index = weeks.findIndex((one) => one.key === week.key);
  const before = weeks[index - 1];
  const after = weeks[index + 1];
  const when = weekWhen(week, today);
  const arrow = "inline-grid size-8 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <nav aria-label="Week" className="flex items-center gap-1 self-start">
      <button type="button" aria-label="Earlier week" disabled={before === undefined} onClick={() => before !== undefined && onPick(before.key)} className={arrow}>
        <CaretLeft size={16} weight="bold" aria-hidden="true" />
      </button>
      <p aria-live="polite" className="m-0 min-w-44 text-center text-[0.9375rem] font-semibold text-ink">
        {weekTitle(week).replace(/^Week of /, "")}
        {when === null ? null : <span className="ml-2 text-xs font-medium text-rattan-text">{when}</span>}
      </p>
      <button type="button" aria-label="Later week" disabled={after === undefined} onClick={() => after !== undefined && onPick(after.key)} className={arrow}>
        <CaretRight size={16} weight="bold" aria-hidden="true" />
      </button>
    </nav>
  );
}

const STEPS = ["Topics", "Pictures", "Approved"] as const;

/** Where the week stands, drawn like the Posts and Analytics tabs: plain words with a line under the one she is on, and a tick on the ones done. */
function Steps({ stage }: { readonly stage: 0 | 1 | 2 }): ReactElement {
  return (
    <ol className="m-0 flex list-none flex-wrap gap-1 border-b border-line p-0" aria-label="Where this week stands">
      {STEPS.map((name, index) => (
        <li
          key={name}
          aria-current={index === stage ? "step" : undefined}
          className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-[0.875rem] font-semibold", index === stage ? "border-rattan-text text-ink" : index < stage ? "border-transparent text-ink-2" : "border-transparent text-ink-3")}
        >
          {index < stage ? <Check size={13} weight="bold" aria-hidden="true" /> : null}
          {name}
        </li>
      ))}
    </ol>
  );
}

interface ReviewFlowProps {
  readonly groups: readonly ReviewGroup[];
  /** The batches whose pictures were already asked for. */
  readonly drawing?: readonly string[];
  readonly reasons: readonly string[];
  /** The connected accounts, down the side. */
  readonly channels: readonly ReviewChannel[];
  /** The dropped posts with a new topic being written, or whose last try wrote nothing, by post id. */
  readonly replacing?: Readonly<Record<string, ReplaceState>>;
  /** Today in India, `YYYY-MM-DD`, for the days a topic may be moved to. */
  readonly today?: string;
  readonly children: ReactNode;
}

interface Flow {
  readonly groups: readonly ReviewGroup[];
  readonly reasons: readonly string[];
  readonly channels: readonly ReviewChannel[];
  readonly replacing: Readonly<Record<string, ReplaceState>>;
  readonly today: string;
  readonly weeks: readonly FlowWeek[];
  /** The week being looked at, or undefined when there are no posts. */
  readonly week: FlowWeek | undefined;
  readonly cards: readonly ReviewCard[];
  readonly channel: "all" | ChannelPlatform;
  readonly setChannel: (channel: "all" | ChannelPlatform) => void;
  readonly setWeekKey: (key: string) => void;
}

const FlowContext = createContext<Flow | null>(null);

function useFlow(): Flow {
  const value = useContext(FlowContext);
  if (value === null) throw new Error("The review screen's parts must be inside ReviewFlowProvider");
  return value;
}

/** Holds which channel and which week the customer is looking at, for the channels column and the workspace beside it. */
export function ReviewFlowProvider({ groups, drawing = [], reasons, channels, replacing = {}, today = "", children }: ReviewFlowProps): ReactElement {
  const weeks = useMemo(() => flowWeeks(groups, drawing), [groups, drawing]);
  const [weekKey, setWeekKey] = useState<string | null>(() => firstOpenWeek(groups, flowWeeks(groups, drawing)));
  const [channel, setChannel] = useState<"all" | ChannelPlatform>(channels[0]?.platform ?? "all");
  const week = weeks.find((one) => one.key === weekKey) ?? weeks[0];
  const cards = useMemo(() => (week === undefined ? [] : cardsOfWeek(groups, week)), [groups, week]);
  const value = useMemo<Flow>(() => ({ groups, reasons, channels, replacing, today, weeks, week, cards, channel, setChannel, setWeekKey }), [groups, reasons, channels, replacing, today, weeks, week, cards, channel]);
  return <FlowContext value={value}>{children}</FlowContext>;
}

/**
 * The second sidebar of the review page, drawn like the one on the Posts and Analytics pages: against the menu, the channels down it, and a
 * Connect button for each network with no account yet. A row shows what is left to do in the week being looked at.
 */
export function ReviewChannelsColumn(): ReactElement {
  const { channels, week, cards, channel, setChannel } = useFlow();
  const missing = CHANNEL_PLATFORMS.filter((platform) => !channels.some((one) => one.platform === platform));
  return (
    <aside
      id="channels"
      aria-labelledby="review-channels-title"
      className="border-t border-line bg-surface p-4 pb-28 md:px-8 lg:sticky lg:top-topbar lg:h-dvh lg:w-[13rem] lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-r lg:px-4 lg:pt-4 lg:pb-8"
    >
      <h2 id="review-channels-title" className="px-1 type-section text-ink">
        Channels
      </h2>
      <ul className="mt-3 grid gap-0.5">
        <li>
          <button type="button" aria-pressed={channel === "all"} onClick={() => setChannel("all")} className={cn("grid w-full grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-sunken", channel === "all" && "bg-sunken")}>
            <span className="grid size-7 place-items-center rounded-md bg-ink text-[0.6875rem] font-bold text-on-primary">All</span>
            <span className="min-w-0">
              <span className="block truncate text-[0.84375rem] font-semibold leading-tight text-ink">All channels</span>
              <span className="mt-0.5 block text-xs text-ink-2">The whole week</span>
            </span>
          </button>
        </li>
        {channels.map((one) => {
          const todo = channelTodo(cards, week, one.platform);
          return (
            <li key={one.platform}>
              <button type="button" aria-pressed={channel === one.platform} onClick={() => setChannel(one.platform)} className={cn("grid w-full grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-sunken", channel === one.platform && "bg-sunken")}>
                <ChannelLogo platform={one.platform} medium />
                <span className="min-w-0">
                  <span title={one.account} className="block truncate text-[0.84375rem] font-semibold leading-tight text-ink">
                    {one.account}
                    <span className="sr-only">, {PLATFORM_NAMES[one.platform]}</span>
                  </span>
                  <span className={cn("mt-0.5 block truncate text-xs", todo.count > 0 ? "font-semibold text-rattan-text" : "text-ink-2")}>{todo.words}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {missing.length === 0 ? null : (
        <section aria-labelledby="review-add-channel-title" className="mt-4 grid gap-2">
          <h3 id="review-add-channel-title" className="px-1 text-xs font-semibold text-ink-2">
            {channels.length === 0 ? "Connect your accounts" : "Add a channel"}
          </h3>
          {missing.map((platform) => (
            <div key={platform} className="grid gap-1">
              <ConnectButton platform={platform} label={`Connect ${platform === "google" ? "Google" : PLATFORM_NAMES[platform]}`} logo />
              <span className="px-1 text-xs text-ink-3">{PLATFORM_HINTS[platform]}</span>
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}

/**
 * The part of the review screen beside the channels column: for the channel picked, the topics of a week as headlines to keep or drop,
 * then (once the week is drawn) each picture as it will look on that account, to approve. "All channels" is one table of the week.
 */
export function ReviewWorkspace(): ReactElement {
  const { channels, reasons, replacing, today, week, cards, channel, weeks, setWeekKey } = useFlow();
  if (week === undefined) return <p className="text-[0.84375rem] text-ink-2">No posts are waiting for you.</p>;
  const asked = weekAsked(week);
  const missing = week.state === "not_drawn" || cards.some((card) => card.written?.notDrawn != null);
  const keptCount = cards.filter((card) => card.written?.state === "kept").length;
  const approvedAll = asked && cards.some((card) => card.pictures.length > 0) && cards.every((card) => card.pictures.every((poster) => poster.status === "approved" || poster.status === "rejected" || poster.status === "expired"));
  const stage: 0 | 1 | 2 = !asked ? 0 : approvedAll ? 2 : 1;
  const picked = channel === "all" ? undefined : channels.find((one) => one.platform === channel);
  return (
    <section aria-label={picked === undefined ? "All channels" : PLATFORM_NAMES[picked.platform]} className="grid min-w-0 content-start gap-4">
      <div>
        <h2 className="type-section text-ink">{picked === undefined ? "All channels" : `${PLATFORM_NAMES[picked.platform]} · ${picked.account}`}</h2>
        <p className="mt-1 type-meta">{asked ? "Your pictures and words, as they will look on this account." : "First the topics, as headlines. Pictures come after you decide."}</p>
      </div>
      <WeekNav weeks={weeks} week={week} today={today} onPick={setWeekKey} />
      <Steps stage={stage} />
      {channel === "all" ? (
        <Overview cards={cards} week={week} channels={channels} />
      ) : asked && !missing ? (
        picked === undefined ? null : <PicturesStage cards={cards} week={week} channel={picked.platform} account={picked.account} reasons={reasons} />
      ) : (
        <>
          {asked && picked !== undefined ? <PicturesStage cards={cards} week={week} channel={picked.platform} account={picked.account} reasons={reasons} /> : null}
          <WeekGrid cards={cards} week={week} asked={asked} replacing={replacing} today={today} />
          <DrawBar week={week} kept={keptCount} total={cards.length} retry={asked || missing} />
        </>
      )}
    </section>
  );
}
