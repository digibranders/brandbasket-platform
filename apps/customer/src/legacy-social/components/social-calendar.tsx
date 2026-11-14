"use client";

import { CaretLeft, CaretRight, CheckCircle, Clock, ClockCountdown, DotsSixVertical, PauseCircle, Plus, Prohibit, Warning } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from "react";
import { addDays, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT } from "@/legacy-social/classes";
import { BRAND_TIME_ZONE } from "@/legacy-social/shims";
import { canChange, canDrag, dayLabel, hourLabel, initialOf, monthGrid, nextPostDay, platformsOf, postStatus, postToShow, shiftMonth, time12, weekOf, type AutoChannel, type CalendarPost, type PostState, type PostStatus } from "@/legacy-social/lib/social/auto";
import { changeWrittenPostTimeAction, movePostAction } from "@/legacy-social/actions";
import { canAddOn, DEFAULT_TIME, earliestDay, momentHasPassed } from "@/legacy-social/lib/social/new-post";
import { ChannelLogo } from "./channel-logo";
import { useChannelFilter } from "./channel-filter";
import { NewPostDialog } from "./new-post-dialog";
import { useNewPostRequests } from "./new-post-request";
import { PostDetailsDialog } from "./post-details-dialog";
import { cellKey, usePostDrag, type PostDrag } from "./use-post-drag";

type View = "day" | "week" | "month";
type Entry = { readonly post: CalendarPost; readonly status: PostStatus };

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const FIRST_SHOWN_HOUR = 8;
const MONTH_CHIPS_PER_DAY = 3;

/** A post's ground on the calendar: plain white, or a light red tint when it was not sent. The state shows in its mark, not in an edge colour. */
const GROUND: Readonly<Record<PostState, string>> = {
  published: "bg-surface",
  scheduled: "bg-surface",
  due: "bg-surface",
  missed: "bg-error-wash",
  skipped: "bg-surface border-dashed",
  paused: "bg-surface border-dashed",
  held: "bg-warn-wash",
};
const MARK: Readonly<Record<PostState, string>> = { published: "text-ok", scheduled: "text-info", due: "text-warn", missed: "text-error", skipped: "text-ink-3", paused: "text-warn", held: "text-warn" };
const PILL: Readonly<Record<PostStatus["tone"], string>> = { ok: "bg-ok-wash text-ok", info: "bg-info-wash text-info", warn: "bg-warn-wash text-warn" };
const HATCH = "bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-line)_6px_7px)]";

function StateMark({ state }: { readonly state: PostState }): ReactElement {
  const Mark = state === "published" ? CheckCircle : state === "missed" ? Warning : state === "due" ? ClockCountdown : state === "skipped" ? Prohibit : state === "paused" || state === "held" ? PauseCircle : Clock;
  return <Mark size={14} weight="fill" aria-hidden="true" className={cn("shrink-0", MARK[state])} />;
}

/** The minute it is now, once the page is in the browser: the server draws none, so the two never disagree. */
const minuteNow = (): number => Math.floor(Date.now() / 60_000);
function subscribeToMinutes(notify: () => void): () => void {
  const timer = setInterval(notify, 20_000);
  return () => clearInterval(timer);
}

interface IndiaNow {
  readonly day: string;
  readonly hour: number;
  readonly minute: number;
}

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: BRAND_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function indiaNow(minute: number | null): IndiaNow | null {
  if (minute === null) return null;
  const at = new Date(minute * 60_000);
  const [hour, min] = clock.format(at).split(":").map(Number) as [number, number];
  return { day: localDateIn(BRAND_TIME_ZONE, at), hour, minute: min };
}

/** Moving a post by dragging it onto another day or hour. Only posts the customer made can be dragged, and only onto a moment still ahead. */
interface Dnd {
  readonly drag: PostDrag;
  /** The post being moved, while social-auto answers. */
  readonly movingId: string | null;
}

/** What a cell says so a dragged post can land on it (see use-post-drag), and whether to light it up. */
function dropCell(dnd: Dnd | undefined, day: string, hour?: number): { readonly attrs: Record<string, string>; readonly lit: boolean } {
  const attrs: Record<string, string> = { "data-drop-day": day };
  if (hour !== undefined) attrs["data-drop-hour"] = String(hour);
  return { attrs, lit: dnd?.drag.over === cellKey(day, hour) };
}

const LIT = "bg-rattan-wash ring-2 ring-rattan-text";

/** The free space of a day or an hour, which opens a new post for that day (and hour) when it is clicked. Reached by mouse: the New post button does it for the keyboard. */
function AddHere({ day, time, onAdd }: { readonly day: string; readonly time?: string; readonly onAdd: (day: string, time?: string) => void }): ReactElement {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => onAdd(day, time)}
      aria-label={`New post on ${dayLabel(day, { weekday: "long", day: "numeric", month: "long" })}${time === undefined ? "" : ` at ${time12(time)}`}`}
      className="group absolute inset-0 z-0 grid cursor-pointer place-items-center rounded-lg text-ink-3 transition-colors hover:bg-sunken"
    >
      <Plus size={16} aria-hidden="true" className="opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/** Enter and Space open a post that is a draggable box rather than a button (a button cannot be dragged in every browser). */
const openOnKey = (action: () => void) => (event: ReactKeyboardEvent): void => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
};

/** What a post box needs to be picked up: a press starts the drag (it begins only once the pointer moves), and the box says so with a grab cursor. */
function dragProps(dnd: Dnd | undefined, post: CalendarPost): object {
  if (dnd === undefined || !canDrag(post)) return {};
  return { onPointerDown: (event: React.PointerEvent) => dnd.drag.begin(event, post) };
}

/** A post inside an hourly cell: a small preview, like a draft in a calendar slot. */
function Slot({ entry, large, fallback, onOpen, dnd }: { readonly entry: Entry; readonly large: boolean; readonly fallback: string; readonly onOpen?: ((post: CalendarPost) => void) | undefined; readonly dnd?: Dnd | undefined }): ReactElement {
  const { post, status } = entry;
  const body = (
    <>
      <span aria-hidden="true" className="grid size-[1.625rem] shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold text-ink-2 @max-[70rem]/cal:hidden">
        {initialOf(post, fallback)}
      </span>
      <span className="grid min-w-0 flex-1 overflow-hidden">
        <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs font-bold text-ink">
          <StateMark state={status.state} />
          <span className="min-w-0 truncate">{time12(post.time)}</span>
          <span className="sr-only">, {status.word}</span>
        </span>
        <span className={cn("line-clamp-2 break-words text-xs leading-snug text-ink-2", large && "text-[0.84375rem]")}>{post.caption}</span>
      </span>
    </>
  );
  const box = cn("relative z-10 flex min-w-0 items-center gap-2 rounded-lg border border-line px-1.5 py-1.5 text-left", GROUND[status.state], large && "gap-3 p-2.5");
  const label = `${canChange(post) ? "Edit" : "Open"} the post on ${dayLabel(post.day, { weekday: "long", day: "numeric", month: "long" })} at ${time12(post.time)}`;
  const movable = dnd !== undefined && canDrag(post);
  return onOpen !== undefined ? (
    <div
      role="button"
      tabIndex={0}
      title={movable ? `${status.word}: ${post.caption}. Drag to move it.` : `${status.word}: ${post.caption}`}
      onClick={() => {
        if (!dnd?.drag.takeDragged()) onOpen(post);
      }}
      onKeyDown={openOnKey(() => onOpen(post))}
      aria-label={label}
      {...dragProps(dnd, post)}
      className={cn(box, "w-full cursor-pointer overflow-hidden hover:border-ink-3", movable && "cursor-grab select-none active:cursor-grabbing", (dnd?.drag.dragging?.id === post.id || dnd?.movingId === post.id) && "opacity-40")}
    >
      {movable ? <DotsSixVertical size={14} weight="bold" aria-hidden="true" className="-mx-0.5 shrink-0 text-ink-3 @max-[70rem]/cal:hidden" /> : null}
      {body}
    </div>
  ) : (
    <div title={`${status.word}: ${post.caption}`} className={box}>
      {body}
    </div>
  );
}

/** A post as a row: the day and time, its status, the words, and the networks it goes to. */
function PostRow({ entry, onOpen }: { readonly entry: Entry; readonly onOpen?: ((post: CalendarPost) => void) | undefined }): ReactElement {
  const { post, status } = entry;
  return (
    <li className="grid gap-1.5 py-3.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <time dateTime={`${post.day}T${post.time}`} className="font-figure tabular-nums">
          {dayLabel(post.day)}, {time12(post.time)}
        </time>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", PILL[status.tone])}>
          <StateMark state={status.state} />
          {status.word}
        </span>
      </div>
      <p className="text-[0.84375rem] leading-snug text-ink">{post.caption}</p>
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {platformsOf(post).map((platform) => (
            <ChannelLogo key={platform} platform={platform} small />
          ))}
        </div>
        {onOpen !== undefined ? (
          <button type="button" onClick={() => onOpen(post)} className="text-xs font-semibold text-ink-2 underline">
            {canChange(post) ? "Edit" : "View"}
            <span className="sr-only"> the post on {dayLabel(post.day, { weekday: "long", day: "numeric", month: "long" })}</span>
          </button>
        ) : null}
      </div>
    </li>
  );
}

interface TimeGridProps {
  readonly days: readonly string[];
  /** Every post on screen, so the grid can open at the next one. */
  readonly entries: readonly Entry[];
  /** Changes when the person presses Today, to bring the next post into view again. */
  readonly focus: number;
  readonly on: (day: string) => readonly Entry[];
  readonly today: string;
  readonly now: IndiaNow | null;
  readonly fallback: string;
  /** Opens a new post for a day; left out when no account is connected. */
  readonly onAdd?: ((day: string, time?: string) => void) | undefined;
  /** Opens a post: to change or remove it when the business made it and it has not gone out, else to read it. */
  readonly onOpen?: ((post: CalendarPost) => void) | undefined;
  readonly dnd?: Dnd | undefined;
}

/** The hourly grid for one day or a whole week, with striped past hours and a line at the time now, as in the team's calendar. */
function TimeGrid({ days, entries, focus, on, today, now, fallback, onAdd, onOpen, dnd }: TimeGridProps): ReactElement {
  const large = days.length === 1;
  const columns = large ? "grid-cols-[3.5rem_minmax(0,1fr)]" : "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";
  const body = useRef<HTMLDivElement>(null);
  const dayKey = days.join(",");

  // Open the grid at the next post that has not gone out yet (or the first one shown, or the time now, or 8 AM), not at midnight,
  // with the hour before it in view. It moves when the week, the day, the channels or Today change, never on its own while the person scrolls.
  useEffect(() => {
    const grid = body.current;
    if (!grid) return;
    const at = indiaNow(minuteNow());
    const stamp = at === null ? null : `${at.day}T${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}`;
    const next = postToShow(entries, stamp);
    const hour = next !== null ? Number(next.post.time.slice(0, 2)) : at !== null && dayKey.includes(at.day) ? at.hour : FIRST_SHOWN_HOUR;
    const row = grid.querySelector<HTMLElement>(`[data-hour="${hour}"]`);
    const above = row?.previousElementSibling;
    if (row) grid.scrollTop = Math.max(0, (above instanceof HTMLElement ? above : row).offsetTop - 6);
  }, [entries, focus, dayKey]);

  return (
    <div className="@container/cal">
      <div className={cn("grid gap-1.5 pr-2", columns)}>
        <div />
        {days.map((day) => (
          <div key={day} className="grid justify-items-center rounded-lg bg-bg px-1.5 py-2 text-center">
            <span className="text-xs text-ink-3">{dayLabel(day, { weekday: "short" })}</span>
            <span className={cn("text-[0.84375rem] font-semibold", day === today ? "text-rattan-text" : "text-ink")}>
              {day === today ? "● " : ""}
              {dayLabel(day, { day: "numeric", month: "short" })}
            </span>
          </div>
        ))}
      </div>
      <div ref={body} role="grid" aria-label="Posts by hour" className="relative mt-1.5 grid max-h-[calc(100dvh-16rem)] min-h-[23.75rem] gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
        {HOURS.map((hour) => {
          const isNow = now !== null && now.hour === hour;
          return (
            <div key={hour} data-hour={hour} role="row" className={cn("grid gap-1.5", columns)}>
              <div role="rowheader" className="grid place-items-center text-xs text-ink-3">
                {isNow && now !== null ? (
                  <span className="rounded-md bg-rattan-text px-2 py-0.5 font-bold text-surface">{time12(`${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`)}</span>
                ) : (
                  hourLabel(hour)
                )}
              </div>
              {days.map((day) => {
                const past = now !== null && (day < now.day || (day === now.day && hour < now.hour));
                const here = on(day).filter((entry) => Number(entry.post.time.slice(0, 2)) === hour);
                const target = dropCell(dnd, day, hour);
                return (
                  <div key={day} role="gridcell" {...target.attrs} className={cn("relative flex min-h-[4.25rem] min-w-0 flex-col gap-1 rounded-lg border border-line bg-bg p-1", past && HATCH, target.lit && LIT)}>
                    {onAdd !== undefined && here.length === 0 && !past && canAddOn(day, today) ? <AddHere day={day} time={`${String(hour).padStart(2, "0")}:00`} onAdd={onAdd} /> : null}
                    {here.map((entry) => (
                      <Slot key={entry.post.id} entry={entry} large={large} fallback={fallback} onOpen={onOpen} dnd={dnd} />
                    ))}
                    {isNow && now !== null && day === now.day ? <span aria-hidden="true" className="absolute inset-x-0 z-10 h-0.5 bg-rattan-text" style={{ top: `${(now.minute / 60) * 100}%` }} /> : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MonthProps {
  readonly cursor: string;
  readonly today: string;
  readonly on: (day: string) => readonly Entry[];
  readonly openDay: (day: string) => void;
  /** Opens a new post for a day; left out when no account is connected. */
  readonly onAdd?: ((day: string, time?: string) => void) | undefined;
  /** Opens a post: to change or remove it when the business made it and it has not gone out, else to read it. */
  readonly onOpen?: ((post: CalendarPost) => void) | undefined;
  readonly dnd?: Dnd | undefined;
}

/** Month: a rounded cell per day with up to three small chips and a "+N more" that opens the day, as in the team's calendar. */
function Month({ cursor, today, on, openDay, onAdd, onOpen, dnd }: MonthProps): ReactElement {
  const month = cursor.slice(0, 7);
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return (
    <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={dayLabel(cursor, { month: "long", year: "numeric" })}>
      {names.map((name) => (
        <div key={name} className="rounded-lg bg-bg px-1.5 py-2.5 text-center text-xs font-semibold text-ink-2 sm:text-[0.84375rem]">
          <span className="hidden sm:inline">{name}</span>
          <span className="sm:hidden">{name.slice(0, 3)}</span>
        </div>
      ))}
      {monthGrid(cursor).map((day) => {
        const entries = on(day);
        const more = entries.length - MONTH_CHIPS_PER_DAY;
        // Dropped on a day, a post keeps its own time.
        const target = dropCell(dnd, day);
        return (
          <div key={day} role="gridcell" {...target.attrs} className={cn("relative grid min-h-24 min-w-0 content-start gap-1 rounded-lg bg-bg px-1.5 py-2 sm:min-h-[7.75rem]", day.slice(0, 7) !== month && "opacity-45", target.lit && LIT)}>
            {onAdd !== undefined && canAddOn(day, today) ? <AddHere day={day} onAdd={onAdd} /> : null}
            <span className={cn("pointer-events-none relative min-w-[1.625rem] justify-self-center rounded-md px-1.5 py-0.5 text-center text-[0.84375rem] font-semibold", day === today ? "bg-rattan-wash text-rattan-text" : cn("text-ink-3", day < today && "opacity-60"))}>
              {Number(day.slice(8))}
            </span>
            {entries.slice(0, MONTH_CHIPS_PER_DAY).map(({ post, status }) => {
              const chip = (
                <>
                  <StateMark state={status.state} />
                  <span className="hidden whitespace-nowrap font-bold text-ink sm:inline">{time12(post.time)}</span>
                  <span className="hidden min-w-0 truncate text-ink-2 md:inline">{post.caption}</span>
                  <span className="sr-only">
                    {time12(post.time)}, {status.word}
                  </span>
                </>
              );
              const box = cn("relative flex min-w-0 items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5 text-left text-xs", GROUND[status.state]);
              const movable = dnd !== undefined && canDrag(post);
              return onOpen !== undefined ? (
                <div
                  key={post.id}
                  role="button"
                  tabIndex={0}
                  title={movable ? `${status.word}: ${post.caption}. Drag to move it.` : `${status.word}: ${post.caption}`}
                  onClick={() => {
                    if (!dnd?.drag.takeDragged()) onOpen(post);
                  }}
                  onKeyDown={openOnKey(() => onOpen(post))}
                  {...dragProps(dnd, post)}
                  className={cn(box, "z-10 cursor-pointer hover:border-ink-3", movable && "cursor-grab select-none active:cursor-grabbing", (dnd?.drag.dragging?.id === post.id || dnd?.movingId === post.id) && "opacity-40")}
                >
                  {chip}
                </div>
              ) : (
                <span key={post.id} title={`${status.word}: ${post.caption}`} className={cn(box, "pointer-events-none")}>
                  {chip}
                </span>
              );
            })}
            {more > 0 ? (
              <button type="button" onClick={() => openDay(day)} className="relative min-h-0 justify-self-start px-1 text-xs font-semibold text-ink-2 underline">
                +{more} more
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface SocialCalendarProps {
  readonly posts: readonly CalendarPost[];
  /** Today in India, `YYYY-MM-DD`. */
  readonly today: string;
  /** What to say under the title. */
  readonly lede?: string;
  /** The business's name: its first letter marks a post that has no account yet. */
  readonly businessName: string;
  /** The accounts a new post can go to. With none, posts cannot be added from here. */
  readonly channels: readonly AutoChannel[];
}

/**
 * The calendar as the team sees it in social-auto: Day and Week as an hourly grid, Month as day cells with chips, and a list.
 * A phone gets the list by day instead of the grid. It shows the networks switched on in the channels column.
 */
export function SocialCalendar({ posts, today, lede = "", businessName, channels }: SocialCalendarProps): ReactElement {
  const { shown } = useChannelFilter();
  const [view, setView] = useState<View>("week");
  // It opens on the day of the next post, so a customer sees what is coming, not an empty week behind it.
  const [cursor, setCursor] = useState(() => nextPostDay(posts, today));
  const [focus, setFocus] = useState(0);
  // The day and time a new post is being made for, or null when none is.
  const [adding, setAdding] = useState<{ readonly day: string; readonly time: string } | null>(null);
  // A post that cannot be changed, opened to read.
  const [reading, setReading] = useState<CalendarPost | null>(null);
  // The post being moved by a drag, while social-auto answers.
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [, startMove] = useTransition();
  // The post being changed (with the day it is being moved to), or null when none is.
  const [changing, setChanging] = useState<{ readonly post: CalendarPost; readonly day: string } | null>(null);
  const minute = useSyncExternalStore(subscribeToMinutes, minuteNow, () => null);
  const now = indiaNow(minute);
  const fallback = businessName.trim().charAt(0).toUpperCase() || "S";

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const post of posts) {
      const status = postStatus(post, shown);
      if (status !== null) map.set(post.day, [...(map.get(post.day) ?? []), { post, status }]);
    }
    for (const entries of map.values()) entries.sort((x, y) => x.post.time.localeCompare(y.post.time));
    return map;
  }, [posts, shown]);
  const on = (day: string): readonly Entry[] => byDay.get(day) ?? [];

  const days = useMemo(() => (view === "day" ? [cursor] : weekOf(cursor)), [view, cursor]);
  const entries = useMemo(() => days.flatMap((day) => byDay.get(day) ?? []), [days, byDay]);
  const range =
    view === "month"
      ? dayLabel(cursor, { month: "long", year: "numeric" })
      : view === "day"
        ? dayLabel(cursor, { weekday: "long", day: "numeric", month: "long" })
        : `${dayLabel(days[0] as string, { day: "numeric", month: "short" })} to ${dayLabel(days[6] as string, { day: "numeric", month: "short", year: "numeric" })}`;

  const step = (direction: 1 | -1): void => setCursor((day) => (view === "month" ? shiftMonth(day, direction) : addDays(day, direction * (view === "day" ? 1 : 7))));
  const openDay = (day: string): void => {
    setCursor(day);
    setView("day");
  };

  const canAdd = channels.length > 0;
  const onAdd = canAdd ? (day: string, time: string = DEFAULT_TIME): void => setAdding({ day, time }) : undefined;
  // A post the customer made and that has not gone out opens to be changed; any other opens to be read.
  const onOpen = (post: CalendarPost): void => (canAdd && canChange(post) ? setChanging({ post, day: post.day }) : setReading(post));
  // Dragging a post the customer made onto another day or hour: only onto a moment still ahead that is not where it already is.
  const drag = usePostDrag({
    allowed: (post, day, time) => canAddOn(day, today) && !(day === post.day && time === post.time) && !momentHasPassed(day, time, new Date()),
    onDrop: (post, day, time) => {
      setMoveError(null);
      setMovingId(post.id);
      startMove(async () => {
        try {
          const form = new FormData();
          form.set("postId", post.id);
          form.set("day", day);
          form.set("time", time);
          // A post she made moves in place; one we wrote for her keeps its words and picture and changes only when it goes out.
          const result = await (post.manual ? movePostAction(form) : changeWrittenPostTimeAction(form));
          if (result.status === "error") setMoveError(result.message);
        } catch {
          setMoveError("The post could not be moved. Check your connection and try again.");
        } finally {
          setMovingId(null);
        }
      });
    },
  });
  const dnd: Dnd | undefined = canAdd ? { drag, movingId } : undefined;
  // New post: the first day in view that can take one, else tomorrow.
  const firstFreeDay = (): { readonly day: string; readonly time: string } => ({ day: freeDay(), time: DEFAULT_TIME });
  const freeDay = (): string => (view === "month" ? monthGrid(cursor) : days).find((day) => canAddOn(day, today)) ?? earliestDay(today);
  // New post, pressed in the page's top corner: opens the window here, once for each press. It reads the count while drawing, so the
  // window opens in the same pass instead of one after it.
  const { count: requests } = useNewPostRequests();
  const [seen, setSeen] = useState(requests);
  if (requests !== seen) {
    setSeen(requests);
    if (canAdd) setAdding(firstFreeDay());
  }
  const listed = entries;
  const grid = view !== "month";

  return (
    <section aria-label="Your posts" className={cn(LIFT, "grid gap-4 p-4 sm:p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div role="group" aria-label="Move the calendar" className="flex items-center gap-3">
          <button type="button" aria-label="Previous" onClick={() => step(-1)} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-sunken">
            <CaretLeft size={16} aria-hidden="true" />
          </button>
          <span role="status" className="min-w-44 text-center text-[0.875rem] font-semibold text-ink">
            {range}
          </span>
          <button type="button" aria-label="Next" onClick={() => step(1)} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-sunken">
            <CaretRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Calendar view" className="inline-flex rounded-lg bg-sunken p-0.5">
            {(["day", "week", "month"] as const).map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={view === name}
                onClick={() => {
                  setView(name);
                  // Today shows the day it is now; Week and Month stay where the person has moved to.
                  if (name === "day") {
                    setCursor(today);
                    setFocus((tick) => tick + 1);
                  }
                }}
                className={cn("h-8 rounded-md px-3 text-[0.84375rem] font-semibold transition-colors", view === name ? "bg-surface text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2")}
              >
                {name === "day" ? "Today" : name === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {drag.ghost}
      {lede === "" ? null : (
        <p className="-mt-1 text-[0.84375rem] text-ink-2">
          {lede}
          {canAdd ? " Drag a post you made to another day or hour to move it." : ""}
        </p>
      )}
      {adding === null || !canAdd ? null : <NewPostDialog day={adding.day} onDayChange={(day) => setAdding({ day, time: adding.time })} time={adding.time} today={today} channels={channels} onClose={() => setAdding(null)} />}
      {reading === null ? null : <PostDetailsDialog key={reading.id} post={reading} onClose={() => setReading(null)} />}
      {moveError === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {moveError}
        </p>
      )}
      {changing === null || !canAdd ? null : (
        <NewPostDialog key={changing.post.id} day={changing.day} onDayChange={(day) => setChanging({ post: changing.post, day })} time={changing.post.time} today={today} channels={channels} post={changing.post} onClose={() => setChanging(null)} />
      )}

      {view === "month" ? (
        <Month cursor={cursor} today={today} on={on} openDay={openDay} onAdd={onAdd} onOpen={onOpen} dnd={dnd} />
      ) : (
        <>
          {grid ? (
            <div className="hidden md:block">
              <TimeGrid days={days} entries={entries} focus={focus} on={on} today={today} now={now} fallback={fallback} onAdd={onAdd} onOpen={onOpen} dnd={dnd} />
            </div>
          ) : null}
          {listed.length === 0 ? (
            <p className={cn("rounded-xl bg-sunken p-4 text-[0.84375rem] text-ink-2", grid && "md:hidden")}>{view === "day" ? "No posts on this day." : "Nothing is scheduled for this week yet."}</p>
          ) : (
            <ul className={cn("divide-y divide-line", grid && "md:hidden")}>
              {listed.map((entry) => (
                <PostRow key={entry.post.id} entry={entry} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
