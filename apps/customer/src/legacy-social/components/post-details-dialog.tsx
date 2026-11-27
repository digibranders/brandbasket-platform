"use client";

import { Clock, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactElement } from "react";
import { changeWrittenCaptionAction, changeWrittenPostTimeAction } from "@/legacy-social/actions";
import { ASK_FOR_A_CHANGE_PATH } from "@/legacy-social/shims";
import { CHANNEL_PLATFORMS, dayLabel, PLATFORM_NAMES, postStatus, time12, type CalendarPost, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { BRAND_TIME_ZONE } from "@/legacy-social/shims";
import { canAddOn, earliestDay, isTime, latestDay, momentHasPassed } from "@/legacy-social/lib/social/new-post";
import { postPictureSrc } from "@/legacy-social/lib/social/post-picture";
import { ChannelLogo } from "./channel-logo";
import { DatePicker } from "./date-picker";
import { TimePicker } from "./time-picker";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";
import { useScrollLock } from "./use-scroll-lock";

interface PostDetailsDialogProps {
  readonly post: CalendarPost;
  /** The networks the calendar is showing. Alone, a network gets its own view of the post: its own picture, its own words and its own account, nothing of the others. */
  readonly shown?: ReadonlySet<ChannelPlatform>;
  readonly onClose: () => void;
}

/** What to say about whether the customer can change this post, in plain words. */
function changeNote(post: CalendarPost): string {
  if (post.state === "skipped") return "This post was skipped, so it will not be sent.";
  if (post.state === "held") return "This post is on hold because an account it goes to is not connected. Connect it again and it goes out if its time has not passed.";
  if (post.state === "paused") return "This post is paused, so it is not going out right now. It goes out when the pause ends, unless its time comes first.";
  if (!post.manual) return canChangeTime(post) ? "We wrote this post for you. You can change when it goes out, or its words. To change the picture, look over your posts." : "We wrote this post for you. To change it, ask us and we will.";
  if (post.state === "published") return "This post has gone out, so it can no longer be changed.";
  if (post.state === "missed") return "This post could not be sent to every account, so it can no longer be changed.";
  return "This post is going out now, so it can no longer be changed.";
}

const FIELD = "h-10 rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink";

/** Only a post we wrote that is still waiting for its time can be moved; once it is paused, skipped, due or sent it cannot. */
const canChangeTime = (post: CalendarPost): boolean => !post.manual && post.state === "scheduled" && !momentHasPassed(post.day, post.time, new Date());

/** The day and time of a post we wrote, to move it: the words and picture stay as the customer approved them. */
function TimePanel({ post, onClose }: { readonly post: CalendarPost; readonly onClose: () => void }): ReactElement {
  const router = useRouter();
  const [day, setDay] = useState(post.day);
  const [time, setTime] = useState(post.time);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = localDateIn(BRAND_TIME_ZONE, new Date());
  // A post that goes to several networks can be moved as a whole, or one network at a time (that network is then sent at its own time and the others at the post's).
  // What shows one network's post (a calendar of one network, or a network's own part of a post) is that network's time.
  const platforms = [...new Set(post.channels.map((channel) => channel.platform))];
  const [network, setNetwork] = useState<"all" | ChannelPlatform>(platforms.length === 1 && platforms[0] !== undefined ? platforms[0] : "all");

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (pending) return;
    if (!canAddOn(day, today)) return setError("Choose a day from today to 89 days ahead.");
    if (!isTime(time) || momentHasPassed(day, time, new Date())) return setError("That time has already passed. Choose a later time.");
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("postId", post.id);
        form.set("day", day);
        form.set("time", time);
        if (network !== "all") form.set("network", network);
        const result = await changeWrittenPostTimeAction(form);
        if (result.status === "error") return setError(result.message);
        router.refresh();
        onClose();
      } catch {
        setError("The time could not be changed. Check your connection and try again.");
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-xl bg-sunken p-3">
      {platforms.length > 1 ? (
        <div className="grid gap-1">
          <label htmlFor="written-post-time-network" className="text-xs font-semibold text-ink-2">
            Change the time for
          </label>
          <select
            id="written-post-time-network"
            value={network}
            onChange={(event) => setNetwork(platforms.find((platform) => platform === event.target.value) ?? "all")}
            className={FIELD}
          >
            <option value="all">All channels</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_NAMES[platform]} only
              </option>
            ))}
          </select>
          {network === "all" ? null : <p className="text-xs text-ink-3">Only {PLATFORM_NAMES[network]} goes out at this time. The other channels keep theirs.</p>}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <div className="grid gap-1">
          <label htmlFor="written-post-day" className="text-xs font-semibold text-ink-2">
            Day
          </label>
          <DatePicker id="written-post-day" value={day} min={earliestDay(today)} max={latestDay(today)} today={today} onChange={setDay} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="written-post-time" className="text-xs font-semibold text-ink-2">
            Time
          </label>
          <TimePicker id="written-post-time" value={time} onChange={setTime} />
        </div>
      </div>
      <p className="text-xs text-ink-3">India time. It goes out within a few minutes of the time you choose.</p>
      {error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={SMALL_DARK}>
          {pending ? "Saving" : "Save time"}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className={SMALL_SOFT}>
          Cancel
        </button>
      </div>
    </form>
  );
}


/** The words of a post we wrote, to change: it is held back until she approves the new words again. */
function CaptionPanel({ post, onClose }: { readonly post: CalendarPost; readonly onClose: () => void }): ReactElement {
  const router = useRouter();
  // A post goes to one or more networks, each with its own words (or the main ones). The words changed here are one network's: the one chosen, never the first by default for every network.
  const platforms = [...new Set(post.channels.map((channel) => channel.platform))];
  const wordsOf = (platform: ChannelPlatform | undefined): string => (platform === undefined ? post.caption : (post.variants?.[platform] ?? post.caption));
  const [network, setNetwork] = useState<ChannelPlatform | undefined>(platforms[0]);
  const [caption, setCaption] = useState(wordsOf(platforms[0]));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (pending || network === undefined) return;
    if (caption.trim() === "") return setError("Write what the post should say.");
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("postId", post.id);
        form.set("network", network);
        form.set("caption", caption);
        const result = await changeWrittenCaptionAction(form);
        if (result.status === "error") return setError(result.message);
        if (result.status === "partial") setNotice(result.message);
        router.refresh();
      } catch {
        setError("The words could not be changed. Check your connection and try again.");
      }
    });
  };
  if (notice !== null) {
    return (
      <div className="grid gap-2 rounded-xl bg-sunken p-3">
        <p role="status" className="text-[0.84375rem] font-semibold text-ink">
          {notice}
        </p>
        <div>
          <button type="button" onClick={onClose} className={SMALL_SOFT}>
            Close
          </button>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-xl bg-sunken p-3">
      {platforms.length > 1 ? (
        <div className="grid gap-1">
          <label htmlFor="written-post-network" className="text-xs font-semibold text-ink-2">
            Change the words for
          </label>
          <select
            id="written-post-network"
            value={network}
            onChange={(event) => {
              const next = platforms.find((platform) => platform === event.target.value);
              setNetwork(next);
              setCaption(wordsOf(next));
            }}
            className={FIELD}
          >
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_NAMES[platform]}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-3">Only this network's words change. The other networks keep theirs.</p>
        </div>
      ) : null}
      <label htmlFor="written-post-caption" className="text-xs font-semibold text-ink-2">
        {platforms.length === 1 && platforms[0] !== undefined ? `${PLATFORM_NAMES[platforms[0]]} caption` : "Caption"}
      </label>
      <textarea id="written-post-caption" value={caption} onChange={(event) => setCaption(event.target.value)} rows={6} maxLength={3000} className="w-full rounded-lg border border-ink-2/65 bg-surface px-3 py-2 text-[0.875rem] text-ink" />
      <p className="text-xs text-ink-3">The words are checked against what is on your website. The post is held back until you approve the new words in Posts.</p>
      {error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={SMALL_DARK}>
          {pending ? "Saving" : "Save caption"}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className={SMALL_SOFT}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Change time and Change caption of a post we wrote, side by side on one line, each opening its own form below. */
function ChangeBar({ post }: { readonly post: CalendarPost }): ReactElement {
  const [mode, setMode] = useState<"time" | "caption" | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={mode === "time"} onClick={() => setMode(mode === "time" ? null : "time")} className={SMALL_SOFT}>
          <Clock size={14} weight="bold" aria-hidden="true" />
          Change time
        </button>
        <button type="button" aria-pressed={mode === "caption"} onClick={() => setMode(mode === "caption" ? null : "caption")} className={SMALL_SOFT}>
          <PencilSimple size={14} weight="bold" aria-hidden="true" />
          Change caption
        </button>
      </div>
      {mode === "time" ? <TimePanel post={post} onClose={() => setMode(null)} /> : mode === "caption" ? <CaptionPanel post={post} onClose={() => setMode(null)} /> : null}
    </div>
  );
}

/** A link to the post on its network, only when it is a plain https address. */
const safeLink = (value: string | null): string | null => (value !== null && value.startsWith("https://") ? value : null);

/**
 * A post the customer cannot change, opened to read: the day and time, how it is doing on each account, the picture and the
 * words. It is a native dialog, so focus stays inside it and Escape closes it.
 */
export function PostDetailsDialog({ post, shown, onClose }: PostDetailsDialogProps): ReactElement {
  // On one network's calendar the post is that network's post: its own picture and words when it has them, the main ones when it has none, and only its own account.
  const only: ChannelPlatform | null = shown !== undefined && shown.size === 1 ? ([...shown][0] ?? null) : null;
  const seen = (platform: ChannelPlatform): boolean => shown === undefined || shown.has(platform);
  const mainPicture = only === null ? post.imageUrl : (post.variantImages?.[only] ?? post.imageUrl);
  const mainCaption = only === null ? post.caption : (post.variants?.[only] ?? post.caption);
  const accounts = post.channels.filter((channel) => seen(channel.platform));
  const dialog = useRef<HTMLDialogElement>(null);
  useScrollLock();
  useEffect(() => {
    const window = dialog.current;
    if (window !== null && !window.open) window.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="post-details-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),36rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-dialog backdrop:bg-scrim"
    >
      <div className="grid gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="post-details-title" className="type-section text-ink">
              Post
            </h3>
            <p className="mt-1 text-[0.84375rem] text-ink-2">
              {dayLabel(post.day, { weekday: "long", day: "numeric", month: "long" })} at {time12(post.time)}
            </p>
          </div>
          <button type="button" onClick={onClose} className={SMALL_SOFT}>
            Close
          </button>
        </div>

        {post.imageUrls !== undefined && post.imageUrls.length > 1 ? (
          // A carousel: every slide, in order, so the whole post can be seen and not only its first picture.
          <ol aria-label={`The ${post.imageUrls.length} slides of this carousel`} className="flex flex-wrap gap-2">
            {post.imageUrls.map((url, index) => (
              <li key={url} className="grid gap-1">
                {/* The slides are served by social-auto, which Next's image optimiser cannot reach. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={postPictureSrc(url)} alt={`Slide ${index + 1} of ${post.imageUrls?.length ?? 0}`} className="size-28 rounded-xl object-cover sm:size-32" />
                <span className="text-center text-[0.6875rem] text-ink-3">
                  {index + 1} of {post.imageUrls?.length}
                </span>
              </li>
            ))}
          </ol>
        ) : mainPicture === undefined ? null : (
          // The post's picture, served by social-auto, which Next's image optimiser cannot reach.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={postPictureSrc(mainPicture)} alt="The picture of this post" className="size-40 rounded-xl object-cover" />
        )}

        <p className="whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed text-ink">{mainCaption}</p>
        {CHANNEL_PLATFORMS.flatMap((platform) => {
          // A network's own picture and words are shown beside the main ones only when the calendar shows more than that network.
          if (only !== null || !seen(platform)) return [];
          const own = post.variants?.[platform];
          const ownPicture = post.variantImages?.[platform];
          // A network that has its own caption or its own picture (LinkedIn's is wide) is shown with both: the main picture and words stand only for the networks with none of their own.
          return own === undefined && ownPicture === undefined ? [] : [
            <div key={platform} className="grid gap-1.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                <ChannelLogo platform={platform} small />
                {PLATFORM_NAMES[platform]} {ownPicture !== undefined && own !== undefined ? "picture and caption" : ownPicture !== undefined ? "picture" : "caption"}
              </p>
              {ownPicture === undefined ? null : (
                // The picture is served by social-auto, which Next's image optimiser cannot reach.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={postPictureSrc(ownPicture)} alt={`The ${PLATFORM_NAMES[platform]} picture of this post`} className="w-full max-w-md rounded-xl object-cover" />
              )}
              {own === undefined ? null : <p className="whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed text-ink">{own}</p>}
            </div>,
          ];
        })}

        {accounts.length === 0 ? null : (
          <ul className="grid gap-2" aria-label="Where this post goes">
            {accounts.map((channel) => {
              const status = postStatus({ ...post, channels: [channel] }, new Set([channel.platform]));
              const link = safeLink(channel.permalink);
              return (
                <li key={`${channel.platform}:${channel.account}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.84375rem]">
                  <ChannelLogo platform={channel.platform} small />
                  <span className="min-w-0 break-words font-semibold text-ink">
                    {channel.account}
                    <span className="sr-only">, {PLATFORM_NAMES[channel.platform]}</span>
                  </span>
                  <span className="text-ink-2">{status === null ? "" : status.word}</span>
                  {link === null ? null : (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-2 underline">
                      View post
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[0.84375rem] text-ink-2">{changeNote(post)}</p>
        {post.manual ? null : canChangeTime(post) ? (
          <ChangeBar post={post} />
        ) : (
          <Link href={`${ASK_FOR_A_CHANGE_PATH}&kind=social`} className={SMALL_SOFT}>
            Ask for a change
          </Link>
        )}
      </div>
    </dialog>
  );
}
