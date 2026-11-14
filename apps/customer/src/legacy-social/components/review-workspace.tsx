"use client";

import { ArrowClockwise, CalendarBlank, CaretDown, CaretLeft, CaretRight, Check, Plus, Prohibit, TextT, X } from "@phosphor-icons/react/dist/ssr";
import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { askTopicAction, decideBatchAction, decideCarouselAction, drawCarouselAction, moveCarouselAction, decidePosterAction, drawBatchAction, moveTopicAction, replaceTopicAction } from "@/legacy-social/review-actions";
import { REJECT_REASON_WORDS, TOPIC_NOT_MADE_WORDS, type Poster, type TopicRequest, type WrittenBatch } from "@/legacy-social/lib/social/ai";
import { CHANNEL_PLATFORMS, dayLabel, PLATFORM_HINTS, PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { CHANNEL_PARAM, channelParamOf, rememberChannel } from "@/legacy-social/lib/social/channel-param";
import type { ReviewCard, ReviewGroup } from "@/legacy-social/lib/social/review-cards";
import { cardsOfWeek, channelTodo, firstOpenWeek, flowWeeks, picturesOn, POST_TIME, postFinal, weekAsked, type FlowWeek, type ReplaceState } from "@/legacy-social/lib/social/review-flow";
import { ConnectButton } from "./channels-sidebar";
import { AddChannelChoice } from "./add-channel-choice";
import { CarouselPictures, CarouselTopic, carouselInWeek, decisionOf, sendBackReason, slideHeadlines, type WeekCarousel } from "./carousel-week";
import { carouselMovable } from "@/legacy-social/lib/social/carousel";
import type { PostingDays } from "@/legacy-social/lib/social/schedule";
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

const ICON_BUTTON = "inline-grid size-6 shrink-0 place-items-center rounded-md border transition-colors disabled:cursor-not-allowed";
const ICON_IDLE = "border-line bg-surface text-ink hover:bg-sunken disabled:opacity-50";
const ICON_PRESSED = "border-ok bg-ok text-on-primary";
const ICON_PRESSED_MUTED = "border-ink-3 bg-ink-3 text-on-primary";

const weekTitle = (week: FlowWeek): string => (week.from === "" ? "Your posts" : `Week of ${dayLabel(week.from, { day: "numeric", month: "short" })} to ${dayLabel(week.to, { day: "numeric", month: "short" })}`);

function IconButton({ label, pressed = false, muted = false, disabled = false, onClick, children }: { readonly label: string; readonly pressed?: boolean; /** The pressed look in grey, for a choice that takes something away (drop). */ readonly muted?: boolean; readonly disabled?: boolean; readonly onClick: () => void; readonly children: ReactNode }): ReactElement {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className={cn(ICON_BUTTON, pressed ? (muted ? ICON_PRESSED_MUTED : ICON_PRESSED) : ICON_IDLE)}>
      {children}
    </button>
  );
}

/** The day and time a post goes out, in plain words. Green once the post is approved. */
function DateChip({ day, time, approved = false }: { readonly day: string | null; /** `HH:MM`; 10:00 when the posting service does not say. */ readonly time?: string | null | undefined; readonly approved?: boolean }): ReactElement | null {
  if (day === null) return null;
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap text-[0.8125rem]", approved ? "text-ok" : "text-ink-2")}>
      <span className={cn("font-semibold", approved ? "text-ok" : "text-ink")}>{dayLabel(day.slice(0, 10))}</span>
      {time ?? POST_TIME} IST
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
  preview,
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
  /** The picture drawn for this topic, shown small inside the card; pressing it opens the pictures. */
  readonly preview?: { readonly poster: Poster; readonly open: () => void };
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
      <IconButton label="Keep this topic" pressed={kept} disabled={pending} onClick={() => run(decideBatchAction, { batchId, postId: post.id, action: kept ? "reset" : "keep" })}>
        <Check size={13} weight="bold" aria-hidden="true" />
      </IconButton>
      <IconButton label="Drop this topic" pressed={dropped} muted disabled={pending} onClick={() => run(decideBatchAction, { batchId, postId: post.id, action: dropped ? "reset" : "drop" })}>
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
      <span className="relative block">
      <select
        aria-label="Move this topic to"
        defaultValue=""
        onChange={(event) => {
          if (event.target.value === "") return;
          setMoving(false);
          onMove(event.target.value);
        }}
        className="h-8 w-full appearance-none rounded-lg border border-ink-2/65 bg-surface pr-8 pl-2 text-[0.8125rem] text-ink"
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
      <CaretDown size={12} weight="bold" aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-2" />
      </span>
    );
  const tags = (
    <>
      <span className={cn("text-xs font-semibold", kept ? "text-ok" : "text-ink-2")}>{kept ? "Kept" : dropped ? "Dropped" : "Not decided"}</span>
      {post.replaces == null ? null : <span className="text-xs font-semibold text-rattan-text">New topic</span>}
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
        {preview !== undefined ? (
          <button type="button" onClick={preview.open} aria-label={`Open the picture: ${post.headline}`} title="Open the picture" className="mt-auto flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent p-0 text-left">
            <img src={imageUrl(preview.poster.id)} alt="" loading="lazy" className="size-12 shrink-0 rounded-md object-cover ring-1 ring-line" />
            <span className={cn("text-xs font-semibold", preview.poster.status === "approved" ? "text-ok" : "text-warn")}>{preview.poster.status === "approved" ? "Approved" : "Drawn"}</span>
          </button>
        ) : post.drawn === true ? <p className="m-0 text-xs text-ink-3">Drawn. Its pictures are below.</p> : locked && !dropped && !kept ? <p className="m-0 text-xs text-ink-3">Not decided. This week was drawn before it could stay open, so it can no longer be changed.</p> : null}
        {notes}
        {icons === null ? null : <div className="mt-auto flex flex-nowrap items-center justify-between gap-1 pt-1">{icons}</div>}
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
  readonly replacing: Readonly<Record<string, ReplaceState>>;
  /** Today in India, `YYYY-MM-DD`: a topic cannot be moved to a day that has passed or to today. Empty when not known. */
  readonly today: string;
  /** The picture to show small inside a topic that has been drawn, and what pressing it does. */
  readonly pictureOf?: (card: ReviewCard) => Poster | undefined;
  readonly onOpenPicture?: (poster: Poster) => void;
  /** The weekly carousel when it is for this week: it is a card in the column of its day. */
  readonly carousel?: WeekCarousel | null;
}

/** The carousel as a topic of its day: its topic and slide headlines, and the same choices a topic has (keep, drop, undo). Its slides show under Pictures once drawn. */
function CarouselDayCard({ carousel, dragProps }: { readonly carousel: WeekCarousel; readonly dragProps?: { readonly onPointerDown: (event: ReactPointerEvent) => void; readonly dragging: boolean } }): ReactElement {
  const { summary, detail, canChange } = carousel;
  const { pending, error, run } = useReviewAction();
  const decision = decisionOf(summary);
  const headlines = slideHeadlines(carousel);
  const decide = (action: "keep" | "drop" | "reset" | "approve"): void => run(decideCarouselAction, { id: summary.id, action });
  const kept = summary.status === "kept" || summary.status === "approved";
  const dropped = summary.status === "dropped";
  /** Keep and drop while it is a topic (and to undo either); approve and send back once the slides are drawn. */
  const topicChoices = canChange && (summary.status === "topic" || summary.status === "kept" || summary.status === "dropped");
  const drawnChoices = canChange && summary.status === "pending" && detail !== null;
  return (
    <li
      {...(dragProps === undefined ? {} : { onPointerDown: dragProps.onPointerDown })}
      className={cn("grid content-start gap-2 rounded-xl bg-surface p-2.5 ring-1", kept ? "ring-2 ring-ok" : dropped ? "bg-surface-subtle ring-line" : "ring-line", dragProps !== undefined && "cursor-grab touch-pan-x select-none", dragProps?.dragging === true && "opacity-40")}
    >
      <p className="text-[0.6875rem] font-semibold text-ink-3">Carousel · {summary.count} slides</p>
      <p className="text-[0.84375rem] font-semibold leading-snug text-ink">{summary.topic ?? "Carousel of the week"}</p>
      {headlines.length === 0 ? null : (
        <ol className="m-0 grid list-none gap-0.5 p-0 text-xs leading-snug text-ink-2">
          {headlines.map((slide) => (
            <li key={slide.position} className="break-words">
              {slide.position}. {slide.headline}
            </li>
          ))}
        </ol>
      )}
      {topicChoices ? (
        <div className="flex flex-nowrap items-center justify-between gap-1 pt-1">
          <IconButton label={kept ? "Undo keeping this carousel" : "Keep this carousel"} pressed={kept} disabled={pending} onClick={() => decide(kept ? "reset" : "keep")}>
            <Check size={13} weight="bold" aria-hidden="true" />
          </IconButton>
          <IconButton label={dropped ? "Undo dropping this carousel" : "Drop this carousel"} pressed={dropped} muted disabled={pending} onClick={() => decide(dropped ? "reset" : "drop")}>
            <X size={13} weight="bold" aria-hidden="true" />
          </IconButton>
        </div>
      ) : drawnChoices ? (
        <div className="flex flex-nowrap items-center justify-between gap-1 pt-1">
          <IconButton label="Approve this carousel" disabled={pending} onClick={() => decide("approve")}>
            <Check size={13} weight="bold" aria-hidden="true" />
          </IconButton>
          <IconButton label="Send this carousel back" disabled={pending} onClick={() => run(decideCarouselAction, { id: summary.id, action: "reject", reason: sendBackReason(detail) })}>
            <X size={13} weight="bold" aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      {summary.status === "topic" && topicChoices ? null : <p className={cn("text-[0.8125rem]", decision.tone)}>{decision.word}</p>}
      {error === null ? null : (
        <p role="alert" className="text-xs font-semibold text-error">
          {error}
        </p>
      )}
    </li>
  );
}

/** The key the carousel card is dragged under: no topic has one like it. */
const CAROUSEL_DRAG_KEY = "carousel";

const nextDay = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * The topics of a week in seven columns, Monday to Sunday: each topic sits in the column of the day it goes out, with the time by the day.
 * A topic can be dragged to another day of the week (or moved with its day picker) until the week is drawn. A week whose topics carry no
 * day, or one outside it, is listed one under the other instead, so nothing is hidden.
 */
function WeekGrid({ cards, week, replacing, today, pictureOf, onOpenPicture, carousel = null }: WeekGridProps): ReactElement {
  const mover = useReviewAction();
  /** Where a topic was just moved to, shown at once while the posting service answers. */
  const [moved, setMoved] = useState<Readonly<Record<string, string>>>({});
  const { pending: moving } = mover;
  /** Where the carousel was just moved to, shown at once while the posting service answers. */
  const [carouselMoved, setCarouselMoved] = useState<string | null>(null);
  useEffect(() => {
    if (!moving) {
      setMoved({});
      setCarouselMoved(null);
    }
  }, [moving]);
  const written = cards.filter((card) => card.written !== null);
  const days = week.from === "" ? [] : daysOfWeek(week.from);
  const placed = days.length > 0 && written.every((card) => card.written?.date != null && days.includes(card.written.date));
  const dayOf = (card: ReviewCard): string | null => moved[card.postId] ?? card.written?.date ?? null;
  const earliest = today === "" ? "" : nextDay(today);
  /** The days a topic may go to: the other days of its week, from tomorrow on, while the week is open and no move is on its way. */
  const targets = (card: ReviewCard): string[] => {
    if (postFinal(card, week) || moving || !placed) return [];
    return days.filter((day) => day !== dayOf(card) && day >= earliest);
  };
  const move = (card: ReviewCard, day: string): void => {
    setMoved((current) => ({ ...current, [card.postId]: day }));
    mover.run(moveTopicAction, { batchId: card.batchId, postId: card.postId, day });
  };
  const carouselDay = carouselMoved ?? carousel?.summary.date ?? null;
  /** The days the carousel may go to: the other days of its week from tomorrow on, while it is still wanted and no move is on its way. Its content is never changed. */
  const carouselTargets = (): string[] => (carousel === null || !carousel.canChange || !carouselMovable(carousel.summary.status) || moving || !placed ? [] : days.filter((day) => day !== carouselDay && day >= earliest));
  const drag = useTopicDrag({
    allowed: (key, day) => {
      if (key === CAROUSEL_DRAG_KEY) return carouselTargets().includes(day);
      const card = written.find((one) => one.key === key);
      return card !== undefined && targets(card).includes(day);
    },
    onDrop: (key, day) => {
      if (key === CAROUSEL_DRAG_KEY) {
        if (carousel !== null) {
          setCarouselMoved(day);
          mover.run(moveCarouselAction, { id: carousel.summary.id, day });
        }
        return;
      }
      const card = written.find((one) => one.key === key);
      if (card !== undefined) move(card, day);
    },
  });
  const row = (card: ReviewCard, compact: boolean): ReactElement => {
    const open = targets(card);
    return <TopicRow key={card.key} card={card} compact={compact} locked={postFinal(card, week)} replace={replacing[card.postId]} replacementsLeft={week.replacementsLeft} moveDays={open} onMove={(day) => move(card, day)} {...(compact && pictureOf?.(card) !== undefined && onOpenPicture !== undefined ? { preview: { poster: pictureOf(card) as Poster, open: () => onOpenPicture(pictureOf(card) as Poster) } } : {})} {...(open.length > 0 && compact ? { dragProps: { onPointerDown: (event: ReactPointerEvent) => drag.begin(event, card.key, card.headline), dragging: drag.dragging === card.key } } : {})} />;
  };
  if (!placed) {
    return (
      <div className="grid gap-3">
        <ul className="grid gap-3">{cards.map((card) => row(card, false))}</ul>
        {carousel === null ? null : <CarouselTopic carousel={carousel} />}
      </div>
    );
  }
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
        <div data-drop-zone="" className="grid grid-cols-[repeat(7,minmax(9.5rem,1fr))] gap-2.5">
          {days.map((day, index) => {
            const here = written.filter((card) => dayOf(card) === day);
            const carouselHere = carousel !== null && carouselDay === day;
            const landing = drag.dragging !== null && drag.over === day;
            return (
              <div key={day} data-drop-day={day} className={cn("min-w-0 rounded-xl p-1 transition-colors", landing && "bg-rattan-wash/60 ring-2 ring-inset ring-rattan-text")}>
                <p className="mb-1.5 text-[0.8125rem] font-bold leading-tight text-ink">
                  {dayLabel(day, { weekday: "short" })}
                  <span className="block text-xs font-semibold text-ink-3">
                    {dayLabel(day, { day: "numeric", month: "short" })}
                    {here.length === 0 ? "" : ` ${here[0]?.written?.time ?? POST_TIME} IST`}
                  </span>
                </p>
                {here.length === 0 && !carouselHere ? (
                  <p className="grid min-h-44 place-items-center rounded-xl border border-dashed border-line px-2 text-center text-xs text-ink-3">{index > 4 ? "Weekend, no post" : "No post this day"}</p>
                ) : (
                  <ul className="grid gap-2">
                    {here.map((card) => row(card, true))}
                    {carouselHere ? <CarouselDayCard carousel={carousel} {...(carouselTargets().length > 0 ? { dragProps: { onPointerDown: (event: ReactPointerEvent) => drag.begin(event, CAROUSEL_DRAG_KEY, carousel.summary.topic ?? "Carousel"), dragging: drag.dragging === CAROUSEL_DRAG_KEY } } : {})} /> : null}
                  </ul>
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

/** What the review screen knows of the topics she wrote in her own words. */
export interface OwnTopicsData {
  readonly requests: readonly TopicRequest[];
  /** The batches those topics are written into (each is a batch of one post), to read and change their words. */
  readonly batches: readonly WrittenBatch[];
  /** The pictures drawn for those topics. */
  readonly posters: readonly Poster[];
  readonly canChange: boolean;
}

const NO_OWN: OwnTopicsData = { requests: [], batches: [], posters: [], canChange: false };

/** The window to write a topic in her own words, for the week being looked at. */
function OwnTopicBox({ week, onClose }: { readonly week: string | undefined; readonly onClose: () => void }): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const ask = useReviewAction();
  const [text, setText] = useState("");
  useEffect(() => {
    const window = dialog.current;
    if (window !== null && !window.open) window.showModal();
  }, []);
  const length = text.trim().length;
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (ask.pending || length < 10) return;
    ask.run(askTopicAction, { text, ...(week === undefined ? {} : { week }) }, onClose);
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby="own-topic-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(calc(100%-2rem),32rem)] rounded-2xl border-0 bg-surface p-6 text-ink shadow-[0_24px_60px_-20px_rgb(21_22_26/0.5)] backdrop:bg-[rgb(17_20_24/0.5)]"
    >
      <form onSubmit={submit} className="grid gap-3">
        <h3 id="own-topic-title" className="type-section text-ink">
          Write your prompt for this week
        </h3>
        <p className="text-[0.875rem] text-ink-2">Tell us what the post is about, in your own words: an offer, a new dish, an event. We write the post from your words only, and you read it before any picture is drawn.</p>
        <textarea
          aria-label="Your topic"
          value={text}
          maxLength={1000}
          onChange={(event) => setText(event.target.value)}
          placeholder="For example: Diwali special, 20% off all thalis until 2 Nov."
          className="min-h-28 w-full rounded-lg border border-ink-2/65 bg-surface px-3 py-2.5 text-[0.875rem] text-ink placeholder:text-ink-3"
        />
        <p className="text-xs text-ink-3">{text.length} of 1000. At least 10 characters.</p>
        {ask.error === null ? null : (
          <p role="alert" className="text-[0.84375rem] font-semibold text-error">
            {ask.error}
          </p>
        )}
        <ul className="m-0 grid gap-1 pl-5 text-[0.8125rem] text-ink-2">
          <li>One topic a week.</li>
          <li>Links and email addresses are not read: write the details in words.</li>
          <li>It goes out on the first day of this week you can still use, at {POST_TIME} IST, on the channels you have connected.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={ask.pending || length < 10} className={SMALL_DARK}>
            {ask.pending ? "Sending" : "Write my post"}
          </button>
          <button type="button" onClick={onClose} className={SMALL_SOFT}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** One topic she wrote in her own words, from being written to its pictures. */
function OwnTopicCard({ request, data, channels, reasons }: { readonly request: TopicRequest; readonly data: OwnTopicsData; readonly channels: readonly ReviewChannel[]; readonly reasons: readonly string[] }): ReactElement {
  const batchId = request.batchId;
  const postId = request.postId;
  const post = batchId === null || postId === null ? null : (data.batches.find((one) => one.id === batchId)?.posts.find((one) => one.id === postId) ?? null);
  const posters = data.posters.filter((poster) => poster.batchId === batchId);
  const [busy, startBusy] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const edit = useReviewAction();
  const drop = useReviewAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  /** Keeps the written post and asks for its pictures, one after the other, stopping at the first refusal. */
  const keepAndDraw = (): void => {
    if (batchId === null || postId === null) return;
    setFailure(null);
    startBusy(async () => {
      try {
        if (post?.state !== "kept") {
          const keep = new FormData();
          keep.set("batchId", batchId);
          keep.set("postId", postId);
          keep.set("action", "keep");
          const kept = await decideBatchAction(keep);
          if (kept.status === "error") {
            setFailure(kept.message);
            return;
          }
        }
        const draw = new FormData();
        draw.set("batchId", batchId);
        const drawn = await drawBatchAction(draw);
        if (drawn.status === "error") setFailure(drawn.message);
      } catch {
        setFailure("That did not work. Check your connection and try again.");
      }
    });
  };
  const waiting = request.state === "waiting_for_words" && batchId !== null && postId !== null;
  return (
    <section aria-label="Your own topic" className="grid gap-3 rounded-xl bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="m-0 text-xs font-semibold tracking-wide text-ink-3 uppercase">Your own topic</p>
        <DateChip day={request.goesOutOn} time={request.goesOutAt} approved={request.state === "drawn" && posters.length > 0 && posters.every((poster) => poster.status === "approved")} />
      </div>
      {request.state === "writing" ? (
        <p role="status" className="flex items-center gap-2 text-[0.84375rem] font-semibold text-ink-2">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-c-growth" aria-hidden="true" />
          Writing your post from your words. It appears here when it is ready.
        </p>
      ) : null}
      {waiting && post !== null ? (
        <>
          {editing ? (
            <div className="flex flex-wrap gap-2">
              <input aria-label="Headline (it is printed on the picture)" type="text" value={draft} maxLength={120} onChange={(event) => setDraft(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink" />
              <button type="button" disabled={edit.pending || draft.trim() === ""} onClick={() => edit.run(decideBatchAction, { batchId, postId, action: "edit-headline", headline: draft }, () => setEditing(false))} className={SMALL_DARK}>
                Save headline
              </button>
              <button type="button" onClick={() => setEditing(false)} className={SMALL_SOFT}>
                Cancel
              </button>
            </div>
          ) : (
            <h3 className="m-0 break-words type-section text-ink">{post.headline}</h3>
          )}
          <ul className="m-0 grid list-none gap-2 p-0">
            {CHANNEL_PLATFORMS.filter((one) => post.captions[one] !== undefined && channels.some((channel) => channel.platform === one)).map((one) => (
              <li key={one} className="flex gap-2.5">
                <ChannelLogo platform={one} small />
                <p className="m-0 min-w-0 whitespace-pre-wrap break-words text-[0.84375rem] leading-relaxed text-ink">{post.captions[one]}</p>
              </li>
            ))}
          </ul>
          <p className="m-0 text-xs text-ink-3">Written from your words only. Read it, then ask for its pictures: {request.picturesToDraw} {request.picturesToDraw === 1 ? "picture" : "pictures"}, one for each channel it is written for. Nothing is posted until you approve them.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || request.picturesToDraw === 0} onClick={keepAndDraw} className={SMALL_DARK}>
              {busy ? "Asking" : `Keep and draw ${request.picturesToDraw} ${request.picturesToDraw === 1 ? "picture" : "pictures"}`}
            </button>
            <IconButton
              label="Change the headline"
              disabled={busy || edit.pending}
              onClick={() => {
                setDraft(post.headline);
                setEditing(true);
              }}
            >
              <TextT size={13} weight="bold" aria-hidden="true" />
            </IconButton>
            <IconButton label="Drop this topic" muted disabled={busy || drop.pending} onClick={() => drop.run(decideBatchAction, { batchId, postId, action: "drop" })}>
              <X size={13} weight="bold" aria-hidden="true" />
            </IconButton>
          </div>
          {[failure, edit.error, drop.error].filter((message): message is string => message !== null).map((message) => (
            <p key={message} role="alert" className="text-[0.84375rem] font-semibold text-error">
              {message}
            </p>
          ))}
        </>
      ) : null}
      {request.state === "drawing" ? (
        <div role="status" className="grid gap-2">
          <p className="m-0 text-[0.84375rem] font-semibold text-ink">Drawing your pictures</p>
          <div className="h-1.5 max-w-sm overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-c-growth" />
          </div>
        </div>
      ) : null}
      {request.state === "drawn" ? (
        <ul className="m-0 grid list-none items-start gap-4 p-0 sm:grid-cols-2 2xl:grid-cols-3">
          {posters.map((poster) => (
            <PictureCard key={poster.id} poster={poster} account={channels.find((channel) => channel.platform === poster.network)?.account ?? PLATFORM_NAMES[poster.network]} day={poster.date ?? request.goesOutOn} time={poster.time ?? request.goesOutAt} reasons={reasons} />
          ))}
        </ul>
      ) : null}
      {request.state === "not_made" ? <p className="m-0 text-[0.84375rem] text-ink-2">{request.reason === null ? "This topic did not become a post." : (TOPIC_NOT_MADE_WORDS[request.reason] ?? "This topic did not become a post.")}</p> : null}
    </section>
  );
}

/**
 * Her own topic for the week being looked at, above the topics we found: one line to write it when she has none (one a week), and its card
 * once she has, from being written to its pictures.
 */
function OwnTopics(): ReactElement | null {
  const { week, own, channels, reasons } = useFlow();
  if (week === undefined || week.from === "") return null;
  const request = own.requests.find((one) => one.week.from === week.from);
  return request === undefined ? null : <OwnTopicCard request={request} data={own} channels={channels} reasons={reasons} />;
}

/** "Write your prompt": one small button beside the channel's name, while the week has no topic of her own and its days are still ahead. One a week. */
function OwnTopicButton(): ReactElement | null {
  const { week, today, own } = useFlow();
  const [writing, setWriting] = useState(false);
  if (week === undefined || week.from === "" || !own.canChange || (today !== "" && week.to <= today)) return null;
  if (own.requests.some((one) => one.week.from === week.from)) return null;
  return (
    <>
      <button type="button" onClick={() => setWriting(true)} aria-label="Write your prompt for this week." title="Write your own prompt for this week. One a week." className={SMALL_SOFT}>
        <Plus size={14} weight="bold" aria-hidden="true" />
        Write your prompt
      </button>
      {writing ? <OwnTopicBox week={week.from} onClose={() => setWriting(false)} /> : null}
    </>
  );
}

/** Asks for the pictures of a week, after saying what it makes and what it locks. */
function DrawBar({ week, kept, total, retry, pictures, stay, carousel = null }: { readonly week: FlowWeek; /** The topics kept to draw, the kept carousel not counted. */ readonly kept: number; /** The kept carousel of this week, drawn with the pictures when she presses the bar. */ readonly carousel?: { readonly id: string; readonly count: number } | null; readonly total: number; readonly retry: boolean; /** The new pictures a draw makes: for each topic kept and not drawn yet, one for each connected channel it is written for. */ readonly pictures: number; /** The topics that stay open after this draw. */ readonly stay: number }): ReactElement {
  const rounds = !week.whole;
  const picturesWord = pictures === 1 ? "picture" : "pictures";
  const draw = useReviewAction();
  const drawSlides = useReviewAction();
  /** What is drawn now: the kept topics, and the kept carousel (counted as one). */
  const toDrawCount = kept + (carousel === null ? 0 : 1);
  const carouselNote = carousel === null ? "" : `${pictures > 0 ? " and " : ""}the ${carousel.count} slides of the carousel`;
  /** What a draw makes, in words: the new pictures and/or the carousel's slides. */
  const makesWords = pictures > 0 ? `${pictures} new ${picturesWord}${carouselNote}` : carouselNote === "" ? `${pictures} new ${picturesWord}` : carouselNote;
  const dialog = useRef<HTMLDialogElement>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const window = dialog.current;
    if (window === null) return;
    if (asking && !window.open) window.showModal();
    if (!asking && window.open) window.close();
  }, [asking]);
  const fields = { batchId: week.batchId, ...(week.whole ? {} : { week: week.from }), ...(retry ? { retry: "1" } : {}) };
  /** Draws the kept topics, then the kept carousel; a carousel alone when no topic is kept. */
  const drawNow = (after?: () => void): void => {
    const slides = (): void => {
      if (carousel === null) after?.();
      else drawSlides.run(drawCarouselAction, { id: carousel.id }, after);
    };
    if (kept > 0 || retry) draw.run(drawBatchAction, fields, slides);
    else slides();
  };
  return (
    <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/95 px-1 py-3 backdrop-blur">
      <p className="min-w-0 flex-1 text-[0.84375rem] text-ink-2">
        {retry ? (
          <>Change the headline or drop a topic that got no picture, then draw again. Posts that have pictures stay as they are.</>
        ) : (
          rounds ? (
            toDrawCount === 0 ? null : (
            <>
              <b className="text-ink">
                {toDrawCount} kept to draw.
              </b>{" "}
              Drawing makes {makesWords}. {stay > 0 ? (stay === 1 ? "The other one stays open." : `The other ${stay} stay open.`) : "Nothing else is left open."}
            </>
            )
          ) : (
            <>
              <b className="text-ink">
                {kept} of {total} kept.
              </b>{" "}
              Drawing makes {kept} {kept === 1 ? "picture" : "pictures"} for each connected channel. Once you draw, this week&rsquo;s choices are final.
            </>
          )
        )}
      </p>
      <button type="button" disabled={draw.pending || drawSlides.pending || (!retry && toDrawCount === 0)} onClick={() => (retry ? drawNow() : setAsking(true))} className={SMALL_DARK}>
        {draw.pending || drawSlides.pending ? "Asking" : retry ? "Draw the missing pictures" : `Draw pictures for ${toDrawCount} kept`}
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
          Draw pictures for {toDrawCount} kept {toDrawCount === 1 ? "topic" : "topics"}?
        </h3>
        {rounds ? (
          <>
            <p className="mt-2 text-[0.875rem] text-ink-2">
              This makes {makesWords}
              {pictures > 0 ? ", one for each connected channel a topic is written for" : ""}.
            </p>
            <p className="mt-3 text-[0.875rem] text-ink-2">
              <b className="text-ink">It locks only {toDrawCount === 1 ? "this topic" : `these ${toDrawCount} topics`}:</b> you can no longer change {toDrawCount === 1 ? "it" : "them"} after you draw.
              {stay > 0 ? (stay === 1 ? " The other one stays open, and you can keep it and draw again later." : ` The ${stay} others stay open, and you can keep them and draw again later.`) : ""}
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-[0.875rem] text-ink-2">This makes {kept} {kept === 1 ? "picture" : "pictures"} for each connected channel.</p>
            <p className="mt-3 text-[0.875rem] text-ink-2">
              <b className="text-ink">It locks this week.</b> After you draw, you can no longer keep, drop or change the headline of any topic of this week
              {total - kept > 0 ? `, so the ${total - kept} you did not keep stay out.` : "."}
            </p>
          </>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={draw.pending || drawSlides.pending}
            onClick={() => drawNow(() => setAsking(false))}
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
    <div className="flex items-center gap-2 px-2.5 py-2">
      <ChannelLogo platform={poster.network} medium />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs font-semibold text-ink" title={account}>
          {account}
        </p>
        <p className="text-[0.6875rem] text-ink-3">{poster.network === "linkedin" ? `Post · ${when}` : poster.network === "google" ? `Update · ${when}` : when}</p>
      </div>
    </div>
  );
  const words = <p className="whitespace-pre-wrap break-words px-2.5 pb-2.5 text-xs leading-snug text-ink">{poster.caption}</p>;
  if (poster.network === "instagram") {
    return (
      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        {head}
        {picture}
        <p className="whitespace-pre-wrap break-words px-2.5 py-2.5 text-xs leading-snug text-ink">
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
    <li id={`picture-${poster.id}`} className="grid content-start gap-2 rounded-xl bg-sunken p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 flex-1 basis-32 break-words text-[0.84375rem] font-semibold leading-snug text-ink">{poster.headline}</h3>
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
          <span className={cn("inline-flex items-center gap-1 text-[0.8125rem] font-semibold", approved ? "text-ok" : blocked || putAway ? "text-ink-2" : "text-warn")}>
            {approved ? <Check size={13} weight="bold" aria-hidden="true" /> : null}
            {pictureWord(poster)}
          </span>
          {approved || blocked || putAway ? null : (
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
function PicturesStage({ cards, week, channel, account, reasons, ownPosters = [], settled = true, only }: { readonly cards: readonly ReviewCard[]; readonly week: FlowWeek; readonly channel: ChannelPlatform; readonly account: string; readonly reasons: readonly string[]; /** The pictures of her own topic of this week, listed with the rest. */ readonly ownPosters?: readonly Poster[]; /** Which pictures to list when she has picked a step: the ones waiting for her, or the approved ones; all of them when she has not. */ readonly only?: "waiting" | "approved"; /** False while the week is only partly drawn: the topics still open are not left out, so nothing is said of them. */ readonly settled?: boolean }): ReactElement | null {
  const [approvingAll, startApproving] = useTransition();
  const [approveError, setApproveError] = useState<string | null>(null);
  const everyPicture = [...picturesOn(cards, channel), ...ownPosters.filter((poster) => poster.network === channel)];
  const waiting = everyPicture.filter((poster) => poster.status === "pending" || poster.status === "held");
  const pictures = only === "approved" ? everyPicture.filter((poster) => poster.status === "approved") : only === "waiting" ? everyPicture.filter((poster) => poster.status !== "approved") : everyPicture;
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
  const undecided = cards.filter((card) => card.written?.state === "pending");
  const drawingNow = cards.some((card) => card.written?.drawn === true && card.pictures.length === 0 && card.written.notDrawn === null);
  if (!settled && pictures.length === 0 && !drawingNow) return null;
  return (
    <div className="grid gap-4">
      {pictures.length === 0 && (week.state === "drawing" || drawingNow) ? (
        <div role="status" className="grid gap-2 rounded-xl bg-surface p-4 ring-1 ring-line">
          <p className="text-[0.84375rem] font-semibold text-ink">Drawing your pictures</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-c-growth" />
          </div>
          <p className="text-xs text-ink-3">They will appear here when they are ready.</p>
        </div>
      ) : null}
      {pictures.length === 0 && week.state !== "drawing" && !drawingNow ? <p className="rounded-xl bg-surface p-4 text-[0.84375rem] text-ink-2 ring-1 ring-line">No picture was drawn for {PLATFORM_NAMES[channel]} this week.</p> : null}
      {pictures.length === 0 ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-3">
            {waiting.length} waiting · {everyPicture.length - waiting.length} approved
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
      <ul className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pictures.map((poster) => (
          <PictureCard key={poster.id} poster={poster} account={account} day={dayOf(poster)} time={timeOf(poster)} reasons={reasons} />
        ))}
      </ul>
      {!settled || keptWithout.length === 0 ? null : <p className="text-xs text-ink-3">Still without a picture: {keptWithout.map((card) => card.headline).join(" · ")}.</p>}
      {!settled || undecided.length === 0 ? null : <p className="text-xs text-ink-3">Not decided before the pictures were drawn, so nothing was drawn for them and they cannot be changed now: {undecided.map((card) => card.headline).join(" · ")}.</p>}
      {!settled || dropped.length === 0 ? null : <p className="text-xs text-ink-3">Dropped, nothing drawn: {dropped.map((card) => card.headline).join(" · ")}.</p>}
    </div>
  );
}

/** Every topic of a week in one table: what was chosen, and where each channel's picture stands. */
/** The colour of a word in the overview: green for what is kept or approved, amber for anything still to be decided, drawn or approved. */
const toneOf = (word: string): string => (word === "Kept" || word === "Approved" ? "font-semibold text-ok" : word === "Dropped" ? "text-ink-3" : "font-semibold text-warn");

function Overview({ cards, week, channels }: { readonly cards: readonly ReviewCard[]; readonly week: FlowWeek; readonly channels: readonly ReviewChannel[] }): ReactElement {
  return (
    <div className="grid gap-3">
      <p className="text-[0.84375rem] text-ink-2">One line for each topic. Pick a channel on the left to see its posts the way they will look there.</p>
      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[0.84375rem]">
          <thead>
            <tr className="bg-sunken text-xs text-ink-2">
              <th className="px-3 py-2 font-semibold">Topic</th>
              {channels.map((channel) => (
                <th key={channel.platform} className="px-3 py-2 font-semibold" title={PLATFORM_NAMES[channel.platform]}>
                  <ChannelLogo platform={channel.platform} small />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => {
              return (
                <tr key={card.key} className="border-t border-line align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-ink">{card.headline}</p>
                    <div className="mt-1">
                      <DateChip day={card.written?.date ?? null} time={card.written?.time} />
                    </div>
                  </td>
                  {channels.map((channel) => {
                    const poster = card.pictures.find((one) => one.network === channel.platform);
                    const word = poster === undefined ? (weekAsked(week) && card.written?.state === "kept" ? "Drawing" : "Not drawn") : pictureWord(poster);
                    return (
                      <td key={channel.platform} className={cn("px-3 py-2.5", toneOf(word))}>
                        {word}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
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
    <nav aria-label="Week" className="flex items-center gap-1 pb-1">
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

/** Where the week stands, drawn like the Posts and Analytics tabs: plain words with a line under the one she is on. */
function Steps({ stage, counts, onPick }: { readonly stage: 0 | 1 | 2; /** How many are left in each step: topics not decided, pictures to approve. A step with none shows no number. */ readonly counts?: readonly [number, number, number]; /** When the week is drawn in rounds, the customer can switch between the topics and the pictures drawn so far. */ readonly onPick?: (index: 0 | 1 | 2) => void }): ReactElement {
  return (
    <ol className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Where this week stands">
      {STEPS.map((name, index) => {
        const classes = cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-[0.875rem] font-semibold", index === stage ? "border-rattan-text text-ink" : index < stage ? "border-transparent text-ink-2" : "border-transparent text-ink-3");
        const body = (
          <>
            {name}
            {counts === undefined || counts[index] === 0 ? null : (
              <span className="rounded-full bg-warn-wash px-1.5 text-[0.6875rem] font-bold leading-5 text-warn" aria-hidden="true" title={`${counts[index]} ${index === 0 ? "topics to decide" : "pictures to approve"}`}>
                {counts[index]}
              </span>
            )}
          </>
        );
        return (
          <li key={name} aria-current={index === stage ? "step" : undefined} className="m-0 p-0">
            {onPick !== undefined ? (
              <button type="button" onClick={() => onPick(index === 0 ? 0 : index === 1 ? 1 : 2)} className={cn(classes, "cursor-pointer")}>
                {body}
              </button>
            ) : (
              <span className={classes}>{body}</span>
            )}
          </li>
        );
      })}
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
  /** The topics she wrote in her own words, with their posts and pictures. */
  readonly own?: OwnTopicsData;
  /** The newest weekly carousel, shown with the week it is for. */
  readonly carousel?: WeekCarousel | null;
  readonly children: ReactNode;
}

interface Flow {
  readonly groups: readonly ReviewGroup[];
  readonly reasons: readonly string[];
  readonly channels: readonly ReviewChannel[];
  readonly replacing: Readonly<Record<string, ReplaceState>>;
  readonly today: string;
  readonly own: OwnTopicsData;
  readonly carousel: WeekCarousel | null;
  readonly weeks: readonly FlowWeek[];
  /** The week being looked at, or undefined when there are no posts. */
  readonly week: FlowWeek | undefined;
  readonly cards: readonly ReviewCard[];
  readonly channel: "all" | ChannelPlatform;
  readonly setChannel: (channel: "all" | ChannelPlatform) => void;
  readonly setWeekKey: (key: string | null) => void;
  /** What one channel has left to do, in its own batch. */
  readonly todoOf: (platform: ChannelPlatform) => { readonly count: number; readonly words: string };
}

const FlowContext = createContext<Flow | null>(null);

function useFlow(): Flow {
  const value = useContext(FlowContext);
  if (value === null) throw new Error("The review screen's parts must be inside ReviewFlowProvider");
  return value;
}

/**
 * Whether a written batch (or, once its posts are gone, its pictures) is for this channel. Channels that post on different days are written
 * as batches of their own, so a channel looks only at the batches written for it.
 */
export function groupIsFor(group: ReviewGroup, channel: ChannelPlatform): boolean {
  if (group.batch !== null) return group.batch.networks.includes(channel);
  return group.cards.some((card) => card.pictures.some((poster) => poster.network === channel));
}

/** Holds which channel and which week the customer is looking at, for the channels column and the workspace beside it. */
export function ReviewFlowProvider({ groups, drawing = [], reasons, channels, replacing = {}, today = "", own = NO_OWN, carousel = null, children }: ReviewFlowProps): ReactElement {
  // The channel she chose on another page is in the address, so this page opens on it (a channel not connected is left out).
  const chosen = channelParamOf(useSearchParams()?.get(CHANNEL_PARAM));
  const [channel, setChannelNow] = useState<"all" | ChannelPlatform>(chosen === "all" || (chosen !== null && channels.some((one) => one.platform === chosen)) ? (chosen as "all" | ChannelPlatform) : (channels[0]?.platform ?? "all"));
  const groupsOf = useCallback((which: "all" | ChannelPlatform): readonly ReviewGroup[] => (which === "all" ? groups : groups.filter((group) => groupIsFor(group, which))), [groups]);
  const visible = useMemo(() => groupsOf(channel), [groupsOf, channel]);
  const weeks = useMemo(() => flowWeeks(visible, drawing), [visible, drawing]);
  const [weekKey, setWeekKey] = useState<string | null>(() => firstOpenWeek(groupsOf(channel), flowWeeks(groupsOf(channel), drawing)));
  const week = weeks.find((one) => one.key === weekKey) ?? weeks.find((one) => one.key === firstOpenWeek(visible, weeks)) ?? weeks[0];
  const cards = useMemo(() => (week === undefined ? [] : cardsOfWeek(visible, week)), [visible, week]);
  /** Changing channel looks at that channel's own batch: the week it has something to do in, else its first. */
  const setChannel = useCallback(
    (next: "all" | ChannelPlatform): void => {
      setChannelNow(next);
      rememberChannel(next);
      setWeekKey(firstOpenWeek(groupsOf(next), flowWeeks(groupsOf(next), drawing)));
    },
    [groupsOf, drawing],
  );
  /** What one channel has left to do, in its own batch's week (the one starting the same Monday as the week being looked at when it has one). */
  const todoOf = useCallback(
    (platform: ChannelPlatform): { readonly count: number; readonly words: string } => {
      const own = groupsOf(platform);
      const its = flowWeeks(own, drawing);
      const same = week === undefined ? undefined : its.find((one) => one.from === week.from);
      const there = same ?? its.find((one) => one.key === firstOpenWeek(own, its));
      return channelTodo(there === undefined ? [] : cardsOfWeek(own, there), there, platform);
    },
    [groupsOf, drawing, week],
  );
  const value = useMemo<Flow>(() => ({ groups: visible, reasons, channels, replacing, today, own, carousel, weeks, week, cards, channel, setChannel, setWeekKey, todoOf }), [visible, reasons, channels, replacing, today, own, carousel, weeks, week, cards, channel, setChannel, todoOf]);
  return <FlowContext value={value}>{children}</FlowContext>;
}

/**
 * The card for a channel that has no posts of its own yet, with the two ways to get them (the same topics as the others, or new ones). It is
 * for the channel being looked at only: the all-channels view and a channel that has posts have none.
 */
export function NewChannelChoice({ unwritten, missing, postingDays, website, busy, canChange }: { readonly unwritten: { readonly channels: readonly ChannelPlatform[]; readonly startDate: string | null; readonly writtenFor: readonly ChannelPlatform[] }; readonly missing: readonly ChannelPlatform[]; readonly postingDays: PostingDays | null; readonly website: string | null; readonly busy: boolean; readonly canChange: boolean }): ReactElement | null {
  const { channel } = useFlow();
  if (channel === "all" || !unwritten.channels.includes(channel) || unwritten.writtenFor.length === 0) return null;
  return <AddChannelChoice channel={channel} writtenFor={unwritten.writtenFor} canCopy={missing.includes(channel)} postingDays={postingDays} website={website} startDate={unwritten.startDate} busy={busy} canChange={canChange} />;
}

/**
 * The note that a batch is being written. It speaks for the channels the batch is for: another channel is told that nothing is being written
 * for it, so a customer never thinks posts were started for a channel she has not asked for. When the posting service does not say which
 * channels the job is for, the note is shown on every channel as before.
 */
export function ActiveJobNote({ text, networks }: { readonly text: string; readonly networks: readonly ChannelPlatform[] | undefined }): ReactElement {
  const { channel } = useFlow();
  if (channel === "all" || networks === undefined || networks.includes(channel)) {
    return (
      <p role="status" className="rounded-xl bg-warn-wash px-4 py-3 text-[0.84375rem] font-semibold text-warn">
        {text}
      </p>
    );
  }
  return (
    <p role="status" className="rounded-xl bg-sunken px-4 py-3 text-[0.84375rem] text-ink-2">
      Nothing is being written for {PLATFORM_NAMES[channel]} yet. You can add it once the posts being written for {networks.map((network) => PLATFORM_NAMES[network]).join(" and ")} are ready.
    </p>
  );
}

/**
 * The second sidebar of the review page, drawn like the one on the Posts and Analytics pages: against the menu, the channels down it, and a
 * Connect button for each network with no account yet. A row shows what is left to do in the week being looked at.
 */
export function ReviewChannelsColumn(): ReactElement {
  const { channels, channel, setChannel, todoOf } = useFlow();
  const missing = CHANNEL_PLATFORMS.filter((platform) => !channels.some((one) => one.platform === platform));
  return (
    <aside
      id="channels"
      aria-labelledby="review-channels-title"
      className="border-t border-line bg-surface p-4 pb-28 md:px-8 lg:sticky lg:top-topbar lg:h-channels-column lg:self-start lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-r lg:px-4 lg:pt-4 lg:pb-8"
    >
      <h2 id="review-channels-title" className="px-1 type-section text-ink">
        Channels
      </h2>
      <ul className="mt-3 grid gap-1">
        <li>
          <button type="button" aria-pressed={channel === "all"} onClick={() => setChannel("all")} className={cn("grid w-full grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-neutral-wash", channel === "all" && "bg-neutral-wash")}>
            <span className="grid size-7 place-items-center rounded-md bg-ink text-[0.6875rem] font-bold text-on-primary">All</span>
            <span className="min-w-0">
              <span className="block truncate type-body font-medium text-ink">All channels</span>
            </span>
          </button>
        </li>
        {channels.map((one) => {
          const todo = todoOf(one.platform);
          return (
            <li key={one.platform}>
              <button type="button" aria-pressed={channel === one.platform} onClick={() => setChannel(one.platform)} className={cn("grid w-full grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-neutral-wash", channel === one.platform && "bg-neutral-wash")}>
                <ChannelLogo platform={one.platform} medium />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span title={one.account} className="min-w-0 truncate type-body font-medium text-ink">
                      {one.account}
                      <span className="sr-only">, {PLATFORM_NAMES[one.platform]}</span>
                    </span>
                    {todo.count > 0 ? <span aria-label={`${todo.count} to do`} className="shrink-0 rounded-full bg-warn-wash px-1.5 text-xs font-semibold leading-5 text-warn">{todo.count}</span> : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {missing.length === 0 ? null : (
        <section aria-labelledby="review-add-channel-title" className="mt-3 grid gap-2">
          <h3 id="review-add-channel-title" className="type-meta font-medium">
            {channels.length === 0 ? "Connect your accounts" : "Add a channel"}
          </h3>
          {missing.map((platform) => (
            <div key={platform} className="grid gap-1">
              <ConnectButton platform={platform} label={`Connect ${platform === "google" ? "Google" : PLATFORM_NAMES[platform]}`} logo />
              <span className="type-meta">{PLATFORM_HINTS[platform]}</span>
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
export function ReviewWorkspace(): ReactElement | null {
  const { channels, reasons, replacing, today, own, carousel, week, cards, channel, weeks, setWeekKey } = useFlow();
  /** A week drawn in rounds has topics still open and pictures drawn: the customer looks at one at a time, the pictures only under Pictures. */
  const [roundView, setRoundView] = useState<"topics" | "pictures">("topics");
  /** A week drawn whole is shown by its pictures; this lets her go back and read its topics (the ones that are final cannot be changed). */
  const [lookAtTopics, setLookAtTopics] = useState(false);
  /** The picture step she picked: the ones waiting for her, or the approved ones. Not picked: all of them. */
  const [pictureStep, setPictureStep] = useState<"waiting" | "approved" | null>(null);
  if (week === undefined) return null;
  const asked = weekAsked(week);
  /** The carousel of this week: its topic with the topics, its slides with the pictures once they are drawn. */
  const weekCarousel = carouselInWeek(carousel, week.from, week.to) ? carousel : null;
  /** A kept carousel waiting to be drawn, whose day is still ahead; it is drawn with the Draw bar. */
  const carouselToDraw = weekCarousel !== null && weekCarousel.canChange && weekCarousel.summary.status === "kept" && (today === "" || (weekCarousel.summary.date ?? "") > today) ? { id: weekCarousel.summary.id, count: weekCarousel.summary.count } : null;
  /** The pictures of her own topic of this week: shown with the others once the week's pictures are the thing to look at. */
  const ownPosters = own.requests.filter((request) => request.week.from === week.from && request.batchId !== null).flatMap((request) => own.posters.filter((poster) => poster.batchId === request.batchId));
  const missing = week.state === "not_drawn" || cards.some((card) => card.written?.notDrawn != null);
  const rounds = !week.whole;
  const partly = week.state === "partly_drawn";
  /** The pictures one topic needs: one for each connected channel it is written for. */
  const picturesFor = (card: (typeof cards)[number]): number => (card.written === null ? 0 : CHANNEL_PLATFORMS.filter((one) => channels.some((channel) => channel.platform === one) && card.written?.captions[one] !== undefined).length);
  /** The topics a draw now would draw: kept, not drawn yet, and with a day still ahead (a week drawn in rounds), or every kept topic (an older week drawn whole). */
  const toDraw = cards.filter((card) => card.written?.state === "kept" && (!rounds || (card.written.drawn !== true && (today === "" || (card.written.date ?? "") > today))));
  const newPictures = toDraw.reduce((total, card) => total + picturesFor(card), 0);
  const stay = cards.filter((card) => card.written !== null && !postFinal(card, week) && !toDraw.includes(card)).length;
  const keptCount = toDraw.length;
  const approvedAll = asked && cards.some((card) => card.pictures.length > 0) && cards.every((card) => card.pictures.every((poster) => poster.status === "approved" || poster.status === "rejected" || poster.status === "expired"));
  const looking = asked && !partly && lookAtTopics && channel !== "all";
  const stage: 0 | 1 | 2 = partly ? (roundView === "pictures" ? (pictureStep === "approved" ? 2 : 1) : 0) : looking ? 0 : !asked ? 0 : pictureStep === "approved" ? 2 : pictureStep === "waiting" ? 1 : approvedAll ? 2 : 1;
  const picked = channel === "all" ? undefined : channels.find((one) => one.platform === channel);
  /** The picture shown small in a drawn topic: the one for the channel being looked at, not one that was replaced. */
  const pictureOf = (card: ReviewCard): Poster | undefined => card.pictures.find((poster) => (picked === undefined || poster.network === picked.platform) && poster.status !== "superseded");
  /** Pressing it opens the pictures at that one: under Approved when it is approved, else under Pictures. */
  const openPicture = (poster: Poster): void => {
    setLookAtTopics(false);
    setRoundView("pictures");
    setPictureStep(poster.status === "approved" ? "approved" : "waiting");
    window.setTimeout(() => document.getElementById(`picture-${poster.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  };
  const pictureList = channel === "all" ? cards.flatMap((card) => card.pictures) : picturesOn(cards, channel);
  /** What is left in this week, for the numbers on the Topics step (topics not decided yet) and the Pictures step (pictures to approve). Approved has none. */
  const stepCounts: readonly [number, number, number] = [
    cards.filter((card) => card.written?.state === "pending").length + (weekCarousel?.summary.status === "topic" ? 1 : 0),
    pictureList.filter((poster) => poster.status === "pending" || poster.status === "held").length + (weekCarousel?.summary.status === "pending" ? 1 : 0),
    0,
  ];
  const carouselBlock =
    weekCarousel === null || channel === "all" || stage === 0 ? null : stage === 1 || weekCarousel.summary.status === "approved" ? <CarouselPictures carousel={weekCarousel} channel={channel} /> : null;
  return (
    <section aria-label={picked === undefined ? "All channels" : PLATFORM_NAMES[picked.platform]} className="grid min-w-0 content-start gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="type-section text-ink">{picked === undefined ? "All channels" : `${PLATFORM_NAMES[picked.platform]} · ${picked.account}`}</h2>
        {asked || stage !== 0 || picked === undefined ? null : <OwnTopicButton />}
      </div>
      {/* The steps and the week on one line, the week at the right end, over one rule. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line">
        <Steps stage={stage} counts={stepCounts} {...(partly && channel !== "all" ? { onPick: (index: 0 | 1 | 2) => { setRoundView(index === 0 ? "topics" : "pictures"); setPictureStep(index === 2 ? "approved" : index === 1 ? "waiting" : null); } } : asked && channel !== "all" ? { onPick: (index: 0 | 1 | 2) => { setLookAtTopics(index === 0); setPictureStep(index === 2 ? "approved" : index === 1 ? "waiting" : null); } } : {})} />
        <WeekNav weeks={weeks} week={week} today={today} onPick={setWeekKey} />
      </div>
      {asked || stage !== 0 ? null : <OwnTopics />}
      {channel === "all" ? (
        <Overview cards={cards} week={week} channels={channels} />
      ) : asked && !missing && looking ? (
        <WeekGrid cards={cards} week={week} replacing={replacing} today={today} pictureOf={pictureOf} onOpenPicture={openPicture} carousel={weekCarousel} />
      ) : asked && !missing ? (
        picked === undefined ? null : <PicturesStage cards={cards} week={week} channel={picked.platform} account={picked.account} reasons={reasons} ownPosters={ownPosters} {...(pictureStep === null ? {} : { only: pictureStep })} />
      ) : (
        <>
          {asked && picked !== undefined ? <PicturesStage cards={cards} week={week} channel={picked.platform} account={picked.account} reasons={reasons} ownPosters={ownPosters} {...(pictureStep === null ? {} : { only: pictureStep })} /> : null}
          {partly && roundView === "pictures" && picked !== undefined ? (
            <PicturesStage cards={cards} week={week} channel={picked.platform} account={picked.account} reasons={reasons} ownPosters={ownPosters} settled={false} {...(pictureStep === null ? {} : { only: pictureStep })} />
          ) : (
            <WeekGrid cards={cards} week={week} replacing={replacing} today={today} pictureOf={pictureOf} onOpenPicture={openPicture} carousel={weekCarousel} />
          )}
          {partly && roundView === "pictures" ? null : <DrawBar week={week} kept={keptCount} total={cards.length} retry={asked || missing} pictures={newPictures} stay={stay} carousel={carouselToDraw} />}
        </>
      )}
      {carouselBlock}
    </section>
  );
}
